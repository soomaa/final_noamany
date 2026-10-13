import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryTxnType,
  InventoryTxnStatus,
  MovementDirection,
  Prisma,
  QuickSaleStatus,
  SalesPaymentMethod,
} from "@prisma/client";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";
import { paginated } from "../../common/dto/list-result";
import { isDryRun, previewResponse, PreviewRow } from "../../common/preview";
import { PrismaService } from "../../common/prisma/prisma.service";
import { retryOnUniqueViolation } from "../../common/retry-unique";
import { JwtUser } from "../../common/types/jwt-user";
import { convertToBaseUnit, type RecipeUnit } from "../../common/utils/units";
import { InventoryStockService } from "../inventory/inventory-stock.service";
import { InventoryLocationService } from "../inventory/inventory-location.service";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import { notDeletedFilter } from "../inventory/inventory.utils";
import {
  CreateQuickSaleDto,
  ListQuickSalesDto,
  PosPaymentDto,
  UpdateQuickSaleDto,
} from "./dto/quick-sales.dto";
import { ShiftSessionsService } from "./shift-sessions.service";
import { PosSettingsService } from "./pos-admin/pos-reports-notifications.service";
import { recordSystemExpense } from "../finance/system-expense.util";
import {
  assertPaymentMethodRules,
  findRuleForPayment,
  PosPaymentMethodRule,
} from "./pos-payment-validation.util";
import {
  computeSaleTotals,
  localDateString,
  localTimeString,
  roundMoney,
  toDecimal,
  toNumber,
} from "./sales.utils";

type SaleRow = Prisma.sales_quick_salesGetPayload<{
  include: {
    items: { include: { feedback: true } };
    payments: true;
    feedback: true;
    events: true;
  };
}>;

type StockTrackedSaleItem = {
  productType: "prepared" | "ready" | "inventory";
  cafeProductId: number | null;
  name: string;
  variantName: string | null;
  consumption: Array<{
    productId: number;
    quantity: number;
    ingredientName: string;
    unit: string;
  }>;
};

