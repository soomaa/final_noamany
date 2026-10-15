import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { normalizePhone } from "../club-sales/club-sales.constants";
import { uploadReferenceUrl } from "../../common/uploads/upload-reference-url";
import {
  normaliseWorkingHours,
  parseGallery,
} from "../club-branches/club-branch-profiles.service";
import {
  CreateGuestLeadDto,
  GuestBranchDto,
  GuestCafeCategoryDto,
  GuestCafeProductDto,
  GuestLeadResult,
} from "./dto/guest-experience.dto";

const OPEN_LEAD_STATUSES = ["new", "in_progress", "follow_later", "qualified"];

type DatabaseBoolean = boolean | number | bigint | null;

interface CafeProductRow {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  sell_price: Prisma.Decimal | number | string;
  product_type: string;
  inventory_product_id: number | null;
  assigned_category_id: number | null;
  assigned_category_name: string | null;
  assigned_category_active: DatabaseBoolean;
  assigned_category_deleted: DatabaseBoolean;
  legacy_category_id: number | null;
  legacy_category_name: string | null;
  legacy_category_active: DatabaseBoolean;
  legacy_category_deleted: DatabaseBoolean;
}

interface CafeStockRow {
  product_id: number;
  current_stock: Prisma.Decimal | number | string | null;
}

interface MutableCafeProduct {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sellPrice: number;
  productType: string;
  inventoryProductId: number | null;
  categories: GuestCafeCategoryDto[];
  legacyCategory: GuestCafeCategoryDto | null;
}

interface LockRow {
  acquired: number | bigint | null;
}

interface LeadIdRow {
  id: number | bigint;
}

function databaseTrue(value: DatabaseBoolean): boolean {
  return value === true || Number(value ?? 0) === 1;
}

