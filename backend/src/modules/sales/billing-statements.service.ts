import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma, QuickSaleStatus, SalesPaymentMethod } from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import {
  BillingPreviewQueryDto,
  CreateBillingStatementDto,
  ListBillingStatementsDto,
  SettleBillingStatementDto,
} from "./dto/billing-statements.dto";
import { DEFERRED_BILLING_CYCLES, localDateString, toDecimal, toNumber } from "./sales.utils";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { mapPaymentMethodToArabic } from "../finance/finance.utils";
import { ShiftSessionsService } from "./shift-sessions.service";

@Injectable()
export class BillingStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ModuleLedgerService,
    private readonly sessions: ShiftSessionsService,
    private readonly branchScope?: BranchScopeService,
  ) {}

  private salesWhere(
    q: BillingPreviewQueryDto,
    user?: JwtUser,
  ): Prisma.sales_quick_salesWhereInput {
    const scope = this.branchScope?.resolveListFilter(user, q.branchId);
    return {
      ...(scope ? { AND: [{ branch_id: { in: scope } }] } : {}),
      sale_type: q.accountType,
      ...(q.accountType === "employee"
        ? { employee_id: q.accountId }
        : q.accountType === "partner" ? { partner_id: q.accountId } : {}),
      status: QuickSaleStatus.completed,
      billing_status: q.accountType === "hospitality" ? { in: ["not_applicable", "unbilled"] } : "unbilled",
      // One monthly statement collects EVERY deferred invoice of the account in the period —
      // legacy "daily" invoices included — so nothing is silently left out of the statement.
      ...(q.accountType !== "hospitality" ? { billing_cycle: { in: [...DEFERRED_BILLING_CYCLES] } } : {}),
      sale_date: { gte: q.periodStart, lte: q.periodEnd },
      ...(q.branchId ? { branch_id: q.branchId } : {}),
    };
  }

  async preview(q: BillingPreviewQueryDto, user?: JwtUser) {
    if (q.periodStart > q.periodEnd)
      throw new BadRequestException("بداية الفترة يجب أن تسبق نهايتها");
    const sales = await this.prisma.sales_quick_sales.findMany({
      where: this.salesWhere(q, user),
      include: { items: true },
      orderBy: [{ sale_date: "asc" }, { daily_number: "asc" }],
    });
    const account = q.accountType === "hospitality" ? { name: "ضيافة المكان" } :
      q.accountType === "employee"
        ? await this.prisma.employees.findUnique({
            where: { id: q.accountId },
            select: { employee: true, emp_code: true },
          })
        : await this.prisma.cafe_partners.findUnique({
            where: { id: q.accountId },
            select: { name: true },
          });
    if (!account)
      throw new NotFoundException(
        q.accountType === "employee" ? "الموظف غير موجود" : "الشريك غير موجود",
      );
    return {
      accountType: q.accountType,
      accountId: q.accountId,
      accountName: "employee" in account ? account.employee : account.name,
      periodStart: q.periodStart,
      periodEnd: q.periodEnd,
      count: sales.length,
      totalAmount: sales.reduce(
        (sum, sale) => sum + toNumber(sale.total_amount),
        0,
      ),
      sales: sales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.sale_number,
        dailyNumber: sale.daily_number,
        saleDate: sale.sale_date,
        saleTime: sale.sale_time,
        amount: toNumber(sale.total_amount),
        billingCycle: sale.billing_cycle,
        items: sale.items.map((item) => ({
          name: item.name,
          quantity: toNumber(item.quantity),
          amount: toNumber(item.line_total),
        })),
      })),
    };
  }

  async create(dto: CreateBillingStatementDto, userId: number, user?: JwtUser) {
    const preview = await this.preview(dto, user);
    const selected = dto.saleIds?.length
      ? preview.sales.filter((sale) => dto.saleIds!.includes(sale.id))
      : preview.sales;
    if (!selected.length)
      throw new BadRequestException(
        "لا توجد فواتير غير مسواة في الفترة المحددة",
      );
    if (dto.saleIds?.length && selected.length !== new Set(dto.saleIds).size) {
      throw new BadRequestException("بعض الفواتير المختارة غير متاحة للتجميع");
    }
    const selectedIds = selected.map((sale) => sale.id).sort((a, b) => a - b);
    const statementNumber = `ST-${localDateString().replaceAll("-", "")}-${dto.accountType === "employee" ? "E" : dto.accountType === "partner" ? "P" : "H"}-${Date.now().toString().slice(-8)}`;
    const row = await this.prisma.$transaction(async (tx) => {
      // Completed edits and refunds lock these same rows. The preview is only a
      // candidate list: after waiting for an edit, use its committed total and
      // recheck that every invoice still belongs to this unbilled account.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_quick_sales
        WHERE id IN (${Prisma.join(selectedIds)}) ORDER BY id FOR UPDATE
      `);
      const eligibleWhere: Prisma.sales_quick_salesWhereInput = {
        ...this.salesWhere(dto, user),
        id: { in: selectedIds },
        billing_statement_item: null,
      };
      const currentSales = await tx.sales_quick_sales.findMany({
        where: eligibleWhere,
        select: { id: true, total_amount: true, branch_id: true },
        orderBy: { id: 'asc' },
      });
      if (dto.accountType === "hospitality" && new Set(currentSales.map(sale => sale.branch_id)).size !== 1) throw new BadRequestException("اختر فواتير ضيافة من فرع واحد لكل كشف");
      if (currentSales.length !== selectedIds.length) {
        throw new BadRequestException('تغيرت حالة بعض الفواتير؛ حدّث المعاينة ثم أنشئ كشف الحساب مرة أخرى');
      }
      if (await tx.payroll_cafe_allocations.count({ where: { sale_id: { in: selectedIds } } })) throw new BadRequestException('بعض الفواتير مختارة للخصم من المرتبات الشهرية');
      const claimed = await tx.sales_quick_sales.updateMany({
        where: eligibleWhere,
        data: { billing_status: 'in_statement' },
      });
      if (claimed.count !== selectedIds.length) {
        throw new BadRequestException('تعذر تجميع بعض الفواتير؛ حدّث المعاينة ثم أعد المحاولة');
      }
      const total = currentSales.reduce((sum, sale) => sum.plus(sale.total_amount), new Prisma.Decimal(0));
      const created = await tx.sales_billing_statements.create({
        data: {
          statement_number: statementNumber,
          account_type: dto.accountType,
          employee_id: dto.accountType === "employee" ? dto.accountId : null,
          partner_id: dto.accountType === "partner" ? dto.accountId : null,
          billing_cycle: dto.accountType === "hospitality" ? dto.billingCycle : "monthly",
          period_start: dto.periodStart,
          period_end: dto.periodEnd,
          total_amount: toDecimal(total),
          branch_id: dto.branchId ?? (dto.accountType === "hospitality" ? currentSales[0].branch_id : null),
          notes: dto.notes?.trim() || null,
          created_by: userId,
          items: {
            create: currentSales.map((sale) => ({
              quick_sale_id: sale.id,
              amount: sale.total_amount,
            })),
          },
        },
        include: { items: { include: { sale: { include: { items: true } } } } },
      });
      await tx.sales_invoice_events.createMany({
        data: currentSales.map((sale) => ({
          quick_sale_id: sale.id,
          event_type: "billing_statement_issued",
          notes: `تمت إضافة الفاتورة إلى كشف الحساب ${statementNumber}`,
          created_by: userId,
        })),
      });
      return created;
    });
    return this.map(row);
  }

  async settle(id: number, dto: SettleBillingStatementDto, userId: number, user?: JwtUser) {
    const statement = await this.prisma.sales_billing_statements.findUnique({
      where: { id },
      include: {
        items: {
          include: { sale: { select: { branch_id: true, sale_number: true } } },
        },
      },
    });
    if (!statement) throw new NotFoundException("كشف الحساب غير موجود");
    if (user && statement.items.some(item => !this.branchScope?.isBranchAllowed(user, item.sale.branch_id))) throw new ForbiddenException("كشف الحساب خارج الفروع المسموح بها");
    if (statement.account_type === "hospitality") return this.settleHospitality(id, dto, userId, user);
    if (dto.settlementMethod === "partner_account") throw new BadRequestException("تحميل حساب الشريك متاح للضيافة فقط");
    if (statement.status !== "issued")
      throw new BadRequestException("تمت تسوية هذا الكشف بالفعل");
    if (
      statement.account_type === "employee" &&
      dto.settlementMethod === "profit_share_deduction"
    ) {
      throw new BadRequestException("خصم الأرباح متاح للشريك فقط");
    }
    if (
      statement.account_type === "partner" &&
      dto.settlementMethod === "payroll_deduction"
    ) {
      throw new BadRequestException("خصم الراتب متاح للموظف فقط");
    }
    if (dto.settlementMethod === 'payroll_deduction') throw new BadRequestException('اختار خصم حساب الكافيه من شاشة المرتبات الشهرية عشان يتخصم من صافي المرتب ويتسدد مرة واحدة');
    if (dto.settlementMethod === "direct_payment" && !dto.paymentMethod) {
      throw new BadRequestException("اختر وسيلة الدفع");
    }
    const saleBranchIds = new Set(
      statement.items.map((item) => item.sale.branch_id),
    );
    const branchId = statement.branch_id
      ?? (saleBranchIds.size === 1 ? [...saleBranchIds][0] : null);
    if (!branchId) {
      throw new BadRequestException(
        "تعذر تحديد فرع كشف الحساب؛ أنشئ كشفًا موحدًا لفواتير فرع واحد",
      );
    }
    await this.ledger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      const ids = statement.items.map(item => item.quick_sale_id).sort((a, b) => a - b);
      if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      const current = await tx.sales_billing_statements.findUnique({ where: { id } });
      if (current?.status !== 'issued') throw new BadRequestException('تمت تسوية هذا الكشف بالفعل');
      if (await tx.payroll_cafe_allocations.count({ where: { sale_id: { in: ids } } })) throw new BadRequestException('الكشف مختار للخصم من المرتبات؛ أجّل الخصم هناك قبل التحصيل المباشر');
      // The cash lands in whichever shift is collecting now, not the shift that
      // rang up the original orders.
      const shift = await this.sessions.findBranchSessionForSale(tx, branchId);
      if (!shift) {
        throw new BadRequestException(
          "لا توجد وردية مفتوحة في الفرع لتسجيل تسوية الحساب",
        );
      }
      await this.ledger.postSalesStatementSettlement(
        {
          statementNumber: statement.statement_number,
          branchId,
          date: localDateString(),
          amount: toNumber(statement.total_amount),
          accountType: statement.account_type as "employee" | "partner",
          settlementMethod: dto.settlementMethod as "direct_payment" | "profit_share_deduction",
          paymentMethod: dto.paymentMethod as SalesPaymentMethod | undefined,
          createdBy: userId,
        },
        tx,
      );
      await this.sessions.applyStatementSettlementToSession(tx, shift.id, {
        amount: toNumber(statement.total_amount),
        settlementMethod: dto.settlementMethod,
        paymentMethod: dto.paymentMethod as SalesPaymentMethod | undefined,
      });
      if (
        dto.settlementMethod === "direct_payment"
        && dto.paymentMethod === SalesPaymentMethod.cash
      ) {
        await tx.sales_cash_drawer_transactions.create({
          data: {
            reference: `AS-${statement.id}-${shift.id}`,
            branch_id: branchId,
            shift_session_id: shift.id,
            source_transaction_id: statement.id,
            movement_type: "account_settlement",
            direction: "in",
            amount: statement.total_amount,
            category: statement.account_type === "employee"
              ? "employee_account"
              : "partner_account",
            description: `تحصيل كشف الحساب ${statement.statement_number}`,
            employee_id: statement.employee_id,
            created_by: userId,
          },
        });
      }
      await tx.sales_quick_sales.updateMany({
        where: {
          id: { in: statement.items.map((item) => item.quick_sale_id) },
        },
        data: { billing_status: "settled" },
      });
      await tx.fin_revenues.updateMany({
        where: { source_module: 'quick_sale', source_ref: { in: statement.items.map(item => item.sale.sale_number) } },
        data: { payment_status: 'مدفوع' },
      });
      await tx.sales_invoice_events.createMany({
        data: statement.items.map((item) => ({
          quick_sale_id: item.quick_sale_id,
          event_type: "billing_statement_settled",
          notes: `تمت تسوية كشف الحساب ${statement.statement_number} بطريقة ${dto.settlementMethod}`,
          created_by: userId,
        })),
      });
      return tx.sales_billing_statements.update({
        where: { id },
        data: {
          paid_amount: statement.total_amount,
          settlement_method: dto.settlementMethod,
          payment_method: dto.paymentMethod as SalesPaymentMethod | undefined,
          status: "settled",
          branch_id: branchId,
          shift_session_id: shift.id,
          settled_by: userId,
          settled_at: new Date(),
          notes: dto.notes?.trim() || statement.notes,
        },
        include: { items: { include: { sale: { include: { items: true } } } } },
      });
    });
    return this.map(row);
  }

  private async settleHospitality(id: number, dto: SettleBillingStatementDto, userId: number, user?: JwtUser) {
    await this.ledger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      // Serialize transfer and collection against this same immutable invoice group.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_billing_statements WHERE id = ${id} FOR UPDATE`);
      const statement = await tx.sales_billing_statements.findUnique({
        where: { id }, include: { items: { include: { sale: { include: { items: true } } } } },
      });
      if (!statement || statement.account_type !== 'hospitality') throw new NotFoundException('كشف الضيافة غير موجود');
      if (statement.status !== 'issued') throw new BadRequestException('تمت تسوية هذا الكشف بالفعل');
      const ids = statement.items.map(item => item.quick_sale_id).sort((a, b) => a - b);
      if (!ids.length) throw new BadRequestException('كشف الضيافة فارغ');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      const sales = await tx.sales_quick_sales.findMany({ where: { id: { in: ids } } });
      if (sales.length !== ids.length || sales.some(sale => sale.status !== 'completed' || sale.sale_type !== 'hospitality' || sale.billing_status !== 'in_statement')) throw new BadRequestException('تغيرت حالة فواتير الضيافة؛ حدّث الكشف');
      const branches = new Set(sales.map(sale => sale.branch_id));
      const branchId = sales[0].branch_id;
      if (branches.size !== 1 || (user && !this.branchScope?.isBranchAllowed(user, branchId))) throw new ForbiddenException('اختر كشفًا من فرع واحد مسموح به');
      const transfer = dto.settlementMethod === 'partner_account';
      const alreadyTransferred = statement.partner_id != null;
      if (transfer && alreadyTransferred) throw new BadRequestException('تم تحميل الكشف على حساب شريك بالفعل');
      if (!transfer && dto.settlementMethod !== 'direct_payment' && !(alreadyTransferred && dto.settlementMethod === 'profit_share_deduction')) throw new BadRequestException('اختر تحصيلًا مباشرًا أو التحميل على حساب شريك');
      if (!transfer && dto.settlementMethod === 'direct_payment' && !dto.paymentMethod) throw new BadRequestException('اختر وسيلة الدفع');
      const partner = transfer && dto.partnerId ? await tx.cafe_partners.findUnique({ where: { id: dto.partnerId } }) : null;
      if (transfer && !partner?.is_active) throw new BadRequestException('اختر شريكًا نشطًا لتحميل قيمة الضيافة');
      const shift = transfer ? null : await this.sessions.findBranchSessionForSale(tx, branchId);
      if (!transfer && !shift) throw new BadRequestException('لا توجد وردية مفتوحة في الفرع لتسجيل التحصيل');
      const amount = toNumber(statement.total_amount);
      if (amount <= 0) throw new BadRequestException('قيمة الكشف يجب أن تكون أكبر من صفر');
      const date = localDateString();
      if (!alreadyTransferred) {
        const taxAmount = sales.reduce((sum, sale) => sum + toNumber(sale.tax_amount), 0);
        await this.ledger.postHospitalitySettlement({ statementNumber: statement.statement_number, branchId, date, amount, taxAmount, partnerAccount: transfer, paymentMethod: dto.paymentMethod, createdBy: userId }, tx);
        // One finance projection for the recovery; never recreate the original inventory expense.
        const revenue = {
          revenue_date: date, source: 'تسويات ضيافة الكافيه', sub_source: transfer ? 'حساب شريك' : 'تحصيل مباشر',
          amount: amount - taxAmount, tax_amount: taxAmount, discount_amount: 0, total_amount: amount, net_amount: amount,
          payment_status: transfer ? 'معلق' : 'مدفوع', payment_method: transfer ? 'آجل' : mapPaymentMethodToArabic(dto.paymentMethod),
          description: `تسوية ضيافة ${statement.statement_number}`, customer_name: partner?.name ?? null,
          invoice_number: statement.statement_number, source_module: 'hospitality_settlement', source_ref: statement.statement_number,
          branch_id: branchId, created_by: userId, notes: 'مستند تلقائي مربوط بالنظام',
        };
        await tx.fin_revenues.upsert({ where: { revenue_number: `HOSP-ST-${id}` }, create: { revenue_number: `HOSP-ST-${id}`, ...revenue }, update: revenue });
      } else {
        await this.ledger.postSalesStatementSettlement({ statementNumber: statement.statement_number, branchId, date, amount, accountType: 'partner', settlementMethod: dto.settlementMethod as 'direct_payment' | 'profit_share_deduction', paymentMethod: dto.paymentMethod, createdBy: userId }, tx);
        await tx.fin_revenues.updateMany({ where: { source_module: 'hospitality_settlement', source_ref: statement.statement_number }, data: { payment_status: 'مدفوع', payment_method: dto.settlementMethod === 'direct_payment' ? mapPaymentMethodToArabic(dto.paymentMethod) : 'خصم من الأرباح' } });
      }
      if (shift) {
        await this.sessions.applyStatementSettlementToSession(tx, shift.id, { amount, settlementMethod: dto.settlementMethod as 'direct_payment' | 'profit_share_deduction', paymentMethod: dto.paymentMethod });
        if (dto.settlementMethod === 'direct_payment' && dto.paymentMethod === 'cash') {
          await tx.sales_cash_drawer_transactions.create({ data: {
            reference: `AS-${id}-${shift.id}`, branch_id: branchId, shift_session_id: shift.id, source_transaction_id: id,
            movement_type: 'account_settlement', direction: 'in', amount: statement.total_amount, category: 'hospitality_account',
            description: `تحصيل ضيافة ${statement.statement_number}`, created_by: userId,
          } });
        }
      }
      await tx.sales_quick_sales.updateMany({ where: { id: { in: ids } }, data: {
        billing_status: transfer ? 'in_statement' : 'settled', ...(transfer ? { partner_id: partner!.id } : {}),
      } });
      await tx.sales_invoice_events.createMany({ data: ids.map(saleId => ({
        quick_sale_id: saleId, event_type: transfer ? 'hospitality_partner_assigned' : 'hospitality_settled', created_by: userId,
        notes: transfer ? `تحميل كشف الضيافة ${statement.statement_number} على الشريك ${partner!.name} (#${partner!.id}) بقيمة ${amount}` : `تسوية كشف الضيافة ${statement.statement_number} بطريقة ${dto.settlementMethod}${dto.paymentMethod ? ` (${dto.paymentMethod})` : ''}`,
      })) });
      return tx.sales_billing_statements.update({ where: { id }, data: {
        status: transfer ? 'issued' : 'settled', partner_id: transfer ? partner!.id : statement.partner_id,
        paid_amount: transfer ? 0 : statement.total_amount, settlement_method: dto.settlementMethod,
        payment_method: !transfer && dto.settlementMethod === 'direct_payment' ? dto.paymentMethod : null,
        branch_id: branchId, shift_session_id: shift?.id ?? null,
        settled_by: userId, settled_at: new Date(), notes: dto.notes?.trim() || statement.notes,
      }, include: { items: { include: { sale: { include: { items: true } } } } } });
    });
    return this.map(row);
  }

  async list(q: ListBillingStatementsDto, user?: JwtUser) {
    const where: Prisma.sales_billing_statementsWhereInput = {};
    if (q.accountType === "partner") where.OR = [{ account_type: "partner" }, { account_type: "hospitality", partner_id: { not: null } }];
    else if (q.accountType) where.account_type = q.accountType;
    const scope = this.branchScope?.resolveListFilter(user, q.branchId);
    if (scope) where.items = { every: { sale: { branch_id: { in: scope } } }, some: {} };
    if (q.accountId != null) {
      if (q.accountType === "employee") where.employee_id = q.accountId;
      else if (q.accountType === "partner") where.partner_id = q.accountId;
      else
        where.OR = [{ employee_id: q.accountId }, { partner_id: q.accountId }];
    }
    if (q.status && q.status !== "all") where.status = q.status;
    if (q.branchId) where.branch_id = q.branchId;
    if (q.dateFrom || q.dateTo)
      where.period_start = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    const [rows, total] = await Promise.all([
      this.prisma.sales_billing_statements.findMany({
        where,
        include: { items: { include: { sale: { include: { items: true } } } } },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_billing_statements.count({ where }),
    ]);
    const employeeIds = rows.flatMap((row) =>
      row.employee_id ? [row.employee_id] : [],
    );
    const partnerIds = rows.flatMap((row) =>
      row.partner_id ? [row.partner_id] : [],
    );
    const employees: Array<{ id: number; employee: string | null }> =
      employeeIds.length
        ? await this.prisma.employees.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employee: true },
          })
        : [];
    const partners: Array<{ id: number; name: string }> = partnerIds.length
      ? await this.prisma.cafe_partners.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, name: true },
        })
      : [];
    const employeeNames = new Map<number, string | null>(
      employees.map((employee) => [employee.id, employee.employee]),
    );
    const partnerNames = new Map<number, string>(
      partners.map((partner) => [partner.id, partner.name]),
    );
    return paginated(
      rows.map((row) =>
        this.map(
          row,
          row.employee_id
            ? employeeNames.get(row.employee_id)
            : row.partner_id
              ? partnerNames.get(row.partner_id)
              : null,
        ),
      ),
      total,
      q.page,
      q.pageSize,
    );
  }

  private map(
    row: Prisma.sales_billing_statementsGetPayload<{
      include: { items: { include: { sale: { include: { items: true } } } } };
    }>,
    accountName?: string | null,
  ) {
    return {
      id: row.id,
      statementNumber: row.statement_number,
      accountType: row.account_type,
      employeeId: row.employee_id,
      partnerId: row.partner_id,
      billingCycle: row.billing_cycle,
      accountName: accountName ?? null,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalAmount: toNumber(row.total_amount),
      paidAmount: toNumber(row.paid_amount),
      settlementMethod: row.settlement_method,
      paymentMethod: row.payment_method,
      status: row.status,
      notes: row.notes,
      branchId: row.branch_id,
      shiftSessionId: row.shift_session_id,
      createdBy: row.created_by,
      settledBy: row.settled_by,
      settledAt: row.settled_at,
      createdAt: row.created_at,
      sales: row.items.map((item) => ({
        id: item.sale.id,
        saleNumber: item.sale.sale_number,
        dailyNumber: item.sale.daily_number,
        saleDate: item.sale.sale_date,
        saleTime: item.sale.sale_time,
        amount: toNumber(item.amount),
        items: (item.sale.items ?? []).map((saleItem) => ({
          id: saleItem.id,
          name: saleItem.name,
          quantity: toNumber(saleItem.quantity),
          amount: toNumber(saleItem.line_total),
        })),
      })),
    };
  }
}