@Injectable()
export class QuickSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly sessions: ShiftSessionsService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly posSettings: PosSettingsService,
    private readonly branchScope: BranchScopeService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private canApprovePayment(userId: number) {
    return this.permissions.canAny(userId, [
      "gym-sales.sales.new_receipt:update",
      "gym-sales.sales.drafts:update",
    ]);
  }

  private assertBranchAccess(
    user: JwtUser | undefined,
    branchId: number | null | undefined,
  ) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException("لا تملك صلاحية الوصول لبيانات هذا الفرع");
    }
  }

  private async resolveTargetEmployeeId(
    targetEmployeeId: number | undefined,
    branchId: number,
  ): Promise<number | null> {
    if (targetEmployeeId == null) return null;
    const employee = await this.prisma.employees.findFirst({
      where: {
        id: targetEmployeeId,
        branch_id_fk: branchId,
        employee_type: 1,
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
      },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(
        "مندوب التارجت المحدد غير موجود أو لا يتبع الفرع المختار",
      );
    }
    return employee.id;
  }

  private map(row: SaleRow) {
    return {
      id: row.id,
      saleNumber: row.sale_number,
      dailyNumber: row.daily_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      gender: row.gender,
      cafeCategoryId: row.cafe_category_id,
      saleType: row.sale_type,
      employeeId: row.employee_id,
      targetEmployeeId: row.target_employee_id,
      partnerId: row.partner_id,
      billingCycle: row.billing_cycle,
      billingStatus: row.billing_status,
      branchId: row.branch_id,
      cashierId: row.cashier_id,
      shiftSessionId: row.shift_session_id,
      saleDate: row.sale_date,
      saleTime: row.sale_time,
      subtotal: toNumber(row.subtotal),
      discountAmount: toNumber(row.discount_amount),
      discountPercentage: toNumber(row.discount_percentage),
      taxAmount: toNumber(row.tax_amount),
      taxPercentage: toNumber(row.tax_percentage),
      totalAmount: toNumber(row.total_amount),
      collectedAmount: toNumber(row.collected_amount),
      costTotal: toNumber(row.cost_total),
      profit:
        row.sale_type === "partner"
          ? roundMoney(-toNumber(row.cost_total))
          : roundMoney(toNumber(row.total_amount) - toNumber(row.cost_total)),
      paymentMethod: row.payment_method,
      status: row.status,
      notes: row.notes,
      receiptComment: row.receipt_comment,
      feedback: row.feedback
        ? {
            rating: row.feedback.rating,
            comment: row.feedback.comment,
            date: row.feedback.feedback_date,
            invoiceId: row.id,
          }
        : null,
      events: row.events.map((event) => ({
        type: event.event_type,
        notes: event.notes,
        createdAt: event.created_at,
      })),
      loyaltyPointsEarned: row.loyalty_points_earned,
      receiptPrinted: row.receipt_printed,
      warehouseId: row.warehouse_id,
      createdBy: row.created_by,
      items: row.items.map((i) => ({
        id: i.id,
        itemType: i.item_type,
        productId: i.product_id,
        cafeProductId: i.cafe_product_id,
        cafeVariantId: i.cafe_variant_id,
        variantName: i.variant_name,
        inventoryProductId: i.inventory_product_id,
        refId: i.ref_id,
        name: i.name,
        productCode: i.product_code,
        itemNote: i.item_note,
        unitPrice: toNumber(i.unit_price),
        quantity: toNumber(i.quantity),
        lineTotal: toNumber(i.line_total),
        unitCost: toNumber(i.unit_cost),
        lineCost: toNumber(i.line_cost),
        feedback: i.feedback
          ? {
              rating: i.feedback.rating,
              comment: i.feedback.comment,
              date: i.feedback.feedback_date,
            }
          : null,
      })),
      payments: row.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: toNumber(p.amount),
        reference: p.reference,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildWhere(
    q: Pick<
      ListQuickSalesDto,
      | "branchId"
      | "status"
      | "paymentMethod"
      | "saleType"
      | "employeeId"
      | "partnerId"
      | "billingCycle"
      | "billingStatus"
      | "dateFrom"
      | "dateTo"
      | "shiftSessionId"
      | "shiftSessionIds"
      | "search"
    >,
    user?: JwtUser,
  ) {
    const and: Prisma.sales_quick_salesWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { sale_number: { contains: s } },
          { customer_name: { contains: s } },
          { customer_phone: { contains: s } },
        ],
      });
    }
    if (q.branchId && q.branchId !== "all")
      and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scope) and.push({ branch_id: { in: scope } });
    if (q.status && q.status !== "all")
      and.push({ status: q.status as QuickSaleStatus });
    else if (!q.status) and.push({ status: { not: QuickSaleStatus.draft } });
    if (q.paymentMethod && q.paymentMethod !== "all") {
      and.push({ payment_method: q.paymentMethod as SalesPaymentMethod });
    }
    if (q.saleType) and.push({ sale_type: q.saleType });
    if (q.employeeId != null) and.push({ employee_id: q.employeeId });
    if (q.partnerId != null) and.push({ partner_id: q.partnerId });
    if (q.billingCycle) and.push({ billing_cycle: q.billingCycle });
    if (q.billingStatus) and.push({ billing_status: q.billingStatus });
    if (q.dateFrom || q.dateTo) {
      and.push({
        sale_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    if (q.shiftSessionId != null) {
      and.push({ shift_session_id: q.shiftSessionId });
    }
    if (q.shiftSessionIds?.trim()) {
      const ids = q.shiftSessionIds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
      if (ids.length) and.push({ shift_session_id: { in: ids } });
    }
    return and.length ? { AND: and } : {};
  }

  private resolvePayments(
    paymentMethod: SalesPaymentMethod,
    totalAmount: number,
    payments?: PosPaymentDto[],
    rules?: PosPaymentMethodRule[],
    opts?: { paymentApproved?: boolean },
  ): { method: SalesPaymentMethod; amount: number; reference?: string }[] {
    if (paymentMethod === SalesPaymentMethod.mixed) {
      if (!payments?.length) {
        throw new BadRequestException("يجب تحديد تفاصيل الدفع المختلط");
      }
      const sum = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
      if (sum !== totalAmount) {
        throw new BadRequestException("مجموع الدفعات لا يساوي إجمالي الفاتورة");
      }
      const rows = payments.map((p) => ({
        method: p.method as SalesPaymentMethod,
        amount: p.amount,
        reference: p.reference,
      }));
      if (rules?.length) {
        for (const row of rows) {
          assertPaymentMethodRules(
            row.amount,
            row.method,
            findRuleForPayment(rules, row.method),
            opts,
          );
        }
      }
      return rows;
    }
    if (rules?.length) {
      assertPaymentMethodRules(
        totalAmount,
        paymentMethod,
        findRuleForPayment(rules, paymentMethod),
        opts,
      );
    }
    return [{ method: paymentMethod, amount: totalAmount }];
  }

  private async loadPaymentRules(): Promise<PosPaymentMethodRule[]> {
    const rows = await this.prisma.sales_pos_payment_methods.findMany({
      orderBy: { sort_order: "asc" },
    });
    return rows.map((r) => ({
      code: r.code,
      baseMethod: r.base_method,
      name: r.name,
      minAmount: r.min_amount != null ? toNumber(r.min_amount) : null,
      maxAmount: r.max_amount != null ? toNumber(r.max_amount) : null,
      requiresApproval: r.requires_approval,
      approvalThreshold:
        r.approval_threshold != null ? toNumber(r.approval_threshold) : null,
      isEnabled: r.is_enabled,
    }));
  }

  private buildVoidPreviewRows(
    existing: SaleRow,
    status: string,
  ): PreviewRow[] {
    const isRefund = status === "refunded";
    const readyItems = existing.items.filter(
      (item) => item.inventory_product_id != null,
    );
    const preparedItems = existing.items.filter(
      (item) => item.inventory_product_id == null,
    );
    return [
      { label: "رقم الفاتورة", after: existing.sale_number },
      {
        label: "الإجراء",
        after: isRefund
          ? "استرداد بعد تنفيذ الطلب"
          : "إلغاء إداري قبل التحضير أو التسليم",
      },
      {
        label: "إرجاع للمخزون",
        after: isRefund
          ? `${readyItems.length} صنف جاهز قابل لإعادة البيع`
          : `${existing.items.length} بند — عكس كامل لحركة الصرف الأصلية`,
      },
      ...(isRefund
        ? [
            {
              label: "هالك التحضير",
              after: preparedItems.length
                ? `${preparedItems.length} صنف مُحضّر — تُسجل خاماته هالكًا ولا تعود للمخزون`
                : "لا توجد منتجات مُحضّرة في هذه الفاتورة",
            },
          ]
        : []),
      { label: "عكس قيد GL", after: existing.sale_number },
      {
        label: "عكس التحصيل المالي",
        after:
          toNumber(existing.collected_amount) > 0
            ? `${toNumber(existing.collected_amount).toFixed(2)} ج.م (${existing.payment_method})`
            : "لا يوجد تحصيل مالي",
      },
    ];
  }

  async list(q: ListQuickSalesDto, user?: JwtUser) {
    const where = this.buildWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.sales_quick_sales.findMany({
        where,
        include: {
          items: { include: { feedback: true } },
          payments: true,
          feedback: true,
          events: true,
        },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_quick_sales.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.map(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /**
   * POS drafts/invoices board keyed by shift sessions.
   * Keeps only the latest `limit` sessions (default 2) so the screen never
   * wipes at midnight — older sessions simply fall out of the window.
   */
  async shiftBoard(
    q: { branchId?: string; limit?: number },
    user?: JwtUser,
  ) {
    const limit = Math.min(Math.max(Number(q.limit ?? 2) || 2, 1), 5);
    const scope = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const branchFilter: Prisma.sales_shift_sessionsWhereInput = {
      ...(q.branchId && q.branchId !== 'all'
        ? { branch_id: Number(q.branchId) }
        : {}),
      ...(scope ? { branch_id: { in: scope } } : {}),
    };

    const sessions = await this.prisma.sales_shift_sessions.findMany({
      where: branchFilter,
      include: { shift: true },
      orderBy: [{ start_time: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    if (!sessions.length) {
      return {
        sessions: [],
        totals: { orders: 0, completed: 0, value: 0, held: 0, drafts: 0 },
      };
    }

    const sessionIds = sessions.map((row) => row.id);
    const sales = await this.prisma.sales_quick_sales.findMany({
      where: {
        shift_session_id: { in: sessionIds },
        ...(scope ? { branch_id: { in: scope } } : {}),
        ...(q.branchId && q.branchId !== 'all'
          ? { branch_id: Number(q.branchId) }
          : {}),
      },
      include: {
        items: { include: { feedback: true } },
        payments: true,
        feedback: true,
        events: true,
      },
      orderBy: [{ id: 'desc' }],
    });

    const mappedSales = sales.map((row) => this.map(row));
    const bySession = new Map<number, Array<ReturnType<QuickSalesService['map']>>>();
    for (const sale of mappedSales) {
      const key = sale.shiftSessionId as number | null | undefined;
      if (key == null) continue;
      const bucket = bySession.get(key) ?? [];
      bucket.push(sale);
      bySession.set(key, bucket);
    }

    const boardSessions = sessions.map((session) => {
      const invoices = bySession.get(session.id) ?? [];
      return {
        id: session.id,
        shiftId: session.shift_id,
        shiftName: session.shift?.shift_name ?? `وردية #${session.shift_id}`,
        color: session.shift?.color ?? null,
        status: session.status,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        isOpen: session.status === 'open',
        invoices,
        drafts: invoices.filter((row) => row.status === 'draft'),
        completedCount: invoices.filter((row) => row.status === 'completed').length,
        completedValue: roundMoney(
          invoices
            .filter((row) => row.status === 'completed')
            .reduce((sum, row) => sum + row.totalAmount, 0),
        ),
      };
    });

    const allInvoices = boardSessions.flatMap((session) => session.invoices);
    const drafts = allInvoices.filter((row) => row.status === 'draft');
    const completed = allInvoices.filter((row) => row.status === 'completed');

    return {
      sessions: boardSessions,
      totals: {
        orders: allInvoices.length,
        completed: completed.length,
        value: roundMoney(completed.reduce((sum, row) => sum + row.totalAmount, 0)),
        held: roundMoney(drafts.reduce((sum, row) => sum + row.totalAmount, 0)),
        drafts: drafts.length,
      },
    };
  }

  async summary(
    q: Pick<
      ListQuickSalesDto,
      "branchId" | "status" | "paymentMethod" | "dateFrom" | "dateTo"
    >,
    user?: JwtUser,
  ) {
    const where = this.buildWhere(q, user);
    const sales = await this.prisma.sales_quick_sales.findMany({
      where,
      select: {
        status: true,
        payment_method: true,
        total_amount: true,
        collected_amount: true,
        sale_type: true,
        discount_amount: true,
        tax_amount: true,
      },
    });

    const completed = sales.filter(
      (s) => s.status === QuickSaleStatus.completed,
    );
    return {
      totalSales: sales.length,
      completedSales: completed.length,
      refundedSales: sales.filter((s) => s.status === QuickSaleStatus.refunded)
        .length,
      cancelledSales: sales.filter(
        (s) => s.status === QuickSaleStatus.cancelled,
      ).length,
      totalRevenue: roundMoney(
        completed.reduce((sum, s) => sum + toNumber(s.collected_amount), 0),
      ),
      partnerConsumptionValue: roundMoney(
        completed
          .filter((s) => s.sale_type === "partner")
          .reduce((sum, s) => sum + toNumber(s.total_amount), 0),
      ),
      totalDiscount: roundMoney(
        completed
          .filter((s) => s.sale_type !== "partner")
          .reduce((sum, s) => sum + toNumber(s.discount_amount), 0),
      ),
      totalTax: roundMoney(
        completed
          .filter((s) => s.sale_type !== "partner")
          .reduce((sum, s) => sum + toNumber(s.tax_amount), 0),
      ),
      byPaymentMethod: {
        cash: sales.filter((s) => s.payment_method === SalesPaymentMethod.cash)
          .length,
        card: sales.filter((s) => s.payment_method === SalesPaymentMethod.card)
          .length,
        wallet: sales.filter(
          (s) => s.payment_method === SalesPaymentMethod.wallet,
        ).length,
        transfer: sales.filter(
          (s) => s.payment_method === SalesPaymentMethod.transfer,
        ).length,
        mixed: sales.filter(
          (s) => s.payment_method === SalesPaymentMethod.mixed,
        ).length,
      },
      byStatus: {
        completed: sales.filter((s) => s.status === QuickSaleStatus.completed)
          .length,
        refunded: sales.filter((s) => s.status === QuickSaleStatus.refunded)
          .length,
        cancelled: sales.filter((s) => s.status === QuickSaleStatus.cancelled)
          .length,
      },
    };
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
      include: {
        items: { include: { feedback: true } },
        payments: true,
        feedback: true,
        events: true,
      },
    });
    if (!row) throw new NotFoundException("الفاتورة غير موجودة");
    this.assertBranchAccess(user, row.branch_id);
    return this.map(row);
  }

  private async generateSaleIdentity(
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
      saleNumber: `QS-${saleDate.replaceAll("-", "")}-${branchId}-${String(dailyNumber).padStart(4, "0")}`,
    };
  }

  private async explodeManufacturedConsumption(
    ingredientId: number,
    ingredientName: string,
    neededInBase: number,
    depth = 0,
  ): Promise<
    Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      ingredientName: string;
      unit: string;
    }>
  > {
    if (depth > 6) {
      throw new BadRequestException(
        `تعذّر تفكيك الوصفة الفرعية لـ ${ingredientName} (عمق مفرط)`,
      );
    }
    const cafe = await this.prisma.cafe_products.findFirst({
      where: { inventory_product_id: ingredientId, product_type: "internal" },
      include: {
        recipes: {
          include: {
            ingredient: true,
          },
        },
      },
    });
    if (!cafe?.recipes?.length) {
      throw new BadRequestException(
        `الخامة المصنعة ${ingredientName} ليس لها وصفة فرعية — أصلح مكوناتها أولًا`,
      );
    }

    const lines: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      ingredientName: string;
      unit: string;
    }> = [];

    for (const bom of cafe.recipes) {
      const scaledQty = toNumber(bom.quantity) * neededInBase;
      const converted = convertToBaseUnit(
        scaledQty,
        bom.unit as RecipeUnit,
        bom.ingredient.unit_of_measure,
      );
      if (converted == null) {
        throw new BadRequestException(
          `وحدة ${bom.ingredient.name_ar} غير متوافقة مع الوصفة`,
        );
      }
      if (bom.ingredient.inventory_kind === "manufactured_internal") {
        lines.push(
          ...(await this.explodeManufacturedConsumption(
            bom.ingredient.id,
            bom.ingredient.name_ar,
            converted,
            depth + 1,
          )),
        );
      } else {
        lines.push({
          productId: bom.ingredient.id,
          quantity: converted,
          unitCost: toNumber(bom.ingredient.cost_price),
          ingredientName: bom.ingredient.name_ar,
          unit: bom.ingredient.unit_of_measure,
        });
      }
    }
    return lines;
  }

  private mergePreparedConsumption(
    lines: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      ingredientName: string;
      unit: string;
    }>,
  ) {
    const map = new Map<
      number,
      {
        productId: number;
        quantity: number;
        unitCost: number;
        ingredientName: string;
        unit: string;
        costAmount: number;
      }
    >();
    for (const line of lines) {
      const prev = map.get(line.productId);
      if (prev) {
        const costAmount = prev.costAmount + line.quantity * line.unitCost;
        prev.quantity += line.quantity;
        prev.costAmount = costAmount;
        prev.unitCost = prev.quantity > 0 ? costAmount / prev.quantity : 0;
      } else {
        map.set(line.productId, {
          ...line,
          costAmount: line.quantity * line.unitCost,
        });
      }
    }
    return [...map.values()].map(({ costAmount: _costAmount, ...row }) => row);
  }

  private async resolvePreparedConsumption(
    recipes: Array<{
      quantity: Prisma.Decimal | number;
      unit: string;
      ingredient_id: number;
      ingredient: {
        id: number;
        name_ar: string;
        unit_of_measure: string;
        cost_price: Prisma.Decimal;
        inventory_kind: string;
      };
    }>,
    saleQuantity: number,
  ) {
    const lines: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      ingredientName: string;
      unit: string;
    }> = [];

    for (const recipe of recipes) {
      const baseQuantity = convertToBaseUnit(
        toNumber(recipe.quantity) * saleQuantity,
        recipe.unit as RecipeUnit,
        recipe.ingredient.unit_of_measure,
      );
      if (baseQuantity == null) {
        throw new BadRequestException(
          `وحدة ${recipe.ingredient.name_ar} غير متوافقة مع الوصفة`,
        );
      }
      if (recipe.ingredient.inventory_kind === "manufactured_internal") {
        lines.push(
          ...(await this.explodeManufacturedConsumption(
            recipe.ingredient.id,
            recipe.ingredient.name_ar,
            baseQuantity,
          )),
        );
      } else {
        lines.push({
          productId: recipe.ingredient_id,
          quantity: baseQuantity,
          unitCost: toNumber(recipe.ingredient.cost_price),
          ingredientName: recipe.ingredient.name_ar,
          unit: recipe.ingredient.unit_of_measure,
        });
      }
    }

    return this.mergePreparedConsumption(lines);
  }

  private async resolveWarehouse(
    tx: Prisma.TransactionClient,
    branchId: number,
    warehouseId?: number,
  ): Promise<number> {
    if (warehouseId) {
      const wh = await tx.inv_warehouses.findFirst({
        where: { id: warehouseId, branch_id: branchId, ...notDeletedFilter() },
      });
      if (!wh)
        throw new BadRequestException("المستودع المحدد غير موجود لهذا الفرع");
      return wh.id;
    }

    return this.location.resolveBranchStockLocation(branchId, tx);
  }

  private async assertStockAvailability(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    items: StockTrackedSaleItem[],
    allowIngredientShortage: boolean,
  ) {
    const requiredByIngredient = new Map<
      number,
      {
        ingredientId: number;
        ingredientName: string;
        unit: string;
        required: number;
        canContinueWithNegative: boolean;
        affectedProducts: Map<
          string,
          {
            cafeProductId: number | null;
            name: string;
            variantName: string | null;
          }
        >;
      }
    >();

    for (const item of items) {
      for (const consumed of item.consumption) {
        const existing = requiredByIngredient.get(consumed.productId) ?? {
          ingredientId: consumed.productId,
          ingredientName: consumed.ingredientName,
          unit: consumed.unit,
          required: 0,
          canContinueWithNegative: true,
          affectedProducts: new Map(),
        };
        existing.required += consumed.quantity;
        existing.canContinueWithNegative &&= item.productType === "prepared";
        const productKey = `${item.cafeProductId ?? "inventory"}:${item.variantName ?? "base"}:${item.name}`;
        existing.affectedProducts.set(productKey, {
          cafeProductId: item.cafeProductId,
          name: item.name,
          variantName: item.variantName,
        });
        requiredByIngredient.set(consumed.productId, existing);
      }
    }

    const ingredientIds = [...requiredByIngredient.keys()];
    const balances = ingredientIds.length
      ? await tx.inv_stock_balances.findMany({
          where: {
            warehouse_id: warehouseId,
            product_id: { in: ingredientIds },
          },
          select: { product_id: true, current_stock: true },
        })
      : [];
    const availableByIngredient = new Map(
      balances.map((balance) => [
        balance.product_id,
        toNumber(balance.current_stock),
      ]),
    );
    const roundStock = (value: number) => Number(value.toFixed(3));
    const shortages = [...requiredByIngredient.values()].flatMap(
      (ingredient) => {
        const available =
          availableByIngredient.get(ingredient.ingredientId) ?? 0;
        if (available + 0.000001 >= ingredient.required) return [];
        return [
          {
            ingredientId: ingredient.ingredientId,
            ingredientName: ingredient.ingredientName,
            unit: ingredient.unit,
            available: roundStock(available),
            required: roundStock(ingredient.required),
            shortage: roundStock(ingredient.required - available),
            canContinueWithNegative: ingredient.canContinueWithNegative,
            affectedProducts: [...ingredient.affectedProducts.values()],
          },
        ];
      },
    );

    if (!shortages.length) return;
    const canContinueWithNegative = shortages.every(
      (shortage) => shortage.canContinueWithNegative,
    );
    if (allowIngredientShortage && canContinueWithNegative) return;

    const affectedProducts = new Map<
      string,
      {
        cafeProductId: number | null;
        name: string;
        variantName: string | null;
      }
    >();
    for (const shortage of shortages) {
      for (const product of shortage.affectedProducts) {
        affectedProducts.set(
          `${product.cafeProductId ?? "inventory"}:${product.variantName ?? "base"}:${product.name}`,
          product,
        );
      }
    }
    throw new BadRequestException({
      code: "CAFE_STOCK_SHORTAGE",
      message: "بعض خامات الطلب غير متوفرة بالكمية المطلوبة",
      canContinueWithNegative,
      shortages,
      affectedProducts: [...affectedProducts.values()],
    });
  }

  private async prepareSale(
    dto: CreateQuickSaleDto,
    user?: JwtUser,
    paymentApproved = false,
  ) {
    if (!dto.items?.length)
      throw new BadRequestException("يجب إضافة بند واحد على الأقل");
    this.assertBranchAccess(user, dto.branchId);

    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: dto.branchId },
    });
    if (!branch) throw new BadRequestException("الفرع المحدد غير موجود");

    if (dto.items.some((item) => !item.productId && !item.cafeProductId)) {
      throw new BadRequestException(
        "كل بند يجب أن يكون منتجًا مخزنيًا أو منتج كافيه",
      );
    }
    const saleType = dto.saleType ?? "customer";
    if (saleType === "employee" && !dto.employeeId)
      throw new BadRequestException("اختر الموظف");
    if (saleType === "partner" && !dto.partnerId)
      throw new BadRequestException("اختر الشريك");
    if (saleType === "employee") {
      const employee = await this.prisma.employees.findFirst({
        where: {
          id: dto.employeeId,
          employee_type: 1,
          OR: [{ leave_emp: null }, { leave_emp: 0 }],
        },
        select: { id: true },
      });
      if (!employee)
        throw new BadRequestException("الموظف المحدد غير موجود أو غير نشط");
    }
    if (saleType === "partner") {
      const partner = await this.prisma.cafe_partners.findFirst({
        where: { id: dto.partnerId, is_active: true },
        select: { id: true },
      });
      if (!partner)
        throw new BadRequestException("الشريك المحدد غير موجود أو غير نشط");
    }
    const billingCycle =
      saleType === "customer"
        ? "immediate"
        : (dto.billingCycle ?? (saleType === "partner" ? "monthly" : "daily"));

    // Price, recipe and cost are resolved from server-side masters. Browser values are never trusted.
    const productIds = [
      ...new Set(
        dto.items.flatMap((item) => (item.productId ? [item.productId] : [])),
      ),
    ];
    const cafeProductIds = [
      ...new Set(
        dto.items.flatMap((item) =>
          item.cafeProductId ? [item.cafeProductId] : [],
        ),
      ),
    ];
    const products = await this.prisma.inv_products.findMany({
      where: { id: { in: productIds }, ...notDeletedFilter() },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException("أحد المنتجات غير موجود");
    }
    const productMap = new Map(products.map((p) => [p.id, p]));
    const cafeProducts = await this.prisma.cafe_products.findMany({
      where: { id: { in: cafeProductIds }, is_active: true },
      include: {
        inventory_product: true,
        recipes: { include: { ingredient: true } },
        variants: {
          include: { recipes: { include: { ingredient: true } } },
          orderBy: { sort_order: "asc" },
        },
      },
    });
    if (cafeProducts.length !== cafeProductIds.length) {
      throw new BadRequestException("أحد منتجات الكافيه غير موجود أو غير نشط");
    }
    const cafeMap = new Map(
      cafeProducts.map((product) => [product.id, product]),
    );
    const category = await this.prisma.inv_categories.findFirst({
      where: {
        id: dto.cafeCategoryId,
        is_active: true,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException("فئة فاتورة الكافيه المختارة غير متاحة");
    }
    const mismatchedProduct = [
      ...products.map((product) => ({
        name: product.name_ar,
        categoryId: product.category_id,
      })),
      ...cafeProducts.map((product) => ({
        name: product.name,
        categoryId: product.category_id,
      })),
    ].find((product) => product.categoryId !== dto.cafeCategoryId);
    if (mismatchedProduct) {
      throw new BadRequestException(
        `المنتج ${mismatchedProduct.name} لا ينتمي إلى فئة الفاتورة المختارة`,
      );
    }

    const resolvedItems = await Promise.all(
      dto.items.map(async (item) => {
      if (item.cafeProductId) {
        const product = cafeMap.get(item.cafeProductId)!;
        const activeVariants = (product.variants ?? []).filter(
          (variant) => variant.is_active,
        );
        const variant = item.cafeVariantId
          ? activeVariants.find((row) => row.id === item.cafeVariantId)
          : (activeVariants.find((row) => row.is_default) ?? activeVariants[0]);
        if (item.cafeVariantId && !variant) {
          throw new BadRequestException(
            `الحجم أو النوع المحدد للمنتج ${product.name} غير متاح`,
          );
        }
        if (product.product_type === "internal") {
          throw new BadRequestException(
            `المنتج ${product.name} مخصص للاستخدام الداخلي ولا يمكن بيعه`,
          );
        }
        if (product.product_type === "ready" && !product.inventory_product) {
          throw new BadRequestException(
            `المنتج الجاهز ${product.name} غير مربوط بالمخزون`,
          );
        }
        if (
          product.product_type === "ready" &&
          product.inventory_product &&
          (product.inventory_product.is_deleted ||
            product.inventory_product.status !== "active")
        ) {
          throw new BadRequestException(
            `المنتج الجاهز ${product.name} غير نشط في المخزون`,
          );
        }
        const selectedRecipes = variant?.recipes ?? product.recipes;
        if (
          product.product_type === "prepared" &&
          selectedRecipes.length === 0
        ) {
          throw new BadRequestException(
            `المنتج ${product.name} لا يحتوي على وصفة`,
          );
        }
        const consumption =
          product.product_type === "ready"
            ? [
                {
                  productId: product.inventory_product!.id,
                  quantity: item.quantity,
                  unitCost: toNumber(product.inventory_product!.cost_price),
                  ingredientName: product.inventory_product!.name_ar,
                  unit: product.inventory_product!.unit_of_measure,
                },
              ]
            : await this.resolvePreparedConsumption(
                selectedRecipes,
                item.quantity,
              );
        const unitCost = roundMoney(
          consumption.reduce(
            (sum, row) => sum + row.quantity * row.unitCost,
            0,
          ) / item.quantity,
        );
        return {
          itemType: "cafe",
          productType: product.product_type as "prepared" | "ready",
          productId: product.inventory_product_id ?? product.id,
          cafeProductId: product.id,
          cafeVariantId: variant?.id ?? null,
          variantName: variant?.name ?? null,
          inventoryProductId: product.inventory_product_id,
          name: product.name,
          productCode: product.product_code,
          itemNote: item.itemNote?.trim() || null,
          unitPrice: toNumber(variant?.sell_price ?? product.sell_price),
          unitCost,
          quantity: item.quantity,
          consumption,
        };
      }

      const product = productMap.get(item.productId!)!;
      return {
        itemType: "inventory" as const,
        productType: "inventory" as const,
        productId: product.id,
        cafeProductId: null,
        cafeVariantId: null,
        variantName: null,
        inventoryProductId: product.id,
        name: product.name_ar,
        productCode: product.product_code,
        itemNote: item.itemNote?.trim() || null,
        unitPrice: toNumber(product.selling_price),
        unitCost: toNumber(product.cost_price),
        quantity: item.quantity,
        consumption: [
          {
            productId: product.id,
            quantity: item.quantity,
            unitCost: toNumber(product.cost_price),
            ingredientName: product.name_ar,
            unit: product.unit_of_measure,
          },
        ],
      };
      }),
    );

    const employeeDiscount =
      saleType === "employee"
        ? ((await this.posSettings.getNumericSetting(
            "general",
            "employee_discount_percentage",
            dto.branchId,
          )) ?? 0)
        : 0;
    const partnerDiscount =
      saleType === "partner"
        ? ((await this.posSettings.getNumericSetting(
            "general",
            "partner_discount_percentage",
            dto.branchId,
          )) ?? 0)
        : 0;
    const defaultDiscount =
      (await this.posSettings.getNumericSetting(
        "general",
        "default_discount_percentage",
        dto.branchId,
      )) ?? 0;
    const discountPct = Math.min(
      100,
      Math.max(
        0,
        saleType === "employee"
          ? employeeDiscount
          : saleType === "partner"
            ? partnerDiscount
            : (dto.discountPercentage ?? defaultDiscount),
      ),
    );
    const taxEnabled = await this.posSettings.isTaxEnabled(dto.branchId);
    const settingsTaxPct = taxEnabled
      ? await this.posSettings.getTaxRate(dto.branchId)
      : 0;
    const taxPct = Math.min(100, Math.max(0, settingsTaxPct));
    const paymentRules = await this.loadPaymentRules();
    const pricedItems = resolvedItems.map((item) => ({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    }));
    const cogsAmount = roundMoney(
      resolvedItems.reduce(
        (sum, item) => sum + item.unitCost * item.quantity,
        0,
      ),
    );
    const { lineItems, subtotal, discountAmount, taxAmount, totalAmount } =
      computeSaleTotals(pricedItems, discountPct, taxPct);

    const paymentMethod =
      (dto.paymentMethod as SalesPaymentMethod) ?? SalesPaymentMethod.cash;
    const isDeferredBilling =
      saleType !== "customer" && billingCycle !== "immediate";
    const collectedAmount =
      dto.onHold || saleType === "partner" || isDeferredBilling
        ? 0
        : totalAmount;
    const paymentRows =
      collectedAmount === 0
        ? []
        : this.resolvePayments(
            paymentMethod,
            collectedAmount,
            dto.payments,
            paymentRules,
            { paymentApproved },
          );
    const loyaltyPoints = Math.floor(totalAmount / 10);

    return {
      saleType,
      billingCycle,
      resolvedItems,
      discountPct,
      taxPct,
      pricedItems,
      cogsAmount,
      lineItems,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMethod,
      collectedAmount,
      paymentRows,
      loyaltyPoints,
    };
  }

  async create(dto: CreateQuickSaleDto, userId: number, user?: JwtUser) {
    const paymentApproved = await this.canApprovePayment(userId);
    const targetEmployeeId = await this.resolveTargetEmployeeId(
      dto.targetEmployeeId,
      dto.branchId,
    );
    const {
      saleType,
      billingCycle,
      resolvedItems,
      discountPct,
      taxPct,
      pricedItems,
      cogsAmount,
      lineItems,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMethod,
      collectedAmount,
      paymentRows,
      loyaltyPoints,
    } = await this.prepareSale(dto, user, paymentApproved);

    if (!dto.onHold) await this.moduleLedger.ensureChart();

    const sale = await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const session = dto.onHold
          ? null
          : await this.sessions.findBranchSessionForSale(
              tx,
              dto.branchId,
              userId,
            );
        if (!dto.onHold && !session) {
          throw new BadRequestException(
            "افتح وردية باسم المستخدم الحالي قبل تأكيد الطلب",
          );
        }
        const warehouseId = await this.resolveWarehouse(
          tx,
          dto.branchId,
          dto.warehouseId,
        );
        await this.assertStockAvailability(
          tx,
          warehouseId,
          resolvedItems,
          dto.allowIngredientShortage === true,
        );
        const now = new Date();
        const saleDate = localDateString(now);
        const { saleNumber, dailyNumber } = await this.generateSaleIdentity(
          tx,
          dto.branchId,
          saleDate,
        );

        const created = await tx.sales_quick_sales.create({
          data: {
            sale_number: saleNumber,
            daily_number: dailyNumber,
            customer_name: dto.customerName?.trim() || "عميل نقدي",
            customer_phone: dto.customerPhone?.trim() || null,
            gender: dto.gender,
            cafe_category_id: dto.cafeCategoryId,
            sale_type: saleType,
            employee_id: dto.employeeId ?? null,
            target_employee_id: targetEmployeeId,
            partner_id: dto.partnerId ?? null,
            billing_cycle: saleType === "customer" ? null : billingCycle,
            billing_status:
              saleType === "customer" || dto.onHold
                ? "not_applicable"
                : collectedAmount > 0
                  ? "settled"
                  : "unbilled",
            branch_id: dto.branchId,
            cashier_id: userId,
            shift_session_id: session?.id ?? null,
            sale_date: saleDate,
            sale_time: localTimeString(now),
            subtotal: toDecimal(subtotal),
            discount_amount: toDecimal(discountAmount),
            discount_percentage: toDecimal(discountPct),
            tax_amount: toDecimal(taxAmount),
            tax_percentage: toDecimal(taxPct),
            total_amount: toDecimal(totalAmount),
            collected_amount: toDecimal(collectedAmount),
            cost_total: toDecimal(cogsAmount),
            payment_method: paymentMethod,
            status: dto.onHold
              ? QuickSaleStatus.draft
              : QuickSaleStatus.completed,
            notes: dto.notes ?? null,
            receipt_comment: dto.receiptComment?.trim() || null,
            loyalty_points_earned: loyaltyPoints,
            warehouse_id: warehouseId,
            created_by: userId,
            items: {
              create: resolvedItems.map((item, idx) => ({
                item_type: item.itemType,
                product_id: item.productId,
                cafe_product_id: item.cafeProductId,
                cafe_variant_id: item.cafeVariantId,
                variant_name: item.variantName,
                inventory_product_id: item.inventoryProductId,
                ref_id: item.cafeProductId ?? item.productId,
                name: item.name,
                product_code: item.productCode,
                item_note: item.itemNote,
                unit_price: toDecimal(pricedItems[idx].unitPrice),
                quantity: toDecimal(item.quantity),
                line_total: toDecimal(lineItems[idx].lineTotal),
                unit_cost: toDecimal(item.unitCost),
                line_cost: toDecimal(item.unitCost * item.quantity),
              })),
            },
            payments: paymentRows.length
              ? {
                  create: paymentRows.map((p) => ({
                    method: p.method,
                    amount: toDecimal(p.amount),
                    reference: p.reference ?? null,
                  })),
                }
              : undefined,
            events: {
              create: [
                {
                  event_type: dto.onHold ? "created_on_hold" : "completed",
                  notes: dto.onHold
                    ? "تم إنشاء الفاتورة وحجز مكوناتها من المخزون"
                    : null,
                  created_by: userId,
                },
                ...(dto.allowIngredientShortage
                  ? [
                      {
                        event_type: "stock_shortage_override",
                        notes:
                          "تم استكمال الطلب بموافقة المستخدم وتسجيل عجز الخامات في المخزون",
                        created_by: userId,
                      },
                    ]
                  : []),
              ],
            },
          },
          include: {
            items: { include: { feedback: true } },
            payments: true,
            feedback: true,
            events: true,
          },
        });

        for (const item of resolvedItems) {
          for (const consumed of item.consumption)
            await this.stock.applyMovement(
              {
                productId: consumed.productId,
                warehouseId,
                direction: MovementDirection.out,
                quantity: consumed.quantity,
                unitCost: consumed.unitCost,
                txnType: InventoryTxnType.issue,
                docType: dto.onHold
                  ? "cafe_draft"
                  : item.itemType === "cafe"
                    ? "cafe_sale"
                    : "sale",
                docRef: saleNumber,
                branchId: dto.branchId,
                createdBy: userId,
                allowNegative:
                  dto.allowIngredientShortage === true &&
                  item.productType === "prepared",
              },
              tx,
            );
        }

        if (session)
          await this.sessions.applySaleToSession(
            tx,
            session.id,
            {
              totalAmount,
              collectedAmount,
              discountAmount,
              taxAmount,
              paymentMethod,
              payments: paymentRows,
            },
            false,
          );

        if (!dto.onHold)
          await this.moduleLedger.postQuickSale(
            {
              saleNumber,
              branchId: dto.branchId,
              saleDate: localDateString(now),
              subtotal,
              discountAmount,
              taxAmount,
              totalAmount,
              collectedAmount,
              paymentMethod,
              payments: paymentRows,
              cogsAmount,
              saleType,
              createdBy: userId,
            },
            tx,
          );

        return created;
      }),
    );

    return this.map(sale);
  }

  private async releaseDraftReservation(
    tx: Prisma.TransactionClient,
    sale: {
      sale_number: string;
      warehouse_id: number | null;
      branch_id: number;
    },
    userId: number,
    docType: "cafe_draft_adjustment" | "cafe_draft_cancel",
  ) {
    if (!sale.warehouse_id)
      throw new BadRequestException("لا يوجد مستودع مرتبط بالمسودة");
    const movements = await tx.inv_movements.findMany({
      where: {
        doc_ref: sale.sale_number,
        doc_type: {
          in: ["cafe_draft", "cafe_draft_adjustment", "cafe_draft_cancel"],
        },
      },
    });
    const reserved = new Map<
      number,
      { quantity: number; unitCost: Prisma.Decimal }
    >();
    for (const movement of movements) {
      const current = reserved.get(movement.product_id) ?? {
        quantity: 0,
        unitCost: movement.unit_cost,
      };
      current.quantity +=
        movement.direction === MovementDirection.out
          ? Math.abs(toNumber(movement.quantity))
          : -Math.abs(toNumber(movement.quantity));
      current.unitCost = movement.unit_cost;
      reserved.set(movement.product_id, current);
    }
    for (const [productId, row] of reserved) {
      if (row.quantity <= 0.000001) continue;
      await this.stock.applyMovement(
        {
          productId,
          warehouseId: sale.warehouse_id,
          direction: MovementDirection.in,
          quantity: row.quantity,
          unitCost: row.unitCost,
          txnType: InventoryTxnType.sales_return,
          docType,
          docRef: sale.sale_number,
          branchId: sale.branch_id,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  async reviseDraft(
    id: number,
    dto: CreateQuickSaleDto,
    userId: number,
    finalize: boolean,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
      include: {
        items: { include: { feedback: true } },
        payments: true,
        feedback: true,
        events: true,
      },
    });
    if (!existing) throw new NotFoundException("المسودة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== QuickSaleStatus.draft)
      throw new BadRequestException("هذه الفاتورة لم تعد مسودة");
    if (dto.branchId !== existing.branch_id)
      throw new BadRequestException("لا يمكن نقل المسودة إلى فرع آخر");
    const targetEmployeeId = await this.resolveTargetEmployeeId(
      dto.targetEmployeeId,
      existing.branch_id,
    );

    const prepared = await this.prepareSale(
      { ...dto, onHold: !finalize },
      user,
      await this.canApprovePayment(userId),
    );
    if (finalize) await this.moduleLedger.ensureChart();
    const now = new Date();
    const updated = await this.prisma.$transaction(
      async (tx) => {
        await this.releaseDraftReservation(
          tx,
          existing,
          userId,
          "cafe_draft_adjustment",
        );
        const warehouseId =
          existing.warehouse_id ??
          (await this.resolveWarehouse(tx, dto.branchId, dto.warehouseId));
        await this.assertStockAvailability(
          tx,
          warehouseId,
          prepared.resolvedItems,
          dto.allowIngredientShortage === true,
        );
        const session = finalize
          ? await this.sessions.findBranchSessionForSale(
              tx,
              dto.branchId,
              userId,
            )
          : null;
        if (finalize && !session) {
          throw new BadRequestException(
            "افتح وردية باسم المستخدم الحالي قبل تأكيد الفاتورة",
          );
        }
        const finalSaleDate = localDateString(now);
        const finalIdentity =
          finalize && existing.sale_date !== finalSaleDate
            ? await this.generateSaleIdentity(tx, dto.branchId, finalSaleDate)
            : {
                saleNumber: existing.sale_number,
                dailyNumber: existing.daily_number,
              };

        await tx.sales_pos_payments.deleteMany({
          where: { quick_sale_id: id },
        });
        await tx.sales_quick_sale_items.deleteMany({
          where: { quick_sale_id: id },
        });

        for (const item of prepared.resolvedItems) {
          for (const consumed of item.consumption) {
            await this.stock.applyMovement(
              {
                productId: consumed.productId,
                warehouseId,
                direction: MovementDirection.out,
                quantity: consumed.quantity,
                unitCost: consumed.unitCost,
                txnType: InventoryTxnType.issue,
                docType: finalize
                  ? item.itemType === "cafe"
                    ? "cafe_sale"
                    : "sale"
                  : "cafe_draft",
                docRef: finalIdentity.saleNumber,
                branchId: dto.branchId,
                createdBy: userId,
                allowNegative:
                  dto.allowIngredientShortage === true &&
                  item.productType === "prepared",
              },
              tx,
            );
          }
        }

        if (finalize && session) {
          await this.sessions.applySaleToSession(
            tx,
            session.id,
            {
              totalAmount: prepared.totalAmount,
              collectedAmount: prepared.collectedAmount,
              discountAmount: prepared.discountAmount,
              taxAmount: prepared.taxAmount,
              paymentMethod: prepared.paymentMethod,
              payments: prepared.paymentRows,
            },
            false,
          );
        }

        if (finalize) {
          await this.moduleLedger.postQuickSale(
            {
              saleNumber: finalIdentity.saleNumber,
              branchId: dto.branchId,
              saleDate: localDateString(now),
              subtotal: prepared.subtotal,
              discountAmount: prepared.discountAmount,
              taxAmount: prepared.taxAmount,
              totalAmount: prepared.totalAmount,
              collectedAmount: prepared.collectedAmount,
              paymentMethod: prepared.paymentMethod,
              payments: prepared.paymentRows,
              cogsAmount: prepared.cogsAmount,
              saleType: prepared.saleType,
              createdBy: userId,
            },
            tx,
          );
        }

        return tx.sales_quick_sales.update({
          where: { id },
          data: {
            ...(finalize
              ? {
                  sale_number: finalIdentity.saleNumber,
                  daily_number: finalIdentity.dailyNumber,
                }
              : {}),
            customer_name: dto.customerName?.trim() || "عميل نقدي",
            customer_phone: dto.customerPhone?.trim() || null,
            gender: dto.gender,
            cafe_category_id: dto.cafeCategoryId,
            sale_type: prepared.saleType,
            employee_id: dto.employeeId ?? null,
            target_employee_id: targetEmployeeId,
            partner_id: dto.partnerId ?? null,
            billing_cycle:
              prepared.saleType === "customer" ? null : prepared.billingCycle,
            billing_status:
              prepared.saleType === "customer" || !finalize
                ? "not_applicable"
                : prepared.collectedAmount > 0
                  ? "settled"
                  : "unbilled",
            shift_session_id: session?.id ?? null,
            ...(finalize
              ? { sale_date: finalSaleDate, sale_time: localTimeString(now) }
              : {}),
            subtotal: toDecimal(prepared.subtotal),
            discount_amount: toDecimal(prepared.discountAmount),
            discount_percentage: toDecimal(prepared.discountPct),
            tax_amount: toDecimal(prepared.taxAmount),
            tax_percentage: toDecimal(prepared.taxPct),
            total_amount: toDecimal(prepared.totalAmount),
            collected_amount: toDecimal(prepared.collectedAmount),
            cost_total: toDecimal(prepared.cogsAmount),
            payment_method: prepared.paymentMethod,
            status: finalize
              ? QuickSaleStatus.completed
              : QuickSaleStatus.draft,
            notes: dto.notes?.trim() || null,
            receipt_comment: dto.receiptComment?.trim() || null,
            loyalty_points_earned: prepared.loyaltyPoints,
            warehouse_id: warehouseId,
            items: {
              create: prepared.resolvedItems.map((item, index) => ({
                item_type: item.itemType,
                product_id: item.productId,
                cafe_product_id: item.cafeProductId,
                cafe_variant_id: item.cafeVariantId,
                variant_name: item.variantName,
                inventory_product_id: item.inventoryProductId,
                ref_id: item.cafeProductId ?? item.productId,
                name: item.name,
                product_code: item.productCode,
                item_note: item.itemNote,
                unit_price: toDecimal(prepared.pricedItems[index].unitPrice),
                quantity: toDecimal(item.quantity),
                line_total: toDecimal(prepared.lineItems[index].lineTotal),
                unit_cost: toDecimal(item.unitCost),
                line_cost: toDecimal(item.unitCost * item.quantity),
              })),
            },
            payments: prepared.paymentRows.length
              ? {
                  create: prepared.paymentRows.map((payment) => ({
                    method: payment.method,
                    amount: toDecimal(payment.amount),
                    reference: payment.reference ?? null,
                  })),
                }
              : undefined,
            events: {
              create: [
                {
                  event_type: finalize ? "finalized" : "edited",
                  created_by: userId,
                },
                ...(dto.allowIngredientShortage
                  ? [
                      {
                        event_type: "stock_shortage_override",
                        notes:
                          "تم استكمال الطلب بموافقة المستخدم وتسجيل عجز الخامات في المخزون",
                        created_by: userId,
                      },
                    ]
                  : []),
              ],
            },
          },
          include: {
            items: { include: { feedback: true } },
            payments: true,
            feedback: true,
            events: true,
          },
        });
      },
      { maxWait: 10000, timeout: 20000 },
    );

    return this.map(updated);
  }

  async cancelDraft(
    id: number,
    notes: string | undefined,
    userId: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("المسودة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== QuickSaleStatus.draft)
      throw new BadRequestException("هذه الفاتورة لم تعد مسودة");
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.releaseDraftReservation(
        tx,
        existing,
        userId,
        "cafe_draft_cancel",
      );
      return tx.sales_quick_sales.update({
        where: { id },
        data: {
          status: QuickSaleStatus.cancelled,
          notes: notes?.trim() || existing.notes,
          events: {
            create: [
              {
                event_type: "cancelled",
                notes: "تم إرجاع كل المكونات المحجوزة إلى المخزون",
                created_by: userId,
              },
            ],
          },
        },
        include: {
          items: { include: { feedback: true } },
          payments: true,
          feedback: true,
          events: true,
        },
      });
    });
    return this.map(updated);
  }

  async saveFeedback(
    id: number,
    rating: number,
    comment: string | undefined,
    userId: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("الفاتورة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== QuickSaleStatus.completed)
      throw new BadRequestException("التقييم متاح للفواتير المكتملة فقط");
    const feedback = await this.prisma.sales_invoice_feedback.upsert({
      where: { quick_sale_id: id },
      create: {
        quick_sale_id: id,
        rating,
        comment: comment?.trim() || null,
        created_by: userId,
      },
      update: {
        rating,
        comment: comment?.trim() || null,
        feedback_date: new Date(),
        created_by: userId,
      },
    });
    return {
      rating: feedback.rating,
      comment: feedback.comment,
      date: feedback.feedback_date,
      invoiceId: id,
    };
  }

  async saveItemFeedback(
    id: number,
    items: Array<{ itemId: number; rating: number; comment?: string }>,
    userId: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException("الفاتورة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== QuickSaleStatus.completed) {
      throw new BadRequestException("تقييم الأصناف متاح للفواتير المكتملة فقط");
    }
    const validItemIds = new Set(existing.items.map((item) => item.id));
    if (!items.length || items.some((item) => !validItemIds.has(item.itemId))) {
      throw new BadRequestException("أحد بنود التقييم لا ينتمي إلى الفاتورة");
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sales_invoice_item_feedback.upsert({
          where: { quick_sale_item_id: item.itemId },
          create: {
            quick_sale_id: id,
            quick_sale_item_id: item.itemId,
            rating: item.rating,
            comment: item.comment?.trim() || null,
            created_by: userId,
          },
          update: {
            rating: item.rating,
            comment: item.comment?.trim() || null,
            feedback_date: new Date(),
            created_by: userId,
          },
        }),
      ),
    );
    return this.findOne(id, user);
  }

  async update(
    id: number,
    dto: UpdateQuickSaleDto,
    userId: number,
    dryRun = false,
    user?: JwtUser,
  ) {
    if (!dto.notes?.trim() || dto.notes.trim().length < 3) {
      throw new BadRequestException(
        "سبب الإلغاء أو الاسترداد مطلوب ويجب أن يكون واضحًا",
      );
    }
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
      include: {
        items: { include: { feedback: true } },
        payments: true,
        feedback: true,
        events: true,
      },
    });
    if (!existing) throw new NotFoundException("الفاتورة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== QuickSaleStatus.completed) {
      throw new BadRequestException(
        "لا يمكن تعديل فاتورة غير مكتملة أو تم إرجاعها مسبقاً",
      );
    }

    if (isDryRun(dryRun)) {
      return previewResponse(
        {
          saleId: id,
          saleNumber: existing.sale_number,
          status: dto.status,
          totalAmount: toNumber(existing.total_amount),
          collectedAmount: toNumber(existing.collected_amount),
        },
        {
          rows: this.buildVoidPreviewRows(existing, dto.status),
          warning:
            dto.status === "refunded"
              ? "سيُعاد الجاهز فقط للمخزون، وتُصنّف خامات المنتجات المُحضّرة هالكًا، مع عكس التحصيل."
              : "استخدم الإلغاء فقط إذا لم يتم تحضير أو تسليم الطلب؛ سيُعكس المخزون والتحصيل بالكامل.",
        },
      );
    }

    const warehouseId = existing.warehouse_id;
    if (!warehouseId)
      throw new BadRequestException("لا يوجد مستودع مرتبط بالفاتورة");
    const cogsAmount = roundMoney(toNumber(existing.cost_total));
    const isRefund = dto.status === "refunded";

    const updated = await this.prisma.$transaction(async (tx) => {
      // Reverse the exact movements persisted at sale time. Recipe edits after a sale must
      // never change what is returned to stock for that historical receipt.
      const originalMovements = await tx.inv_movements.findMany({
        where: {
          doc_ref: existing.sale_number,
          doc_type: { in: ["sale", "cafe_sale"] },
          direction: MovementDirection.out,
        },
        include: {
          product: {
            select: {
              name_ar: true,
              product_code: true,
              unit_of_measure: true,
            },
          },
        },
        orderBy: { id: "asc" },
      });
      if (!originalMovements.length) {
        throw new BadRequestException(
          "لا توجد حركات مخزنية أصلية مرتبطة بالفاتورة",
        );
      }
      // inventory_product_id is persisted only for ready/direct inventory sale
      // lines. It is therefore the historical source of truth even if the cafe
      // product master is edited later.
      const readyReturnRemaining = new Map<number, number>();
      if (isRefund) {
        for (const item of existing.items) {
          if (item.inventory_product_id == null) continue;
          readyReturnRemaining.set(
            item.inventory_product_id,
            (readyReturnRemaining.get(item.inventory_product_id) ?? 0) +
              Math.abs(toNumber(item.quantity)),
          );
        }
      }

      const wasteRows: Array<{
        productId: number;
        itemCode: string | null;
        itemName: string;
        quantity: number;
        unit: string | null;
        unitCost: number;
        total: number;
      }> = [];
      let returnedMovementCost = 0;

      for (const movement of originalMovements) {
        const movementQuantity = Math.abs(toNumber(movement.quantity));
        const unitCost = toNumber(movement.unit_cost);
        const returnQuantity = isRefund
          ? Math.min(
              movementQuantity,
              readyReturnRemaining.get(movement.product_id) ?? 0,
            )
          : movementQuantity;
        if (isRefund && returnQuantity > 0) {
          readyReturnRemaining.set(
            movement.product_id,
            Math.max(
              0,
              (readyReturnRemaining.get(movement.product_id) ?? 0) -
                returnQuantity,
            ),
          );
        }
        if (returnQuantity > 0.000001) {
          returnedMovementCost += returnQuantity * unitCost;
          await this.stock.applyMovement(
            {
              productId: movement.product_id,
              warehouseId: movement.warehouse_id || warehouseId,
              direction: MovementDirection.in,
              quantity: returnQuantity,
              unitCost: movement.unit_cost,
              txnType: InventoryTxnType.sales_return,
              docType: isRefund ? "sale_return" : "sale_cancel",
              docRef: existing.sale_number,
              branchId: existing.branch_id,
              createdBy: userId,
            },
            tx,
          );
        }
        const wasteQuantity =
          Math.round((movementQuantity - returnQuantity) * 1000) / 1000;
        if (isRefund && wasteQuantity > 0.000001) {
          wasteRows.push({
            productId: movement.product_id,
            itemCode: movement.product.product_code,
            itemName: movement.product.name_ar,
            quantity: wasteQuantity,
            unit: movement.uom ?? movement.product.unit_of_measure,
            unitCost,
            total: roundMoney(wasteQuantity * unitCost),
          });
        }
      }

      if (isRefund) {
        const unresolvedReadyQuantity = [
          ...readyReturnRemaining.values(),
        ].reduce((sum, value) => sum + value, 0);
        if (unresolvedReadyQuantity > 0.000001) {
          throw new BadRequestException(
            "تعذر مطابقة كمية المنتجات الجاهزة مع حركة البيع الأصلية",
          );
        }
      }

      const returnedCogsAmount = isRefund
        ? Math.min(cogsAmount, roundMoney(returnedMovementCost))
        : cogsAmount;
      const wasteCogsAmount = isRefund
        ? roundMoney(Math.max(0, cogsAmount - returnedCogsAmount))
        : 0;

      if (wasteRows.length && wasteCogsAmount > 0) {
        const wasteReference = `WASTE-${existing.sale_number}`;
        await tx.inv_transactions.create({
          data: {
            reference: wasteReference,
            txn_type: InventoryTxnType.damage,
            status: InventoryTxnStatus.approved,
            txn_date: new Date(),
            source_warehouse_id: warehouseId,
            branch_id: existing.branch_id,
            total_amount: wasteCogsAmount,
            notes: `هالك تحضير ناتج عن استرداد الفاتورة ${existing.sale_number}`,
            reason: `${dto.notes.trim()} — تم صرف الخامات وقت البيع ولا تُنشأ حركة صرف إضافية`,
            created_by: userId,
            approved_by: userId,
            approved_at: new Date(),
            items: {
              create: wasteRows.map((row) => ({
                product_id: row.productId,
                item_code: row.itemCode,
                item_name: row.itemName,
                quantity: row.quantity,
                unit: row.unit,
                price: row.unitCost,
                total: row.total,
                notes: `هالك استرداد ${existing.sale_number}`,
              })),
            },
          },
        });
        await recordSystemExpense(tx, {
          invoiceNumber: wasteReference,
          date: localDateString(),
          category: "مخزون",
          subCategory: "هالك كافيه",
          amount: wasteCogsAmount,
          description: `هالك خامات منتجات مُحضّرة — استرداد الفاتورة ${existing.sale_number}`,
          branchId: existing.branch_id,
          createdBy: userId,
          paymentMethod: "تسوية مخزون",
        });
      }

      const reversalSession = await this.sessions.findBranchSessionForSale(
        tx,
        existing.branch_id,
        userId,
      );
      if (!reversalSession) {
        throw new BadRequestException(
          "افتح وردية باسم المستخدم الحالي قبل استرداد أو إلغاء الفاتورة",
        );
      }
      await this.sessions.applySaleReversalToSession(tx, reversalSession.id, {
        quickSaleId: existing.id,
        totalAmount: toNumber(existing.total_amount),
        collectedAmount: toNumber(existing.collected_amount),
        discountAmount: toNumber(existing.discount_amount),
        taxAmount: toNumber(existing.tax_amount),
        paymentMethod: existing.payment_method,
        payments: existing.payments,
        operationType: isRefund ? "refund" : "cancel",
        createdBy: userId,
      });

      // GL reversal applies to both 'refunded' and 'cancelled': either way the sale's
      // revenue/tax/payment must come back out of the books (stock and collection are
      // already reversed above). Dated today — not the original sale_date — so reversing
      // a prior-period sale doesn't mutate a possibly closed accounting period.
      await this.moduleLedger.postQuickSaleRefund(
        {
          saleNumber: existing.sale_number,
          branchId: existing.branch_id,
          saleDate: localDateString(),
          subtotal: toNumber(existing.subtotal),
          discountAmount: toNumber(existing.discount_amount),
          taxAmount: toNumber(existing.tax_amount),
          totalAmount: toNumber(existing.total_amount),
          collectedAmount: toNumber(existing.collected_amount),
          paymentMethod: existing.payment_method,
          payments: existing.payments.map((p) => ({
            method: p.method,
            amount: toNumber(p.amount),
          })),
          returnedCogsAmount,
          wasteCogsAmount,
          operationType: isRefund ? "refund" : "cancel",
          saleType: existing.sale_type as "customer" | "employee" | "partner",
          createdBy: userId,
        },
        tx,
      );

      return tx.sales_quick_sales.update({
        where: { id },
        data: {
          status: dto.status as QuickSaleStatus,
          notes: dto.notes.trim(),
          events: {
            create: {
              event_type: dto.status === "refunded" ? "refunded" : "cancelled",
              notes: dto.notes.trim(),
              created_by: userId,
            },
          },
        },
        include: {
          items: { include: { feedback: true } },
          payments: true,
          feedback: true,
          events: true,
        },
      });
    });

    return this.map(updated);
  }

  async markPrinted(id: number, user?: JwtUser) {
    const existing = await this.prisma.sales_quick_sales.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("الفاتورة غير موجودة");
    this.assertBranchAccess(user, existing.branch_id);

    const row = await this.prisma.sales_quick_sales.update({
      where: { id },
      data: { receipt_printed: true },
      include: {
        items: { include: { feedback: true } },
        payments: true,
        feedback: true,
        events: true,
      },
    });
    return this.map(row);
  }
}
