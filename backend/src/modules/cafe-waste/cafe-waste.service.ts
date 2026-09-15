import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnStatus, InventoryTxnType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { convertToBaseUnit, type RecipeUnit } from '../../common/utils/units';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import { InventoryLocationService } from '../inventory/inventory-location.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { LedgerService } from '../accounting/ledger.service';
import { paginated } from '../../common/dto/list-result';
import { recordSystemExpense, reverseSystemExpense } from '../finance/system-expense.util';
import { localDateString } from '../sales/sales.utils';
import { cairoDateBounds } from '../../common/utils/cairo-date';
import {
  CafeWasteAnalyticsDto,
  CreateCafeWasteDto,
  CreateCafeWasteReasonDto,
  ListCafeWasteCatalogDto,
  ListCafeWasteRecordsDto,
  PreviewCafeWasteDto,
  ReverseCafeWasteDto,
  UpdateCafeWasteReasonDto,
} from './dto/cafe-waste.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

type IngredientRow = {
  id: number;
  product_code?: string | null;
  name_ar: string;
  unit_of_measure: string;
  cost_price: Prisma.Decimal | number;
  inventory_kind: string;
};

type RecipeRow = {
  quantity: Prisma.Decimal | number;
  unit: string;
  ingredient: IngredientRow;
};

