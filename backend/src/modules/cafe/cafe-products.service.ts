import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTxnType,
  MovementDirection,
  Prisma,
  QuickSaleStatus,
  SalesPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { assertPositive } from '../../common/validators';
import { convertToBaseUnit, type RecipeUnit } from '../../common/utils/units';
import { cairoDateBounds } from '../../common/utils/cairo-date';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import { InventoryLocationService } from '../inventory/inventory-location.service';
import { notDeletedFilter, toNumber as invToNumber } from '../inventory/inventory.utils';
import { PosSettingsService } from '../sales/pos-admin/pos-reports-notifications.service';
import {
  computeSaleTotals,
  localDateString,
  localTimeString,
  roundMoney,
  toDecimal,
  toNumber,
} from '../sales/sales.utils';
import { UpsertCafeProductDto } from './dto/upsert-cafe-product.dto';
import { SellCafeProductDto } from './dto/sell-cafe-product.dto';
import { SellCafeCartDto } from './dto/sell-cafe-cart.dto';
import { UpsertCafePartnerDto } from './dto/upsert-cafe-partner.dto';
import { ProduceCafeProductDto } from './dto/produce-cafe-product.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { savedSalePaymentInvoice, shiftPaymentSummary } from '../sales/sale-payment-summary.util';
import { allocateCollectedCafeSale } from '../targets/cafe-target-classification';

type IngredientStockSelect = {
  id: true;
  name_ar: true;
  unit_of_measure: true;
  cost_price: true;
  inventory_kind: true;
};

type ProductWithRecipes = Prisma.cafe_productsGetPayload<{
  include: {
    inventory_product: { select: { id: true; name_ar: true; unit_of_measure: true; cost_price: true } };
    recipes: {
      include: {
        ingredient: { select: IngredientStockSelect };
      };
    };
    variants: {
      include: {
        recipes: {
          include: {
            ingredient: { select: IngredientStockSelect };
          };
        };
      };
    };
  };
}>;

type ConsumptionLine = {
  ingredientId: number;
  needed: number;
  ingredientName: string;
  costAmount: number;
};

const INGREDIENT_STOCK_SELECT = {
  id: true,
  name_ar: true,
  unit_of_measure: true,
  cost_price: true,
  inventory_kind: true,
} as const;

function reportHourLabel(hour: number) {
  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? 'م' : 'ص';
  return `${hour12}:00 ${period}`.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!);
}

type CafeWasteTransactionLike = {
  id: number;
  reference: string;
  txn_date: Date;
  total_amount: Prisma.Decimal | number;
  reason: string | null;
  items: Array<{
    product_id: number | null;
    item_name: string;
    quantity: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    unit: string | null;
  }>;
};

type ManualCafeWasteLike = {
  status: string;
  total_cost: Prisma.Decimal | number;
  transaction: CafeWasteTransactionLike;
};

export function combineCafeWasteReport(
  automaticTransactions: CafeWasteTransactionLike[],
  manualRecords: ManualCafeWasteLike[],
) {
  const activeManual = manualRecords.filter((row) => row.status === 'active');
  const automaticCost = roundMoney(automaticTransactions.reduce((sum, row) => sum + invToNumber(row.total_amount), 0));
  const manualCost = roundMoney(activeManual.reduce((sum, row) => sum + invToNumber(row.total_cost), 0));
  const transactions = [...automaticTransactions, ...activeManual.map((row) => row.transaction)]
    .sort((a, b) => b.txn_date.getTime() - a.txn_date.getTime());
  return {
    automaticCost,
    manualCost,
    totalCost: roundMoney(automaticCost + manualCost),
    transactions,
  };
}

