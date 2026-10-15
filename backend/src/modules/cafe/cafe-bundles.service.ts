import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import type { JwtUser } from '../../common/types/jwt-user';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { roundMoney, toDecimal, toNumber } from '../sales/sales.utils';
import { UpsertCafeBundleDto } from './dto/upsert-cafe-bundle.dto';
import type { BundleSelectionOptionDto } from './dto/bundle-selection.dto';
import { normalizeCafeCategoryIds } from './cafe-product-categories';

/** One priced café component of a bundle. Each sale path supplies its own resolver
 *  so the bundle service stays free of café/sales module dependencies (no cycles). */
export type BundleComponentSale = {
  cafeProductId: number;
  productName: string;
  variantId: number | null;
  variantName: string | null;
  unitPrice: number;
  unitCost: number;
  inventoryProductId: number | null;
  consumption: { productId: number; quantity: number; unitCost: number; ingredientName: string; unit: string }[];
};

export type BundleComponentResolver = (
  db: Prisma.TransactionClient | PrismaService,
  cafeProductId: number,
  variantId: number | null,
  quantity: number,
  warehouseId: number,
) => Promise<BundleComponentSale>;

/** One chosen component after a bundle is priced — persisted on the sale line as JSON. */
export type BundleSelectionSnapshot = {
  groupId: number;
  groupName: string;
  cafeProductId: number;
  productName: string;
  cafeVariantId: number | null;
  variantName: string | null;
  unitPrice: number;
  unitCost: number;
  priceDelta: number;
};

/** A fully priced, costed and stock-expanded bundle ready to become a sale line. */
export type ResolvedBundleSale = {
  bundleId: number;
  bundleCode: string;
  name: string;
  /** Price of a single bundle (before quantity). */
  unitPrice: number;
  /** Cost of a single bundle (weighted from component recipes). */
  unitCost: number;
  quantity: number;
  /** Human-readable list of the chosen components, e.g. "أمريكانو + راب فراخ". */
  label: string;
  selection: BundleSelectionSnapshot[];
  /** Stock to deduct, in the quick-sales consumption shape (already scaled by quantity). */
  consumption: { productId: number; quantity: number; unitCost: number; ingredientName: string; unit: string }[];
};