type ComponentSeed = {
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

const CAFE_INVENTORY_SCOPE: Prisma.inv_productsWhereInput[] = [
  { inventory_kind: 'raw_material', inventory_section: { in: ['preparation_ingredients', 'serving_packaging'] } },
  { inventory_kind: 'ready_product', inventory_section: 'ready_products' },
];

function isCafeInventoryProduct(product: { inventory_kind: string; inventory_section: string }) {
  return (product.inventory_kind === 'raw_material'
      && ['preparation_ingredients', 'serving_packaging'].includes(product.inventory_section))
    || (product.inventory_kind === 'ready_product' && product.inventory_section === 'ready_products');
}

export type CafeWastePreview = {
  source: {
    kind: 'inventory' | 'cafe_product';
    id: number;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unit: string;
    variantId: number | null;
    packageId: number | null;
    packageLabel: string | null;
    inventoryProductId: number | null;
    cafeProductId: number | null;
  };
  branchId: number;
  warehouseId: number;
  components: Array<ComponentSeed & {
    cost: number;
    currentStock: number;
    afterStock: number;
    shortage: boolean;
  }>;
  totalCost: number;
  hasShortage: boolean;
};

function numberValue(value: Prisma.Decimal | number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function allocateComponentCosts(lines: ComponentSeed[]) {
  const exactCents = lines.map((line) => Math.max(0, line.quantity * line.unitCost * 100));
  const allocatedCents = exactCents.map(Math.floor);
  const headerCents = Math.round(exactCents.reduce((sum, value) => sum + value, 0));
  let remainder = headerCents - allocatedCents.reduce((sum, value) => sum + value, 0);
  const priority = exactCents
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
    allocatedCents[priority[cursor % priority.length].index] += 1;
  }
  return { costs: allocatedCents.map((value) => value / 100), total: headerCents / 100 };
}

@Injectable()
export class CafeWasteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly ledger: LedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranch(user: JwtUser, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل هالك على هذا الفرع');
    }
  }

  private compatibleQuantity(quantity: number, fromUnit: string, baseUnit: string) {
    const converted = convertToBaseUnit(quantity, fromUnit as RecipeUnit, baseUnit);
    if (converted == null) {
      throw new BadRequestException(`الوحدة ${fromUnit} غير متوافقة مع وحدة المخزون ${baseUnit}`);
    }
    const rounded = roundQuantity(converted);
    if (rounded <= 0) throw new BadRequestException('كمية الهالك يجب أن تكون أكبر من صفر');
    return rounded;
  }

  private async explodeRecipe(
    db: DbClient,
    recipes: RecipeRow[],
    multiplier: number,
    depth = 0,
    trail = new Set<number>(),
  ): Promise<ComponentSeed[]> {
    if (depth > 6) throw new BadRequestException('تعذر تفكيك الوصفة بسبب عمق مفرط');
    const result: ComponentSeed[] = [];
    for (const recipe of recipes) {
      const baseQuantity = this.compatibleQuantity(
        numberValue(recipe.quantity) * multiplier,
        recipe.unit,
        recipe.ingredient.unit_of_measure,
      );
      if (recipe.ingredient.inventory_kind !== 'manufactured_internal') {
        result.push({
          productId: recipe.ingredient.id,
          name: recipe.ingredient.name_ar,
          quantity: baseQuantity,
          unit: recipe.ingredient.unit_of_measure,
          unitCost: numberValue(recipe.ingredient.cost_price),
        });
        continue;
      }
      if (trail.has(recipe.ingredient.id)) {
        throw new BadRequestException(`يوجد تكرار دائري في وصفة ${recipe.ingredient.name_ar}`);
      }
      const manufactured = await db.cafe_products.findFirst({
        where: {
          inventory_product_id: recipe.ingredient.id,
          product_type: 'internal',
          is_active: true,
        },
        include: {
          recipes: { include: { ingredient: true }, orderBy: { sort_order: 'asc' } },
        },
      });
      if (!manufactured?.recipes?.length) {
        throw new BadRequestException(`لا توجد وصفة مكونات للخامة المصنعة ${recipe.ingredient.name_ar}`);
      }
      const nextTrail = new Set(trail);
      nextTrail.add(recipe.ingredient.id);
      result.push(...await this.explodeRecipe(
        db,
        manufactured.recipes as unknown as RecipeRow[],
        baseQuantity,
        depth + 1,
        nextTrail,
      ));
    }
    return result;
  }

  private mergeComponents(lines: ComponentSeed[]) {
    const merged = new Map<number, ComponentSeed>();
    for (const line of lines) {
      const current = merged.get(line.productId);
      if (current) {
        current.quantity = roundQuantity(current.quantity + line.quantity);
      } else {
        merged.set(line.productId, { ...line, quantity: roundQuantity(line.quantity) });
      }
    }
    return [...merged.values()];
  }

  private async resolvePreviewSeeds(
    db: DbClient,
    dto: PreviewCafeWasteDto,
  ): Promise<{ source: CafeWastePreview['source']; lines: ComponentSeed[] }> {
    if (dto.sourceKind === 'inventory') {
      const product = await db.inv_products.findFirst({
        where: { id: dto.sourceId, status: 'active', is_deleted: false },
        include: { packages: { where: { is_active: true }, orderBy: { id: 'asc' } } },
      });
      if (!product) throw new NotFoundException('الخامة أو المنتج المخزني غير موجود');
      if (!isCafeInventoryProduct(product)) {
        throw new BadRequestException('هذا الصنف لا يتبع مخزون الكافيه ولا يمكن تسجيله كهالك من هذه الصفحة');
      }
      let quantity: number;
      let packageLabel: string | null = null;
      if (dto.unit === 'package') {
        const selectedPackage = product.packages.find((row) => row.id === dto.packageId);
        if (!selectedPackage) throw new BadRequestException('اختر عبوة صحيحة لهذا الصنف');
        quantity = roundQuantity(dto.quantity * numberValue(selectedPackage.package_base_quantity));
        packageLabel = `${numberValue(selectedPackage.package_size)} ${selectedPackage.package_unit}`;
      } else {
        quantity = this.compatibleQuantity(dto.quantity, dto.unit, product.unit_of_measure);
      }

      let lines: ComponentSeed[];
      if (product.inventory_kind === 'manufactured_internal') {
        const manufactured = await db.cafe_products.findFirst({
          where: { inventory_product_id: product.id, product_type: 'internal', is_active: true },
          include: { recipes: { include: { ingredient: true }, orderBy: { sort_order: 'asc' } } },
        });
        if (!manufactured?.recipes?.length) {
          throw new BadRequestException(`لا توجد وصفة مكونات للخامة المصنعة ${product.name_ar}`);
        }
        lines = await this.explodeRecipe(db, manufactured.recipes as unknown as RecipeRow[], quantity, 0, new Set([product.id]));
      } else {
        lines = [{
          productId: product.id,
          name: product.name_ar,
          quantity,
          unit: product.unit_of_measure,
          unitCost: numberValue(product.cost_price),
        }];
      }
      return {
        source: {
          kind: 'inventory',
          id: product.id,
          name: product.name_ar,
          imageUrl: product.image_url ?? null,
          quantity: dto.quantity,
          unit: dto.unit,
          variantId: null,
          packageId: dto.packageId ?? null,
          packageLabel,
          inventoryProductId: product.id,
          cafeProductId: null,
        },
        lines,
      };
    }

    if (dto.unit !== 'piece') {
      throw new BadRequestException('المنتجات المحضّرة تُسجل بعدد القطع');
    }
    const product = await db.cafe_products.findFirst({
      where: { id: dto.sourceId, is_active: true, product_type: { not: 'internal' } },
      include: {
        inventory_product: true,
        recipes: { include: { ingredient: true }, orderBy: { sort_order: 'asc' } },
        variants: {
          where: { is_active: true },
          include: { recipes: { include: { ingredient: true }, orderBy: { sort_order: 'asc' } } },
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!product) throw new NotFoundException('منتج الكافيه غير موجود');
    const variant = dto.variantId == null
      ? null
      : product.variants.find((row) => row.id === dto.variantId) ?? null;
    if (product.variants.length && !variant) throw new BadRequestException('اختر حجم المنتج أو نوعه');

    let lines: ComponentSeed[];
    if (product.product_type === 'ready') {
      if (!product.inventory_product) throw new BadRequestException(`المنتج ${product.name} غير مربوط بالمخزون`);
      lines = [{
        productId: product.inventory_product.id,
        name: product.inventory_product.name_ar,
        quantity: this.compatibleQuantity(dto.quantity, 'piece', product.inventory_product.unit_of_measure),
        unit: product.inventory_product.unit_of_measure,
        unitCost: numberValue(product.inventory_product.cost_price),
      }];
    } else {
      const recipes = (variant?.recipes ?? product.recipes) as unknown as RecipeRow[];
      if (!recipes.length) throw new BadRequestException(`لا توجد وصفة مكونات للمنتج ${product.name}`);
      lines = await this.explodeRecipe(db, recipes, dto.quantity);
    }
    return {
      source: {
        kind: 'cafe_product',
        id: product.id,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        imageUrl: product.image_url ?? null,
        quantity: dto.quantity,
        unit: 'piece',
        variantId: variant?.id ?? null,
        packageId: null,
        packageLabel: null,
        inventoryProductId: product.inventory_product_id ?? null,
        cafeProductId: product.id,
      },
      lines,
    };
  }

  private async previewWithDb(db: DbClient, dto: PreviewCafeWasteDto, warehouseId: number): Promise<CafeWastePreview> {
    const resolved = await this.resolvePreviewSeeds(db, dto);
    const lines = this.mergeComponents(resolved.lines);
    const balances = await db.inv_stock_balances.findMany({
      where: { warehouse_id: warehouseId, product_id: { in: lines.map((line) => line.productId) } },
      select: { product_id: true, current_stock: true },
    });
    const stockByProduct = new Map(balances.map((row) => [row.product_id, numberValue(row.current_stock)]));
    const allocation = allocateComponentCosts(lines);
    const components = lines.map((line, index) => {
      const currentStock = roundQuantity(stockByProduct.get(line.productId) ?? 0);
      const afterStock = roundQuantity(currentStock - line.quantity);
      return {
        ...line,
        unitCost: line.unitCost,
        cost: allocation.costs[index],
        currentStock,
        afterStock,
        shortage: afterStock < 0,
      };
    });
    return {
      source: resolved.source,
      branchId: dto.branchId,
      warehouseId,
      components,
      totalCost: allocation.total,
      hasShortage: components.some((row) => row.shortage),
    };
  }

  async preview(dto: PreviewCafeWasteDto, user: JwtUser): Promise<CafeWastePreview> {
    this.assertBranch(user, dto.branchId);
    const warehouseId = await this.location.resolveBranchStockLocation(dto.branchId);
    return this.previewWithDb(this.prisma, dto, warehouseId);
  }

  private requestedBranch(user: JwtUser, value?: string | number) {
    const branchId = value != null && value !== '' && value !== 'all'
      ? Number(value)
      : Number(user.branch ?? 0);
    if (!branchId) throw new BadRequestException('اختر الفرع أولًا');
    this.assertBranch(user, branchId);
    return branchId;
  }

  async catalog(q: ListCafeWasteCatalogDto, user: JwtUser) {
    const branchId = this.requestedBranch(user, q.branchId);
    const warehouseId = await this.location.resolveBranchStockLocation(branchId);
    const search = q.search?.trim();
    const inventoryWhere: Prisma.inv_productsWhereInput = {
      is_deleted: false,
      status: 'active',
      AND: [
        { OR: CAFE_INVENTORY_SCOPE },
        ...(search ? [{ OR: [
          { name_ar: { contains: search } },
          { name_en: { contains: search } },
          { product_code: { contains: search } },
          { barcode: { contains: search } },
        ] }] : []),
      ],
    };
    const cafeWhere: Prisma.cafe_productsWhereInput = {
      is_active: true,
      product_type: { not: 'internal' },
      ...(search ? { OR: [
        { name: { contains: search } },
        { product_code: { contains: search } },
      ] } : {}),
    };
    const [inventory, cafe] = await Promise.all([
      this.prisma.inv_products.findMany({
        where: inventoryWhere,
        include: {
          packages: { where: { is_active: true }, orderBy: { id: 'asc' } },
          balances: { where: { warehouse_id: warehouseId }, select: { current_stock: true } },
          cafe_ready_products: { where: { is_active: true, product_type: { not: 'internal' } }, select: { id: true } },
        },
        orderBy: { name_ar: 'asc' },
        take: 500,
      }),
      this.prisma.cafe_products.findMany({
        where: cafeWhere,
        include: {
          inventory_product: {
            include: { balances: { where: { warehouse_id: warehouseId }, select: { current_stock: true } } },
          },
          variants: { where: { is_active: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    ]);

    const inventoryCards = inventory
      .filter((row) => row.inventory_kind !== 'manufactured_internal')
      .filter((row) => !row.cafe_ready_products.length)
      .map((row) => ({
        sourceKind: 'inventory' as const,
        sourceId: row.id,
        name: row.name_ar,
        code: row.product_code,
        imageUrl: row.image_url,
        kind: row.inventory_section === 'serving_packaging'
          ? 'packaging'
          : row.inventory_kind === 'ready_product'
            ? 'ready_product'
            : 'raw_material',
        inventoryKind: row.inventory_kind,
        inventorySection: row.inventory_section,
        unit: row.unit_of_measure,
        stock: roundQuantity(row.balances.reduce((sum, balance) => sum + numberValue(balance.current_stock), 0)),
        packages: row.packages.map((pack) => ({
          id: pack.id,
          label: `${numberValue(pack.package_size)} ${pack.package_unit}`,
          baseQuantity: numberValue(pack.package_base_quantity),
        })),
        variants: [],
      }));
    const cafeCards = cafe.map((row) => ({
      sourceKind: 'cafe_product' as const,
      sourceId: row.id,
      name: row.name,
      code: row.product_code,
      imageUrl: row.image_url,
      kind: row.product_type === 'ready' ? 'ready_product' : 'prepared_product',
      inventoryKind: row.inventory_product?.inventory_kind ?? null,
      inventorySection: row.inventory_product?.inventory_section ?? null,
      unit: 'piece',
      stock: row.product_type === 'ready'
        ? roundQuantity(row.inventory_product?.balances.reduce((sum, balance) => sum + numberValue(balance.current_stock), 0) ?? 0)
        : null,
      packages: [],
      variants: row.variants.map((variant) => ({ id: variant.id, name: variant.name })),
    }));
    const selectedKind = q.kind ?? 'all';
    const all = [...inventoryCards, ...cafeCards]
      .filter((row) => selectedKind === 'all' || row.kind === selectedKind)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return paginated(all.slice(q.skip, q.skip + q.take), all.length, q.page, q.pageSize);
  }

  async listReasons(includeInactive = false) {
    return this.prisma.cafe_waste_reasons.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    }).then((rows) => rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      createdAt: row.created_at,
    })));
  }

  async createReason(dto: CreateCafeWasteReasonDto, user: JwtUser) {
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('سبب الهالك يجب أن يكون حرفين على الأقل');
    const row = await this.prisma.cafe_waste_reasons.upsert({
      where: { name },
      create: { name, created_by: user.sub },
      update: { is_active: true },
    });
    return { id: row.id, name: row.name, isActive: row.is_active };
  }

  async updateReason(id: number, dto: UpdateCafeWasteReasonDto) {
    const existing = await this.prisma.cafe_waste_reasons.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('سبب الهالك غير موجود');
    const name = dto.name?.trim();
    if (dto.name != null && (!name || name.length < 2)) {
      throw new BadRequestException('سبب الهالك يجب أن يكون حرفين على الأقل');
    }
    if (name && name !== existing.name) {
      const clash = await this.prisma.cafe_waste_reasons.findFirst({ where: { name, id: { not: id } } });
      if (clash) throw new BadRequestException('سبب الهالك موجود بالفعل');
    }
    const row = await this.prisma.cafe_waste_reasons.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.isActive != null ? { is_active: dto.isActive } : {}),
      },
    });
    return { id: row.id, name: row.name, isActive: row.is_active };
  }

  private async resolveReason(db: Prisma.TransactionClient, dto: CreateCafeWasteDto, user: JwtUser) {
    if (dto.reasonId && dto.newReason?.trim()) {
      throw new BadRequestException('اختر سببًا موجودًا أو أضف سببًا جديدًا، وليس الاثنين');
    }
    if (dto.reasonId) {
      const reason = await db.cafe_waste_reasons.findFirst({ where: { id: dto.reasonId, is_active: true } });
      if (!reason) throw new BadRequestException('سبب الهالك غير موجود أو غير نشط');
      return reason;
    }
    const name = dto.newReason?.trim();
    if (!name) throw new BadRequestException('سبب الهالك مطلوب');
    if (name.length < 2) throw new BadRequestException('سبب الهالك يجب أن يكون حرفين على الأقل');
    return db.cafe_waste_reasons.upsert({
      where: { name },
      create: { name, created_by: user.sub },
      update: { is_active: true },
    });
  }

  private validatePreviewForCreate(preview: Pick<CafeWastePreview, 'hasShortage' | 'totalCost' | 'components'>, allowNegative?: boolean) {
    if (preview.hasShortage && !allowNegative) {
      throw new BadRequestException('كمية الهالك أكبر من الرصيد المتاح؛ عدّل الكمية أو اختر السماح برصيد سالب');
    }
    if (preview.totalCost <= 0 || preview.components.some((row) => row.unitCost <= 0)) {
      throw new BadRequestException('يجب تسجيل تكلفة صحيحة لكل مكونات الهالك قبل الحفظ');
    }
  }

  private assertIdempotentMatch(existing: any, dto: CreateCafeWasteDto, user: JwtUser) {
    this.assertBranch(user, existing.branch_id);
    const expectedInventoryId = dto.sourceKind === 'inventory' ? dto.sourceId : null;
    const expectedCafeId = dto.sourceKind === 'cafe_product' ? dto.sourceId : null;
    const expectedReasonMatches = dto.reasonId != null
      ? existing.reason_id === dto.reasonId
      : !!dto.newReason?.trim() && existing.reason_name === dto.newReason.trim();
    const samePayload = existing.branch_id === dto.branchId
      && existing.source_kind === dto.sourceKind
      && existing.inventory_product_id === expectedInventoryId
      && existing.cafe_product_id === expectedCafeId
      && (existing.cafe_variant_id ?? null) === (dto.variantId ?? null)
      && (existing.package_id ?? null) === (dto.packageId ?? null)
      && numberValue(existing.quantity) === dto.quantity
      && existing.unit === dto.unit
      && expectedReasonMatches
      && (existing.notes ?? null) === (dto.notes?.trim() || null)
      && existing.allow_negative === (dto.allowNegative === true)
      && (existing.shift_session_id ?? null) === (dto.shiftSessionId ?? null);
    if (!samePayload) throw new BadRequestException('مفتاح الطلب مستخدم بالفعل لعملية هالك مختلفة');
  }

  private wasteReference(prefix = 'WASTE') {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `${prefix}-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  async create(dto: CreateCafeWasteDto, user: JwtUser) {
    const existing = await this.prisma.cafe_waste_records.findUnique({
      where: { request_id: dto.requestId },
      include: { transaction: { include: { items: true } } },
    });
    if (existing) {
      this.assertIdempotentMatch(existing, dto, user);
      return this.mapRecord(existing);
    }

    const initialPreview = await this.preview(dto, user);
    this.validatePreviewForCreate(initialPreview, dto.allowNegative);
    await this.moduleLedger.ensureChart();
    const reference = this.wasteReference();
    const now = new Date();

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.shiftSessionId) {
          const shiftSession = await tx.sales_shift_sessions.findFirst({
            where: { id: dto.shiftSessionId, branch_id: dto.branchId, status: 'open' },
            select: { id: true },
          });
          if (!shiftSession) {
            throw new BadRequestException('الشيفت غير مفتوح أو لا ينتمي إلى الفرع المحدد');
          }
        }
        const freshPreview = await this.previewWithDb(tx, dto, initialPreview.warehouseId);
        this.validatePreviewForCreate(freshPreview, dto.allowNegative);
        const reason = await this.resolveReason(tx, dto, user);
        const transaction = await tx.inv_transactions.create({
          data: {
            reference,
            txn_type: InventoryTxnType.damage,
            status: InventoryTxnStatus.approved,
            txn_date: now,
            source_warehouse_id: freshPreview.warehouseId,
            branch_id: dto.branchId,
            total_amount: freshPreview.totalCost,
            notes: dto.notes?.trim() || null,
            reason: reason.name,
            created_by: user.sub,
            approved_by: user.sub,
            approved_at: now,
            items: { create: freshPreview.components.map((component) => ({
              product_id: component.productId,
              item_name: component.name,
              quantity: component.quantity,
              unit: component.unit,
              price: component.unitCost,
              total: component.cost,
            })) },
          },
          include: { items: true },
        });
        await this.stock.applyTransaction({
          transactionId: transaction.id,
          txnType: InventoryTxnType.damage,
          branchId: dto.branchId,
          sourceWarehouseId: freshPreview.warehouseId,
          docRef: reference,
          createdBy: user.sub,
          allowNegative: dto.allowNegative === true,
          lines: freshPreview.components.map((component) => ({
            productId: component.productId,
            quantity: component.quantity,
            unitCost: component.unitCost,
            itemName: component.name,
            unit: component.unit,
          })),
        }, tx);
        await this.moduleLedger.postInventoryConsumption({
          transactionId: transaction.id,
          reference,
          branchId: dto.branchId,
          date: localDateString(now),
          amount: freshPreview.totalCost,
          kind: 'damage',
          createdBy: user.sub,
        }, tx);
        await recordSystemExpense(tx, {
          invoiceNumber: `INV-DAMAGE-${transaction.id}`,
          date: localDateString(now),
          category: 'مخزون',
          subCategory: 'هالك',
          amount: freshPreview.totalCost,
          description: `هالك مخزون — ${reference}`,
          branchId: dto.branchId,
          createdBy: user.sub,
          paymentMethod: 'تسوية مخزون',
        });
        return tx.cafe_waste_records.create({
          data: {
            reference,
            request_id: dto.requestId,
            transaction_id: transaction.id,
            branch_id: dto.branchId,
            warehouse_id: freshPreview.warehouseId,
            source_kind: freshPreview.source.kind,
            inventory_product_id: freshPreview.source.inventoryProductId,
            cafe_product_id: freshPreview.source.cafeProductId,
            cafe_variant_id: freshPreview.source.variantId,
            package_id: freshPreview.source.packageId,
            package_label: freshPreview.source.packageLabel,
            source_name: freshPreview.source.name,
            component_snapshot: freshPreview.components.map((component) => ({
              productId: component.productId,
              name: component.name,
              quantity: component.quantity,
              unit: component.unit,
              unitCost: component.unitCost,
              cost: component.cost,
            })),
            quantity: dto.quantity,
            unit: dto.unit,
            reason_id: reason.id,
            reason_name: reason.name,
            notes: dto.notes?.trim() || null,
            total_cost: freshPreview.totalCost,
            allow_negative: dto.allowNegative === true,
            shift_session_id: dto.shiftSessionId ?? null,
            created_by: user.sub,
          },
          include: { transaction: { include: { items: true } } },
        });
      });
      return this.mapRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.cafe_waste_records.findUnique({
          where: { request_id: dto.requestId },
          include: { transaction: { include: { items: true } } },
        });
        if (duplicate) {
          this.assertIdempotentMatch(duplicate, dto, user);
          return this.mapRecord(duplicate);
        }
      }
      throw error;
    }
  }

  private mapRecord(row: any, users = new Map<number, string>()) {
    const snapshot = this.componentSnapshot(row);
    return {
      id: row.id,
      reference: row.reference,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      sourceKind: row.source_kind,
      sourceName: row.source_name,
      quantity: numberValue(row.quantity),
      unit: row.unit,
      packageId: row.package_id ?? null,
      packageLabel: row.package_label ?? null,
      reasonId: row.reason_id,
      reasonName: row.reason_name,
      notes: row.notes,
      totalCost: numberValue(row.total_cost),
      status: row.status,
      allowNegative: row.allow_negative,
      shiftSessionId: row.shift_session_id ?? null,
      createdBy: row.created_by,
      createdByName: row.created_by ? users.get(row.created_by) ?? `#${row.created_by}` : 'غير محدد',
      createdAt: row.created_at,
      reversedBy: row.reversed_by,
      reversedByName: row.reversed_by ? users.get(row.reversed_by) ?? `#${row.reversed_by}` : null,
      reversedAt: row.reversed_at,
      reversalReason: row.reversal_reason,
      components: snapshot,
    };
  }

  private componentSnapshot(row: any): Array<{
    productId: number; name: string; quantity: number; unit: string | null; unitCost: number; cost: number;
  }> {
    if (Array.isArray(row.component_snapshot)) {
      return row.component_snapshot.map((item: any) => ({
        productId: Number(item.productId),
        name: String(item.name),
        quantity: numberValue(item.quantity),
        unit: item.unit == null ? null : String(item.unit),
        unitCost: numberValue(item.unitCost),
        cost: numberValue(item.cost),
      }));
    }
    return (row.transaction?.items ?? []).map((item: any) => ({
      productId: item.product_id,
      name: item.item_name,
      quantity: numberValue(item.quantity),
      unit: item.unit,
      unitCost: numberValue(item.quantity) > 0
        ? numberValue(item.total) / numberValue(item.quantity)
        : numberValue(item.price),
      cost: numberValue(item.total),
    }));
  }

  private recordWhere(q: ListCafeWasteRecordsDto | CafeWasteAnalyticsDto, user: JwtUser): Prisma.cafe_waste_recordsWhereInput {
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const { start: dateFrom, endExclusive: dateToExclusive } = cairoDateBounds(q.dateFrom, q.dateTo);
    const search = 'search' in q ? q.search?.trim() : undefined;
    return {
      ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
      ...('reasonId' in q && q.reasonId && q.reasonId !== 'all' ? { reason_id: Number(q.reasonId) } : {}),
      ...('status' in q && q.status && q.status !== 'all' ? { status: q.status } : {}),
      ...('shiftSessionId' in q && q.shiftSessionId ? { shift_session_id: q.shiftSessionId } : {}),
      ...(search ? { OR: [
        { reference: { contains: search } },
        { source_name: { contains: search } },
        { reason_name: { contains: search } },
        { notes: { contains: search } },
      ] } : {}),
      ...(dateFrom || dateToExclusive ? { created_at: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateToExclusive ? { lt: dateToExclusive } : {}) } } : {}),
    };
  }

  async listRecords(q: ListCafeWasteRecordsDto, user: JwtUser) {
    const where = this.recordWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.cafe_waste_records.findMany({
        where,
        include: { transaction: { include: { items: true } } },
        orderBy: { created_at: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.cafe_waste_records.count({ where }),
    ]);
    const userIds = [...new Set(rows.flatMap((row) => [row.created_by, row.reversed_by]).filter((id): id is number => id != null))];
    const actors = userIds.length ? await this.prisma.users.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, name: true, username: true },
    }) : [];
    const userNames = new Map(actors.map((actor) => [actor.user_id, actor.name || actor.username || `#${actor.user_id}`]));
    return paginated(rows.map((row) => this.mapRecord(row, userNames)), total, q.page, q.pageSize);
  }

  async analytics(q: CafeWasteAnalyticsDto, user: JwtUser) {
    const rows = await this.prisma.cafe_waste_records.findMany({
      where: { ...this.recordWhere(q, user), status: 'active' },
      include: { transaction: { include: { items: true } } },
      orderBy: { created_at: 'asc' },
    });
    const actors = [...new Set(rows.map((row) => row.created_by).filter((id): id is number => id != null))];
    const users = actors.length ? await this.prisma.users.findMany({
      where: { user_id: { in: actors } }, select: { user_id: true, name: true, username: true },
    }) : [];
    const userNames = new Map(users.map((actor) => [actor.user_id, actor.name || actor.username || `#${actor.user_id}`]));
    const group = <T extends string | number>(keyOf: (row: typeof rows[number]) => T, labelOf: (row: typeof rows[number]) => string) => {
      const map = new Map<T, { key: T; label: string; count: number; cost: number }>();
      for (const row of rows) {
        const key = keyOf(row);
        const current = map.get(key) ?? { key, label: labelOf(row), count: 0, cost: 0 };
        current.count += 1;
        current.cost += numberValue(row.total_cost);
        map.set(key, current);
      }
      return [...map.values()].map((item) => ({ ...item, cost: roundMoney(item.cost) })).sort((a, b) => b.cost - a.cost);
    };
    const componentMap = new Map<number, { productId: number; name: string; quantity: number; unit: string | null; cost: number }>();
    for (const row of rows) for (const item of row.transaction.items) {
      if (!item.product_id) continue;
      const current = componentMap.get(item.product_id) ?? { productId: item.product_id, name: item.item_name, quantity: 0, unit: item.unit, cost: 0 };
      current.quantity += numberValue(item.quantity);
      current.cost += numberValue(item.total);
      componentMap.set(item.product_id, current);
    }
    return {
      totalCost: roundMoney(rows.reduce((sum, row) => sum + numberValue(row.total_cost), 0)),
      recordCount: rows.length,
      averageCost: rows.length ? roundMoney(rows.reduce((sum, row) => sum + numberValue(row.total_cost), 0) / rows.length) : 0,
      byReason: group((row) => row.reason_id ?? row.reason_name, (row) => row.reason_name),
      byItem: group((row) => `${row.source_kind}:${row.inventory_product_id ?? row.cafe_product_id ?? row.id}`, (row) => row.source_name),
      byUser: group((row) => row.created_by ?? 0, (row) => row.created_by ? userNames.get(row.created_by) ?? `#${row.created_by}` : 'غير محدد'),
      byBranch: group((row) => row.branch_id, (row) => `فرع ${row.branch_id}`),
      byDay: group((row) => localDateString(row.created_at), (row) => localDateString(row.created_at)).sort((a, b) => String(a.key).localeCompare(String(b.key))),
      topComponents: [...componentMap.values()].map((item) => ({ ...item, quantity: roundQuantity(item.quantity), cost: roundMoney(item.cost) })).sort((a, b) => b.cost - a.cost).slice(0, 10),
    };
  }

  async reverse(id: number, dto: ReverseCafeWasteDto, user: JwtUser) {
    const existing = await this.prisma.cafe_waste_records.findFirst({
      where: { id },
      include: { transaction: { include: { items: true } } },
    });
    if (!existing) throw new NotFoundException('حركة الهالك غير موجودة');
    this.assertBranch(user, existing.branch_id);
    if (existing.status === 'reversed') throw new BadRequestException('تم عكس حركة الهالك مسبقًا');
    const reason = dto.reason.trim();
    if (reason.length < 3) throw new BadRequestException('سبب عكس الحركة يجب أن يكون 3 أحرف على الأقل');
    const reference = this.wasteReference('WASTE-REV');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cafe_waste_records.updateMany({
        where: { id, status: 'active' },
        data: { status: 'reversed', reversed_by: user.sub, reversed_at: now, reversal_reason: reason },
      });
      if (!claimed.count) throw new BadRequestException('تم عكس حركة الهالك مسبقًا');
      const reversal = await tx.inv_transactions.create({
        data: {
          reference,
          txn_type: InventoryTxnType.receipt,
          status: InventoryTxnStatus.approved,
          txn_date: now,
          target_warehouse_id: existing.warehouse_id,
          branch_id: existing.branch_id,
          total_amount: existing.total_cost,
          notes: `عكس ${existing.reference}: ${reason}`,
          reason,
          created_by: user.sub,
          approved_by: user.sub,
          approved_at: now,
          items: { create: existing.transaction.items.map((item) => ({
            product_id: item.product_id,
            item_code: item.item_code,
            item_name: item.item_name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.price,
            total: item.total,
            notes: item.notes,
          })) },
        },
        include: { items: true },
      });
      const reversalComponents = this.componentSnapshot(existing);
      await this.stock.applyTransaction({
        transactionId: reversal.id,
        txnType: InventoryTxnType.receipt,
        branchId: existing.branch_id,
        targetWarehouseId: existing.warehouse_id,
        docRef: reference,
        createdBy: user.sub,
        allowNegative: true,
        lines: reversalComponents.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          itemName: item.name,
          unit: item.unit ?? undefined,
        })),
      }, tx);
      const journal = await tx.acc_journal_entries.findFirst({
        where: {
          source_module: 'inventory',
          source_doc_type: 'inventory_damage',
          source_doc_id: String(existing.transaction_id),
        },
        select: { id: true, status: true, reversed_by_id: true },
      });
      if (!journal) throw new BadRequestException('تعذر عكس الهالك لأن القيد المحاسبي الأصلي غير موجود');
      if (journal.status === 'posted') {
        await this.ledger.reverseEntry(journal.id, reason, user.sub, tx);
      } else if (journal.status !== 'reversed' || !journal.reversed_by_id) {
        throw new BadRequestException('القيد المحاسبي الأصلي ليس في حالة تسمح بعكس الهالك');
      }
      await reverseSystemExpense(tx, `INV-DAMAGE-${existing.transaction_id}`, reason);
      await tx.cafe_waste_records.update({ where: { id }, data: { reversal_transaction_id: reversal.id } });
    });
    const updated = await this.prisma.cafe_waste_records.findUnique({
      where: { id }, include: { transaction: { include: { items: true } } },
    });
    return this.mapRecord(updated);
  }
}