@Injectable()
export class GuestExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private publicBase(): string {
    return this.config?.get<string>("publicUploadBase") ?? "/uploads";
  }

  /**
   * The branch picker of the guest app. `id/name/lat/lng` is the original contract; when an
   * admin has filled the branch profile («الفروع») its display name replaces the operational
   * name, an unpublished branch is hidden, the admin's order wins, and the profile's public
   * details ride along as extra fields older clients simply ignore.
   */
  async activeBranches(): Promise<GuestBranchDto[]> {
    const branches = await this.prisma.tbl_branches.findMany({
      where: { branch_name: { not: null } },
      orderBy: { branch_id: "asc" },
      select: { branch_id: true, branch_name: true },
    });
    if (!branches.length) return [];

    const [settings, profiles] = await Promise.all([
      this.prisma.branch_settings.findMany({
        where: { title: { in: branches.map((branch) => branch.branch_name!) } },
        select: { title: true, lat_map: true, long_map: true },
      }),
      this.prisma.club_branch_profiles.findMany({
        where: { branch_id: { in: branches.map((branch) => branch.branch_id) } },
      }),
    ]);
    const geoByTitle = new Map(
      settings.map((setting) => [setting.title, setting]),
    );
    const profileByBranch = new Map(
      profiles.map((profile) => [profile.branch_id, profile]),
    );
    return branches
      .filter((branch) => profileByBranch.get(branch.branch_id)?.is_published !== false)
      .map((branch) => {
        const geo = geoByTitle.get(branch.branch_name!);
        const profile = profileByBranch.get(branch.branch_id);
        const base: GuestBranchDto = {
          id: branch.branch_id,
          name: profile?.display_name?.trim() || branch.branch_name!,
          lat: geo?.lat_map ?? null,
          lng: geo?.long_map ?? null,
        };
        if (!profile) return base;
        const gallery = parseGallery(profile.gallery);
        return {
          ...base,
          nameEn:
            profile.display_name_en?.trim() ||
            profile.display_name?.trim() ||
            branch.branch_name!,
          tagline: profile.tagline,
          about: profile.about,
          address: profile.address,
          phone: profile.phone,
          whatsapp: profile.whatsapp,
          email: profile.email,
          mapUrl: profile.map_url,
          coverImageUrl: uploadReferenceUrl(this.publicBase(), profile.cover_image),
          galleryUrls: gallery
            .map((path) => uploadReferenceUrl(this.publicBase(), path))
            .filter((url): url is string => url != null),
          workingHours: normaliseWorkingHours(profile.working_hours),
          facebookUrl: profile.facebook_url,
          instagramUrl: profile.instagram_url,
          sortOrder: profile.sort_order,
        };
      })
      .sort(
        (a, b) =>
          (profileByBranch.get(a.id)?.sort_order ?? 0) -
            (profileByBranch.get(b.id)?.sort_order ?? 0) || a.id - b.id,
      );
  }

  /** Programs a guest may say they are interested in: the branch's active packages. */
  async listGuestInterestedPrograms(branchId: number) {
    await this.assertBranchExists(branchId);
    return this.prisma.club_subscription_types.findMany({
      where: {
        is_active: true,
        OR: [
          { apply_to_all_branches: true },
          { branch_id: branchId },
          { branches: { some: { branch_id: branchId } } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  async cafeCatalogue(branchId: number): Promise<{
    categories: GuestCafeCategoryDto[];
    products: GuestCafeProductDto[];
  }> {
    await this.assertBranchExists(branchId);
    const rows = await this.prisma.$queryRaw<CafeProductRow[]>(Prisma.sql`
      SELECT
        cp.id,
        cp.name,
        inventory_product.description,
        cp.image_url,
        cp.sell_price,
        cp.product_type,
        cp.inventory_product_id,
        assigned_category.id AS assigned_category_id,
        assigned_category.name_ar AS assigned_category_name,
        assigned_category.is_active AS assigned_category_active,
        assigned_category.is_deleted AS assigned_category_deleted,
        legacy_category.id AS legacy_category_id,
        legacy_category.name_ar AS legacy_category_name,
        legacy_category.is_active AS legacy_category_active,
        legacy_category.is_deleted AS legacy_category_deleted
      FROM cafe_products cp
      LEFT JOIN inv_products inventory_product
        ON inventory_product.id = cp.inventory_product_id
      LEFT JOIN cafe_product_categories assignment
        ON assignment.product_id = cp.id
      LEFT JOIN inv_categories assigned_category
        ON assigned_category.id = assignment.category_id
      LEFT JOIN inv_categories legacy_category
        ON legacy_category.id = cp.category_id
      WHERE cp.is_active = TRUE
        AND cp.product_type <> 'internal'
        AND (
          cp.product_type <> 'ready'
          OR (
            inventory_product.id IS NOT NULL
            AND inventory_product.status = 'active'
            AND inventory_product.is_deleted = FALSE
          )
        )
      ORDER BY cp.name ASC, assignment.sort_order ASC, assignment.category_id ASC
    `);

    const productById = new Map<number, MutableCafeProduct>();
    for (const row of rows) {
      let product = productById.get(row.id);
      if (!product) {
        const hasLegacyCategory =
          row.legacy_category_id != null &&
          row.legacy_category_name != null &&
          databaseTrue(row.legacy_category_active) &&
          !databaseTrue(row.legacy_category_deleted);
        product = {
          id: row.id,
          name: row.name,
          description: row.description?.trim() || null,
          imageUrl: row.image_url,
          sellPrice: Number(row.sell_price),
          productType: row.product_type,
          inventoryProductId: row.inventory_product_id,
          categories: [],
          legacyCategory: hasLegacyCategory
            ? { id: row.legacy_category_id!, name: row.legacy_category_name! }
            : null,
        };
        productById.set(row.id, product);
      }
      const hasAssignedCategory =
        row.assigned_category_id != null &&
        row.assigned_category_name != null &&
        databaseTrue(row.assigned_category_active) &&
        !databaseTrue(row.assigned_category_deleted);
      if (
        hasAssignedCategory &&
        !product.categories.some(
          (category) => category.id === row.assigned_category_id,
        )
      ) {
        product.categories.push({
          id: row.assigned_category_id!,
          name: row.assigned_category_name!,
        });
      }
    }

    const rawProducts = [...productById.values()];
    rawProducts.forEach((product) => {
      if (!product.categories.length && product.legacyCategory) {
        product.categories.push(product.legacyCategory);
      }
    });
    const inventoryProductIds = rawProducts
      .filter((product) => product.productType === "ready")
      .map((product) => product.inventoryProductId)
      .filter((id): id is number => id != null);
    const balances = inventoryProductIds.length
      ? await this.prisma.$queryRaw<CafeStockRow[]>(Prisma.sql`
          SELECT
            balance.product_id,
            SUM(balance.current_stock) AS current_stock
          FROM inv_stock_balances balance
          INNER JOIN inv_warehouses warehouse
            ON warehouse.id = balance.warehouse_id
          WHERE balance.product_id IN (${Prisma.join(inventoryProductIds)})
            AND warehouse.branch_id = ${branchId}
            AND warehouse.status = 'active'
            AND warehouse.is_deleted = FALSE
          GROUP BY balance.product_id
        `)
      : [];
    const stockByProduct = new Map(
      balances.map((balance) => [
        balance.product_id,
        Number(balance.current_stock ?? 0),
      ]),
    );

    const products = rawProducts.map<GuestCafeProductDto>((product) => ({
      id: product.id,
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      imageUrl: product.imageUrl,
      sellPrice: product.sellPrice,
      isAvailable:
        product.productType !== "ready" ||
        (product.inventoryProductId != null &&
          (stockByProduct.get(product.inventoryProductId) ?? 0) > 0),
      categories: product.categories,
    }));
    const categoryById = new Map<number, GuestCafeCategoryDto>();
    products.forEach((product) => {
      product.categories.forEach((category) =>
        categoryById.set(category.id, category),
      );
    });
    return { categories: [...categoryById.values()], products };
  }

  async createGuestLead(dto: CreateGuestLeadDto): Promise<GuestLeadResult> {
    await this.assertBranchExists(dto.branchId);
    const phone = normalizePhone(dto.phone);
    if (phone.replace(/\D/g, "").length < 6) {
      throw new BadRequestException("رقم الموبايل مطلوب ويجب أن يكون صحيحًا");
    }
    if (dto.subscriptionTypeId != null) {
      await this.assertProgramAtBranch(dto.subscriptionTypeId, dto.branchId);
    }
    const interestedProgram = this.interestedProgram(dto.interestKeys);
    const lockKey = createHash("sha256")
      .update(`${dto.branchId}:${phone}`)
      .digest("hex");

    return this.prisma.$transaction(
      async (tx) => {
        let acquired = false;
        try {
          const lockRows = await tx.$queryRaw<LockRow[]>(Prisma.sql`
            SELECT GET_LOCK(${lockKey}, ${5}) AS acquired
          `);
          acquired = Number(lockRows[0]?.acquired ?? 0) === 1;
          if (!acquired) {
            throw new ServiceUnavailableException(
              "تعذّر حفظ طلبك الآن، يرجى المحاولة مرة أخرى",
            );
          }

          const existingRows = await tx.$queryRaw<LeadIdRow[]>(Prisma.sql`
            SELECT id
            FROM club_sales_crm_leads
            WHERE branch_id = ${dto.branchId}
              AND phone = ${phone}
              AND source = ${"mobile_app"}
              AND status IN (${Prisma.join(OPEN_LEAD_STATUSES)})
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
          `);
          const existingId = existingRows[0]?.id;
          if (existingId != null) {
            await tx.$executeRaw(Prisma.sql`
              UPDATE club_sales_crm_leads
              SET full_name = ${dto.fullName.trim()},
                  interested_program = COALESCE(${interestedProgram}, interested_program),
                  subscription_type_id = COALESCE(${dto.subscriptionTypeId ?? null}, subscription_type_id),
                  updated_at = CURRENT_TIMESTAMP(3)
              WHERE id = ${existingId}
            `);
            return { id: Number(existingId), created: false };
          }

          await tx.$executeRaw(Prisma.sql`
            INSERT INTO club_sales_crm_leads (
              full_name,
              phone,
              source,
              interested_program,
              subscription_type_id,
              status,
              branch_id,
              created_by,
              created_at,
              updated_at
            ) VALUES (
              ${dto.fullName.trim()},
              ${phone},
              ${"mobile_app"},
              ${interestedProgram},
              ${dto.subscriptionTypeId ?? null},
              ${"new"},
              ${dto.branchId},
              ${null},
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3)
            )
          `);
          const insertedRows = await tx.$queryRaw<LeadIdRow[]>(Prisma.sql`
            SELECT LAST_INSERT_ID() AS id
          `);
          const insertedId = Number(insertedRows[0]?.id ?? 0);
          if (!insertedId) {
            throw new ServiceUnavailableException(
              "تعذّر حفظ طلبك الآن، يرجى المحاولة مرة أخرى",
            );
          }
          return { id: insertedId, created: true };
        } finally {
          if (acquired) {
            await tx.$queryRaw(Prisma.sql`
              SELECT RELEASE_LOCK(${lockKey}) AS released
            `);
          }
        }
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
  }

  /** A guest may only name a package that is actually sold at the chosen branch. */
  private async assertProgramAtBranch(subscriptionTypeId: number, branchId: number): Promise<void> {
    const program = await this.prisma.club_subscription_types.findUnique({
      where: { id: subscriptionTypeId },
      select: {
        is_active: true,
        apply_to_all_branches: true,
        branch_id: true,
        branches: { select: { branch_id: true } },
      },
    });
    const sold =
      program?.is_active &&
      (program.apply_to_all_branches ||
        program.branch_id === branchId ||
        program.branches.some((row) => row.branch_id === branchId));
    if (!sold) throw new BadRequestException("اختر برنامجًا متاحًا لهذا الفرع");
  }

  private async assertBranchExists(branchId: number): Promise<void> {
    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: branchId },
      select: { branch_id: true },
    });
    if (!branch) throw new NotFoundException("الفرع غير موجود");
  }

  private interestedProgram(interestKeys?: string[]): string | null {
    const keys = [
      ...new Set(
        (interestKeys ?? [])
          .map((key) => key.trim())
          .filter((key) => key.length > 0),
      ),
    ];
    return keys.join(",").slice(0, 80) || null;
  }
}