@Injectable()
export class CafeProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly posSettings: PosSettingsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private resolveCafePaymentMethod(method?: SalesPaymentMethod): SalesPaymentMethod {
    const paymentMethod = method ?? SalesPaymentMethod.cash;
    if (paymentMethod === SalesPaymentMethod.mixed) {
      throw new BadRequestException('الدفع المختلط غير مدعوم في بيع الكافيه');
    }
    return paymentMethod;
  }

  private mapProduct(row: {
    id: number;
    product_code: string;
    name: string;
    category_id: number | null;
    product_type: string;
    business_classification: 'protein' | 'bar' | 'management_withdrawal' | null;
    inventory_product_id: number | null;
    sell_price: Prisma.Decimal;
    image_url: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    category?: { name_ar: string } | null;
    _count?: { recipes: number };
    inventory_product?: { cost_price: Prisma.Decimal } | null;
    recipes?: Array<{
      quantity: Prisma.Decimal;
      unit: string;
      ingredient: { unit_of_measure: string; cost_price: Prisma.Decimal };
    }>;
    variants?: Array<{
      id: number;
      name: string;
      variant_code: string | null;
      sell_price: Prisma.Decimal;
      is_default: boolean;
      is_active: boolean;
      sort_order: number;
      recipes?: Array<{
        quantity: Prisma.Decimal;
        unit: string;
        ingredient: { unit_of_measure: string; cost_price: Prisma.Decimal };
      }>;
    }>;
  }) {
    const cost = row.product_type === 'ready' && row.inventory_product
      ? Number(row.inventory_product.cost_price)
      : roundMoney((row.recipes ?? []).reduce((sum, recipe) => {
          const converted = convertToBaseUnit(
            Number(recipe.quantity),
            recipe.unit as RecipeUnit,
            recipe.ingredient.unit_of_measure,
          );
          return sum + (converted ?? 0) * Number(recipe.ingredient.cost_price);
        }, 0));
    const variants = (row.variants ?? []).map((variant) => {
      const variantCost = roundMoney((variant.recipes ?? []).reduce((sum, recipe) => {
        const converted = convertToBaseUnit(
          Number(recipe.quantity),
          recipe.unit as RecipeUnit,
          recipe.ingredient.unit_of_measure,
        );
        return sum + (converted ?? 0) * Number(recipe.ingredient.cost_price);
      }, 0));
      const variantPrice = Number(variant.sell_price);
      return {
        id: variant.id,
        name: variant.name,
        variantCode: variant.variant_code,
        sellPrice: variantPrice,
        cost: variantCost,
        profit: roundMoney(variantPrice - variantCost),
        marginPercentage: variantPrice > 0
          ? roundMoney(((variantPrice - variantCost) / variantPrice) * 100)
          : 0,
        isDefault: variant.is_default,
        isActive: variant.is_active,
        sortOrder: variant.sort_order,
      };
    });
    return {
      id: row.id,
      productCode: row.product_code,
      name: row.name,
      categoryId: row.category_id,
      categoryName: row.category?.name_ar ?? null,
      productType: row.product_type,
      businessClassification: row.business_classification,
      inventoryProductId: row.inventory_product_id,
      sellPrice: Number(row.sell_price),
      cost,
      profit: roundMoney(Number(row.sell_price) - cost),
      marginPercentage: Number(row.sell_price) > 0
        ? roundMoney(((Number(row.sell_price) - cost) / Number(row.sell_price)) * 100)
        : 0,
      imageUrl: row.image_url,
      isActive: row.is_active,
      recipeCount: row._count?.recipes ?? 0,
      variantCount: variants.filter((variant) => variant.isActive).length,
      variants,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async nextProductCode(): Promise<{ productCode: string }> {
    const productCode = await this.generateProductCode();
    return { productCode };
  }

  async partners() {
    const rows = await this.prisma.cafe_partners.findMany({ include: { phones: true }, orderBy: { name: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      partnerCode: row.partner_code ?? `PRT-${String(row.id).padStart(5, '0')}`,
      name: row.name,
      phone: row.phones.find((item) => item.is_primary)?.phone ?? row.phone,
      phones: row.phones
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id)
        .map((item) => ({ id: item.id, phone: item.phone, label: item.label, isPrimary: item.is_primary })),
      notes: row.notes,
      isActive: row.is_active,
    }));
  }

  async createPartner(dto: UpsertCafePartnerDto) {
    return this.prisma.cafe_partners.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        is_active: dto.isActive ?? true,
        ...(dto.phone?.trim() ? { phones: { create: { phone: dto.phone.trim(), label: 'رئيسي', is_primary: true } } } : {}),
      },
    });
  }

  async updatePartner(id: number, dto: UpsertCafePartnerDto) {
    const existing = await this.prisma.cafe_partners.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الشريك غير موجود');
    return this.prisma.cafe_partners.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        is_active: dto.isActive ?? true,
        phones: {
          deleteMany: {},
          ...(dto.phone?.trim() ? { create: { phone: dto.phone.trim(), label: 'رئيسي', is_primary: true } } : {}),
        },
      },
    });
  }

  async reports(dateFrom?: string, dateTo?: string, branchId?: string, user?: JwtUser, shiftSessionId?: string, section?: 'protein' | 'bar' | 'management_withdrawals', requestedGender?: 'male' | 'female') {
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const branchWhere = scopedBranches ? { branch_id: { in: scopedBranches } } : {};
    // Filter on the operating day, not the calendar day: a shift running past
    // midnight belongs to the day it opened, so these totals line up with shift
    // close. Sales written before `business_date` existed fall back to sale_date.
    const dateRange = { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
    const dateFilter = dateFrom || dateTo
      ? {
          OR: [
            { business_date: dateRange },
            { business_date: null, sale_date: dateRange },
          ],
        }
      : {};
    const wasteBounds = cairoDateBounds(dateFrom, dateTo);
    const wasteDateFilter = dateFrom || dateTo
      ? {
          txn_date: {
            ...(wasteBounds.start ? { gte: wasteBounds.start } : {}),
            ...(wasteBounds.endExclusive ? { lt: wasteBounds.endExclusive } : {}),
          },
        }
      : {};
    const manualWasteDateFilter = dateFrom || dateTo
      ? {
          created_at: {
            ...(wasteBounds.start ? { gte: wasteBounds.start } : {}),
            ...(wasteBounds.endExclusive ? { lt: wasteBounds.endExclusive } : {}),
          },
        }
      : {};
    let allSales = await this.prisma.sales_quick_sales.findMany({
      where: { ...dateFilter, ...branchWhere },
      include: { items: true, feedback: true, payments: true },
    });
    // Cashier reports never accept a client-selected audience. When an account is
    // scoped to Men/Women, only sales tied to a member in that same persisted
    // audience are visible; unlinked walk-in sales are deliberately not leaked.
    const lockedAudience = this.branchScope.memberGenderFilter(user);
    if (requestedGender && requestedGender !== 'male' && requestedGender !== 'female') throw new BadRequestException('قسم الأعضاء غير صحيح');
    if (lockedAudience && requestedGender && requestedGender !== lockedAudience) throw new BadRequestException('لا يمكنك تغيير قسم الأعضاء');
    const audience = lockedAudience ?? requestedGender ?? null;
    const filterToAudience = async <T extends { customer_member_id: number | null }>(rows: T[]): Promise<T[]> => {
      if (!audience) return rows;
      const memberIds = [...new Set(rows.flatMap((row) => row.customer_member_id ? [row.customer_member_id] : []))];
      const allowedMembers = memberIds.length
        ? await this.prisma.club_members.findMany({ where: { id: { in: memberIds }, gender: audience }, select: { id: true } })
        : [];
      const allowed = new Set(allowedMembers.map((member) => member.id));
      return rows.filter((row) => row.customer_member_id != null && allowed.has(row.customer_member_id));
    };
    allSales = await filterToAudience(allSales);
    const sales = allSales.filter((sale) => sale.status === QuickSaleStatus.completed);
    // Partner orders are sales like any other; they only become *revenue* once the
    // partner settles, which `collected_amount` already reflects (0 until settled).
    const revenueSales = sales;
    const refunded = allSales.filter((sale) => sale.status === QuickSaleStatus.refunded);
    // Shared by the period-wide product lists and by the shift-scoped sold summary, so
    // Free units keep their discount on the original line; any remaining invoice
    // discount is allocated only to paid amounts in both summaries.
    const aggregateProductRows = (rows: typeof revenueSales) => {
      const map = new Map<number, { productId: number; name: string; quantity: number; revenue: number; cost: number; profit: number }>();
      for (const sale of rows) {
        const pricedLines = sale.items.map((item) => {
          const quantity = invToNumber(item.quantity);
          const freeQuantity = Math.min(quantity, Math.max(0, item.free_quantity ?? 0));
          const gross = invToNumber(item.line_total);
          const freeAmount = Math.min(gross, freeQuantity * invToNumber(item.unit_price));
          return { item, freeAmount, paidAmount: Math.max(0, gross - freeAmount) };
        });
        const freeAmount = roundMoney(pricedLines.reduce((sum, line) => sum + line.freeAmount, 0));
        const paidSubtotal = Math.max(0, roundMoney(invToNumber(sale.subtotal) - freeAmount));
        const remainingDiscount = Math.max(0, invToNumber(sale.discount_amount) - freeAmount);
        const paidRatio = paidSubtotal > 0 ? Math.max(0, 1 - remainingDiscount / paidSubtotal) : 0;
        let cumulativeRevenue = 0;
        let allocatedRevenue = 0;
        for (const { item, paidAmount } of pricedLines) {
          const key = item.cafe_product_id ?? item.product_id;
          const current = map.get(key) ?? {
            productId: key,
            name: item.name,
            quantity: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
          current.quantity += invToNumber(item.quantity);
          // Cumulative rounding keeps line revenues equal to the saved invoice net.
          cumulativeRevenue += paidAmount * paidRatio;
          const roundedRevenue = roundMoney(cumulativeRevenue);
          current.revenue += roundedRevenue - allocatedRevenue;
          allocatedRevenue = roundedRevenue;
          current.cost += invToNumber(item.line_cost);
          current.profit = current.revenue - current.cost;
          map.set(key, current);
        }
      }
      return [...map.values()].map((row) => ({
        ...row,
        quantity: Math.round(row.quantity * 1000) / 1000,
        profit: roundMoney(row.profit),
        revenue: roundMoney(row.revenue),
        cost: roundMoney(row.cost),
      }));
    };
    const products = aggregateProductRows(revenueSales);
    // Classification is the immutable invoice-line fact, never a product name or a
    // current category. Collected value is allocated across the already-discounted
    // line totals so Protein + Bar reconciles exactly to invoice collection.
    const sectionRows = (classification: 'protein' | 'bar') => {
      let billed = 0; let collected = 0; let cost = 0; let quantity = 0;
      for (const sale of revenueSales) {
        const allocated = allocateCollectedCafeSale(sale.items.map((item) => ({
          item,
          classification: item.business_classification,
          grossAmount: invToNumber(item.line_total),
          paidAmount: invToNumber(item.unit_price) * Math.max(
            0,
            invToNumber(item.quantity) - Number(item.free_quantity ?? 0),
          ),
        })), invToNumber(sale.collected_amount));
        for (const { item, amount, classification: lineClassification, grossAmount } of allocated) {
          if (lineClassification !== classification) continue;
          billed += grossAmount;
          collected += amount;
          cost += invToNumber(item.line_cost); quantity += invToNumber(item.quantity);
        }
      }
      return { classification, quantity: Math.round(quantity * 1000) / 1000, billed: roundMoney(billed), collected: roundMoney(collected), cost: roundMoney(cost), profit: roundMoney(collected - cost) };
    };

    const [catalog, stockRows, purchases, debts, users, expiring, automaticWasteTransactions, manualWasteRecords, managementWithdrawals] = await Promise.all([
      audience
        ? Promise.resolve([] as any[])
        : this.prisma.cafe_products.findMany({ where: { is_active: true, product_type: { not: 'internal' } }, select: { id: true, name: true, sell_price: true } }),
      audience ? Promise.resolve([] as any[]) : this.prisma.inv_products.findMany({
        where: { is_deleted: false, status: 'active' },
        select: {
          id: true,
          name_ar: true,
          reorder_point: true,
          balances: {
            where: scopedBranches
              ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
              : undefined,
            select: { current_stock: true },
          },
        },
      }),
      audience ? Promise.resolve({ _sum: { total_amount: null } }) : this.prisma.prc_supplier_invoices.aggregate({ where: { is_deleted: false, ...branchWhere }, _sum: { total_amount: true } }),
      audience ? Promise.resolve({ _sum: { remaining_amount: null } }) : this.prisma.prc_supplier_invoices.aggregate({ where: { is_deleted: false, ...branchWhere }, _sum: { remaining_amount: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: [...new Set(sales.map((sale) => sale.cashier_id).filter((id): id is number => id != null))] } }, select: { user_id: true, name: true, username: true } }),
      audience ? Promise.resolve([] as any[]) : this.prisma.inv_products.findMany({
        where: {
          is_deleted: false,
          expiry_date: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) },
          ...(scopedBranches ? { balances: { some: { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } } } : {}),
        },
        select: { id: true, name_ar: true, expiry_date: true },
      }),
      audience ? Promise.resolve([] as any[]) : this.prisma.inv_transactions.findMany({
        where: {
          is_deleted: false,
          status: 'approved',
          txn_type: InventoryTxnType.damage,
          reference: { startsWith: 'WASTE-' },
          cafe_waste_record: { is: null },
          ...wasteDateFilter,
          ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
        },
        include: { items: true },
        orderBy: { txn_date: 'desc' },
      }),
      audience ? Promise.resolve([] as any[]) : this.prisma.cafe_waste_records.findMany({
        where: {
          status: 'active',
          ...manualWasteDateFilter,
          ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
        },
        include: { transaction: { include: { items: true } } },
        orderBy: { created_at: 'desc' },
      }),
      audience ? Promise.resolve([] as any[]) : this.prisma.inv_transactions.findMany({
        where: { is_deleted: false, business_classification: 'management_withdrawal', ...wasteDateFilter, ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}) },
        include: { items: true }, orderBy: { txn_date: 'desc' },
      }),
    ]);
    // Employee/partner invoices are rung up with collected_amount = 0 and only turn
    // into revenue when their statement is settled. Recognise that revenue on the
    // settlement date so previously issued reports never change retroactively.
    // Attributed by the collecting shift's operating day so a 02:00 settlement lands
    // on the same day as the drawer movement it created, not on the next calendar day.
    const settledAccountsRevenueBetween = async (from?: string, to?: string) => {
      const bounds = cairoDateBounds(from, to);
      const periodFilter = from || to
        ? {
            OR: [
              { session: { session_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } },
              {
                shift_session_id: null,
                settled_at: {
                  ...(bounds.start ? { gte: bounds.start } : {}),
                  ...(bounds.endExclusive ? { lt: bounds.endExclusive } : {}),
                },
              },
            ],
          }
        : {};
      const statements = await this.prisma.sales_billing_statements.findMany({
        where: {
          status: 'settled',
          ...periodFilter,
          ...branchWhere,
        },
        include: { items: { include: { sale: { select: { total_amount: true, tax_amount: true, customer_member_id: true } } } } },
      });
      const statementSales = statements.flatMap((statement) => statement.items.map((item) => item.sale));
      const visibleSales = await filterToAudience(statementSales);
      return visibleSales.reduce(
        (sum, sale) => sum + invToNumber(sale.total_amount) - invToNumber(sale.tax_amount),
        0,
      );
    };
    const settledAccountsRevenue = await settledAccountsRevenueBetween(dateFrom, dateTo);

    const partnerSales = sales.filter((sale) => sale.sale_type === 'partner');
    const totalCollected = revenueSales.reduce((sum, sale) => sum + invToNumber(sale.collected_amount), 0);
    const totalSales = revenueSales.reduce((sum, sale) => sum + invToNumber(sale.subtotal), 0);
    const totalCost = revenueSales.reduce((sum, sale) => sum + invToNumber(sale.cost_total), 0);
    const totalDiscounts = revenueSales.reduce((sum, sale) => sum + invToNumber(sale.discount_amount), 0);
    const totalTaxes = revenueSales.reduce((sum, sale) => sum + invToNumber(sale.tax_amount), 0);
    const totalRefunds = refunded.reduce((sum, sale) => sum + invToNumber(sale.collected_amount), 0);
    const partnerConsumptionCost = partnerSales.reduce((sum, sale) => sum + invToNumber(sale.cost_total), 0);
    const wasteBreakdown = combineCafeWasteReport(automaticWasteTransactions, manualWasteRecords);
    const wasteTransactions = wasteBreakdown.transactions;
    const wasteCost = wasteBreakdown.totalCost;
    const wasteItemMap = new Map<number | string, { productId: number | null; name: string; quantity: number; cost: number; unit: string | null }>();
    for (const transaction of wasteTransactions) {
      for (const item of transaction.items) {
        const key = item.product_id ?? `${item.item_name}:${item.unit ?? ''}`;
        const current = wasteItemMap.get(key) ?? {
          productId: item.product_id,
          name: item.item_name,
          quantity: 0,
          cost: 0,
          unit: item.unit,
        };
        current.quantity += invToNumber(item.quantity);
        current.cost += invToNumber(item.total);
        wasteItemMap.set(key, current);
      }
    }
    const wasteItems = [...wasteItemMap.values()]
      .map((row) => ({ ...row, quantity: Math.round(row.quantity * 1000) / 1000, cost: roundMoney(row.cost) }))
      .sort((a, b) => b.cost - a.cost);
    let previousRevenue = 0;
    if (dateFrom && dateTo) {
      const fromDate = new Date(`${dateFrom}T12:00:00`);
      const toDate = new Date(`${dateTo}T12:00:00`);
      const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
      const previousTo = new Date(fromDate); previousTo.setDate(previousTo.getDate() - 1);
      const previousFrom = new Date(previousTo); previousFrom.setDate(previousFrom.getDate() - periodDays + 1);
      const previous = await this.prisma.sales_quick_sales.findMany({
        where: {
          status: QuickSaleStatus.completed,
          OR: [
            { business_date: { gte: localDateString(previousFrom), lte: localDateString(previousTo) } },
            { business_date: null, sale_date: { gte: localDateString(previousFrom), lte: localDateString(previousTo) } },
          ],
          ...branchWhere,
        },
        select: { collected_amount: true, tax_amount: true, customer_member_id: true },
      });
      // Same formula as netRevenue below, otherwise growth % compares two different
      // measures and reads negative whenever account settlements carry the period.
      const visiblePrevious = await filterToAudience(previous);
      previousRevenue = visiblePrevious.reduce((sum, sale) => sum + invToNumber(sale.collected_amount) - invToNumber(sale.tax_amount), 0)
        + await settledAccountsRevenueBetween(localDateString(previousFrom), localDateString(previousTo));
    }
    const netRevenue = totalCollected - totalTaxes + settledAccountsRevenue;
    const uncollectedAccountsValue = roundMoney(
      revenueSales
        .filter((sale) => sale.sale_type !== 'customer' && sale.billing_status !== 'settled')
        .reduce((sum, sale) => sum + invToNumber(sale.total_amount) - invToNumber(sale.collected_amount), 0),
    );
    const revenueGrowth = previousRevenue > 0 ? roundMoney(((netRevenue - previousRevenue) / previousRevenue) * 100) : netRevenue > 0 ? 100 : 0;

    const productRows = products;

    // Shift picker for the sold-products summary, so the list can be lined up against a
    // single shift-close receipt instead of the whole period.
    const sessionIdsInPeriod = [...new Set(
      revenueSales.map((sale) => sale.shift_session_id).filter((id): id is number => id != null),
    )];
    const sessionRows = sessionIdsInPeriod.length
      ? await this.prisma.sales_shift_sessions.findMany({
          where: { id: { in: sessionIdsInPeriod } },
          select: { id: true, session_date: true, session_sequence: true, shift: { select: { shift_name: true } } },
          orderBy: [{ session_date: 'desc' }, { id: 'desc' }],
        })
      : [];
    const shiftOptions = sessionRows.map((row) => ({
      sessionId: row.id,
      label: `${row.shift.shift_name} — ${row.session_date}${row.session_sequence > 1 ? ` (${row.session_sequence})` : ''}`,
    }));

    const selectedSessionId = Number(shiftSessionId);
    const soldSales = Number.isInteger(selectedSessionId) && selectedSessionId > 0
      ? revenueSales.filter((sale) => sale.shift_session_id === selectedSessionId)
      : revenueSales;
    const soldOrderCount = soldSales.length;
    const soldRows = (soldSales === revenueSales ? [...productRows] : aggregateProductRows(soldSales))
      .sort((a, b) => b.quantity - a.quantity);
    const soldProductIds = new Set(products.map((row) => row.productId));
    const neverSold = catalog.filter((product) => !soldProductIds.has(product.id)).map((product) => ({ productId: product.id, name: product.name, sellPrice: invToNumber(product.sell_price) }));
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: reportHourLabel(hour),
      orders: revenueSales.filter((sale) => Number(sale.sale_time.slice(0, 2)) === hour).length,
      sales: roundMoney(revenueSales.filter((sale) => Number(sale.sale_time.slice(0, 2)) === hour).reduce((sum, sale) => sum + invToNumber(sale.collected_amount), 0)),
    }));
    const businessDateOf = (sale: { business_date: string | null; sale_date: string }) =>
      sale.business_date ?? sale.sale_date;
    const dailyMap = new Map<string, { date: string; orders: number; sales: number }>();
    for (const sale of revenueSales) {
      const date = businessDateOf(sale);
      const row = dailyMap.get(date) ?? { date, orders: 0, sales: 0 };
      row.orders += 1;
      row.sales += invToNumber(sale.collected_amount);
      dailyMap.set(date, row);
    }
    const byDay = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({ ...row, sales: roundMoney(row.sales) }));
    const aggregatePeriods = (keyOf: (date: string) => string) => {
      const periods = new Map<string, { label: string; orders: number; sales: number }>();
      for (const row of byDay) {
        const key = keyOf(row.date);
        const period = periods.get(key) ?? { label: key, orders: 0, sales: 0 };
        period.orders += row.orders;
        period.sales += row.sales;
        periods.set(key, period);
      }
      return [...periods.values()].sort((a, b) => a.label.localeCompare(b.label)).map((row) => ({ ...row, sales: roundMoney(row.sales) }));
    };
    const byWeek = aggregatePeriods((date) => {
      const value = new Date(`${date}T12:00:00`);
      value.setDate(value.getDate() - ((value.getDay() + 1) % 7));
      return localDateString(value);
    });
    const byMonth = aggregatePeriods((date) => date.slice(0, 7));
    const weekdayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const weekday = weekdayNames.map((name, day) => {
      const matching = revenueSales.filter((sale) => new Date(`${businessDateOf(sale)}T12:00:00`).getDay() === day);
      return { day, name, orders: matching.length, sales: roundMoney(matching.reduce((sum, sale) => sum + invToNumber(sale.collected_amount), 0)) };
    });
    const customerGroups = new Map<string, { name: string; phone: string | null; orders: number; spend: number }>();
    for (const sale of revenueSales.filter((row) => row.sale_type === 'customer')) {
      const normalizedPhone = sale.customer_phone?.replace(/\D/g, '') ?? '';
      if (!normalizedPhone) continue;
      const key = normalizedPhone;
      const row = customerGroups.get(key) ?? { name: sale.customer_name, phone: sale.customer_phone, orders: 0, spend: 0 };
      row.orders += 1;
      row.spend += invToNumber(sale.collected_amount);
      customerGroups.set(key, row);
    }
    const customers = [...customerGroups.values()].map((row) => ({ ...row, spend: roundMoney(row.spend) })).sort((a, b) => b.spend - a.spend);
    const userNames = new Map(users.map((user) => [user.user_id, user.name || user.username || `#${user.user_id}`]));
    const cashierRows = Object.values(revenueSales.reduce<Record<string, { userId: number | null; name: string; orders: number; sales: number; discounts: number; refunds: number }>>((acc, sale) => {
      const key = String(sale.cashier_id ?? 0);
      const current = acc[key] ?? { userId: sale.cashier_id, name: sale.cashier_id ? userNames.get(sale.cashier_id) ?? `#${sale.cashier_id}` : 'غير محدد', orders: 0, sales: 0, discounts: 0, refunds: 0 };
      current.orders += 1;
      current.sales += invToNumber(sale.collected_amount);
      current.discounts += invToNumber(sale.discount_amount);
      acc[key] = current;
      return acc;
    }, {}));
    for (const sale of refunded) {
      const key = String(sale.cashier_id ?? 0);
      if (cashierRows.find((row) => String(row.userId ?? 0) === key)) cashierRows.find((row) => String(row.userId ?? 0) === key)!.refunds += 1;
    }
    const ratings = sales.flatMap((sale) => sale.feedback ? [{ rating: sale.feedback.rating, comment: sale.feedback.comment, date: sale.feedback.feedback_date, invoiceId: sale.id }] : []);
    const averageRating = ratings.length ? roundMoney(ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length) : 0;
    // Rank only hours that actually had orders. Zero-sales hours are not useful
    // as "quiet" business periods, and the same hour must never appear in both
    // the rush and quiet summaries when the selected period has little data.
    const rankedActiveHours = [...byHour]
      .filter((row) => row.orders > 0)
      .sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.hour - b.hour);
    const rushCount = rankedActiveHours.length
      ? Math.min(3, Math.max(1, Math.floor(rankedActiveHours.length / 2)))
      : 0;
    const rushHours = rankedActiveHours.slice(0, rushCount);
    const quietHours = rankedActiveHours
      .slice(rushCount)
      .sort((a, b) => a.sales - b.sales || a.orders - b.orders || a.hour - b.hour)
      .slice(0, 3);
    const activeWeekdays = [...weekday]
      .filter((row) => row.orders > 0)
      .sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.day - b.day);
    const bestDay = activeWeekdays[0];
    const worstDay = activeWeekdays.length > 1
      ? [...activeWeekdays]
          .filter((row) => row.day !== bestDay.day)
          .sort((a, b) => a.sales - b.sales || a.orders - b.orders || a.day - b.day)[0]
      : undefined;
    const insights = [
      rushHours[0]?.sales > 0 ? `ساعة الذروة تبدأ ${rushHours[0].label} بمبيعات ${rushHours[0].sales.toFixed(2)} ج.م.` : 'لا توجد مبيعات كافية بعد لتحديد ساعة الذروة.',
      bestDay?.sales > 0 ? `أفضل يوم في الأسبوع هو ${bestDay.name}.` : null,
      worstDay ? `أهدأ يوم مبيعات هو ${worstDay.name}؛ يمكن تجربة عرض ترويجي مخصص له.` : null,
      neverSold.length ? `${neverSold.length} منتج لم يُبع خلال الفترة ويحتاج مراجعة الظهور أو التسعير.` : null,
      productRows.length ? `المنتج الأقل مبيعًا هو ${[...productRows].sort((a, b) => a.quantity - b.quantity)[0].name}؛ راجع مكانه أو العرض الخاص به.` : null,
      wasteCost > 0 ? `تكلفة الهالك والفاقد خلال الفترة ${wasteCost.toFixed(2)} ج.م؛ راجع الأسباب والأصناف الأعلى لتقليل الفاقد.` : null,
      `نمو الإيراد مقارنة بالفترة السابقة ${revenueGrowth >= 0 ? 'ارتفع' : 'انخفض'} بنسبة ${Math.abs(revenueGrowth).toFixed(1)}%.`,
    ].filter((row): row is string => Boolean(row));

    return {
      range: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      paymentSummary: shiftPaymentSummary(allSales.map(savedSalePaymentInvoice)),
      salesCount: revenueSales.length,
      totalOrders: revenueSales.length,
      totalSales: roundMoney(totalSales),
      totalRevenue: roundMoney(totalCollected),
      netRevenue: roundMoney(netRevenue),
      previousRevenue: roundMoney(previousRevenue),
      revenueGrowth,
      // Average *order* value, so it is comparable with totalSales on the same tile
      // row. It used to divide collected cash by order count, which read ~10% low
      // whenever there were discounts or unsettled account orders.
      averageOrderValue: revenueSales.length ? roundMoney(totalSales / revenueSales.length) : 0,
      totalDiscounts: roundMoney(totalDiscounts),
      totalTaxes: roundMoney(totalTaxes),
      totalRefunds: roundMoney(totalRefunds),
      totalCost: roundMoney(totalCost),
      materialsCost: roundMoney(totalCost),
      materialsCostPercentage: netRevenue > 0 ? roundMoney((totalCost / netRevenue) * 100) : 0,
      settledAccountsRevenue: roundMoney(settledAccountsRevenue),
      uncollectedAccountsValue,
      wasteCost,
      grossProfit: roundMoney(netRevenue - totalCost - wasteCost),
      section: section ?? 'summary',
      sectionBreakdown: {
        protein: sectionRows('protein'),
        bar: sectionRows('bar'),
        managementWithdrawals: managementWithdrawals.map((row) => ({ id: row.id, reference: row.reference, date: row.txn_date, status: row.status, amount: invToNumber(row.total_amount), reason: row.reason, items: row.items.map((item) => ({ name: item.item_name, quantity: invToNumber(item.quantity), cost: invToNumber(item.total) })) })),
      },
      marginPercentage: netRevenue > 0
        ? roundMoney(((netRevenue - totalCost - wasteCost) / netRevenue) * 100)
        : 0,
      partnerConsumptionCost: roundMoney(partnerConsumptionCost),
      products: {
        // Full list, not a top-10 slice: the owner reconciles the period against the
        // shift-close product summary, which lists every line that was rung up.
        // Only this block honours `shiftSessionId` — the rest of the report stays
        // period-wide so picking a shift never silently changes the headline figures.
        soldSummary: soldRows,
        soldTotals: {
          items: soldRows.length,
          quantity: Math.round(soldRows.reduce((sum, row) => sum + row.quantity, 0) * 1000) / 1000,
          revenue: roundMoney(soldRows.reduce((sum, row) => sum + row.revenue, 0)),
          cost: roundMoney(soldRows.reduce((sum, row) => sum + row.cost, 0)),
          profit: roundMoney(soldRows.reduce((sum, row) => sum + row.profit, 0)),
          orders: soldOrderCount,
        },
        shifts: shiftOptions,
        bestSelling: [...productRows].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
        worstSelling: [...productRows].sort((a, b) => a.quantity - b.quantity).slice(0, 10),
        highestRevenue: [...productRows].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        lowestRevenue: [...productRows].sort((a, b) => a.revenue - b.revenue).slice(0, 10),
        neverSold,
      },
      time: { byHour, byDay, byWeek, byMonth, byWeekday: weekday, rushHours, quietHours },
      customers: {
        averageBasketSize: revenueSales.length ? roundMoney(revenueSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + invToNumber(item.quantity), 0), 0) / revenueSales.length) : 0,
        returningCustomers: customers.filter((row) => row.orders > 1).length,
        newCustomers: customers.filter((row) => row.orders === 1).length,
        highestSpending: customers.slice(0, 10),
        ratings,
        averageRating,
      },
      employees: cashierRows.map((row) => ({ ...row, sales: roundMoney(row.sales), discounts: roundMoney(row.discounts), averageInvoice: row.orders ? roundMoney(row.sales / row.orders) : 0 })).sort((a, b) => b.sales - a.sales),
      inventory: {
        lowStock: stockRows
          .map((row) => ({
            productId: row.id,
            name: row.name_ar,
            stock: row.balances.reduce((sum, balance) => sum + invToNumber(balance.current_stock), 0),
            reorderPoint: invToNumber(row.reorder_point),
          }))
          .filter((row) => row.stock <= row.reorderPoint),
        fastMoving: [...productRows].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
        slowMoving: [...productRows].sort((a, b) => a.quantity - b.quantity).slice(0, 10),
        nearExpiration: expiring.map((row) => ({ productId: row.id, name: row.name_ar, expiryDate: row.expiry_date })),
        waste: {
          totalCost: wasteCost,
          manualCost: wasteBreakdown.manualCost,
          automaticCost: wasteBreakdown.automaticCost,
          transactionCount: wasteTransactions.length,
          topItems: wasteItems.slice(0, 10),
          recent: wasteTransactions.slice(0, 10).map((row) => ({
            id: row.id,
            reference: row.reference,
            invoiceNumber: row.reference.replace(/^WASTE-/, ''),
            date: row.txn_date,
            amount: invToNumber(row.total_amount),
            reason: row.reason,
          })),
        },
      },
      insights,
      totalPurchases: invToNumber(purchases._sum.total_amount),
      supplierDebt: invToNumber(debts._sum.remaining_amount),
    };
  }

  async itemFeedbackReport(dateFrom?: string, dateTo?: string, branchId?: string, user?: JwtUser, requestedGender?: 'male' | 'female') {
    if (requestedGender && requestedGender !== 'male' && requestedGender !== 'female') throw new BadRequestException('القسم غير صحيح');
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const lockedGender = this.branchScope.memberGenderFilter(user);
    const gender = lockedGender ?? requestedGender;
    if (lockedGender && requestedGender && requestedGender !== lockedGender) throw new BadRequestException('لا يمكن تغيير قسم البيانات المسموح به');
    const rows = await this.prisma.sales_invoice_item_feedback.findMany({
      where: {
        invoice: {
          status: QuickSaleStatus.completed,
          ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
          sale_date: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        },
      },
      include: {
        item: true,
        invoice: { select: { id: true, daily_number: true, sale_number: true, sale_date: true, customer_member_id: true } },
      },
      orderBy: { feedback_date: 'desc' },
    });

    const memberIds = [...new Set(rows.map((row) => row.invoice.customer_member_id).filter((id): id is number => id != null))];
    const allowedMemberIds = gender ? new Set((await this.prisma.club_members.findMany({ where: { id: { in: memberIds }, gender, is_deleted: false }, select: { id: true } })).map((member) => member.id)) : null;
    const visibleRows = allowedMemberIds ? rows.filter((row) => row.invoice.customer_member_id != null && allowedMemberIds.has(row.invoice.customer_member_id)) : rows;
    const byProduct = new Map<string, {
      productId: number;
      name: string;
      ratings: number[];
      comments: Array<{ comment: string; rating: number; date: Date; invoiceId: number; dailyNumber: number }>;
    }>();
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0 }));
    for (const row of visibleRows) {
      distribution[row.rating - 1].count += 1;
      const productId = row.item.cafe_product_id ?? row.item.product_id;
      const key = `${row.item.item_type}:${productId}:${row.item.cafe_variant_id ?? 'base'}`;
      const product = byProduct.get(key) ?? {
        productId,
        name: row.item.variant_name ? `${row.item.name} · ${row.item.variant_name}` : row.item.name,
        ratings: [],
        comments: [],
      };
      product.ratings.push(row.rating);
      if (row.comment) product.comments.push({
        comment: row.comment,
        rating: row.rating,
        date: row.feedback_date,
        invoiceId: row.invoice.id,
        dailyNumber: row.invoice.daily_number,
      });
      byProduct.set(key, product);
    }

    const products = [...byProduct.values()]
      .map((row) => ({
        productId: row.productId,
        name: row.name,
        ratingsCount: row.ratings.length,
        averageRating: roundMoney(row.ratings.reduce((sum, rating) => sum + rating, 0) / row.ratings.length),
        comments: row.comments.slice(0, 8),
      }))
      .sort((a, b) => b.ratingsCount - a.ratingsCount || b.averageRating - a.averageRating);

    return {
      totalRatings: visibleRows.length,
      averageRating: visibleRows.length
        ? roundMoney(visibleRows.reduce((sum, row) => sum + row.rating, 0) / visibleRows.length)
        : 0,
      distribution,
      products,
      bestRated: [...products].filter((row) => row.ratingsCount > 0).sort((a, b) => b.averageRating - a.averageRating).slice(0, 10),
      needsAttention: [...products].filter((row) => row.averageRating < 3.5).sort((a, b) => a.averageRating - b.averageRating).slice(0, 10),
      recent: visibleRows.slice(0, 30).map((row) => ({
        id: row.id,
        invoiceId: row.invoice.id,
        dailyNumber: row.invoice.daily_number,
        saleDate: row.invoice.sale_date,
        itemId: row.item.id,
        productId: row.item.cafe_product_id ?? row.item.product_id,
        productName: row.item.variant_name ? `${row.item.name} · ${row.item.variant_name}` : row.item.name,
        rating: row.rating,
        comment: row.comment,
        date: row.feedback_date,
      })),
    };
  }

  private async generateProductCode(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('cafe_product_code', 10)`;
      try {
        const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
          SELECT MAX(CAST(SUBSTRING(product_code, 4) AS UNSIGNED)) AS maxNum
          FROM cafe_products WHERE product_code LIKE 'CP-%'
        `;
        const next = Number(rows[0]?.maxNum ?? 0) + 1;
        return `CP-${String(next).padStart(6, '0')}`;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('cafe_product_code')`;
      }
    });
  }

  private async generateCafeSaleIdentity(
    tx: Prisma.TransactionClient,
    branchId: number,
    saleDate: string,
  ): Promise<{ saleNumber: string; dailyNumber: number }> {
    const rows = await tx.sales_quick_sales.aggregate({
      where: { branch_id: branchId, sale_date: saleDate },
      _max: { daily_number: true },
    });
    const dailyNumber = Number(rows._max.daily_number ?? 0) + 1;
    return {
      dailyNumber,
      saleNumber: `CF-${saleDate.replaceAll('-', '')}-${branchId}-${String(dailyNumber).padStart(4, '0')}`,
    };
  }

  private async generateManufacturingNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MFG-${year}-`;
    const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(reference, ${prefix.length + 1}) AS UNSIGNED)) AS maxNum
      FROM inv_transactions WHERE reference LIKE ${`${prefix}%`}
    `;
    const next = Number(rows[0]?.maxNum ?? 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  }

  /** Prefer an explicit branch from the form, then the user's branch, then the first active branch. */
  private async resolveOpeningStockBranchId(
    preferred?: number | null,
    userBranch?: string | number | null,
  ): Promise<number> {
    const fromDto = Number(preferred ?? 0);
    if (Number.isInteger(fromDto) && fromDto > 0) {
      const branch = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: fromDto },
        select: { branch_id: true },
      });
      if (!branch) throw new BadRequestException('فرع الرصيد الافتتاحي المحدد غير موجود');
      return branch.branch_id;
    }
    const fromUser = Number(userBranch ?? 0);
    if (Number.isInteger(fromUser) && fromUser > 0) {
      const branch = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: fromUser },
        select: { branch_id: true },
      });
      if (branch) return branch.branch_id;
    }
    const first = await this.prisma.tbl_branches.findFirst({
      orderBy: { branch_id: 'asc' },
      select: { branch_id: true },
    });
    if (!first?.branch_id) {
      throw new BadRequestException('لا يوجد فرع مسجّل لتسجيل رصيد الافتتاح — أضف فرعًا أولًا');
    }
    return first.branch_id;
  }

  private async resolveWarehouse(
    tx: Prisma.TransactionClient | PrismaService,
    branchId: number,
    warehouseId?: number,
  ): Promise<number> {
    if (warehouseId) {
      const wh = await tx.inv_warehouses.findFirst({
        where: { id: warehouseId, branch_id: branchId, ...notDeletedFilter() },
      });
      if (!wh) throw new BadRequestException('المستودع المحدد غير موجود لهذا الفرع');
      return wh.id;
    }
    return this.location.resolveBranchStockLocation(branchId, tx);
  }

  async list(q: {
    skip?: number;
    take?: number;
    search?: string;
    categoryId?: number;
    branchId?: number;
    warehouseId?: number;
    sellableOnly?: boolean;
    isActive?: boolean;
  }, user?: JwtUser) {
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const where: Prisma.cafe_productsWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { product_code: { contains: s } }];
    }
    if (q.categoryId) where.category_id = q.categoryId;
    if (q.isActive !== undefined) where.is_active = q.isActive;
    if (q.sellableOnly) {
      where.product_type = { not: 'internal' };
      where.is_active = true;
      where.AND = [{
        OR: [
          { product_type: { not: 'ready' } },
          {
            product_type: 'ready',
            inventory_product: { is_deleted: false, status: 'active' },
          },
        ],
      }];
    }

    const [rows, total] = await Promise.all([
      this.prisma.cafe_products.findMany({
        where,
        include: {
          category: { select: { name_ar: true } },
          inventory_product: { select: { cost_price: true } },
          recipes: {
            select: {
              quantity: true,
              unit: true,
              ingredient: { select: { unit_of_measure: true, cost_price: true } },
            },
          },
          variants: {
            orderBy: { sort_order: 'asc' },
            include: {
              recipes: {
                select: {
                  quantity: true,
                  unit: true,
                  ingredient: { select: { unit_of_measure: true, cost_price: true } },
                },
              },
            },
          },
          _count: { select: { recipes: true } },
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.cafe_products.count({ where }),
    ]);
    const inventoryProductIds = rows
      .map((row) => row.inventory_product_id)
      .filter((id): id is number => id != null);
    const balances = inventoryProductIds.length
      ? await this.prisma.inv_stock_balances.groupBy({
          by: ['product_id'],
          where: {
            product_id: { in: inventoryProductIds },
            ...(q.warehouseId
              ? {
                  warehouse_id: q.warehouseId,
                  ...(scopedBranches ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } : {}),
                }
              : scopedBranches
                ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
                : {}),
          },
          _sum: { current_stock: true },
        })
      : [];
    const stockByProduct = new Map(
      balances.map((balance) => [balance.product_id, invToNumber(balance._sum.current_stock)]),
    );
    return paginated(rows.map((row) => ({
      ...this.mapProduct(row),
      currentStock: row.inventory_product_id != null
        ? stockByProduct.get(row.inventory_product_id) ?? 0
        : null,
    })), total, 1, q.take ?? rows.length);
  }

  async findOne(id: number) {
    const row = await this.prisma.cafe_products.findUnique({
      where: { id },
      include: {
        category: { select: { name_ar: true } },
        inventory_product: {
          select: { id: true, name_ar: true, unit_of_measure: true, min_stock: true, cost_price: true },
        },
        recipes: {
          orderBy: { sort_order: 'asc' },
          include: {
            ingredient: {
              select: { id: true, name_ar: true, name_en: true, unit_of_measure: true, cost_price: true },
            },
          },
        },
        variants: {
          orderBy: { sort_order: 'asc' },
          include: {
            recipes: {
              orderBy: { sort_order: 'asc' },
              include: {
                ingredient: {
                  select: { id: true, name_ar: true, name_en: true, unit_of_measure: true, cost_price: true },
                },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('منتج الكافيه غير موجود');
    const recipeCost = this.calculateLoadedRecipeCost(row.recipes);
    const cost = row.product_type === 'ready'
      ? invToNumber(row.inventory_product?.cost_price)
      : recipeCost;
    return {
      ...this.mapProduct(row),
      cost,
      recipeCost,
      profit: roundMoney(invToNumber(row.sell_price) - cost),
      marginPercentage: invToNumber(row.sell_price) > 0
        ? roundMoney(((invToNumber(row.sell_price) - cost) / invToNumber(row.sell_price)) * 100)
        : 0,
      suggestedSellPrice: roundMoney(recipeCost * 1.3),
      inventoryProduct: row.inventory_product ? {
        id: row.inventory_product.id,
        unitOfMeasure: row.inventory_product.unit_of_measure,
        minStock: invToNumber(row.inventory_product.min_stock),
      } : null,
      recipes: row.recipes.map((r) => ({
        id: r.id,
        ingredientId: r.ingredient_id,
        ingredientName: r.ingredient.name_ar || r.ingredient.name_en || '—',
        ingredientBaseUnit: r.ingredient.unit_of_measure,
        quantity: Number(r.quantity),
        unit: r.unit as RecipeUnit,
        sortOrder: r.sort_order,
      })),
      variants: row.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        variantCode: variant.variant_code,
        sellPrice: invToNumber(variant.sell_price),
        isDefault: variant.is_default,
        isActive: variant.is_active,
        sortOrder: variant.sort_order,
        recipes: variant.recipes.map((recipe) => ({
          id: recipe.id,
          ingredientId: recipe.ingredient_id,
          ingredientName: recipe.ingredient.name_ar || recipe.ingredient.name_en || '—',
          ingredientBaseUnit: recipe.ingredient.unit_of_measure,
          quantity: invToNumber(recipe.quantity),
          unit: recipe.unit as RecipeUnit,
          sortOrder: recipe.sort_order,
        })),
      })),
    };
  }

  private validateRecipes(recipes?: UpsertCafeProductDto['recipes']) {
    if (!recipes) return;
    const seen = new Set<number>();
    for (const r of recipes) {
      if (!r.ingredientId || r.quantity <= 0) {
        throw new BadRequestException('كل مكون يجب أن يكون له عنصر وكمية موجبة');
      }
      if (seen.has(r.ingredientId)) {
        throw new BadRequestException('لا يمكن تكرار نفس المكون في الوصفة');
      }
      seen.add(r.ingredientId);
    }
  }

  private activeVariants(dto: UpsertCafeProductDto) {
    return (dto.variants ?? []).filter((variant) => variant.isActive !== false);
  }

  private validateVariants(dto: UpsertCafeProductDto) {
    const variants = this.activeVariants(dto);
    if (!variants.length) return;
    if ((dto.productType ?? 'prepared') !== 'prepared') {
      throw new BadRequestException('الأحجام والأنواع متاحة للمنتجات التي يتم تحضيرها فقط');
    }
    const names = variants.map((variant) => variant.name.trim().toLowerCase());
    if (names.some((name) => !name)) throw new BadRequestException('اسم كل حجم أو نوع مطلوب');
    if (new Set(names).size !== names.length) throw new BadRequestException('لا يمكن تكرار نفس الحجم أو النوع');
    if (variants.filter((variant) => variant.isDefault).length !== 1) {
      throw new BadRequestException('اختر حجمًا أو نوعًا افتراضيًا واحدًا');
    }
    for (const variant of variants) {
      this.validateRecipes(variant.recipes);
      if (!variant.recipes?.length) {
        throw new BadRequestException(`يجب إضافة وصفة للاختيار ${variant.name}`);
      }
    }
  }

  private defaultVariant(dto: UpsertCafeProductDto) {
    return this.activeVariants(dto).find((variant) => variant.isDefault);
  }

  private validateProductType(dto: UpsertCafeProductDto) {
    const productType = dto.productType ?? 'prepared';
    const variants = this.activeVariants(dto);
    if (productType === 'ready') {
      if (dto.recipes?.length || variants.length) throw new BadRequestException('المنتج الجاهز لا يقبل وصفة تحضير أو أحجامًا بوصفات');
    } else if (productType === 'internal' && variants.length) {
      throw new BadRequestException('المنتج الداخلي لا يقبل أحجامًا أو أنواعًا للبيع');
    } else if (!dto.recipes?.length && !variants.length) {
      throw new BadRequestException('المنتج المُحضّر أو الداخلي يجب أن يحتوي على مكون واحد على الأقل');
    }
  }

  private async estimateRecipeCost(
    recipes: { ingredientId: number; quantity: number; unit: RecipeUnit }[],
    legacyIngredientIds: Iterable<number> = [],
  ): Promise<number> {
    if (!recipes.length) return 0;
    const ids = recipes.map((r) => r.ingredientId);
    const legacyIds = [...new Set(legacyIngredientIds)];
    const products = await this.prisma.inv_products.findMany({
      where: {
        id: { in: ids },
        OR: [
          {
            OR: [
              { inventory_kind: 'manufactured_internal' },
              {
                inventory_kind: 'raw_material',
                inventory_section: { in: ['preparation_ingredients', 'serving_packaging'] },
              },
              {
                inventory_kind: 'ready_product',
                inventory_section: 'ready_products',
              },
            ],
            ...notDeletedFilter(),
          },
          ...(legacyIds.length ? [{ id: { in: legacyIds } }] : []),
        ],
      },
      select: { id: true, name_ar: true, cost_price: true, unit_of_measure: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    if (map.size !== new Set(ids).size) {
      throw new BadRequestException('الوصفة تقبل خامات التحضير ومستلزمات التقديم والمنتجات الجاهزة والمنتجات المصنعة داخليًا فقط');
    }
    let total = 0;
    for (const r of recipes) {
      const p = map.get(r.ingredientId);
      if (!p) continue;
      const converted = convertToBaseUnit(r.quantity, r.unit, p.unit_of_measure);
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${p.name_ar} غير متوافقة مع وحدة المخزون ${p.unit_of_measure}`,
        );
      }
      total += invToNumber(p.cost_price) * converted;
    }
    return roundMoney(total);
  }

  private calculateLoadedRecipeCost(recipes: Array<{
    quantity: Prisma.Decimal;
    unit: string;
    ingredient: { name_ar?: string; unit_of_measure: string; cost_price: Prisma.Decimal };
  }>): number {
    let total = 0;
    for (const recipe of recipes) {
      const converted = convertToBaseUnit(
        invToNumber(recipe.quantity),
        recipe.unit as RecipeUnit,
        recipe.ingredient.unit_of_measure,
      );
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${recipe.ingredient.name_ar ?? ''} غير متوافقة مع وحدة المخزون ${recipe.ingredient.unit_of_measure}`,
        );
      }
      total += invToNumber(recipe.ingredient.cost_price) * converted;
    }
    return roundMoney(total);
  }

  private async assertSellPriceAboveCost(
    sellPrice: number,
    recipes?: UpsertCafeProductDto['recipes'],
    legacyIngredientIds: Iterable<number> = [],
  ) {
    if (!recipes?.length) return;
    const cost = await this.estimateRecipeCost(recipes, legacyIngredientIds);
    if (cost > 0 && sellPrice < cost) {
      throw new BadRequestException(
        `سعر البيع (${sellPrice}) أقل من تكلفة الوصفة (${cost}) — قد تبيع بخسارة`,
      );
    }
  }

  private async ensureStockInventoryProduct(
    tx: Prisma.TransactionClient,
    dto: UpsertCafeProductDto,
    productCode: string,
    inventoryKind: 'ready_product' | 'manufactured_internal',
    calculatedCost: number,
    existingInventoryProductId?: number | null,
  ): Promise<number> {
    const inventoryProductId = dto.inventoryProductId ?? existingInventoryProductId ?? undefined;
    if (inventoryProductId) {
      const product = await tx.inv_products.findFirst({
        where: { id: inventoryProductId, ...notDeletedFilter() },
        select: { id: true, cost_price: true, unit_of_measure: true },
      });
      if (!product) throw new BadRequestException('المنتج المخزني المرتبط غير موجود');
      if (dto.readyUnit && dto.readyUnit.trim().toLowerCase() !== product.unit_of_measure.trim().toLowerCase()) {
        const [movements, recipes, variantRecipes] = await Promise.all([
          tx.inv_movements.count({ where: { product_id: product.id } }),
          tx.cafe_product_recipes.count({ where: { ingredient_id: product.id } }),
          tx.cafe_variant_recipes.count({ where: { ingredient_id: product.id } }),
        ]);
        if (movements || recipes || variantRecipes) {
          throw new BadRequestException(
            'لا يمكن تغيير وحدة القياس بعد وجود رصيد أو حركة أو استخدامها في وصفة. أنشئ خامة جديدة أو استخدم عملية تحويل وحدة معتمدة.',
          );
        }
      }
      if (inventoryKind === 'ready_product' && dto.sellPrice < invToNumber(product.cost_price)) {
        throw new BadRequestException('سعر البيع أقل من متوسط تكلفة المنتج الجاهز');
      }
      await tx.inv_products.update({
        where: { id: product.id },
        data: {
          name_ar: dto.name.trim(),
          name_en: dto.name.trim(),
          category_id: dto.categoryId ?? null,
          selling_price: inventoryKind === 'ready_product' ? dto.sellPrice : 0,
          inventory_kind: inventoryKind,
          ...(inventoryKind === 'ready_product' ? { inventory_section: 'ready_products' } : {}),
          ...(inventoryKind === 'manufactured_internal' ? { inventory_section: 'preparation_ingredients', cost_price: calculatedCost } : {}),
          unit_of_measure: dto.readyUnit ?? undefined,
          min_stock: dto.readyMinStock ?? undefined,
          reorder_point: dto.readyMinStock ?? undefined,
          status: dto.isActive === false ? 'inactive' : 'active',
        },
      });
      return product.id;
    }

    if (inventoryKind === 'ready_product' && dto.sellPrice < Number(dto.initialCost ?? 0)) {
      throw new BadRequestException('سعر البيع أقل من التكلفة الافتتاحية للمنتج الجاهز');
    }

    const created = await tx.inv_products.create({
      data: {
        product_code: `${inventoryKind === 'ready_product' ? 'CFI' : 'CFM'}-${productCode.slice(3)}`,
        name_ar: dto.name.trim(),
        name_en: dto.name.trim(),
        category_id: dto.categoryId ?? null,
        inventory_kind: inventoryKind,
        inventory_section: inventoryKind === 'ready_product' ? 'ready_products' : 'preparation_ingredients',
        cost_price: inventoryKind === 'manufactured_internal' ? calculatedCost : (dto.initialCost ?? 0),
        selling_price: inventoryKind === 'ready_product' ? dto.sellPrice : 0,
        unit_of_measure: dto.readyUnit ?? 'piece',
        min_stock: dto.readyMinStock ?? 0,
        reorder_point: dto.readyMinStock ?? 0,
        status: dto.isActive === false ? 'inactive' : 'active',
      },
      select: { id: true },
    });
    return created.id;
  }

  async create(dto: UpsertCafeProductDto, user: JwtUser) {
    this.validateProductType(dto);
    this.validateRecipes(dto.recipes);
    this.validateVariants(dto);
    const productType = dto.productType ?? 'prepared';
    if (productType !== 'internal' && !dto.businessClassification) {
      throw new BadRequestException(
        'اختر تصنيف Protein أو Bar قبل إنشاء منتج قابل للبيع',
      );
    }
    const defaultVariant = this.defaultVariant(dto);
    const effectiveRecipes = defaultVariant?.recipes ?? dto.recipes ?? [];
    const effectiveSellPrice = defaultVariant?.sellPrice ?? dto.sellPrice;
    const recipeCost = await this.estimateRecipeCost(effectiveRecipes);
    const initialStock = Number(dto.initialStock ?? 0);
    if (dto.initialTotalCost != null && initialStock <= 0) {
      throw new BadRequestException('أدخل كمية الرصيد الافتتاحي لحساب تكلفة الوحدة من التكلفة الإجمالية');
    }
    const initialUnitCost = dto.initialTotalCost != null && initialStock > 0
      ? Number(dto.initialTotalCost) / initialStock
      : Number(dto.initialCost ?? 0);
    const normalizedDto = { ...dto, initialCost: initialUnitCost };
    if (productType !== 'internal') {
      assertPositive(effectiveSellPrice, 'سعر البيع');
      await this.assertSellPriceAboveCost(effectiveSellPrice, effectiveRecipes);
      for (const variant of this.activeVariants(dto)) {
        assertPositive(variant.sellPrice, `سعر ${variant.name}`);
        await this.assertSellPriceAboveCost(variant.sellPrice, variant.recipes);
      }
    }
    const productCode = await this.generateProductCode();
    if (productType === 'ready' && initialStock > 0) {
      if (initialUnitCost <= 0) {
        throw new BadRequestException('تكلفة رصيد أول المدة يجب أن تكون أكبر من صفر');
      }
      await this.moduleLedger.ensureChart();
    }
    const openingBranchId = productType === 'ready' && initialStock > 0
      ? await this.resolveOpeningStockBranchId(
          user.branch > 0 && user.level !== 1 ? user.branch : dto.openingBranchId,
          user.branch,
        )
      : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const inventoryProductId = productType === 'ready' || productType === 'internal'
        ? await this.ensureStockInventoryProduct(
            tx,
            normalizedDto,
            productCode,
            productType === 'ready' ? 'ready_product' : 'manufactured_internal',
            recipeCost,
          )
        : null;
      if (productType === 'ready' && inventoryProductId && initialStock > 0) {
        const branchId = openingBranchId!;
        const warehouseId = await this.location.resolveBranchStockLocation(branchId, tx);
        const initialCost = initialUnitCost;
        const opening = await tx.inv_opening_stocks.create({
          data: {
            opening_stock_date: new Date(),
            item_code: productCode,
            quantity: initialStock,
            unit_cost: initialCost,
            total_cost: initialStock * initialCost,
            notes: 'رصيد افتتاحي عند إنشاء منتج كافيه جاهز',
            branch_id: branchId,
            warehouse_id: warehouseId,
            product_id: inventoryProductId,
          },
        });
        await this.stock.applyMovement({
          productId: inventoryProductId,
          warehouseId,
          direction: MovementDirection.in,
          quantity: initialStock,
          operation: 'set',
          txnType: InventoryTxnType.adjustment,
          unitCost: initialCost,
          docType: 'opening_stock',
          docRef: String(opening.id),
          branchId,
          createdBy: user.sub,
        }, tx);
        await this.moduleLedger.postOpeningStock({
          openingStockId: opening.id,
          branchId,
          date: opening.opening_stock_date!.toISOString().slice(0, 10),
          amount: initialStock * initialCost,
          itemName: dto.name,
          createdBy: user.sub,
        }, tx);
      }
      return tx.cafe_products.create({
        data: {
          product_code: productCode,
          name: dto.name.trim(),
          product_type: productType,
          business_classification: productType === 'internal' ? null : dto.businessClassification ?? null,
          inventory_product_id: inventoryProductId,
          category_id: dto.categoryId ?? null,
          sell_price: productType === 'internal' ? 0 : effectiveSellPrice,
          image_url: dto.imageUrl ?? null,
          is_active: dto.isActive ?? true,
          recipes: {
            create: productType !== 'ready'
              ? effectiveRecipes.map((r, i) => ({
                  ingredient_id: r.ingredientId,
                  quantity: r.quantity,
                  unit: r.unit,
                  sort_order: i,
                })) ?? []
              : [],
          },
          variants: this.activeVariants(dto).length ? {
            create: this.activeVariants(dto).map((variant, variantIndex) => ({
              name: variant.name.trim(),
              variant_code: variant.variantCode?.trim() || null,
              sell_price: variant.sellPrice,
              is_default: variant.isDefault ?? false,
              is_active: variant.isActive ?? true,
              sort_order: variantIndex,
              recipes: {
                create: variant.recipes.map((recipe, recipeIndex) => ({
                  ingredient_id: recipe.ingredientId,
                  quantity: recipe.quantity,
                  unit: recipe.unit,
                  sort_order: recipeIndex,
                })),
              },
            })),
          } : undefined,
        },
        include: {
          category: { select: { name_ar: true } },
          inventory_product: { select: { cost_price: true } },
          recipes: {
            select: {
              quantity: true,
              unit: true,
              ingredient: { select: { unit_of_measure: true, cost_price: true } },
            },
          },
          variants: {
            include: {
              recipes: {
                select: {
                  quantity: true,
                  unit: true,
                  ingredient: { select: { unit_of_measure: true, cost_price: true } },
                },
              },
            },
          },
          _count: { select: { recipes: true } },
        },
      });
    });
    return this.mapProduct(row);
  }

  async update(id: number, dto: UpsertCafeProductDto) {
    this.validateProductType(dto);
    this.validateRecipes(dto.recipes);
    this.validateVariants(dto);
    const productType = dto.productType ?? 'prepared';
    const defaultVariant = this.defaultVariant(dto);
    const effectiveRecipes = defaultVariant?.recipes ?? dto.recipes ?? [];
    const effectiveSellPrice = defaultVariant?.sellPrice ?? dto.sellPrice;
    const existing = await this.prisma.cafe_products.findUnique({
      where: { id },
      include: {
        recipes: { select: { ingredient_id: true } },
        variants: { include: { recipes: { select: { ingredient_id: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('منتج الكافيه غير موجود');
    const legacyIngredientIds = new Set([
      ...existing.recipes.map((recipe) => recipe.ingredient_id),
      ...existing.variants.flatMap((variant) => variant.recipes.map((recipe) => recipe.ingredient_id)),
    ]);
    const recipeCost = await this.estimateRecipeCost(effectiveRecipes, legacyIngredientIds);
    if (productType !== 'internal') {
      assertPositive(effectiveSellPrice, 'سعر البيع');
      await this.assertSellPriceAboveCost(effectiveSellPrice, effectiveRecipes, legacyIngredientIds);
      for (const variant of this.activeVariants(dto)) {
        assertPositive(variant.sellPrice, `سعر ${variant.name}`);
        await this.assertSellPriceAboveCost(variant.sellPrice, variant.recipes, legacyIngredientIds);
      }
    }
    if (existing.product_type !== productType) {
      throw new BadRequestException('لا يمكن تغيير نوع المنتج بعد إنشائه حفاظًا على حركات المخزون؛ أنشئ منتجًا جديدًا بالنوع المطلوب');
    }

    await this.prisma.$transaction(async (tx) => {
      const inventoryProductId = productType === 'ready' || productType === 'internal'
        ? await this.ensureStockInventoryProduct(
            tx,
            dto,
            existing.product_code,
            productType === 'ready' ? 'ready_product' : 'manufactured_internal',
            recipeCost,
            existing.inventory_product_id,
          )
        : null;
      await tx.cafe_products.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          product_type: productType,
          business_classification: productType === 'internal' ? null : dto.businessClassification ?? existing.business_classification,
          inventory_product_id: inventoryProductId,
          category_id: dto.categoryId ?? null,
          sell_price: productType === 'internal' ? 0 : effectiveSellPrice,
          image_url: dto.imageUrl ?? null,
          is_active: dto.isActive ?? true,
        },
      });
      if (dto.recipes || defaultVariant || productType === 'ready') {
        await tx.cafe_product_recipes.deleteMany({ where: { product_id: id } });
        if (productType !== 'ready' && effectiveRecipes.length) await tx.cafe_product_recipes.createMany({
          data: effectiveRecipes.map((r, i) => ({
            product_id: id,
            ingredient_id: r.ingredientId,
            quantity: r.quantity,
            unit: r.unit,
            sort_order: i,
          })),
        });
      }
      const submittedVariantIds: number[] = [];
      for (const [variantIndex, variant] of (dto.variants ?? []).entries()) {
        const data = {
          name: variant.name.trim(),
          variant_code: variant.variantCode?.trim() || null,
          sell_price: variant.sellPrice,
          is_default: variant.isDefault ?? false,
          is_active: variant.isActive ?? true,
          sort_order: variantIndex,
        };
        let variantId = variant.id;
        if (variantId) {
          const owned = await tx.cafe_product_variants.findFirst({ where: { id: variantId, product_id: id }, select: { id: true } });
          if (!owned) throw new BadRequestException('أحد الأحجام أو الأنواع لا يتبع هذا المنتج');
          await tx.cafe_product_variants.update({ where: { id: variantId }, data });
        } else {
          const createdVariant = await tx.cafe_product_variants.create({ data: { ...data, product_id: id }, select: { id: true } });
          variantId = createdVariant.id;
        }
        submittedVariantIds.push(variantId);
        await tx.cafe_variant_recipes.deleteMany({ where: { variant_id: variantId } });
        if (variant.recipes.length) await tx.cafe_variant_recipes.createMany({
          data: variant.recipes.map((recipe, recipeIndex) => ({
            variant_id: variantId!,
            ingredient_id: recipe.ingredientId,
            quantity: recipe.quantity,
            unit: recipe.unit,
            sort_order: recipeIndex,
          })),
        });
      }
      await tx.cafe_product_variants.updateMany({
        where: { product_id: id, ...(submittedVariantIds.length ? { id: { notIn: submittedVariantIds } } : {}) },
        data: { is_active: false, is_default: false },
      });
    });
    return this.findOne(id);
  }

  async updatePrice(id: number, sellPrice: number) {
    assertPositive(sellPrice, 'سعر البيع');
    const existing = await this.prisma.cafe_products.findUnique({
      where: { id },
      include: {
        inventory_product: { select: { id: true, cost_price: true } },
        variants: { select: { id: true, is_default: true, is_active: true } },
      },
    });
    if (!existing) throw new NotFoundException('منتج الكافيه غير موجود');
    if (existing.product_type === 'internal') {
      throw new BadRequestException('المنتج الداخلي لا يملك سعر بيع');
    }
    const detail = await this.findOne(id);
    const cost = detail.cost;
    if (sellPrice < cost) {
      throw new BadRequestException(`سعر البيع لا يمكن أن يقل عن التكلفة الحالية (${cost})`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.cafe_products.update({ where: { id }, data: { sell_price: sellPrice } });
      const defaultVariant = existing.variants.find((variant) => variant.is_default && variant.is_active);
      if (defaultVariant) {
        await tx.cafe_product_variants.update({
          where: { id: defaultVariant.id },
          data: { sell_price: sellPrice },
        });
      }
      if (existing.inventory_product_id) {
        await tx.inv_products.update({
          where: { id: existing.inventory_product_id },
          data: { selling_price: sellPrice },
        });
      }
    });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.cafe_products.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        is_active: true,
        inventory_product_id: true,
      },
    });
    if (!existing) throw new NotFoundException('منتج الكافيه غير موجود');

    if (existing.is_active) {
      throw new BadRequestException('عطّل المنتج أولاً قبل الحذف النهائي');
    }

    const salesCount = await this.prisma.sales_quick_sale_items.count({
      where: {
        OR: [
          { cafe_product_id: id },
          { item_type: 'cafe', product_id: id },
          { cafe_variant: { product_id: id } },
        ],
      },
    });
    if (salesCount > 0) {
      throw new BadRequestException(
        'لا يمكن حذف المنتج نهائيًا لأنه مرتبط بسجل مبيعات سابق؛ اتركه في الأرشيف',
      );
    }

    if (existing.inventory_product_id) {
      const [recipeUsage, variantRecipeUsage] = await Promise.all([
        this.prisma.cafe_product_recipes.count({
          where: { ingredient_id: existing.inventory_product_id },
        }),
        this.prisma.cafe_variant_recipes.count({
          where: { ingredient_id: existing.inventory_product_id },
        }),
      ]);
      if (recipeUsage > 0 || variantRecipeUsage > 0) {
        throw new BadRequestException(
          'لا يمكن حذف المنتج نهائيًا لأنه مستخدم كمكوّن في وصفة أخرى',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cafe_products.delete({ where: { id } });
      if (existing.inventory_product_id) {
        await tx.inv_products.update({
          where: { id: existing.inventory_product_id },
          data: { status: 'inactive', is_deleted: true },
        });
      }
    });
    return { success: true };
  }

  async updateStatus(id: number, isActive: boolean) {
    const existing = await this.prisma.cafe_products.findUnique({
      where: { id },
      select: { id: true, inventory_product_id: true, is_active: true },
    });
    if (!existing) throw new NotFoundException('منتج الكافيه غير موجود');
    if (existing.is_active === isActive) {
      return { success: true, id, isActive };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cafe_products.update({
        where: { id },
        data: { is_active: isActive },
      });
      if (existing.inventory_product_id) {
        await tx.inv_products.update({
          where: { id: existing.inventory_product_id },
          data: { status: isActive ? 'active' : 'inactive' },
        });
      }
    });

    return { success: true, id, isActive };
  }

  async markUnavailableForSale(productIds: number[]) {
    const ids = [...new Set(productIds)];
    const products = await this.prisma.cafe_products.findMany({
      where: { id: { in: ids }, product_type: 'prepared' },
      select: { id: true, name: true },
    });
    if (products.length !== ids.length) {
      throw new BadRequestException('يمكن إيقاف المنتجات المحضرة الموجودة فقط من قائمة البيع');
    }
    await this.prisma.cafe_products.updateMany({
      where: { id: { in: ids } },
      data: { is_active: false },
    });
    return {
      success: true,
      products: products.map((product) => ({ ...product, isActive: false })),
    };
  }

  private buildConsumption(
    product: ProductWithRecipes,
    quantity: number,
    variant?: ProductWithRecipes['variants'][number],
  ): ConsumptionLine[] {
    const consumption: ConsumptionLine[] = [];
    if (product.product_type === 'ready') {
      if (!product.inventory_product) {
        throw new BadRequestException(`المنتج الجاهز ${product.name} غير مربوط بالمخزون`);
      }
      return [{
        ingredientId: product.inventory_product.id,
        needed: quantity,
        ingredientName: product.inventory_product.name_ar,
        costAmount: invToNumber(product.inventory_product.cost_price) * quantity,
      }];
    }
    for (const recipe of variant?.recipes ?? product.recipes) {
      const needed = Number(recipe.quantity) * quantity;
      const converted = convertToBaseUnit(needed, recipe.unit as RecipeUnit, recipe.ingredient.unit_of_measure);
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${recipe.ingredient.name_ar} غير متوافقة مع وحدة المخزون ${recipe.ingredient.unit_of_measure}`,
        );
      }
      consumption.push({
        ingredientId: recipe.ingredient.id,
        needed: converted,
        ingredientName: recipe.ingredient.name_ar,
        costAmount: invToNumber(recipe.ingredient.cost_price) * converted,
      });
    }
    return consumption;
  }

  /** Expand a manufactured/sub-recipe shortage into its base BOM (per 1 stock unit of the composite). */
  private async explodeManufacturedIngredient(
    db: Prisma.TransactionClient | PrismaService,
    ingredientId: number,
    ingredientName: string,
    neededInBase: number,
    depth = 0,
  ): Promise<ConsumptionLine[]> {
    if (depth > 6) {
      throw new BadRequestException(`تعذّر تفكيك الوصفة الفرعية لـ ${ingredientName} (عمق مفرط)`);
    }
    const cafe = await db.cafe_products.findFirst({
      where: { inventory_product_id: ingredientId, product_type: 'internal' },
      include: {
        recipes: {
          include: {
            ingredient: { select: INGREDIENT_STOCK_SELECT },
          },
        },
      },
    });
    if (!cafe?.recipes?.length) {
      throw new BadRequestException(
        `لا يوجد رصيد مصنّع ولا وصفة فرعية للخامة ${ingredientName} — صنّع دفعة أولًا أو أصلح المكونات`,
      );
    }

    const lines: ConsumptionLine[] = [];
    for (const bom of cafe.recipes) {
      const scaledQty = Number(bom.quantity) * neededInBase;
      const converted = convertToBaseUnit(scaledQty, bom.unit as RecipeUnit, bom.ingredient.unit_of_measure);
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${bom.ingredient.name_ar} غير متوافقة مع وحدة المخزون ${bom.ingredient.unit_of_measure}`,
        );
      }
      if (bom.ingredient.inventory_kind === 'manufactured_internal') {
        lines.push(
          ...await this.explodeManufacturedIngredient(
            db,
            bom.ingredient.id,
            bom.ingredient.name_ar,
            converted,
            depth + 1,
          ),
        );
      } else {
        lines.push({
          ingredientId: bom.ingredient.id,
          needed: converted,
          ingredientName: bom.ingredient.name_ar,
          costAmount: invToNumber(bom.ingredient.cost_price) * converted,
        });
      }
    }
    return lines;
  }

  /**
   * Sale consumption: manufactured/sub-recipe ingredients always explode
   * into their base raw BOM — composites do not carry their own stock.
   */
  private async resolveSaleConsumption(
    db: Prisma.TransactionClient | PrismaService,
    product: ProductWithRecipes,
    quantity: number,
    warehouseId: number,
    variant?: ProductWithRecipes['variants'][number],
  ): Promise<ConsumptionLine[]> {
    if (product.product_type === 'ready') {
      return this.buildConsumption(product, quantity, variant);
    }

    const lines: ConsumptionLine[] = [];
    for (const recipe of variant?.recipes ?? product.recipes) {
      const needed = Number(recipe.quantity) * quantity;
      const converted = convertToBaseUnit(needed, recipe.unit as RecipeUnit, recipe.ingredient.unit_of_measure);
      if (converted == null) {
        throw new BadRequestException(
          `وحدة المكون ${recipe.ingredient.name_ar} غير متوافقة مع وحدة المخزون ${recipe.ingredient.unit_of_measure}`,
        );
      }

      if (recipe.ingredient.inventory_kind !== 'manufactured_internal') {
        lines.push({
          ingredientId: recipe.ingredient.id,
          needed: converted,
          ingredientName: recipe.ingredient.name_ar,
          costAmount: invToNumber(recipe.ingredient.cost_price) * converted,
        });
        continue;
      }

      // Composite / sub-recipe: always explode to base raw ingredients.
      // Manufactured items are virtual recipes — stock & alerts live on the raws.
      lines.push(
        ...await this.explodeManufacturedIngredient(
          db,
          recipe.ingredient.id,
          recipe.ingredient.name_ar,
          converted,
        ),
      );
    }
    return lines;
  }

  private mergeConsumption(lines: ConsumptionLine[]) {
    const map = new Map<number, { needed: number; ingredientName: string; costAmount: number }>();
    for (const c of lines) {
      const prev = map.get(c.ingredientId);
      if (prev) {
        prev.needed += c.needed;
        prev.costAmount += c.costAmount;
      } else {
        map.set(c.ingredientId, {
          needed: c.needed,
          ingredientName: c.ingredientName,
          costAmount: c.costAmount,
        });
      }
    }
    return [...map.entries()].map(([ingredientId, v]) => ({
      ingredientId,
      needed: v.needed,
      ingredientName: v.ingredientName,
      costAmount: roundMoney(v.costAmount),
    }));
  }

  private async loadProductsForCart(items: { productId: number; variantId?: number; quantity: number }[]) {
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = await this.prisma.cafe_products.findMany({
      where: { id: { in: ids } },
      include: {
        inventory_product: {
          select: { id: true, name_ar: true, unit_of_measure: true, cost_price: true },
        },
        recipes: {
          include: {
            ingredient: { select: INGREDIENT_STOCK_SELECT },
          },
        },
        variants: {
          orderBy: { sort_order: 'asc' },
          include: {
            recipes: {
              include: {
                ingredient: { select: INGREDIENT_STOCK_SELECT },
              },
            },
          },
        },
      },
    });
    if (products.length !== ids.length) throw new BadRequestException('أحد منتجات الكافيه غير موجود');
    const map = new Map(products.map((p) => [p.id, p]));
    return items.map((i) => {
      const p = map.get(i.productId)!;
      const activeVariants = (p.variants ?? []).filter((variant) => variant.is_active);
      const variant = i.variantId
        ? activeVariants.find((row) => row.id === i.variantId)
        : activeVariants.find((row) => row.is_default) ?? activeVariants[0];
      if (i.variantId && !variant) throw new BadRequestException(`الحجم أو النوع المحدد للمنتج ${p.name} غير متاح`);
      if (!p.is_active) throw new BadRequestException(`المنتج ${p.name} غير نشط`);
      if (p.product_type === 'internal') {
        throw new BadRequestException(`المنتج ${p.name} مخصص للتصنيع الداخلي ولا يظهر للبيع`);
      }
      if (p.product_type === 'prepared' && (variant?.recipes ?? p.recipes).length === 0) {
        throw new BadRequestException(`المنتج ${p.name} لا يحتوي على وصفة`);
      }
      if (p.product_type === 'ready' && !p.inventory_product) {
        throw new BadRequestException(`المنتج الجاهز ${p.name} غير مربوط بالمخزون`);
      }
      return { product: p, variant, quantity: i.quantity };
    });
  }

  private async assertStockInWarehouse(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    consumption: { ingredientId: number; needed: number; ingredientName: string }[],
  ) {
    for (const c of consumption) {
      const balance = await tx.inv_stock_balances.findUnique({
        where: { product_id_warehouse_id: { product_id: c.ingredientId, warehouse_id: warehouseId } },
      });
      const available = balance ? toNumber(balance.current_stock) : 0;
      if (available < c.needed) {
        throw new BadRequestException(
          `المخزون غير كافٍ للمكون ${c.ingredientName} (متوفر: ${available.toFixed(3)}، مطلوب: ${c.needed.toFixed(3)})`,
        );
      }
    }
  }

  async sellCart(dto: SellCafeCartDto, userId: number, dryRun = false) {
    if (!dto.items?.length) throw new BadRequestException('السلة فارغة');

    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: dto.branchId } });
    if (!branch) throw new BadRequestException('الفرع غير موجود');
    const inventoryTrackingEnabled = await this.posSettings.isInventoryTrackingEnabled(dto.branchId);

    const lines = await this.loadProductsForCart(dto.items);
    const warehouseId = inventoryTrackingEnabled
      ? await this.resolveWarehouse(this.prisma, dto.branchId, dto.warehouseId)
      : null;
    const consumptionParts = await Promise.all(
      lines.map(({ product, variant, quantity }) =>
        this.resolveSaleConsumption(this.prisma, product, quantity, warehouseId ?? 0, variant),
      ),
    );
    const allConsumption = this.mergeConsumption(consumptionParts.flat());
    const cogsAmount = roundMoney(allConsumption.reduce((sum, c) => sum + c.costAmount, 0));

    const pricedItems = lines.map(({ product, variant, quantity }) => ({
      unitPrice: toNumber(variant?.sell_price ?? product.sell_price),
      quantity,
    }));
    const costedItems = lines.map(({ quantity }, idx) => {
      const lineCost = roundMoney(consumptionParts[idx].reduce((sum, row) => sum + row.costAmount, 0));
      return {
        unitCost: quantity > 0 ? roundMoney(lineCost / quantity) : 0,
        lineCost,
      };
    });
    const paymentMethod = this.resolveCafePaymentMethod(dto.paymentMethod);
    const taxPct = (await this.posSettings.isTaxEnabled(dto.branchId))
      ? await this.posSettings.getTaxRate(dto.branchId)
      : 0;
    const { lineItems, subtotal, discountAmount, taxAmount, totalAmount } = computeSaleTotals(
      pricedItems,
      0,
      taxPct,
    );

    const previewRows: PreviewRow[] = [
      { label: 'عدد الأصناف', after: String(lines.length) },
      { label: 'الإجمالي', after: `${totalAmount.toFixed(2)} ج.م` },
      ...allConsumption.map((c) => ({
        label: `خصم: ${c.ingredientName}`,
        after: `-${c.needed.toFixed(3)}`,
      })),
    ];

    if (isDryRun(dryRun)) {
      return previewResponse(
        { subtotal, taxAmount, totalAmount, consumption: allConsumption },
        {
          rows: inventoryTrackingEnabled
            ? previewRows
            : previewRows.filter((row) => !row.label.startsWith('خصم:')),
          warning: inventoryTrackingEnabled
            ? 'سيتم خصم المخزون وإنشاء فاتورة بيع'
            : 'سيتم إنشاء فاتورة البيع وحساب التكلفة دون إنشاء حركة مخزون',
        },
      );
    }

    return retryOnUniqueViolation(() => this.prisma.$transaction(async (tx) => {
      // Re-resolve inside the transaction so stock checks/movements stay consistent.
      const txWarehouseId = inventoryTrackingEnabled
        ? await this.resolveWarehouse(tx, dto.branchId, dto.warehouseId)
        : null;
      const txConsumptionParts = await Promise.all(
        lines.map(({ product, variant, quantity }) =>
          this.resolveSaleConsumption(tx, product, quantity, txWarehouseId ?? 0, variant),
        ),
      );
      const txConsumption = this.mergeConsumption(txConsumptionParts.flat());
      const txCogs = roundMoney(txConsumption.reduce((sum, c) => sum + c.costAmount, 0));
      const now = new Date();
      const saleDate = localDateString(now);
      const { saleNumber, dailyNumber } = await this.generateCafeSaleIdentity(tx, dto.branchId, saleDate);

      const created = await tx.sales_quick_sales.create({
        data: {
          sale_number: saleNumber,
          daily_number: dailyNumber,
          customer_name: 'عميل كافيه',
          branch_id: dto.branchId,
          cashier_id: userId,
          sale_date: saleDate,
          sale_time: localTimeString(now),
          subtotal: toDecimal(subtotal),
          discount_amount: toDecimal(discountAmount),
          tax_amount: toDecimal(taxAmount),
          tax_percentage: toDecimal(taxPct),
          total_amount: toDecimal(totalAmount),
          collected_amount: toDecimal(totalAmount),
          cost_total: toDecimal(txCogs),
          payment_method: paymentMethod,
          status: QuickSaleStatus.completed,
          warehouse_id: txWarehouseId,
          inventory_posted: inventoryTrackingEnabled,
          created_by: userId,
          items: {
            create: lines.map(({ product, variant, quantity }, idx) => ({
              item_type: 'cafe',
              product_id: product.id,
              cafe_product_id: product.id,
              cafe_variant_id: variant?.id ?? null,
              variant_name: variant?.name ?? null,
              inventory_product_id: product.inventory_product_id,
              ref_id: product.id,
              name: product.name,
              product_code: product.product_code,
              unit_price: toDecimal(pricedItems[idx].unitPrice),
              quantity: toDecimal(quantity),
              line_total: toDecimal(lineItems[idx].lineTotal),
              unit_cost: toDecimal(costedItems[idx].unitCost),
              line_cost: toDecimal(costedItems[idx].lineCost),
            })),
          },
          payments: {
            create: [{ method: paymentMethod, amount: toDecimal(totalAmount) }],
          },
        },
        include: { items: true },
      });

      if (inventoryTrackingEnabled) {
        await this.assertStockInWarehouse(tx, txWarehouseId!, txConsumption);
        for (const c of txConsumption) {
          await this.stock.applyMovement(
          {
            productId: c.ingredientId,
            warehouseId: txWarehouseId!,
            direction: MovementDirection.out,
            quantity: c.needed,
            txnType: InventoryTxnType.issue,
            docType: 'cafe_sale',
            docRef: saleNumber,
            branchId: dto.branchId,
            createdBy: userId,
            allowNegative: false,
          },
          tx,
        );
        }
      }

      await this.moduleLedger.postQuickSale(
        {
          saleNumber,
          branchId: dto.branchId,
          saleDate: localDateString(now),
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paymentMethod,
          payments: [{ method: paymentMethod, amount: totalAmount }],
          cogsAmount: inventoryTrackingEnabled ? txCogs : 0,
          createdBy: userId,
        },
        tx,
      );

      return {
        saleId: created.id,
        saleNumber,
        subtotal,
        taxAmount,
        totalAmount,
        items: lines.map(({ product, variant, quantity }) => ({
          productId: product.id,
          productName: variant ? `${product.name} · ${variant.name}` : product.name,
          variantId: variant?.id ?? null,
          variantName: variant?.name ?? null,
          quantity,
          unitPrice: toNumber(variant?.sell_price ?? product.sell_price),
          lineTotal: roundMoney(toNumber(variant?.sell_price ?? product.sell_price) * quantity),
        })),
        soldBy: userId,
      };
    }, { maxWait: 10000, timeout: 20000 }));
  }

  /** Single-product sell — delegates to atomic cart for consistency. */
  async sell(id: number, dto: SellCafeProductDto, userId: number, dryRun = false) {
    return this.sellCart(
      {
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
        paymentMethod: dto.paymentMethod,
        items: [{ productId: id, quantity: dto.quantity }],
      },
      userId,
      dryRun,
    );
  }

  async produceByInventoryProduct(inventoryProductId: number, dto: ProduceCafeProductDto, userId: number) {
    const cafe = await this.prisma.cafe_products.findFirst({
      where: {
        inventory_product_id: inventoryProductId,
        product_type: 'internal',
      },
      select: { id: true, is_active: true },
    });
    if (!cafe) {
      throw new BadRequestException('هذه الخامة ليست مصنّعة أو غير مربوطة بوصفة تصنيع');
    }
    if (!cafe.is_active) {
      throw new BadRequestException('الخامة المصنعة مؤرشفة أو غير نشطة — استرجعها أولًا');
    }
    return this.produce(cafe.id, dto, userId);
  }

  async produce(id: number, dto: ProduceCafeProductDto, userId: number) {
    const product = await this.prisma.cafe_products.findUnique({
      where: { id },
      include: {
        inventory_product: {
          select: { id: true, name_ar: true, unit_of_measure: true, cost_price: true },
        },
        recipes: {
          include: {
            ingredient: { select: INGREDIENT_STOCK_SELECT },
          },
        },
        variants: {
          include: {
            recipes: {
              include: {
                ingredient: { select: INGREDIENT_STOCK_SELECT },
              },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('منتج الكافيه غير موجود');
    if (product.product_type !== 'internal' || !product.inventory_product) {
      throw new BadRequestException('التصنيع متاح فقط للمنتجات المخصصة للاستخدام الداخلي');
    }
    const outputInventoryProduct = product.inventory_product;
    if (!product.recipes.length) throw new BadRequestException('أضف مكونات التصنيع أولًا');

    const consumption = this.mergeConsumption(this.buildConsumption(product, dto.quantity));
    const batchCost = roundMoney(consumption.reduce((sum, row) => sum + row.costAmount, 0));
    const unitCost = roundMoney(batchCost / dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const warehouseId = await this.resolveWarehouse(tx, dto.branchId, dto.warehouseId);
      const reference = await this.generateManufacturingNumber(tx);
      const transaction = await tx.inv_transactions.create({
        data: {
          reference,
          txn_type: InventoryTxnType.manufacturing,
          status: 'approved',
          txn_date: new Date(),
          source_warehouse_id: warehouseId,
          target_warehouse_id: warehouseId,
          branch_id: dto.branchId,
          total_amount: batchCost,
          notes: `تصنيع ${dto.quantity} من ${product.name}`,
          created_by: userId,
          approved_by: userId,
          approved_at: new Date(),
          items: {
            create: [
              ...consumption.map((row) => ({
                product_id: row.ingredientId,
                item_name: row.ingredientName,
                quantity: row.needed,
                price: row.needed > 0 ? row.costAmount / row.needed : 0,
                total: row.costAmount,
                notes: 'مكون تصنيع',
              })),
              {
                product_id: outputInventoryProduct.id,
                item_name: product.name,
                quantity: dto.quantity,
                unit: outputInventoryProduct.unit_of_measure,
                price: unitCost,
                total: batchCost,
                notes: 'ناتج تصنيع داخلي',
              },
            ],
          },
        },
      });

      for (const row of consumption) {
        await this.stock.applyMovement({
          productId: row.ingredientId,
          warehouseId,
          direction: MovementDirection.out,
          quantity: row.needed,
          unitCost: row.needed > 0 ? row.costAmount / row.needed : 0,
          txnType: InventoryTxnType.manufacturing,
          docType: 'cafe_manufacturing',
          docRef: reference,
          branchId: dto.branchId,
          createdBy: userId,
          allowNegative: false,
          transactionId: transaction.id,
        }, tx);
      }

      const outputId = outputInventoryProduct.id;
      const balance = await tx.inv_stock_balances.findUnique({
        where: { product_id_warehouse_id: { product_id: outputId, warehouse_id: warehouseId } },
      });
      const oldQty = invToNumber(balance?.current_stock);
      const oldCost = invToNumber(outputInventoryProduct.cost_price);
      const newAverage = oldQty + dto.quantity > 0
        ? roundMoney(((oldQty * oldCost) + batchCost) / (oldQty + dto.quantity))
        : unitCost;
      await tx.inv_products.update({ where: { id: outputId }, data: { cost_price: newAverage } });
      await this.stock.applyMovement({
        productId: outputId,
        warehouseId,
        direction: MovementDirection.in,
        quantity: dto.quantity,
        unitCost,
        txnType: InventoryTxnType.manufacturing,
        docType: 'cafe_manufacturing',
        docRef: reference,
        branchId: dto.branchId,
        createdBy: userId,
        transactionId: transaction.id,
      }, tx);

      return { reference, productId: id, outputInventoryProductId: outputId, quantity: dto.quantity, unitCost, batchCost };
    }, { maxWait: 10000, timeout: 20000 });
  }
}
