import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryLocationService } from './inventory-location.service';
import { assertUnique } from '../../common/validators';
import { InventoryStockService } from './inventory-stock.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  ListProductsDto,
  PackagedMaterialSizeDto,
  ProductRecipeLineDto,
  UpdateProductStockDto,
  UpsertProductDto,
} from './dto/inventory.dto';
import { convertToBaseUnit, type RecipeUnit } from '../../common/utils/units';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private isNonSellableInventory(kind?: string | null, section?: string | null) {
    return kind === 'raw_material'
      || kind === 'manufactured_internal'
      || ['preparation_ingredients', 'serving_packaging', 'gym_operations'].includes(section ?? '');
  }

  private async estimateCompositeCost(
    recipes: ProductRecipeLineDto[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    if (!recipes.length) return 0;
    const ids = [...new Set(recipes.map((r) => r.ingredientId))];
    const products = await tx.inv_products.findMany({
      where: {
        id: { in: ids },
        is_deleted: false,
        status: 'active',
        OR: [
          { inventory_kind: 'raw_material', inventory_section: { in: ['preparation_ingredients', 'serving_packaging'] } },
          { inventory_kind: 'ready_product', inventory_section: 'ready_products' },
        ],
      },
      select: { id: true, name_ar: true, cost_price: true, unit_of_measure: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    if (map.size !== ids.length) {
      throw new BadRequestException('مكونات الخامة المصنعة يجب أن تكون خامات أو منتجات جاهزة نشطة من المخزون');
    }
    let total = 0;
    for (const line of recipes) {
      const product = map.get(line.ingredientId)!;
      const converted = convertToBaseUnit(line.quantity, line.unit as RecipeUnit, product.unit_of_measure);
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${product.name_ar} غير متوافقة مع وحدة المخزون ${product.unit_of_measure}`,
        );
      }
      total += toNumber(product.cost_price) * converted;
    }
    return Math.round(total * 10000) / 10000;
  }

  private async syncCompositeCafeProduct(
    tx: Prisma.TransactionClient,
    product: { id: number; name_ar: string; product_code: string; status: string; unit_of_measure: string },
    recipes: ProductRecipeLineDto[],
    calculatedCost: number,
  ) {
    if (!recipes.length) {
      throw new BadRequestException('الخامة المصنعة تحتاج مكونًا واحدًا على الأقل');
    }
    if (recipes.some((r) => r.ingredientId === product.id)) {
      throw new BadRequestException('لا يمكن أن تتضمن الخامة المصنعة نفسها كمكون');
    }

    const cafe = await tx.cafe_products.upsert({
      where: { inventory_product_id: product.id },
      create: {
        product_code: `CFM-${product.product_code}`,
        name: product.name_ar,
        product_type: 'internal',
        inventory_product_id: product.id,
        sell_price: 0,
        is_active: product.status === 'active',
      },
      update: {
        name: product.name_ar,
        product_type: 'internal',
        sell_price: 0,
        is_active: product.status === 'active',
      },
    });

    await tx.cafe_product_recipes.deleteMany({ where: { product_id: cafe.id } });
    await tx.cafe_product_recipes.createMany({
      data: recipes.map((line, index) => ({
        product_id: cafe.id,
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        sort_order: index,
      })),
    });

    await tx.inv_products.update({
      where: { id: product.id },
      data: {
        inventory_kind: 'manufactured_internal',
        inventory_section: 'preparation_ingredients',
        cost_price: calculatedCost,
        selling_price: 0,
      },
    });
  }

  private async loadCompositeRecipes(productId: number) {
    const cafe = await this.prisma.cafe_products.findFirst({
      where: { inventory_product_id: productId },
      include: {
        recipes: {
          orderBy: { sort_order: 'asc' },
          include: {
            ingredient: {
              select: {
                id: true,
                name_ar: true,
                size: true,
                unit_of_measure: true,
                cost_price: true,
                inventory_kind: true,
                inventory_section: true,
                is_deleted: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!cafe) return [];
    return cafe.recipes.map((row) => ({
      ingredientId: row.ingredient_id,
      quantity: toNumber(row.quantity),
      unit: row.unit,
      ingredientName: row.ingredient.name_ar,
      ingredientSize: row.ingredient.size,
      unitOfMeasure: row.ingredient.unit_of_measure,
      costPrice: toNumber(row.ingredient.cost_price),
      inventoryKind: row.ingredient.inventory_kind,
      inventorySection: row.ingredient.inventory_section,
      isArchived: row.ingredient.is_deleted || row.ingredient.status !== 'active',
    }));
  }

  private async resolveOpeningStockBranchId(preferred?: number | null): Promise<number> {
    const requested = Number(preferred ?? 0);
    if (Number.isInteger(requested) && requested > 0) {
      const branch = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: requested },
        select: { branch_id: true },
      });
      if (!branch) throw new BadRequestException('فرع الرصيد الافتتاحي المحدد غير موجود');
      return branch.branch_id;
    }
    const first = await this.prisma.tbl_branches.findFirst({
      orderBy: { branch_id: 'asc' },
      select: { branch_id: true },
    });
    if (!first?.branch_id) {
      throw new BadRequestException('لا يوجد فرع مسجّل لإضافة الرصيد الافتتاحي');
    }
    return first.branch_id;
  }

  private mapProduct(row: Prisma.inv_productsGetPayload<{
    include: {
      category: true;
      brand: true;
      manufacturer: true;
      supplier: true;
      unit_template: true;
      packages: true;
    };
  }>) {
    return {
      id: row.id,
      productCode: row.product_code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      description: row.description,
      barcode: row.barcode,
      categoryId: row.category_id,
      brandId: row.brand_id,
      manufacturerId: row.manufacturer_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier?.name_ar ?? null,
      inventoryKind: row.inventory_kind,
      inventorySection: row.inventory_section,
      costPrice: toNumber(row.cost_price),
      sellingPrice: toNumber(row.selling_price),
      wholesalePrice: row.wholesale_price != null ? toNumber(row.wholesale_price) : null,
      unitOfMeasure: row.unit_of_measure,
      unitTemplateId: row.unit_template_id,
      minStock: toNumber(row.min_stock),
      maxStock: toNumber(row.max_stock),
      reorderPoint: toNumber(row.reorder_point),
      imageUrl: row.image_url,
      model: row.model,
      color: row.color,
      size: row.size,
      isPackaged: row.is_packaged,
      packages: row.packages.map((pack) => ({
        id: pack.id,
        packageSize: toNumber(pack.package_size),
        packageUnit: pack.package_unit,
        packageBaseQuantity: toNumber(pack.package_base_quantity),
        packagePrice: toNumber(pack.package_price),
        reorderPoint: toNumber(pack.reorder_point),
        isDefault: pack.is_default,
        isActive: pack.is_active,
      })),
      material: row.material,
      weightKg: row.weight_kg != null ? toNumber(row.weight_kg) : null,
      dimensions: row.dimensions,
      warrantyPeriod: row.warranty_period,
      expiryDate: row.expiry_date,
      batchNumber: row.batch_number,
      shelfLocation: row.shelf_location,
      applyToAllBranches: row.apply_to_all_branches,
      status: row.status,
      isDeleted: row.is_deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      category: row.category,
      brand: row.brand,
      manufacturer: row.manufacturer,
      supplier: row.supplier,
      unitTemplate: row.unit_template,
    };
  }

  private includeRelations() {
    return Prisma.validator<Prisma.inv_productsInclude>()({
      category: true,
      brand: true,
      manufacturer: true,
      supplier: true,
      unit_template: true,
      packages: {
        where: { is_active: true },
        orderBy: [{ is_default: 'desc' }, { package_base_quantity: 'asc' }, { id: 'asc' }],
      },
    });
  }

  async list(q: ListProductsDto, user?: JwtUser) {
    const showArchived = q.includeArchived || q.status === 'archived';
    const and: Prisma.inv_productsWhereInput[] = showArchived
      ? [{ is_deleted: true }]
      : [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { name_ar: { contains: s } },
          { name_en: { contains: s } },
          { size: { contains: s } },
          { product_code: { contains: s } },
          { barcode: { contains: s } },
        ],
      });
    }
    if (q.categoryId && q.categoryId !== 'all') and.push({ category_id: Number(q.categoryId) });
    if (q.brandId && q.brandId !== 'all') and.push({ brand_id: Number(q.brandId) });
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.recipeIngredient) {
      and.push({
        OR: [
          { inventory_kind: 'manufactured_internal' },
          { inventory_kind: 'ready_product', inventory_section: 'ready_products' },
          {
            inventory_kind: 'raw_material',
            inventory_section: { in: ['preparation_ingredients', 'serving_packaging'] },
          },
        ],
      });
    } else if (q.inventorySection === 'preparation_ingredients' && q.inventoryKind === 'raw_material') {
      // خامات التحضير تشمل الأساسية + المصنعة (sub-recipes) في نفس القسم.
      and.push({
        OR: [
          { inventory_kind: 'raw_material', inventory_section: 'preparation_ingredients' },
          { inventory_kind: 'manufactured_internal' },
        ],
      });
    } else if (q.inventoryKind && q.inventoryKind !== 'all') {
      and.push({ inventory_kind: q.inventoryKind });
    }
    if (
      q.inventorySection
      && q.inventorySection !== 'all'
      && !(q.inventorySection === 'preparation_ingredients' && q.inventoryKind === 'raw_material')
    ) {
      and.push({ inventory_section: q.inventorySection });
    }
    if (q.status === 'active') and.push({ status: 'active' });
    if (q.status === 'inactive') and.push({ status: 'inactive', is_deleted: false });
    // status === 'archived' already handled via showArchived

    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const stockScope: Prisma.inv_stock_balancesWhereInput = q.warehouseId && q.warehouseId !== 'all'
      ? {
          warehouse_id: Number(q.warehouseId),
          ...(scopedBranches ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } : {}),
        }
      : scopedBranches
        ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
        : {};

    if (q.lowStock) {
      and.push({ inventory_kind: { not: 'manufactured_internal' } });
      const candidates = await this.prisma.inv_products.findMany({
        where: { AND: and },
        select: { id: true, reorder_point: true },
      });
      const candidateIds = candidates.map((row) => row.id);
      const balanceRows = candidateIds.length
        ? await this.prisma.inv_stock_balances.groupBy({
            by: ['product_id'],
            where: { product_id: { in: candidateIds }, ...stockScope },
            _sum: { current_stock: true },
          })
        : [];
      const currentStock = new Map(
        balanceRows.map((row) => [row.product_id, toNumber(row._sum.current_stock)]),
      );
      const lowIds = candidates
        .filter((row) => (currentStock.get(row.id) ?? 0) <= toNumber(row.reorder_point))
        .map((row) => row.id);
      and.push({ id: { in: lowIds.length ? lowIds : [-1] } });
    }

    const where: Prisma.inv_productsWhereInput = { AND: and };

    let rows = await this.prisma.inv_products.findMany({
      where,
      include: this.includeRelations(),
      orderBy: { id: 'desc' },
      skip: q.skip,
      take: q.take,
    });

    const productIds = rows.map((row) => row.id);
    const stockRows = productIds.length
      ? await this.prisma.inv_stock_balances.groupBy({
          by: ['product_id'],
          where: {
            product_id: { in: productIds },
            ...stockScope,
          },
          _sum: { current_stock: true },
        })
      : [];
    const stockMap = new Map(stockRows.map((row) => [row.product_id, toNumber(row._sum.current_stock)]));
    const total = await this.prisma.inv_products.count({ where });
    return paginated(rows.map((r) => ({ ...this.mapProduct(r), currentStock: stockMap.get(r.id) ?? 0 })), total, q.page, q.pageSize);
  }

  async search(term: string, user?: JwtUser) {
    return this.list({ search: term, page: 1, pageSize: 50 } as ListProductsDto, user);
  }

  async lowStock(branchId?: string, user?: JwtUser) {
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const products = await this.prisma.inv_products.findMany({
      where: {
        ...notDeletedFilter(),
        status: 'active',
        inventory_kind: { not: 'manufactured_internal' },
      },
      include: this.includeRelations(),
      orderBy: { name_ar: 'asc' },
    });
    const balances = await this.prisma.inv_stock_balances.groupBy({
      by: ['product_id'],
      where: {
        ...(scopedBranches
          ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
          : {}),
      },
      _sum: { current_stock: true },
    });
    const currentStock = new Map(
      balances.map((row) => [row.product_id, toNumber(row._sum.current_stock)]),
    );
    return products
      .map((product) => ({
        productId: product.id,
        currentStock: currentStock.get(product.id) ?? 0,
        reorderPoint: toNumber(product.reorder_point),
        product,
      }))
      .filter((row) => row.currentStock <= row.reorderPoint)
      .sort((a, b) => a.currentStock - b.currentStock);
  }

  async exportList(q: ListProductsDto, user?: JwtUser) {
    const result = await this.list({ ...q, page: 1, pageSize: 10000 } as ListProductsDto, user);
    return result.data;
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_products.findFirst({
      where: { id, ...notDeletedFilter() },
      include: this.includeRelations(),
    });
    if (!row) throw new NotFoundException('المنتج غير موجود');
    const mapped = this.mapProduct(row);
    if (row.inventory_kind === 'manufactured_internal') {
      return { ...mapped, recipes: await this.loadCompositeRecipes(id) };
    }
    return mapped;
  }

  async productInventory(id: number, user?: JwtUser) {
    await this.findOne(id);
    const scopedBranches = this.branchScope.resolveListFilter(user, null);
    const balances = await this.prisma.inv_stock_balances.findMany({
      where: {
        product_id: id,
        ...(scopedBranches ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } : {}),
      },
      include: { warehouse: true },
    });
    return balances.map((b) => ({
      id: b.id,
      warehouseId: b.warehouse_id,
      warehouse: b.warehouse,
      currentStock: toNumber(b.current_stock),
      minStock: toNumber(b.min_stock),
      maxStock: toNumber(b.max_stock),
      reorderPoint: toNumber(b.reorder_point),
      shelfLocation: b.shelf_location,
    }));
  }

  private async generateProductCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(product_code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_products WHERE product_code LIKE 'PRD%'
    `;
    const nextNum = Number(rows[0]?.maxNum ?? 0) + 1;
    return `PRD${String(nextNum).padStart(6, '0')}`;
  }

  private packageBaseUnit(unit: string): 'g' | 'ml' | 'piece' {
    const normalized = unit.trim().toLowerCase();
    if (['g', 'kg', 'oz'].includes(normalized)) return 'g';
    if (['ml', 'l', 'fl_oz'].includes(normalized)) return 'ml';
    if (normalized === 'piece') return 'piece';
    throw new BadRequestException(`وحدة العبوة ${unit} غير مدعومة`);
  }

  private normalizePackage(pack: PackagedMaterialSizeDto) {
    const baseUnit = this.packageBaseUnit(pack.packageUnit);
    const baseQuantity = convertToBaseUnit(
      pack.packageSize,
      pack.packageUnit as RecipeUnit,
      baseUnit,
    );
    if (baseQuantity == null || baseQuantity <= 0) {
      throw new BadRequestException('حجم العبوة ووحدتها غير صالحين');
    }
    const unitCost = Math.round((pack.packagePrice / baseQuantity) * 1_000_000) / 1_000_000;
    return { ...pack, baseUnit, baseQuantity, unitCost };
  }

  private validatePackageSet(packages?: PackagedMaterialSizeDto[]) {
    if (!packages?.length) throw new BadRequestException('أضف حجم عبوة واحدًا على الأقل');
    const normalized = packages.map((pack) => this.normalizePackage(pack));
    const baseUnit = normalized[0].baseUnit;
    if (normalized.some((pack) => pack.baseUnit !== baseUnit)) {
      throw new BadRequestException('كل أحجام الخامة الواحدة يجب أن تكون من نفس النوع: وزن أو حجم أو قطعة');
    }
    const sizes = normalized.map((pack) => pack.baseQuantity.toFixed(3));
    if (new Set(sizes).size !== sizes.length) {
      throw new BadRequestException('لا يمكن تكرار نفس حجم العبوة داخل الخامة');
    }
    return normalized;
  }

  private packageSizeLabel(packageSize: number, packageUnit: string) {
    return `${Number(packageSize.toFixed(3))} ${packageUnit}`;
  }

  private async createPackagedMaterial(dto: UpsertProductDto, userId: number, branchId?: number) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم الخامة مطلوب');
    if (dto.inventoryKind && dto.inventoryKind !== 'raw_material') {
      throw new BadRequestException('العبوات المتعددة متاحة للخامات الأساسية فقط');
    }
    const packages = this.validatePackageSet(dto.packages);
    const productCode = dto.productCode?.trim() || (await this.generateProductCode());
    await assertUnique(
      () => this.prisma.inv_products.findFirst({
        where: { product_code: productCode, ...notDeletedFilter() },
      }),
      'كود المنتج مستخدم بالفعل',
    );
    if (dto.barcode?.trim()) {
      await assertUnique(
        () => this.prisma.inv_products.findFirst({
          where: { barcode: dto.barcode!.trim(), ...notDeletedFilter() },
        }),
        'الباركود مستخدم بالفعل',
      );
    }

    const initialStock = packages.reduce(
      (sum, pack) => sum + Number(pack.initialPackageCount ?? 0) * pack.baseQuantity,
      0,
    );
    const openingValue = packages.reduce(
      (sum, pack) => sum + Number(pack.initialPackageCount ?? 0) * pack.packagePrice,
      0,
    );
    const openingUnitCost = initialStock > 0
      ? openingValue / initialStock
      : packages[0].unitCost;
    const openingBranchId = initialStock > 0
      ? await this.resolveOpeningStockBranchId(dto.openingBranchId ?? branchId)
      : null;
    if (openingValue > 0) await this.moduleLedger.ensureChart();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inv_products.create({
        data: {
          product_code: productCode,
          name_ar: dto.nameAr.trim(),
          name_en: dto.nameEn?.trim() || dto.nameAr.trim(),
          description: dto.description ?? null,
          barcode: dto.barcode?.trim() || null,
          category_id: dto.categoryId ?? null,
          brand_id: dto.brandId ?? null,
          manufacturer_id: dto.manufacturerId ?? null,
          supplier_id: dto.supplierId ?? null,
          inventory_kind: 'raw_material',
          inventory_section: dto.inventorySection ?? 'preparation_ingredients',
          cost_price: Math.round(openingUnitCost * 1_000_000) / 1_000_000,
          selling_price: 0,
          unit_of_measure: packages[0].baseUnit,
          min_stock: Number(packages[0].reorderPoint ?? 0) * packages[0].baseQuantity,
          max_stock: dto.maxStock ?? 1_000_000,
          reorder_point: Number(packages[0].reorderPoint ?? 0) * packages[0].baseQuantity,
          image_url: dto.imageUrl ?? null,
          material: dto.material ?? null,
          shelf_location: dto.shelfLocation ?? null,
          apply_to_all_branches: dto.applyToAllBranches ?? false,
          status: dto.status ?? 'active',
          is_packaged: true,
          created_by: userId,
          packages: {
            create: packages.map((pack, index) => ({
              package_size: pack.packageSize,
              package_unit: pack.packageUnit,
              package_base_quantity: pack.baseQuantity,
              package_price: pack.packagePrice,
              reorder_point: pack.reorderPoint ?? 0,
              is_default: index === 0,
            })),
          },
        },
      });

      if (dto.supplierId) {
        await tx.inv_supplier_products.create({
          data: {
            supplier_id: dto.supplierId,
            product_id: created.id,
            purchase_unit: 'package',
            last_unit_cost: packages[0].packagePrice,
            is_active: true,
          },
        });
      }

      if (initialStock > 0) {
        const warehouseId = await this.location.resolveBranchStockLocation(openingBranchId!, tx);
        const openingDescription = packages
          .filter((pack) => Number(pack.initialPackageCount ?? 0) > 0)
          .map((pack) =>
            String(Number(pack.initialPackageCount)) + ' عبوة × '
              + this.packageSizeLabel(pack.packageSize, pack.packageUnit),
          )
          .join('، ');
        const opening = await tx.inv_opening_stocks.create({
          data: {
            opening_stock_date: new Date(),
            item_code: created.product_code,
            quantity: initialStock,
            unit_cost: openingUnitCost,
            total_cost: openingValue,
            notes: openingDescription,
            branch_id: openingBranchId!,
            warehouse_id: warehouseId,
            product_id: created.id,
          },
        });
        await this.stock.applyMovement({
          productId: created.id,
          warehouseId,
          direction: MovementDirection.in,
          quantity: initialStock,
          operation: 'set',
          txnType: InventoryTxnType.adjustment,
          unitCost: openingUnitCost,
          docType: 'opening_stock',
          docRef: String(opening.id),
          branchId: openingBranchId!,
          createdBy: userId,
        }, tx);
        await this.moduleLedger.postOpeningStock({
          openingStockId: opening.id,
          branchId: openingBranchId!,
          date: opening.opening_stock_date!.toISOString().slice(0, 10),
          amount: openingValue,
          itemName: created.name_ar,
          createdBy: userId,
        }, tx);
      }

      return created;
    }, { maxWait: 10_000, timeout: 30_000 });

    if (dto.applyToAllBranches) await this.fanOutToAllBranches(row.id);
    return this.findOne(row.id);
  }

  private async updatePackagedMaterial(
    productId: number,
    dto: Partial<UpsertProductDto>,
    userId: number,
    branchId?: number,
  ) {
    const existing = await this.prisma.inv_products.findFirst({
      where: { id: productId, is_packaged: true, ...notDeletedFilter() },
      include: { packages: { where: { is_active: true }, orderBy: { id: 'asc' } } },
    });
    if (!existing) throw new NotFoundException('الخامة ذات العبوات غير موجودة');
    const packages = this.validatePackageSet(dto.packages);
    const existingById = new Map(existing.packages.map((pack) => [pack.id, pack]));
    const submittedIds = packages.flatMap((pack) => pack.id ? [pack.id] : []);
    if (submittedIds.some((id) => !existingById.has(id))) {
      throw new BadRequestException('أحد أحجام العبوات لا ينتمي إلى هذه الخامة');
    }
    if (existing.packages.some((pack) => !submittedIds.includes(pack.id))) {
      throw new BadRequestException('لا يمكن حذف حجم عبوة سبق حفظه؛ يمكن إضافة أحجام جديدة وتعديل السعر');
    }
    for (const pack of packages) {
      if (!pack.id) continue;
      const saved = existingById.get(pack.id)!;
      if (Math.abs(toNumber(saved.package_base_quantity) - pack.baseQuantity) > 0.0001) {
        throw new BadRequestException(
          'لا يمكن تغيير سعة عبوة محفوظة حفاظًا على فواتير الشراء السابقة؛ أضف حجمًا جديدًا بدلًا منها',
        );
      }
    }
    await this.assertMasterDataChangeAllowed(productId, existing, {
      unitOfMeasure: packages[0].baseUnit,
    });

    const newPackages = packages.filter((pack) => !pack.id);
    const addedStock = newPackages.reduce(
      (sum, pack) => sum + Number(pack.initialPackageCount ?? 0) * pack.baseQuantity,
      0,
    );
    const addedValue = newPackages.reduce(
      (sum, pack) => sum + Number(pack.initialPackageCount ?? 0) * pack.packagePrice,
      0,
    );
    const openingBranchId = addedStock > 0
      ? await this.resolveOpeningStockBranchId(dto.openingBranchId ?? branchId)
      : null;
    if (addedValue > 0) await this.moduleLedger.ensureChart();

    await this.prisma.$transaction(async (tx) => {
      let nextCost = toNumber(existing.cost_price);
      if (addedStock > 0) {
        const aggregate = await tx.inv_stock_balances.aggregate({
          where: { product_id: productId },
          _sum: { current_stock: true },
        });
        const currentStock = toNumber(aggregate._sum.current_stock);
        nextCost = currentStock + addedStock > 0
          ? ((currentStock * nextCost) + addedValue) / (currentStock + addedStock)
          : addedValue / addedStock;
      }

      await tx.inv_products.update({
        where: { id: productId },
        data: {
          ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
          ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() || dto.nameAr?.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
          ...(dto.supplierId !== undefined ? { supplier_id: dto.supplierId ?? null } : {}),
          ...(dto.inventorySection !== undefined ? { inventory_section: dto.inventorySection } : {}),
          ...(dto.maxStock !== undefined ? { max_stock: dto.maxStock } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.applyToAllBranches !== undefined
            ? { apply_to_all_branches: dto.applyToAllBranches }
            : {}),
          unit_of_measure: packages[0].baseUnit,
          min_stock: Number(packages[0].reorderPoint ?? 0) * packages[0].baseQuantity,
          reorder_point: Number(packages[0].reorderPoint ?? 0) * packages[0].baseQuantity,
          cost_price: Math.round(nextCost * 1_000_000) / 1_000_000,
        },
      });

      await tx.inv_product_packages.updateMany({
        where: { product_id: productId },
        data: { is_default: false },
      });
      for (const [index, pack] of packages.entries()) {
        if (pack.id) {
          await tx.inv_product_packages.update({
            where: { id: pack.id },
            data: {
              package_size: pack.packageSize,
              package_unit: pack.packageUnit,
              package_base_quantity: pack.baseQuantity,
              package_price: pack.packagePrice,
              reorder_point: pack.reorderPoint ?? 0,
              is_default: index === 0,
              is_active: true,
            },
          });
        } else {
          await tx.inv_product_packages.create({
            data: {
              product_id: productId,
              package_size: pack.packageSize,
              package_unit: pack.packageUnit,
              package_base_quantity: pack.baseQuantity,
              package_price: pack.packagePrice,
              reorder_point: pack.reorderPoint ?? 0,
              is_default: index === 0,
            },
          });
        }
      }

      const effectiveSupplierId = dto.supplierId === undefined
        ? existing.supplier_id
        : dto.supplierId;
      if (effectiveSupplierId) {
        await tx.inv_supplier_products.upsert({
          where: {
            supplier_id_product_id: {
              supplier_id: effectiveSupplierId,
              product_id: productId,
            },
          },
          create: {
            supplier_id: effectiveSupplierId,
            product_id: productId,
            purchase_unit: 'package',
            last_unit_cost: packages[0].packagePrice,
            is_active: true,
          },
          update: {
            purchase_unit: 'package',
            last_unit_cost: packages[0].packagePrice,
            is_active: true,
          },
        });
      }

      if (addedStock > 0) {
        const warehouseId = await this.location.resolveBranchStockLocation(openingBranchId!, tx);
        const openingDescription = newPackages
          .filter((pack) => Number(pack.initialPackageCount ?? 0) > 0)
          .map((pack) =>
            String(Number(pack.initialPackageCount)) + ' عبوة × '
              + this.packageSizeLabel(pack.packageSize, pack.packageUnit),
          )
          .join('، ');
        const opening = await tx.inv_opening_stocks.create({
          data: {
            opening_stock_date: new Date(),
            item_code: existing.product_code,
            quantity: addedStock,
            unit_cost: addedValue / addedStock,
            total_cost: addedValue,
            notes: openingDescription,
            branch_id: openingBranchId!,
            warehouse_id: warehouseId,
            product_id: productId,
          },
        });
        await this.stock.applyMovement({
          productId,
          warehouseId,
          direction: MovementDirection.in,
          quantity: addedStock,
          txnType: InventoryTxnType.adjustment,
          unitCost: addedValue / addedStock,
          docType: 'opening_stock',
          docRef: String(opening.id),
          branchId: openingBranchId!,
          createdBy: userId,
        }, tx);
        await this.moduleLedger.postOpeningStock({
          openingStockId: opening.id,
          branchId: openingBranchId!,
          date: opening.opening_stock_date!.toISOString().slice(0, 10),
          amount: addedValue,
          itemName: existing.name_ar,
          createdBy: userId,
        }, tx);
      }
    }, { maxWait: 10_000, timeout: 30_000 });

    if (dto.applyToAllBranches) await this.fanOutToAllBranches(productId);
    return this.findOne(productId);
  }

  private async fanOutToAllBranches(productId: number) {
    const branches = await this.prisma.tbl_branches.findMany({
      select: { branch_id: true },
    });
    for (const b of branches) {
      await this.prisma.inv_product_branches.upsert({
        where: {
          product_id_branch_id: { product_id: productId, branch_id: b.branch_id },
        },
        create: { product_id: productId, branch_id: b.branch_id },
        update: {},
      });
    }
  }

  private async assertMasterDataChangeAllowed(
    productId: number,
    existing: { unit_of_measure: string; inventory_kind: string; inventory_section: string },
    dto: Partial<UpsertProductDto>,
  ) {
    const unitChanged = dto.unitOfMeasure !== undefined
      && dto.unitOfMeasure.trim().toLowerCase() !== existing.unit_of_measure.trim().toLowerCase();
    const kindChanged = (dto.inventoryKind !== undefined && dto.inventoryKind !== existing.inventory_kind)
      || (dto.inventorySection !== undefined && dto.inventorySection !== existing.inventory_section);
    if (!unitChanged && !kindChanged) return;

    const [movements, balances, recipes, variantRecipes] = await Promise.all([
      this.prisma.inv_movements.count({ where: { product_id: productId } }),
      this.prisma.inv_stock_balances.count({
        where: {
          product_id: productId,
          current_stock: { not: 0 },
        },
      }),
      this.prisma.cafe_product_recipes.count({ where: { ingredient_id: productId } }),
      this.prisma.cafe_variant_recipes.count({ where: { ingredient_id: productId } }),
    ]);
    if (!movements && !balances && !recipes && !variantRecipes) return;

    if (unitChanged) {
      throw new BadRequestException(
        'لا يمكن تغيير وحدة القياس لأن للخامة رصيدًا أو حركة مخزون أو استخدامًا في وصفة. يمكن تصحيح الوحدة من التعديل قبل بدء استخدامها فقط.',
      );
    }
    throw new BadRequestException(
      'لا يمكن تغيير نوع أو قسم الصنف بعد وجود حركات مخزنية أو استخدامه في وصفة حفاظًا على سلامة المخزون.',
    );
  }

  async create(dto: UpsertProductDto, userId: number, branchId?: number) {
    if (dto.isPackaged) {
      return this.createPackagedMaterial(dto, userId, branchId);
    }
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم المنتج مطلوب');

    const productCode = dto.productCode?.trim() || (await this.generateProductCode());
    await assertUnique(
      () =>
        this.prisma.inv_products.findFirst({
          where: { product_code: productCode, ...notDeletedFilter() },
        }),
      'كود المنتج مستخدم بالفعل',
    );
    if (dto.barcode?.trim()) {
      await assertUnique(
        () =>
          this.prisma.inv_products.findFirst({
            where: { barcode: dto.barcode!.trim(), ...notDeletedFilter() },
          }),
        'الباركود مستخدم بالفعل',
      );
    }

    const initialStock = Number(dto.initialStock ?? 0);
    if (dto.initialTotalCost != null && initialStock <= 0) {
      throw new BadRequestException('أدخل كمية الرصيد الافتتاحي لحساب تكلفة الوحدة من التكلفة الإجمالية');
    }
    const openingUnitCost = dto.initialTotalCost != null && initialStock > 0
      ? dto.initialTotalCost / initialStock
      : dto.costPrice ?? 0;
    const cost = dto.inventoryKind === 'manufactured_internal' && dto.recipes?.length
      ? await this.estimateCompositeCost(dto.recipes)
      : openingUnitCost;
    const isSellable = !this.isNonSellableInventory(dto.inventoryKind, dto.inventorySection);
    const sellingPrice = isSellable ? dto.sellingPrice ?? 0 : 0;
    if (isSellable && sellingPrice < cost) {
      throw new BadRequestException('سعر البيع لا يمكن أن يكون أقل من التكلفة');
    }
    if (dto.inventoryKind === 'manufactured_internal' && !dto.recipes?.length) {
      throw new BadRequestException('الخامة المصنعة تحتاج مكونًا واحدًا على الأقل');
    }
    const initialStockValue = initialStock * cost;
    if (initialStock > 0 && initialStockValue <= 0) {
      throw new BadRequestException('تكلفة رصيد أول المدة يجب أن تكون أكبر من صفر');
    }
    const openingBranchId = initialStock > 0
      ? await this.resolveOpeningStockBranchId(dto.openingBranchId ?? branchId)
      : null;
    if (initialStockValue > 0) await this.moduleLedger.ensureChart();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inv_products.create({
        data: {
        product_code: productCode,
        name_ar: dto.nameAr.trim(),
        name_en: dto.nameEn?.trim() || dto.nameAr.trim(),
        description: dto.description ?? null,
        barcode: dto.barcode ?? null,
        category_id: dto.categoryId ?? null,
        brand_id: dto.brandId ?? null,
        manufacturer_id: dto.manufacturerId ?? null,
        supplier_id: dto.supplierId ?? null,
        inventory_kind: dto.inventoryKind ?? 'general',
        inventory_section: dto.inventorySection
          ?? (dto.inventoryKind === 'raw_material' || dto.inventoryKind === 'manufactured_internal'
            ? 'preparation_ingredients'
            : dto.inventoryKind === 'ready_product'
              ? 'ready_products'
              : 'general'),
        cost_price: cost,
        selling_price: sellingPrice,
        wholesale_price: dto.wholesalePrice ?? null,
        unit_of_measure: dto.unitOfMeasure ?? 'وحدة',
        unit_template_id: dto.unitTemplateId ?? null,
        min_stock: dto.inventoryKind === 'manufactured_internal' ? 0 : (dto.minStock ?? 1),
        max_stock: dto.maxStock ?? 1000,
        reorder_point: dto.inventoryKind === 'manufactured_internal' ? 0 : (dto.reorderPoint ?? 10),
        image_url: dto.imageUrl ?? null,
        model: dto.model ?? null,
        color: dto.color ?? null,
        size: dto.size?.trim() || null,
        material: dto.material ?? null,
        weight_kg: dto.weightKg ?? null,
        dimensions: (dto.dimensions ?? undefined) as Prisma.InputJsonValue | undefined,
        warranty_period: dto.warrantyPeriod ?? null,
        expiry_date: dto.expiryDate ? new Date(dto.expiryDate) : null,
        batch_number: dto.batchNumber ?? null,
        shelf_location: dto.shelfLocation ?? null,
        apply_to_all_branches: dto.applyToAllBranches ?? false,
        status: dto.status ?? 'active',
        created_by: userId,
        },
        include: this.includeRelations(),
      });

      // Cafe purchases are intentionally filtered by the supplier-product
      // relation. Keep that relation in sync when a primary supplier is
      // selected on the raw-material/product form.
      if (dto.supplierId) {
        await tx.inv_supplier_products.upsert({
          where: {
            supplier_id_product_id: {
              supplier_id: dto.supplierId,
              product_id: created.id,
            },
          },
          create: {
            supplier_id: dto.supplierId,
            product_id: created.id,
            purchase_unit: dto.unitOfMeasure ?? created.unit_of_measure,
            is_active: true,
          },
          update: {
            is_active: true,
          },
        });
      }

      if (created.inventory_kind === 'ready_product' || created.inventory_section === 'ready_products') {
        await tx.cafe_products.create({
          data: {
            product_code: `CF-INV-${created.id}`,
            name: created.name_ar,
            category_id: created.category_id,
            product_type: 'ready',
            inventory_product_id: created.id,
            sell_price: created.selling_price,
            image_url: created.image_url,
            is_active: created.status === 'active',
          },
        });
      }

      if (created.inventory_kind === 'manufactured_internal' && dto.recipes?.length) {
        await this.syncCompositeCafeProduct(tx, created, dto.recipes, cost);
      }

      if (initialStock > 0) {
        const branchIdForOpening = openingBranchId!;
        const warehouseId = await this.location.resolveBranchStockLocation(branchIdForOpening, tx);
        const opening = await tx.inv_opening_stocks.create({
          data: {
            opening_stock_date: new Date(),
            item_code: created.product_code,
            quantity: initialStock,
            unit_cost: cost,
            total_cost: initialStock * cost,
            notes: 'رصيد افتتاحي عند إنشاء الصنف',
            branch_id: branchIdForOpening,
            warehouse_id: warehouseId,
            product_id: created.id,
          },
        });
        await this.stock.applyMovement({
          productId: created.id,
          warehouseId,
          direction: MovementDirection.in,
          quantity: initialStock,
          operation: 'set',
          txnType: InventoryTxnType.adjustment,
          unitCost: cost,
          docType: 'opening_stock',
          docRef: String(opening.id),
          branchId: branchIdForOpening,
          createdBy: userId,
        }, tx);
        await this.moduleLedger.postOpeningStock({
          openingStockId: opening.id,
          branchId: branchIdForOpening,
          date: opening.opening_stock_date!.toISOString().slice(0, 10),
          amount: initialStock * cost,
          itemName: created.name_ar,
          createdBy: userId,
        }, tx);
      }

      return created;
    });

    if (dto.applyToAllBranches) {
      await this.fanOutToAllBranches(row.id);
    }

    return this.findOne(row.id);
  }

  async update(id: number, dto: Partial<UpsertProductDto>, userId = 0, branchId?: number) {
    const existing = await this.prisma.inv_products.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المنتج غير موجود');
    if (existing.is_packaged && dto.packages) {
      return this.updatePackagedMaterial(id, dto, userId, branchId);
    }
    if (dto.isPackaged && !existing.is_packaged) {
      throw new BadRequestException('لا يمكن تحويل خامة مستخدمة إلى مجموعة عبوات؛ أنشئ خامة عبوات جديدة حفاظًا على الحركات الحالية');
    }
    await this.assertMasterDataChangeAllowed(id, existing, dto);

    const applyAll = dto.applyToAllBranches ?? existing.apply_to_all_branches;
    const nextInventoryKind = dto.inventoryKind ?? existing.inventory_kind;
    const nextInventorySection = dto.inventorySection ?? existing.inventory_section;
    const isComposite = nextInventoryKind === 'manufactured_internal';
    const recipeCost = isComposite && dto.recipes
      ? await this.estimateCompositeCost(dto.recipes)
      : null;
    if (isComposite && dto.recipes && !dto.recipes.length) {
      throw new BadRequestException('الخامة المصنعة تحتاج مكونًا واحدًا على الأقل');
    }
    const protectsCalculatedCost = isComposite;
    const isNonSellable = this.isNonSellableInventory(nextInventoryKind, nextInventorySection);
    const nextCost = recipeCost != null
      ? recipeCost
      : (protectsCalculatedCost ? toNumber(existing.cost_price) : dto.costPrice ?? toNumber(existing.cost_price));
    const nextSellingPrice = isNonSellable ? 0 : dto.sellingPrice ?? toNumber(existing.selling_price);
    if (!isNonSellable && nextSellingPrice < nextCost) {
      throw new BadRequestException('سعر البيع لا يمكن أن يكون أقل من التكلفة');
    }

    const effectiveSupplierId = dto.supplierId ?? existing.supplier_id;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inv_products.update({
        where: { id },
        data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
        ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode ?? null } : {}),
        ...(dto.categoryId !== undefined ? { category_id: dto.categoryId ?? null } : {}),
        ...(dto.brandId !== undefined ? { brand_id: dto.brandId ?? null } : {}),
        ...(dto.manufacturerId !== undefined ? { manufacturer_id: dto.manufacturerId ?? null } : {}),
        ...(dto.supplierId !== undefined ? { supplier_id: dto.supplierId ?? null } : {}),
        ...(dto.inventoryKind !== undefined ? { inventory_kind: dto.inventoryKind } : {}),
        ...(dto.inventorySection !== undefined
          ? { inventory_section: dto.inventorySection }
          : isComposite
            ? { inventory_section: 'preparation_ingredients' }
            : {}),
        ...(recipeCost != null
          ? { cost_price: recipeCost }
          : (!protectsCalculatedCost && dto.costPrice !== undefined ? { cost_price: dto.costPrice } : {})),
        ...(isNonSellable
          ? { selling_price: 0 }
          : dto.sellingPrice !== undefined
            ? { selling_price: dto.sellingPrice }
            : {}),
        ...(dto.wholesalePrice !== undefined ? { wholesale_price: dto.wholesalePrice ?? null } : {}),
        ...(dto.unitOfMeasure !== undefined ? { unit_of_measure: dto.unitOfMeasure } : {}),
        ...(dto.unitTemplateId !== undefined ? { unit_template_id: dto.unitTemplateId ?? null } : {}),
        ...(isComposite
          ? { min_stock: 0, reorder_point: 0 }
          : {
              ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
              ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
            }),
        ...(dto.maxStock !== undefined ? { max_stock: dto.maxStock } : {}),
        ...(dto.imageUrl !== undefined ? { image_url: dto.imageUrl ?? null } : {}),
        ...(dto.size !== undefined ? { size: dto.size?.trim() || null } : {}),
        ...(dto.applyToAllBranches !== undefined ? { apply_to_all_branches: dto.applyToAllBranches } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: this.includeRelations(),
      });

      if (effectiveSupplierId) {
        await tx.inv_supplier_products.upsert({
          where: {
            supplier_id_product_id: {
              supplier_id: effectiveSupplierId,
              product_id: id,
            },
          },
          create: {
            supplier_id: effectiveSupplierId,
            product_id: id,
            purchase_unit: dto.unitOfMeasure ?? updated.unit_of_measure,
            is_active: true,
          },
          update: {
            is_active: true,
          },
        });
      }
      if (dto.unitOfMeasure !== undefined) {
        await tx.inv_supplier_products.updateMany({
          where: { product_id: id, purchase_unit: existing.unit_of_measure },
          data: { purchase_unit: dto.unitOfMeasure },
        });
      }

      const isReadyProduct = updated.inventory_kind === 'ready_product'
        || updated.inventory_section === 'ready_products';
      const isCompositeProduct = updated.inventory_kind === 'manufactured_internal';
      const linkedCafeProduct = await tx.cafe_products.findUnique({
        where: { inventory_product_id: id },
      });
      if (isReadyProduct) {
        if (linkedCafeProduct) {
          await tx.cafe_products.update({
            where: { id: linkedCafeProduct.id },
            data: {
              name: updated.name_ar,
              category_id: updated.category_id,
              product_type: 'ready',
              sell_price: updated.selling_price,
              image_url: updated.image_url,
              is_active: !updated.is_deleted && updated.status === 'active',
            },
          });
        } else {
          await tx.cafe_products.create({
            data: {
              product_code: `CF-INV-${updated.id}`,
              name: updated.name_ar,
              category_id: updated.category_id,
              product_type: 'ready',
              inventory_product_id: updated.id,
              sell_price: updated.selling_price,
              image_url: updated.image_url,
              is_active: updated.status === 'active',
            },
          });
        }
      } else if (isCompositeProduct && dto.recipes) {
        await this.syncCompositeCafeProduct(tx, updated, dto.recipes, nextCost);
      } else if (isCompositeProduct && linkedCafeProduct) {
        await tx.cafe_products.update({
          where: { id: linkedCafeProduct.id },
          data: {
            name: updated.name_ar,
            product_type: 'internal',
            sell_price: 0,
            is_active: !updated.is_deleted && updated.status === 'active',
          },
        });
      } else if (linkedCafeProduct && !isCompositeProduct) {
        await tx.cafe_products.update({
          where: { id: linkedCafeProduct.id },
          data: { is_active: false },
        });
      }

      if (dto.sellingPrice !== undefined || isNonSellable) {
        await tx.cafe_products.updateMany({
          where: { inventory_product_id: id },
          data: { sell_price: isNonSellable ? 0 : dto.sellingPrice! },
        });
      }

      if (dto.reorderPoint !== undefined || dto.minStock !== undefined || dto.maxStock !== undefined) {
        await tx.inv_stock_balances.updateMany({
          where: { product_id: id },
          data: {
            ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
            ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
            ...(dto.maxStock !== undefined ? { max_stock: dto.maxStock } : {}),
          },
        });
      }

      return updated;
    });

    if (applyAll && !existing.apply_to_all_branches) {
      await this.fanOutToAllBranches(id);
    }

    return this.mapProduct(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_products.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المنتج غير موجود');
    await this.prisma.$transaction(async (tx) => {
      await tx.inv_products.update({
        where: { id },
        data: { is_deleted: true, status: 'inactive' },
      });
      // Unified archive: hide from supplier purchase selectors immediately.
      await tx.inv_supplier_products.updateMany({
        where: { product_id: id },
        data: { is_active: false },
      });
      await tx.cafe_products.updateMany({
        where: { inventory_product_id: id },
        data: { is_active: false },
      });
    });
    return { success: true };
  }

  async restore(id: number) {
    const existing = await this.prisma.inv_products.findFirst({
      where: { id, is_deleted: true },
    });
    if (!existing) throw new NotFoundException('الخامة المؤرشفة غير موجودة');
    await this.prisma.$transaction(async (tx) => {
      await tx.inv_products.update({
        where: { id },
        data: { is_deleted: false, status: 'active' },
      });
      await tx.inv_supplier_products.updateMany({
        where: { product_id: id },
        data: { is_active: true },
      });
      await tx.cafe_products.updateMany({
        where: { inventory_product_id: id },
        data: { is_active: true },
      });
    });
    return this.findOne(id);
  }

  async updateStock(id: number, dto: UpdateProductStockDto, userId: number, user?: JwtUser) {
    const product = await this.findOne(id);
    const warehouseId = dto.warehouseId;
    if (!warehouseId) throw new BadRequestException('المستودع مطلوب');

    const warehouse = await this.prisma.inv_warehouses.findFirst({
      where: { id: warehouseId, ...notDeletedFilter() },
    });
    if (!warehouse) throw new BadRequestException('المستودع غير موجود');
    if (!this.branchScope.isBranchAllowed(user, warehouse.branch_id)) {
      throw new BadRequestException('لا تملك صلاحية تعديل مخزون هذا الفرع');
    }

    await this.stock.applyMovement({
      productId: product.id,
      warehouseId,
      direction: dto.operation === 'subtract' ? MovementDirection.out : MovementDirection.in,
      quantity: dto.quantity,
      operation: dto.operation,
      txnType: InventoryTxnType.adjustment,
      docType: 'product_stock_update',
      docRef: String(id),
      branchId: warehouse.branch_id,
      createdBy: userId,
    });

    return this.productInventory(id);
  }

  async bulkImport(products: UpsertProductDto[], userId: number, branchId?: number) {
    const imported: number[] = [];
    const failed: Array<{ index: number; error: string; name?: string }> = [];
    for (let i = 0; i < products.length; i++) {
      try {
        const dto = products[i];
        if (!dto.nameAr?.trim()) throw new BadRequestException('اسم المنتج مطلوب');
        if (dto.barcode) {
          const dup = await this.prisma.inv_products.findFirst({
            where: { barcode: dto.barcode, ...notDeletedFilter() },
          });
          if (dup) {
            await this.update(dup.id, dto);
            imported.push(dup.id);
            continue;
          }
        }
        const row = await this.create(dto, userId, branchId);
        imported.push(row.id);
      } catch (e) {
        failed.push({
          index: i,
          error: e instanceof Error ? e.message : 'خطأ غير معروف',
          name: products[i]?.nameAr,
        });
      }
    }
    return { imported: imported.length, failed: failed.length, failedRows: failed, productIds: imported };
  }

  async bulkUpdate(productIds: number[], updates: Partial<UpsertProductDto>) {
    const updated: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];
    for (const id of productIds) {
      try {
        await this.update(id, updates);
        updated.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : 'خطأ' });
      }
    }
    return { updated: updated.length, failed: failed.length, failedRows: failed };
  }
}