const BUNDLE_WITH_GROUPS = {
  groups: {
    orderBy: { sort_order: 'asc' as const },
    include: {
      options: {
        orderBy: { sort_order: 'asc' as const },
        include: {
          cafe_product: { select: { id: true, name: true, product_code: true, is_active: true, product_type: true,
            category_id: true, category_assignments: { select: { category_id: true } }, sell_price: true } },
          cafe_variant: { select: { id: true, name: true, is_active: true, sell_price: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class CafeBundlesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async nextBundleCode(): Promise<{ code: string }> {
    const rows = await this.prisma.cafe_bundles.findMany({
      where: { bundle_code: { startsWith: 'BND-' } },
      select: { bundle_code: true },
    });
    const max = rows.reduce((top, row) => {
      const n = Number(row.bundle_code.replace(/^BND-/, ''));
      return Number.isFinite(n) && n > top ? n : top;
    }, 0);
    return { code: `BND-${String(max + 1).padStart(4, '0')}` };
  }

  async list(params: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const skip = (params.page - 1) * params.pageSize;
    const where: Prisma.cafe_bundlesWhereInput = {
      ...(params.isActive !== undefined ? { is_active: params.isActive } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search } },
              { bundle_code: { contains: params.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cafe_bundles.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: params.pageSize,
        include: { groups: { include: { _count: { select: { options: true } } } } },
      }),
      this.prisma.cafe_bundles.count({ where }),
    ]);
    const data = rows.map((bundle) => ({
      id: bundle.id,
      bundleCode: bundle.bundle_code,
      name: bundle.name,
      imageUrl: bundle.image_url,
      pricingMode: bundle.pricing_mode,
      fixedPrice: toNumber(bundle.fixed_price),
      discountPercentage: toNumber(bundle.discount_percentage),
      isActive: bundle.is_active,
      groupCount: bundle.groups.length,
      optionCount: bundle.groups.reduce((sum, g) => sum + g._count.options, 0),
    }));
    return paginated(data, total, params.page, params.pageSize);
  }

  async findOne(id: number) {
    const bundle = await this.prisma.cafe_bundles.findUnique({
      where: { id },
      include: BUNDLE_WITH_GROUPS,
    });
    if (!bundle) throw new NotFoundException('الباندل غير موجود');
    return this.serialize(bundle);
  }

  private serialize(bundle: Prisma.cafe_bundlesGetPayload<{ include: typeof BUNDLE_WITH_GROUPS }>) {
    return {
      id: bundle.id,
      bundleCode: bundle.bundle_code,
      name: bundle.name,
      description: bundle.description,
      imageUrl: bundle.image_url,
      pricingMode: bundle.pricing_mode,
      fixedPrice: toNumber(bundle.fixed_price),
      discountPercentage: toNumber(bundle.discount_percentage),
      isActive: bundle.is_active,
      groups: bundle.groups.map((group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.min_select,
        maxSelect: group.max_select,
        sortOrder: group.sort_order,
        options: group.options.map((option) => ({
          id: option.id,
          cafeProductId: option.cafe_product_id,
          productName: option.cafe_product?.name ?? null,
          productCode: option.cafe_product?.product_code ?? null,
          categoryId: option.cafe_product?.category_id ?? null,
          categoryIds: normalizeCafeCategoryIds([
            ...(option.cafe_product?.category_assignments ?? []).map(row => row.category_id),
            ...(option.cafe_product?.category_id ? [option.cafe_product.category_id] : []),
          ]),
          sellPrice: toNumber(option.cafe_variant?.sell_price ?? option.cafe_product?.sell_price),
          cafeVariantId: option.cafe_variant_id,
          variantName: option.cafe_variant?.name ?? null,
          priceDelta: toNumber(option.price_delta),
          sortOrder: option.sort_order,
          isActive: option.is_active && !!option.cafe_product?.is_active &&
            option.cafe_product.product_type !== 'internal' &&
            (option.cafe_variant_id == null || !!option.cafe_variant?.is_active),
        })),
      })),
    };
  }

  /** Validate pricing fields and that every referenced café product is sellable. */
  private async validateInput(dto: UpsertCafeBundleDto) {
    if (dto.pricingMode === 'fixed' && (dto.fixedPrice == null || dto.fixedPrice <= 0)) {
      throw new BadRequestException('حدد سعرًا ثابتًا للباندل');
    }
    if (dto.pricingMode === 'percent' && (dto.discountPercentage == null || dto.discountPercentage <= 0)) {
      throw new BadRequestException('حدد نسبة خصم للباندل');
    }
    for (const group of dto.groups) {
      const maxSelect = group.maxSelect ?? 1;
      const minSelect = group.minSelect ?? 1;
      if (minSelect > maxSelect) {
        throw new BadRequestException(`المجموعة "${group.name}": الحد الأدنى للاختيار أكبر من الأقصى`);
      }
      if (maxSelect > group.options.length) {
        throw new BadRequestException(`المجموعة "${group.name}": عدد الاختيارات المطلوبة أكبر من الخيارات المتاحة`);
      }
    }
    const productIds = [
      ...new Set(dto.groups.flatMap((g) => g.options.map((o) => o.cafeProductId))),
    ];
    const products = await this.prisma.cafe_products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, is_active: true, product_type: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    for (const id of productIds) {
      const product = map.get(id);
      if (!product) throw new BadRequestException('أحد منتجات الباندل غير موجود');
      if (product.product_type === 'internal') {
        throw new BadRequestException(`المنتج ${product.name} مخصص للتصنيع الداخلي ولا يصلح كخيار في باندل`);
      }
    }
  }

  private groupsCreateData(dto: UpsertCafeBundleDto) {
    return dto.groups.map((group, gi) => ({
      name: group.name,
      min_select: group.minSelect ?? 1,
      max_select: group.maxSelect ?? 1,
      sort_order: group.sortOrder ?? gi,
      options: {
        create: group.options.map((option, oi) => ({
          cafe_product_id: option.cafeProductId,
          cafe_variant_id: option.cafeVariantId ?? null,
          price_delta: toDecimal(option.priceDelta ?? 0),
          sort_order: option.sortOrder ?? oi,
          is_active: option.isActive ?? true,
        })),
      },
    }));
  }

  async create(dto: UpsertCafeBundleDto, user?: JwtUser) {
    await this.validateInput(dto);
    const code = dto.bundleCode?.trim() || (await this.nextBundleCode()).code;
    return retryOnUniqueViolation(async () => {
      const bundle = await this.prisma.cafe_bundles.create({
        data: {
          bundle_code: code,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          image_url: dto.imageUrl?.trim() || null,
          pricing_mode: dto.pricingMode,
          fixed_price: toDecimal(dto.pricingMode === 'fixed' ? (dto.fixedPrice ?? 0) : 0),
          discount_percentage: toDecimal(dto.pricingMode === 'percent' ? (dto.discountPercentage ?? 0) : 0),
          is_active: dto.isActive ?? true,
          created_by: user?.sub ?? null,
          groups: { create: this.groupsCreateData(dto) },
        },
        include: BUNDLE_WITH_GROUPS,
      });
      return this.serialize(bundle);
    });
  }

  async update(id: number, dto: UpsertCafeBundleDto) {
    const existing = await this.prisma.cafe_bundles.findUnique({ where: { id }, select: { id: true, bundle_code: true } });
    if (!existing) throw new NotFoundException('الباندل غير موجود');
    await this.validateInput(dto);
    return retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        // Groups + options are fully owned by the bundle — replace them wholesale.
        await tx.cafe_bundle_groups.deleteMany({ where: { bundle_id: id } });
        await tx.cafe_bundles.update({
          where: { id },
          data: {
            name: dto.name.trim(),
            bundle_code: dto.bundleCode?.trim() || existing.bundle_code,
            description: dto.description?.trim() || null,
            image_url: dto.imageUrl?.trim() || null,
            pricing_mode: dto.pricingMode,
            fixed_price: toDecimal(dto.pricingMode === 'fixed' ? (dto.fixedPrice ?? 0) : 0),
            discount_percentage: toDecimal(dto.pricingMode === 'percent' ? (dto.discountPercentage ?? 0) : 0),
            is_active: dto.isActive ?? true,
            groups: { create: this.groupsCreateData(dto) },
          },
        });
        const bundle = await tx.cafe_bundles.findUnique({ where: { id }, include: BUNDLE_WITH_GROUPS });
        return this.serialize(bundle!);
      }),
    );
  }

  async updateStatus(id: number, isActive: boolean) {
    const existing = await this.prisma.cafe_bundles.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('الباندل غير موجود');
    await this.prisma.cafe_bundles.update({ where: { id }, data: { is_active: isActive } });
    return { id, isActive };
  }

  async remove(id: number) {
    const existing = await this.prisma.cafe_bundles.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('الباندل غير موجود');
    // Past sale lines keep their JSON snapshot + name, so removing the definition is safe.
    await this.prisma.cafe_bundles.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Sale-time resolution
  // ---------------------------------------------------------------------------

  /**
   * Price a bundle for a sale: validate the customer's choices against each group's
   * min/max, expand every chosen component into inventory consumption, and compute the
   * bundle's unit price (fixed price, or component sum minus the configured discount)
   * and unit cost. Prices are resolved entirely server-side.
   */
  async resolveBundleSale(
    db: Prisma.TransactionClient | PrismaService,
    line: { bundleId: number; quantity: number; selections: BundleSelectionOptionDto[] },
    warehouseId: number,
    resolveComponent: BundleComponentResolver,
  ): Promise<ResolvedBundleSale> {
    if (!(line.quantity > 0)) throw new BadRequestException('كمية الباندل غير صحيحة');
    const bundle = await db.cafe_bundles.findFirst({
      where: { id: line.bundleId, is_active: true },
      include: BUNDLE_WITH_GROUPS,
    });
    if (!bundle) throw new BadRequestException('الباندل غير موجود أو غير مفعّل');
    if (!bundle.groups.length) throw new BadRequestException(`الباندل ${bundle.name} لا يحتوي على مجموعات`);

    const chosenByGroup = new Map<number, BundleSelectionOptionDto[]>();
    for (const selection of line.selections ?? []) {
      const list = chosenByGroup.get(selection.groupId) ?? [];
      list.push(selection);
      chosenByGroup.set(selection.groupId, list);
    }

    const snapshot: BundleSelectionSnapshot[] = [];
    const consumption: ResolvedBundleSale['consumption'] = [];
    let unitCost = 0;
    let componentPriceSum = 0; // per single bundle, list price incl. price_delta
    let fixedDeltaSum = 0; // per single bundle, surcharges added onto a fixed price

    for (const group of bundle.groups) {
      const activeOptions = group.options.filter((o) => o.is_active);
      let chosen = chosenByGroup.get(group.id) ?? [];

      // Convenience: a single-option group (a fixed combo slot) needs no explicit pick.
      if (chosen.length === 0 && group.min_select <= 1 && activeOptions.length === 1) {
        const only = activeOptions[0];
        chosen = [{ groupId: group.id, cafeProductId: only.cafe_product_id, cafeVariantId: only.cafe_variant_id ?? undefined }];
      }

      if (chosen.length < group.min_select) {
        throw new BadRequestException(`اختر ${group.min_select} من مجموعة "${group.name}"`);
      }
      if (chosen.length > group.max_select) {
        throw new BadRequestException(`لا يمكن اختيار أكثر من ${group.max_select} من مجموعة "${group.name}"`);
      }

      for (const pick of chosen) {
        const option = activeOptions.find(
          (o) => o.cafe_product_id === pick.cafeProductId && (o.cafe_variant_id ?? null) === (pick.cafeVariantId ?? null),
        );
        if (!option) {
          throw new BadRequestException(`اختيار غير صالح في مجموعة "${group.name}"`);
        }
        const component = await resolveComponent(
          db,
          option.cafe_product_id,
          option.cafe_variant_id ?? null,
          line.quantity,
          warehouseId,
        );
        const priceDelta = toNumber(option.price_delta);
        unitCost += component.unitCost;
        componentPriceSum += component.unitPrice + priceDelta;
        fixedDeltaSum += priceDelta;
        snapshot.push({
          groupId: group.id,
          groupName: group.name,
          cafeProductId: component.cafeProductId,
          productName: component.productName,
          cafeVariantId: component.variantId,
          variantName: component.variantName,
          unitPrice: component.unitPrice,
          unitCost: component.unitCost,
          priceDelta,
        });
        consumption.push(...component.consumption);
      }
    }

    const unitPrice =
      bundle.pricing_mode === 'percent'
        ? roundMoney(componentPriceSum * (1 - toNumber(bundle.discount_percentage) / 100))
        : roundMoney(toNumber(bundle.fixed_price) + fixedDeltaSum);

    const label = snapshot
      .map((s) => (s.variantName ? `${s.productName} · ${s.variantName}` : s.productName))
      .join(' + ');

    return {
      bundleId: bundle.id,
      bundleCode: bundle.bundle_code,
      name: bundle.name,
      unitPrice,
      unitCost: roundMoney(unitCost),
      quantity: line.quantity,
      label,
      selection: snapshot,
      consumption,
    };
  }
}
