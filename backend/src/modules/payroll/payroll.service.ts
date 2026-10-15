import { calendarPayrollPeriod, PayrollWindow, sumPayrollEvents } from './monthly-payroll.util';
import { MonthlyPayrollEventDto, PayrollCafeChoiceDto } from './dto/payroll.dto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { allocateDocumentNumber } from '../../common/number-series/document-number-series';
import { FailClosedHrLedgerAdapter, HR_LEDGER_ADAPTER, HrLedgerAdapter } from '../../ports/accounting/hr-ledger.adapter';
import { CreatePayComponentDto, CreatePayrollRunDto, UpdatePayComponentDto } from './dto/payroll.dto';
import { ComputedEmployeeSalary, PayrollEngineService } from './payroll-engine.service';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import {
  BANK_PAYMENT_ADAPTER,
  BankPaymentAdapter,
  DisabledBankPaymentAdapter,
} from '../../ports/payroll/bank-payment.adapter';
import { JwtUser } from '../../common/types/jwt-user';
import { buildPayrollEmployeeWhere } from './salary-component.util';
import {
  decimal,
  mapRunStatus,
  monthLabel,
  payrollPeriod,
  runTitle,
  todayAr,
  timeAr,
} from './payroll-status.util';

const COMPONENT_TYPES = ['allowances', 'deduction'] as const;

/** Marks quests settled by a payroll post so unpost does not reopen cash repayments. */
function payrollQuestPayer(mosayerRkm: number): string {
  return `payroll:${mosayerRkm}`;
}

interface PayrollBranchTotals {
  branchId: number | null;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  employeeInsurance: number;
  employerInsurance: number;
  loanDeductions: number;
  incomeTax: number;
  cafeDeductions: number;
  nonLiabilityDeductions: number;
}

const payrollMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function payrollStatusWhere(status?: string): Prisma.hr_mosayerWhereInput | null {
  switch (status) {
    case 'completed': return { finish_sarf_date: { not: null } };
    case 'banked': return { finish_sarf_date: null, tanfez_ezn_sarf: 'yes' };
    case 'bank_prepared': return { finish_sarf_date: null, tanfez_ezn_sarf: { not: 'yes' }, file_downloded: { not: null } };
    case 'posted': return { finish_sarf_date: null, tanfez_ezn_sarf: { not: 'yes' }, file_downloded: null, halet_sarf: 'yes' };
    case 'approved': return { halet_sarf: { not: 'yes' }, approved: 1 };
    case 'reviewing': return {
      halet_sarf: { not: 'yes' }, approved: { not: 1 },
      OR: [
        { suspend_mohasb: 'yes' }, { suspend_direct_manager: 'yes' }, { suspend_moder_mali: 'yes' },
      ],
    };
    case 'computed': return {
      halet_sarf: { not: 'yes' }, approved: { not: 1 }, taghez: 'yes',
      suspend_mohasb: { not: 'yes' }, suspend_direct_manager: { not: 'yes' }, suspend_moder_mali: { not: 'yes' },
    };
    case 'draft': return { taghez: { not: 'yes' }, approved: { not: 1 }, halet_sarf: { not: 'yes' } };
    default: return null;
  }
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
    @Optional() @Inject(HR_LEDGER_ADAPTER)
    private readonly moduleLedger: HrLedgerAdapter = new FailClosedHrLedgerAdapter(),
    @Optional() private readonly hrScope?: HrDataScopeService,
    @Optional() @Inject(BANK_PAYMENT_ADAPTER)
    private readonly bankPayment: BankPaymentAdapter = new DisabledBankPaymentAdapter(),
  ) {}

  private runWindow(run: { mosayer_month: number | null; mosayer_year: number | null; period_start?: string | null; period_end?: string | null }): PayrollWindow {
    return run.period_start && run.period_end ? { fromDate: run.period_start, toDate: run.period_end } : payrollPeriod(run.mosayer_month!, run.mosayer_year!);
  }

  private async lockEditableRun(tx: Prisma.TransactionClient, id: number) {
    await tx.$queryRaw`SELECT id FROM hr_mosayer WHERE id = ${id} FOR UPDATE`;
    const run = await tx.hr_mosayer.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('المرتبات الشهرية غير موجودة');
    if (!['draft', 'computed', 'reviewing'].includes(mapRunStatus(run))) throw new BadRequestException('تم اعتماد المرتبات؛ التعديل مقفول');
    return run;
  }

  private async importLegacyOverrides(tx: Prisma.TransactionClient, runId: number, employeeId: number, lineId: number) {
    const line = await tx.hr_mosayer_details.findFirst({ where: { id: lineId } });
    const saved = (line?.calculation_snapshot as any)?.overrides;
    if (!saved) return;
    const existing = await tx.payroll_monthly_events.findMany({ where: { run_id: runId, employee_id: employeeId } });
    if (existing.length) return;
    for (const [key, kind] of [['privateBonus', 'bonus'], ['taqeemValue', 'evaluation'], ['targetValue', 'target']]) {
      const amount = Number(saved[key] ?? 0);
      if (amount > 0) await tx.payroll_monthly_events.create({ data: { run_id: runId, employee_id: employeeId, kind, amount, note: 'قيمة محفوظة قبل تفعيل سجل الحركات', actor_id: 0, actor_name: 'ترحيل القيم السابقة', request_id: `legacy-payroll-${runId}-${employeeId}-${key}` } });
    }
  }

  private async monthlyOverrides(tx: Prisma.TransactionClient, runId: number, employeeId: number) {
    const events = await tx.payroll_monthly_events.findMany({ where: { run_id: runId, employee_id: employeeId }, orderBy: { id: 'asc' } });
    const allocations = await tx.payroll_cafe_allocations.findMany({ where: { run_id: runId, employee_id: employeeId } });
    return { ...sumPayrollEvents(events), cafeDeduction: payrollMoney(allocations.reduce((n, a) => n + Number(a.amount), 0)) };
  }

  private async refreshMonthlyEmployee(tx: Prisma.TransactionClient, run: Awaited<ReturnType<PayrollService['lockEditableRun']>>, lineId: number, employeeId: number) {
    const overrides = await this.monthlyOverrides(tx, run.id, employeeId);
    const computed = await this.engine.computeOneById(employeeId, run.mosayer_month!, run.mosayer_year!, overrides, this.runWindow(run));
    if (!computed) throw new BadRequestException('تعذر احتساب الموظف؛ راجع حالة الموظف وراتبه');
    if (computed.totalKhsomat > computed.totalEsthkak) throw new BadRequestException('الخصومات أكبر من المستحقات؛ قلّل الخصم أو أجّل حساب الكافيه');
    await tx.hr_mosayer_details.update({ where: { id: lineId }, data: this.toDetailRow(run.mosayer_rkm!, computed) });
    await this.recomputeHeaderTotals(tx, run.mosayer_rkm, run.id);
    // Any edit after submission requires a fresh review.
    await tx.hr_mosayer.update({ where: { id: run.id }, data: { taghez: 'yes', suspend_mohasb: null, suspend_direct_manager: null, suspend_moder_mali: null } });
  }

  async monthlyEmployee(runId: number, lineId: number, user: JwtUser) {
    const slip = await this.getSlip(runId, lineId, user);
    const employeeId = slip.employee.id;
    if (!employeeId) throw new BadRequestException('الموظف غير مرتبط بسجل صالح');
    const run = await this.getRunOrThrow(runId, user);
    const [events, allocations, sales] = await Promise.all([
      this.prisma.payroll_monthly_events.findMany({ where: { run_id: runId, employee_id: employeeId }, orderBy: { id: 'desc' } }),
      this.prisma.payroll_cafe_allocations.findMany({ where: { employee_id: employeeId } }),
      this.prisma.sales_quick_sales.findMany({ where: { employee_id: employeeId, sale_type: 'employee', status: 'completed', billing_cycle: 'monthly', billing_status: { in: ['unbilled', 'in_statement'] }, sale_date: { lte: this.runWindow(run).toDate } }, orderBy: { id: 'asc' } }),
    ]);
    const reservedElsewhere = new Set(allocations.filter(a => a.run_id !== runId).map(a => a.sale_id));
    const available = sales.filter(s => !reservedElsewhere.has(s.id));
    const selected = allocations.filter(a => a.run_id === runId);
    return { ...slip, editable: ['draft', 'computed', 'reviewing'].includes(slip.run.status),
      history: events.map(e => ({ id: e.id, kind: e.kind, amount: Number(e.amount), note: e.note, actorName: e.actor_name, createdAt: e.created_at, reversesId: e.reverses_id })),
      cafe: { outstanding: payrollMoney(available.reduce((n, s) => n + Number(s.total_amount) - Number(s.collected_amount), 0)), selectedAmount: payrollMoney(selected.reduce((n, a) => n + Number(a.amount), 0)), selected: selected.length > 0, settled: selected.some(a => a.settled_at != null), reservedElsewhere: payrollMoney(allocations.filter(a => a.run_id !== runId && !a.settled_at).reduce((n, a) => n + Number(a.amount), 0)), invoiceCount: available.length },
    };
  }

  async addMonthlyEvent(runId: number, lineId: number, dto: MonthlyPayrollEventDto, user: JwtUser) {
    await this.assertGlobalPayrollScope(user);
    const slip = await this.getSlip(runId, lineId, user);
    const employeeId = slip.employee.id!;
    if (!employeeId || !dto.note.trim()) throw new BadRequestException('اكتب سبب الحركة');
    await this.prisma.$transaction(async tx => {
      const run = await this.lockEditableRun(tx, runId);
      const duplicate = await tx.payroll_monthly_events.findUnique({ where: { request_id: dto.requestId } });
      if (duplicate) {
        if (duplicate.run_id !== runId || duplicate.employee_id !== employeeId || duplicate.kind !== dto.kind || Number(duplicate.amount) !== dto.amount || duplicate.note !== dto.note.trim() || duplicate.reverses_id !== (dto.reversesId ?? null)) throw new ConflictException('طلب مختلف بنفس رقم الحفظ');
        return;
      }
      await this.importLegacyOverrides(tx, runId, employeeId, lineId);
      if (dto.kind === 'reversal') {
        const original = await tx.payroll_monthly_events.findFirst({ where: { id: dto.reversesId ?? -1, run_id: runId, employee_id: employeeId, kind: { in: ['deduction', 'increase', 'bonus', 'evaluation', 'target'] } } });
        if (!original || Number(original.amount) !== dto.amount || await tx.payroll_monthly_events.findFirst({ where: { reverses_id: original.id } })) throw new BadRequestException('الحركة غير موجودة أو تم إلغاؤها');
      } else if (dto.reversesId != null) throw new BadRequestException('رقم الحركة الأصلية متاح للإلغاء فقط');
      await tx.payroll_monthly_events.create({ data: { run_id: runId, employee_id: employeeId, kind: dto.kind, amount: dto.amount, note: dto.note.trim(), actor_id: user.sub, actor_name: user.name || `مستخدم ${user.sub}`, request_id: dto.requestId, reverses_id: dto.reversesId } });
      await this.refreshMonthlyEmployee(tx, run, lineId, employeeId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000 });
    return this.monthlyEmployee(runId, lineId, user);
  }

  async chooseMonthlyCafe(runId: number, lineId: number, dto: PayrollCafeChoiceDto, user: JwtUser) {
    await this.assertGlobalPayrollScope(user);
    const slip = await this.getSlip(runId, lineId, user);
    const employeeId = slip.employee.id!;
    if (!employeeId || !dto.note.trim()) throw new BadRequestException('اكتب ملاحظة القرار');
    await this.prisma.$transaction(async tx => {
      const run = await this.lockEditableRun(tx, runId);
      const kind = dto.deduct ? 'cafe_select' : 'cafe_defer';
      const duplicate = await tx.payroll_monthly_events.findUnique({ where: { request_id: dto.requestId } });
      if (duplicate) {
        if (duplicate.run_id !== runId || duplicate.employee_id !== employeeId || duplicate.kind !== kind || duplicate.note !== dto.note.trim() || Number(duplicate.amount) !== dto.expectedAmount) throw new ConflictException('طلب مختلف بنفس رقم الحفظ');
        return;
      }
      await this.importLegacyOverrides(tx, runId, employeeId, lineId);
      // Serialize allocations across different payroll months for the same employee.
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;
      const old = await tx.payroll_cafe_allocations.findMany({ where: { run_id: runId, employee_id: employeeId } });
      let amount = payrollMoney(old.reduce((n, a) => n + Number(a.amount), 0));
      if (dto.deduct) {
        const candidates = await tx.sales_quick_sales.findMany({ where: { employee_id: employeeId, sale_type: 'employee', status: 'completed', billing_cycle: 'monthly', billing_status: { in: ['unbilled', 'in_statement'] }, sale_date: { lte: this.runWindow(run).toDate } }, orderBy: { id: 'asc' } });
        const held = await tx.payroll_cafe_allocations.findMany({ where: { employee_id: employeeId, run_id: { not: runId } } });
        const heldIds = new Set(held.map(a => a.sale_id));
        const ids = candidates.filter(s => !heldIds.has(s.id)).map(s => s.id);
        if (!ids.length) throw new BadRequestException('لا توجد مديونية متاحة لهذا الشهر');
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
        const sales = await tx.sales_quick_sales.findMany({ where: { id: { in: ids }, status: 'completed', billing_status: { in: ['unbilled', 'in_statement'] } } });
        amount = payrollMoney(sales.reduce((n, s) => n + Number(s.total_amount) - Number(s.collected_amount), 0));
        if (sales.length !== ids.length || amount <= 0 || amount !== dto.expectedAmount) throw new ConflictException('مديونية الكافيه اتغيرت؛ حدّث البيانات وراجع المبلغ');
        await tx.payroll_cafe_allocations.deleteMany({ where: { run_id: runId, employee_id: employeeId } });
        for (const sale of sales) await tx.payroll_cafe_allocations.create({ data: { run_id: runId, employee_id: employeeId, sale_id: sale.id, amount: payrollMoney(Number(sale.total_amount) - Number(sale.collected_amount)), previous_status: sale.billing_status } });
      } else {
        if (amount !== dto.expectedAmount) throw new ConflictException('المبلغ المختار اتغير؛ حدّث البيانات');
        await tx.payroll_cafe_allocations.deleteMany({ where: { run_id: runId, employee_id: employeeId } });
      }
      await tx.payroll_monthly_events.create({ data: { run_id: runId, employee_id: employeeId, kind, amount, note: dto.note.trim(), actor_id: user.sub, actor_name: user.name || `مستخدم ${user.sub}`, request_id: dto.requestId } });
      await this.refreshMonthlyEmployee(tx, run, lineId, employeeId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000 });
    return this.monthlyEmployee(runId, lineId, user);
  }

  private async settleMonthlyCafe(tx: Prisma.TransactionClient, runId: number, userId?: number) {
    const allocations = await tx.payroll_cafe_allocations.findMany({ where: { run_id: runId }, orderBy: { sale_id: 'asc' } });
    if (!allocations.length) return;
    const header = await tx.hr_mosayer.findUnique({ where: { id: runId } });
    const lines = await tx.hr_mosayer_details.findMany({ where: { mosayer_rkm_fk: header?.mosayer_rkm ?? -1 } });
    for (const employeeId of new Set(allocations.map(a => a.employee_id))) {
      const amount = payrollMoney(allocations.filter(a => a.employee_id === employeeId).reduce((n, a) => n + Number(a.amount), 0));
      const line = lines.find(l => l.emp_id === employeeId);
      const deduction = Number((line?.calculation_snapshot as any)?.breakdown?.cafeDeduction ?? 0);
      if (deduction !== amount) throw new ConflictException('خصم الكافيه لا يطابق صافي المرتب؛ راجع الحساب قبل الترحيل');
    }
    const ids = allocations.map(a => a.sale_id);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
    for (const a of allocations) {
      const sale = await tx.sales_quick_sales.findUnique({ where: { id: a.sale_id } });
      if (!sale || a.settled_at || sale.status !== 'completed' || !['unbilled', 'in_statement'].includes(sale.billing_status) || payrollMoney(Number(sale.total_amount) - Number(sale.collected_amount)) !== Number(a.amount)) throw new ConflictException('تغيرت مديونية الكافيه المختارة؛ تعذر ترحيل المرتبات');
      await tx.sales_quick_sales.update({ where: { id: sale.id }, data: { billing_status: 'settled' } });
      await tx.fin_revenues.updateMany({ where: { source_module: 'quick_sale', source_ref: sale.sale_number }, data: { payment_status: 'مدفوع' } });
      await tx.sales_invoice_events.create({ data: { quick_sale_id: sale.id, event_type: 'payroll_deduction', notes: `تم خصم ${a.amount} من المرتبات الشهرية رقم ${runId}`, created_by: userId } });
    }
    const items = await tx.sales_billing_statement_items.findMany({ where: { quick_sale_id: { in: ids } } });
    for (const statementId of [...new Set(items.map(i => i.statement_id))]) {
      const all = await tx.sales_billing_statement_items.findMany({ where: { statement_id: statementId }, include: { sale: true } });
      if (all.some(i => i.sale.billing_status !== 'settled')) throw new BadRequestException('اختر كامل مديونية كشف حساب الموظف قبل الترحيل');
      const statement = await tx.sales_billing_statements.findUnique({ where: { id: statementId } });
      if (!statement || statement.status !== 'issued') throw new ConflictException('كشف الكافيه اتسدد بالفعل');
      await tx.sales_billing_statements.update({ where: { id: statementId }, data: { status: 'settled', paid_amount: statement.total_amount, settlement_method: 'payroll_deduction', settled_at: new Date(), settled_by: userId } });
    }
    await tx.payroll_cafe_allocations.updateMany({ where: { run_id: runId }, data: { settled_at: new Date() } });
  }

  // ─── Components (all_defined_setting) ───────────────────────────────────

  async listComponents(q: PaginationDto) {
    const where: Prisma.all_defined_settingWhereInput = {
      defined_type_title: { in: [...COMPONENT_TYPES] },
      ...(q.search?.trim()
        ? { defined_title: { contains: q.search.trim() } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.all_defined_setting.findMany({
        where,
        orderBy: { defined_id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.all_defined_setting.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toComponentRow(r)), total, q.page, q.pageSize);
  }

  async createComponent(dto: CreatePayComponentDto) {
    const typeTitle = dto.category === 'deduction' ? 'deduction' : 'allowances';
    const row = await this.prisma.all_defined_setting.create({
      data: {
        defined_title: dto.title,
        defined_type: dto.type ? parseInt(dto.type, 10) || 0 : 0,
        defined_type_title: typeTitle,
        in_order: String(dto.amount ?? 0),
      },
    });
    return this.toComponentRow(row, dto);
  }

  async updateComponent(id: number, dto: UpdatePayComponentDto) {
    await this.ensureComponent(id);
    const data: Prisma.all_defined_settingUpdateInput = {};
    if (dto.title != null) data.defined_title = dto.title;
    if (dto.type != null) data.defined_type = parseInt(dto.type, 10) || 0;
    if (dto.category != null) {
      data.defined_type_title = dto.category === 'deduction' ? 'deduction' : 'allowances';
    }
    if (dto.amount != null) data.in_order = String(dto.amount);
    const row = await this.prisma.all_defined_setting.update({
      where: { defined_id: id },
      data,
    });
    return this.toComponentRow(row, dto);
  }

  async removeComponent(id: number) {
    await this.ensureComponent(id);
    await this.prisma.all_defined_setting.delete({ where: { defined_id: id } });
    return { ok: true };
  }

  private async ensureComponent(id: number) {
    const row = await this.prisma.all_defined_setting.findFirst({
      where: { defined_id: id, defined_type_title: { in: [...COMPONENT_TYPES] } },
    });
    if (!row) throw new NotFoundException('مكون الراتب غير موجود');
    return row;
  }

  private toComponentRow(
    row: { defined_id: number; defined_title: string; defined_type: number; defined_type_title: string; in_order: string },
    overrides?: Partial<CreatePayComponentDto | UpdatePayComponentDto>,
  ) {
    const parsedAmount = parseFloat(row.in_order);
    return {
      id: row.defined_id,
      title: row.defined_title,
      type: overrides?.type ?? String(row.defined_type),
      category:
        overrides?.category ??
        (row.defined_type_title === 'deduction' ? 'deduction' : 'allowance'),
      amount: overrides?.amount ?? (Number.isNaN(parsedAmount) ? 0 : parsedAmount),
      isActive: overrides?.isActive ?? row.defined_type !== 2,
    };
  }

  // ─── Payroll runs (hr_mosayer) ────────────────────────────────────────────

  async createRun(dto: CreatePayrollRunDto, user?: JwtUser) {
    await this.assertGlobalPayrollScope(user);
    const window = calendarPayrollPeriod(dto.month, dto.year);
    if (dto.payoutDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dto.payoutDate) || dto.payoutDate < window.fromDate)) throw new BadRequestException('حدد تاريخ صرف صالح لا يسبق شهر المرتبات');
    await this.assertAllActiveEmployeesHaveSalary(dto.month, dto.year, window);
    const existing = await this.prisma.hr_mosayer.findFirst({
      where: { mosayer_month: dto.month, mosayer_year: dto.year },
    });
    if (existing) {
      throw new ConflictException('مسيرة هذا الشهر موجودة مسبقًا');
    }

    const computed = await this.engine.computeAll(dto.month, dto.year, window);
    if (!computed.length) throw new BadRequestException('لا توجد بنود قابلة للاحتساب في مسيرة الرواتب');
    const totals = this.aggregateTotals(computed);
    const policy = computed[0];
    try {
      const header = await this.prisma.$transaction(async (tx) => {
        const periodKey = `${dto.year}-${String(dto.month).padStart(2, '0')}`;
        await tx.payroll_period_controls.upsert({ where: { period_key: periodKey }, create: { period_key: periodKey }, update: {} });
        await tx.$queryRaw`SELECT period_key FROM payroll_period_controls WHERE period_key = ${periodKey} FOR UPDATE`;
        const concurrentExisting = await tx.hr_mosayer.findFirst({ where: { mosayer_month: dto.month, mosayer_year: dto.year }, select: { id: true } });
        if (concurrentExisting) throw new ConflictException('مسيرة هذا الشهر موجودة مسبقًا');
        const maxRkm = await tx.hr_mosayer.aggregate({ _max: { mosayer_rkm: true } });
        const mosayerRkm = await allocateDocumentNumber(
          tx,
          'hr.payroll',
          (maxRkm._max.mosayer_rkm ?? 0) + 1,
        );
        const created = await tx.hr_mosayer.create({
          data: {
            period_start: window.fromDate,
            period_end: window.toDate,
            payout_date: dto.payoutDate ?? window.toDate,
            mosayer_rkm: mosayerRkm,
            mosayer_date: todayAr(),
            mosayer_date_ar: todayAr(),
            mosayer_month: dto.month,
            mosayer_year: dto.year,
            total: computed.length,
            taghez: 'yes',
            taghez_date_ar: todayAr(),
            taghez_time: timeAr(),
            approved: 0,
            tax_policy_id: policy.taxPolicyId,
            tax_policy_version: policy.taxPolicyVersion,
            tax_policy_snapshot: policy.taxPolicySnapshot,
            ...totals,
          },
        });
        for (const line of computed) {
          if (line.taxPolicyVersion !== policy.taxPolicyVersion) {
            throw new BadRequestException('لا يمكن إنشاء مسيرة تحتوي أكثر من نسخة سياسة ضريبية');
          }
          await tx.hr_mosayer_details.create({ data: this.toDetailRow(mosayerRkm, line) });
        }
        return created;
      });
      return this.findRun(header.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('مسيرة هذا الشهر موجودة مسبقًا');
      }
      throw error;
    }
  }

  async listRuns(q: PaginationDto & { status?: string }, user?: JwtUser) {
    const payrollNumbers = await this.payrollNumbersForUser(user);
    const and: Prisma.hr_mosayerWhereInput[] = [];
    if (payrollNumbers !== null) and.push({ mosayer_rkm: { in: payrollNumbers } });
    const statusWhere = payrollStatusWhere(q.status);
    if (statusWhere) and.push(statusWhere);
    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      const numeric = Number.parseInt(s.replace(/[^0-9]/g, ''), 10);
      const months = Array.from({ length: 12 }, (_, index) => index + 1)
        .filter((month) => monthLabel(month).toLowerCase().includes(s));
      const or: Prisma.hr_mosayerWhereInput[] = [
        ...(Number.isSafeInteger(numeric) ? [
          { id: numeric }, { mosayer_rkm: numeric }, { mosayer_year: numeric },
          ...(numeric >= 1 && numeric <= 12 ? [{ mosayer_month: numeric }] : []),
        ] : []),
        ...(months.length ? [{ mosayer_month: { in: months } }] : []),
      ];
      and.push(or.length ? { OR: or } : { id: -1 });
    }
    const where: Prisma.hr_mosayerWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hr_mosayer.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_mosayer.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toRunRow(r)), total, q.page, q.pageSize);
  }

  async findRun(id: number, user?: JwtUser) {
    const row = await this.getRunOrThrow(id, user);
    const employeeCount = await this.prisma.hr_mosayer_details.count({
      where: { mosayer_rkm_fk: row.mosayer_rkm ?? undefined },
    });
    return {
      ...this.toRunRow(row),
      employeeCount,
      totalAmount: decimal(row.egmali_safi),
    };
  }

  async listRunLines(id: number, q: PaginationDto, user?: JwtUser) {
    const row = await this.getRunOrThrow(id, user);
    const identities = await this.payrollIdentities(user);
    const where: Prisma.hr_mosayer_detailsWhereInput = {
      mosayer_rkm_fk: row.mosayer_rkm ?? undefined,
      ...(identities === null ? {} : { emp_id: { in: identities.ids } }),
    };
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { emp_name: { contains: s } },
        ...(Number.isNaN(parseInt(s, 10)) ? [] : [{ emp_code: parseInt(s, 10) }]),
      ];
    }

    const [lines, total] = await Promise.all([
      this.prisma.hr_mosayer_details.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mosayer_details.count({ where }),
    ]);

    return paginated(lines.map((l) => this.toLineRow(l)), total, q.page, q.pageSize);
  }

  async getSlip(runId: number, empLineId: number, user?: JwtUser) {
    const run = await this.getRunOrThrow(runId, user);
    const identities = await this.payrollIdentities(user);
    const line = await this.prisma.hr_mosayer_details.findFirst({
      where: {
        id: empLineId,
        mosayer_rkm_fk: run.mosayer_rkm ?? undefined,
        ...(identities === null ? {} : { emp_id: { in: identities.ids } }),
      },
    });
    if (!line) throw new NotFoundException('بند الموظف غير موجود');

    // Historical slips must never re-run against mutable attendance/policy data.
    const snapshot = line.calculation_snapshot as {
      breakdown?: { khasmTakherAmount?: number; khasmEznAmount?: number };
    } | null;
    const lateNoPermit = snapshot?.breakdown?.khasmTakherAmount ?? decimal(line.khasm_takher);
    const latePermit = snapshot?.breakdown?.khasmEznAmount ?? 0;

    return {
      run: this.toRunRow(run),
      employee: {
        id: line.emp_id,
        empCode: line.emp_code,
        name: line.emp_name,
        jobTitle: line.mosma_wazefy_n,
      },
      earnings: {
        basicSalary: decimal(line.rateb_asasy),
        housing: decimal(line.badal_sakn),
        transport: decimal(line.badal_mowaslat),
        communication: decimal(line.badal_etsal),
        meal: decimal(line.badal_e3asha),
        nature: decimal(line.badal_tabe3a_amal),
        assignment: decimal(line.badal_taklef),
        overtime: decimal(line.tot_edafi),
        bonus: decimal(line.tot_mokafaa),
        incentives: decimal(line.tot_entdab),
        other: decimal(line.tot_okraa_esthkaq),
        total: decimal(line.total_esthkak),
      },
      adjustments: (line.calculation_snapshot as any)?.breakdown ?? {},
      deductions: {
        absence: decimal(line.khasm_keyab),
        unpaidLeave: decimal(line.agaza_bdon_rateb),
        lateness: lateNoPermit,
        permitLateness: latePermit,
        penalty: decimal(line.khasm_gezaa),
        insurance: decimal(line.khasm_tamen),
        incomeTax: decimal(line.income_tax),
        loan: decimal(line.khasm_solaf),
        other: decimal(line.tot_okraa_khasm),
        total: decimal(line.total_khsomat),
      },
      netSalary: decimal(line.safi),
      bank: {
        bankId: line.emp_bank_id_fk,
        account: line.emp_bank_account_num,
        code: line.bank_code,
        nameInBank: line.emp_name_in_bank,
      },
    };
  }

  /**
   * Apply manual slip overrides (مكافأة خاصة / تقييم / تارجت) to a persisted line,
   * recomputing the line via the engine with the overrides folded into earnings.
   * NOTE: hr_mosayer_details has no private_bonus / taqeem_value columns, so the override
   * amounts are merged into tot_okraa_esthkaq (free-form earnings) to keep totals correct.
   */
  async applySlipOverrides(
    runId: number,
    empLineId: number,
    overrides: { privateBonus?: number; taqeemValue?: number; targetValue?: number },
  ) {
    const run = await this.getRunOrThrow(runId);
    // Block edits once the run has left the editable phase — overrides must not alter an
    // approved / posted / banked payroll run.
    const status = mapRunStatus(run);
    if (['approved', 'posted', 'bank_prepared', 'banked', 'completed'].includes(status)) {
      throw new BadRequestException('لا يمكن تعديل مسيّرة معتمدة أو مرحّلة أو مصروفة');
    }
    const line = await this.prisma.hr_mosayer_details.findFirst({
      where: { id: empLineId, mosayer_rkm_fk: run.mosayer_rkm ?? undefined },
    });
    if (!line) throw new NotFoundException('بند الموظف غير موجود');
    if (line.emp_id == null || run.mosayer_month == null || run.mosayer_year == null) {
      throw new BadRequestException('بيانات المسيرة غير مكتملة');
    }

    const recomputed = await this.engine.computeOneById(
      line.emp_id,
      run.mosayer_month,
      run.mosayer_year,
      overrides,
      this.runWindow(run),
    );
    if (!recomputed) throw new NotFoundException('تعذر إعادة احتساب الموظف');

    const manual =
      (overrides.privateBonus ?? 0) +
      (overrides.taqeemValue ?? 0) +
      (overrides.targetValue ?? 0);

    // Update the line AND recompute the hr_mosayer header totals (egmali_* / egmali_safi)
    // from the detail rows in the same transaction, so the header never drifts from its lines.
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mosayer_details.update({
        where: { id: empLineId },
        data: {
          tot_okraa_esthkaq: recomputed.otherAllowances ?? 0,
          tot_okraa_khasm: recomputed.otherDeductions,
          taxable_earnings: recomputed.taxableEarnings,
          income_tax: recomputed.incomeTax,
          tax_policy_id: recomputed.taxPolicyId,
          tax_policy_version: recomputed.taxPolicyVersion,
          tax_breakdown: recomputed.taxBreakdown,
          calculation_snapshot: this.calculationSnapshot(recomputed, overrides),
          total_esthkak: recomputed.totalEsthkak,
          total_khsomat: recomputed.totalKhsomat,
          safi: recomputed.safi,
        },
      });
      await this.recomputeHeaderTotals(tx, run.mosayer_rkm, run.id);
    });
    return this.getSlip(runId, empLineId);
  }

  async runAction(id: number, action: string, userId?: number, user?: JwtUser) {
    await this.assertGlobalPayrollScope(user);
    const run = await this.getRunOrThrow(id);
    const status = mapRunStatus(run);
    let bankFile: { filename: string; content: string } | undefined;

    switch (action) {
      case 'compute':
        if (['approved', 'posted', 'bank_prepared', 'banked', 'completed'].includes(status)) {
          throw new BadRequestException('لا يمكن إعادة احتساب مسيّرة معتمدة أو مصروفة');
        }
        if (!run.mosayer_rkm || run.mosayer_month == null || run.mosayer_year == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        await this.assertAllActiveEmployeesHaveSalary(run.mosayer_month, run.mosayer_year, this.runWindow(run));
        await this.persistComputedSalaries(
          run.id,
          run.mosayer_rkm,
          run.mosayer_month,
          run.mosayer_year,
        );
        break;

      case 'review':
      case 'approve':
        if (action === 'review') {
          if (!run.mosayer_rkm || !run.mosayer_month || !run.mosayer_year) throw new BadRequestException('بيانات المرتبات غير مكتملة');
          await this.persistComputedSalaries(run.id, run.mosayer_rkm, run.mosayer_month, run.mosayer_year);
        }
        await this.prisma.$transaction(async tx => {
          const latest = await this.lockEditableRun(tx, id);
          const current = mapRunStatus(latest);
          if (action === 'review' && current !== 'computed') throw new BadRequestException('احسب المرتبات قبل إرسالها للمراجعة');
          if (action === 'approve' && current !== 'reviewing') throw new BadRequestException('راجع آخر تعديلات المرتبات قبل الاعتماد');
          const details = await tx.hr_mosayer_details.findMany({ where: { mosayer_rkm_fk: latest.mosayer_rkm! } });
          if (details.some(l => Number(l.total_khsomat) > Number(l.total_esthkak))) throw new BadRequestException('يوجد موظف خصوماته أكبر من مستحقاته');
          await tx.hr_mosayer.update({ where: { id }, data: action === 'review' ? { suspend_mohasb: 'yes', suspend_direct_manager: 'yes' } : { approved: 1, suspend_moder_3am: 'yes', suspend_moder_mali: 'yes' } });
        });
        break;

      case 'post': {
        // Precondition: the run must be approved (and not already posted/banked). Atomic
        // conditional claim so a second concurrent post can't re-run the loan settlement.
        if (status !== 'approved') {
          throw new BadRequestException('يجب اعتماد المسيّرة قبل الترحيل');
        }
        if (run.mosayer_rkm == null || run.mosayer_month == null || run.mosayer_year == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        await this.moduleLedger.ensureReady();
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hr_mosayer.updateMany({
            where: {
              id,
              approved: 1,
              // still approved-only: not yet posted, not yet banked
              halet_sarf: { not: 'yes' },
              tanfez_ezn_sarf: { not: 'yes' },
              file_downloded: null,
            },
            data: { halet_sarf: 'yes', taghez: 'yes' },
          });
          if (claimed.count === 0) {
            throw new BadRequestException('المسيّرة مرحّلة بالفعل أو غير معتمدة');
          }
          await this.settleMonthlyCafe(tx, id, userId);
          const branchTotals = await this.getPayrollBranchTotals(run.mosayer_rkm!, tx);
          const accrualDate = this.runWindow(run).toDate;
          for (const totals of branchTotals) {
            this.assertPayrollTotalsBalanced(totals, run.mosayer_rkm!);
            await this.moduleLedger.postPayrollAccrual(
              {
                payrollNumber: run.mosayer_rkm!,
                branchId: totals.branchId ?? undefined,
                date: accrualDate,
                grossEarnings: totals.grossEarnings,
                netPay: totals.netPay,
                employeeInsurance: totals.employeeInsurance,
                employerInsurance: totals.employerInsurance,
                loanDeductions: totals.loanDeductions,
                incomeTax: totals.incomeTax,
                cafeDeductions: totals.cafeDeductions,
                nonLiabilityDeductions: totals.nonLiabilityDeductions,
                createdBy: userId,
              },
              tx,
            );
            const payrollExpense = payrollMoney(
              totals.grossEarnings + totals.employerInsurance - totals.nonLiabilityDeductions,
            );
            await this.moduleLedger.recordPayrollExpense({
              invoiceNumber: `PAYROLL-${run.mosayer_rkm!}-BR-${totals.branchId ?? 'GLOBAL'}`,
              date: accrualDate,
              category: 'رواتب',
              subCategory: 'مسيّرة رواتب',
              amount: payrollExpense,
              description: `مسيّرة رواتب ${run.mosayer_rkm!}`,
              branchId: totals.branchId ?? undefined,
              createdBy: userId,
              paymentMethod: 'تحويل بنكي',
            }, tx);
          }
          // Mark the exact loan installments that were deducted (khasm_solaf) as paid, so a
          // collected loan can't be collected again in a later run. Uses the same window/filters
          // as the engine (findUnpaidLoanQuests) to guarantee agreement on WHICH quests.
          await this.settleDeductedLoanQuests(
            tx,
            run.mosayer_rkm!,
            run.mosayer_month!,
            run.mosayer_year!,
          );
          // Same idea for penalties (hr_gezaat) and salary-borne bonuses (hr_mokafat_details):
          // stamp the exact rows the engine collected with this run number so a recompute or an
          // overlapping-period run can't collect them twice. Same window/filters as the engine
          // (getGezaaByDate / getMokafaaByDate).
          const { fromDate, toDate } = this.runWindow(run);
          await this.engine.stampConsumedPenalties(run.mosayer_rkm!, fromDate, toDate, tx);
          await this.engine.stampConsumedBonuses(run.mosayer_rkm!, fromDate, toDate, tx);
        });
        break;
      }

      case 'bank': {
        // This action only prepares the import file. A CSV is not evidence that
        // money moved; settlement comes exclusively from BANK_PAYMENT_ADAPTER.
        if (status !== 'posted') {
          throw new BadRequestException('يجب ترحيل المسيّرة قبل إصدار ملف البنك');
        }
        if (run.mosayer_rkm == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        bankFile = await this.buildBankCsv(run);
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hr_mosayer.updateMany({
            where: {
              id,
              halet_sarf: 'yes',
              file_downloded: null,
            },
            data: {
              file_downloded: bankFile!.filename,
            },
          });
          if (claimed.count === 0) {
            throw new BadRequestException('تم إصدار ملف البنك مسبقاً');
          }
        });
        break;
      }

      case 'bank-sync': {
        if (status !== 'bank_prepared') {
          throw new BadRequestException('يجب تجهيز ملف البنك قبل طلب تأكيد التسوية');
        }
        if (run.mosayer_rkm == null) throw new BadRequestException('بيانات المسيرة غير مكتملة');
        const branchTotals = await this.getPayrollBranchTotals(run.mosayer_rkm);
        const expectedAmount = payrollMoney(branchTotals.reduce((sum, row) => sum + row.netPay, 0));
        const settlement = await this.bankPayment.getPayrollSettlement({
          payrollNumber: run.mosayer_rkm,
          expectedAmount,
        });
        if (settlement.status !== 'settled' || Math.abs(settlement.settledAmount - expectedAmount) > 0.01) {
          throw new BadRequestException('البنك لم يؤكد تسوية كامل صافي المسيرة بعد');
        }
        await this.moduleLedger.ensureReady();
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hr_mosayer.updateMany({
            where: { id, halet_sarf: 'yes', file_downloded: { not: null }, tanfez_ezn_sarf: { not: 'yes' } },
            data: { tanfez_ezn_sarf: 'yes', finish_sarf_date: todayAr() },
          });
          if (claimed.count === 0) throw new BadRequestException('تم تأكيد تسوية المسيرة مسبقًا');
          for (const totals of branchTotals) {
            await this.moduleLedger.postPayrollPayment({
              payrollNumber: run.mosayer_rkm!,
              branchId: totals.branchId ?? undefined,
              date: todayAr(),
              netPay: totals.netPay,
              createdBy: userId,
            }, tx);
          }
        });
        break;
      }

      case 'unpost': {
        // A settled/banked run represents real money movement. Until a target
        // BankPaymentAdapter provides an explicit, confirmed reversal contract,
        // reversing only the GL would falsify reconciliation. Fail closed.
        if (status !== 'posted') {
          throw new BadRequestException('لا يمكن عكس مسيّرة تمت تسويتها بنكيًا دون عكس بنكي مؤكد');
        }
        if (run.mosayer_rkm == null || run.mosayer_month == null || run.mosayer_year == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        if (await this.prisma.payroll_cafe_allocations.count({ where: { run_id: id, settled_at: { not: null } } })) throw new BadRequestException('المرتبات سددت حساب كافيه؛ يلزم إجراء تسوية محاسبية بدل إلغاء الترحيل');
        await this.prisma.$transaction(async (tx) => {
          await this.moduleLedger.reversePayrollRun(
            {
              payrollNumber: run.mosayer_rkm!,
              reason: `عكس مسيّرة رواتب ${run.mosayer_rkm}`,
              userId,
            },
            tx,
          );
          const branchTotals = await this.getPayrollBranchTotals(run.mosayer_rkm!, tx);
          for (const totals of branchTotals) {
            await this.moduleLedger.reversePayrollExpense(
              `PAYROLL-${run.mosayer_rkm!}-BR-${totals.branchId ?? 'GLOBAL'}`,
              `عكس مسيّرة رواتب ${run.mosayer_rkm}`,
              tx,
            );
          }
          await this.engine.releaseConsumedByRun(run.mosayer_rkm!, tx);
          await this.unsettleDeductedLoanQuests(
            tx,
            run.mosayer_rkm!,
            run.mosayer_month!,
            run.mosayer_year!,
          );
          await tx.hr_mosayer.update({
            where: { id },
            data: {
              approved: 0,
              suspend_mohasb: null,
              suspend_direct_manager: null,
              suspend_moder_mali: null,
              suspend_moder_3am: null,
              halet_sarf: 'no',
              tanfez_ezn_sarf: 'no',
              file_downloded: null,
              finish_sarf_date: null,
              taghez: 'yes',
            },
          });
        });
        break;
      }

      default:
        throw new BadRequestException(`إجراء غير معروف: ${action}`);
    }

    const result = await this.findRun(id);
    return bankFile ? { ...result, bankFile } : result;
  }

  /**
   * Download the bank CSV. File preparation never marks a run paid and never
   * posts a payment journal.
   */
  async generateBankFile(id: number, user?: JwtUser): Promise<{ filename: string; content: string }> {
    await this.assertGlobalPayrollScope(user);
    const run = await this.getRunOrThrow(id);
    const status = mapRunStatus(run);
    if (!['posted', 'bank_prepared', 'banked', 'completed'].includes(status)) {
      throw new BadRequestException('يجب ترحيل المسيّرة قبل تنزيل ملف البنك');
    }
    return this.buildBankCsv(run);
  }

  async reconciliation(id: number, user?: JwtUser) {
    const run = await this.getRunOrThrow(id, user);
    if (run.mosayer_rkm == null) throw new BadRequestException('بيانات المسيرة غير مكتملة');
    const totals = await this.getPayrollBranchTotals(run.mosayer_rkm);
    const netPay = payrollMoney(totals.reduce((s, t) => s + t.netPay, 0));
    const projection = await this.moduleLedger.getPayrollReconciliation({
      payrollNumber: run.mosayer_rkm,
    });
    const settlement = await this.bankPayment.getPayrollSettlement({
      payrollNumber: run.mosayer_rkm,
      expectedAmount: netPay,
    });
    const accrualPayable = payrollMoney(projection.payrollGlPayable);
    const bankPayment = payrollMoney(settlement.settledAmount);
    const salaryExpense = payrollMoney(projection.salaryExpense);
    const status = mapRunStatus(run);
    return {
      runId: run.id,
      payrollNumber: run.mosayer_rkm,
      status,
      netPay,
      payrollGlPayable: accrualPayable,
      bankPayment,
      bankSettlement: settlement,
      salaryExpense,
      differences: {
        netVsPayable: payrollMoney(netPay - accrualPayable),
        netVsBank: payrollMoney(netPay - bankPayment),
      },
      balanced:
        Math.abs(netPay - accrualPayable) <= 0.01 &&
        Math.abs(netPay - bankPayment) <= 0.01,
    };
  }

  private async buildBankCsv(run: { id: number; mosayer_rkm: number | null }) {
    const lines = await this.prisma.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: run.mosayer_rkm ?? undefined },
      orderBy: { id: 'asc' },
    });
    const header = ['emp_code', 'emp_name', 'bank', 'account', 'net'];
    const rows = lines.map((l) => [
      l.emp_code != null ? String(l.emp_code) : '',
      l.emp_name_in_bank || l.emp_name || '',
      l.bank_code || (l.emp_bank_id_fk != null ? String(l.emp_bank_id_fk) : ''),
      l.emp_bank_account_num || '',
      decimal(l.safi).toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((value) => csvCell(csvFormulaSafe(value))).join(','))
      .join('\r\n');
    return {
      filename: `bank_${run.mosayer_rkm ?? run.id}_${todayAr()}.csv`,
      content: '\uFEFF' + csv + '\r\n',
    };
  }

  async removeRun(id: number, user?: JwtUser) {
    await this.assertGlobalPayrollScope(user);
    const run = await this.getRunOrThrow(id);
    if (await this.prisma.payroll_monthly_events.count({ where: { run_id: id } })) throw new BadRequestException('المرتبات لها سجل حركات؛ استخدم إلغاء الحركة بدل حذف الشهر');
    // Block deletion once the run is approved / posted / banked / completed — deleting a
    // posted run would leave settled loan quests / GL without their source document.
    const status = mapRunStatus(run);
    if (['approved', 'posted', 'bank_prepared', 'banked', 'completed'].includes(status)) {
      throw new BadRequestException('لا يمكن حذف مسيّرة معتمدة أو مرحّلة أو مصروفة');
    }
    await this.prisma.$transaction(async (tx) => {
      if (run.mosayer_rkm != null) {
        // Release any penalties / bonuses stamped with this run so a corrected run can
        // collect them again (H1 consumption marker). Kept for symmetry with post: a
        // draft/computed run has none stamped yet, but an unpost path would.
        await this.engine.releaseConsumedByRun(run.mosayer_rkm, tx);
        await tx.hr_mosayer_details.deleteMany({
          where: { mosayer_rkm_fk: run.mosayer_rkm },
        });
      }
      await tx.hr_mosayer.delete({ where: { id } });
    });
    return { ok: true };
  }

  /**
   * On payroll post: mark the exact loan installments (hr_solaf_quest) that were summed into
   * khasm_solaf as paid, then close any loan whose installments are now all settled. This is
   * the CRITICAL fix for double-collection — the deduction sits in the slip but nothing was
   * marking the quests paid, so the same installment could be deducted again next run.
   *
   * WHICH quests: exactly the ones the engine deducted, via engine.findUnpaidLoanQuests (same
   * window/filters: paid='no', approved loan, due-date in the payroll window). Replicates the
   * minimal quest-update + settle logic from LoansService (autoDeduct / settleLoanIfFullyPaid)
   * because LoansService is not injectable into PayrollModule.
   */
  private async settleDeductedLoanQuests(
    tx: Prisma.TransactionClient,
    mosayerRkm: number,
    month: number,
    year: number,
  ) {
    const header = await tx.hr_mosayer.findFirst({ where: { mosayer_rkm: mosayerRkm } });
    const { fromDate, toDate } = header ? this.runWindow(header) : payrollPeriod(month, year);

    // Emp codes that are actually in this run (the ones whose salary — and loan deduction —
    // was computed and persisted).
    const details = await tx.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: { emp_code: true },
    });
    const empCodes = Array.from(
      new Set(details.map((d) => d.emp_code).filter((c): c is number => c != null)),
    );

    const affectedLoans = new Set<number>();
    const nowDate = todayAr();
    const nowTime = new Date().toTimeString().slice(0, 8);

    for (const empCode of empCodes) {
      const quests = await this.engine.findUnpaidLoanQuests(empCode, fromDate, toDate, tx);
      if (!quests.length) continue;
      await tx.hr_solaf_quest.updateMany({
        where: { id: { in: quests.map((q) => q.id) } },
        data: {
          paid: 'yes',
          date_paid: nowDate,
          time_paid: nowTime,
          paid_sarf_person: payrollQuestPayer(mosayerRkm),
        },
      });
      for (const q of quests) {
        if (q.t_rkm_fk != null) affectedLoans.add(q.t_rkm_fk);
      }
    }

    // Close (ended='yes') any loan whose installments are now all paid — mirrors
    // LoansService.settleLoanIfFullyPaid.
    for (const tRkm of affectedLoans) {
      const outstanding = await tx.hr_solaf_quest.count({
        where: { t_rkm_fk: tRkm, paid: { not: 'yes' } },
      });
      if (outstanding === 0) {
        await tx.hr_solaf.updateMany({ where: { t_rkm: tRkm }, data: { ended: 'yes' } });
      }
    }
  }

  /** Unpost counterpart: reopen the exact period quests this run settled. */
  private async unsettleDeductedLoanQuests(
    tx: Prisma.TransactionClient,
    mosayerRkm: number,
    month: number,
    year: number,
  ) {
    const header = await tx.hr_mosayer.findFirst({ where: { mosayer_rkm: mosayerRkm } });
    const { fromDate, toDate } = header ? this.runWindow(header) : payrollPeriod(month, year);
    const details = await tx.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: { emp_code: true },
    });
    const empCodes = Array.from(
      new Set(details.map((d) => d.emp_code).filter((c): c is number => c != null)),
    );
    if (!empCodes.length) return;
    const payer = payrollQuestPayer(mosayerRkm);
    const quests = await tx.$queryRaw<{ id: number; t_rkm_fk: number | null }[]>`
      SELECT q.id, q.t_rkm_fk
      FROM hr_solaf_quest q
      LEFT JOIN hr_solaf s ON s.t_rkm = q.t_rkm_fk
      WHERE q.emp_code_fk IN (${Prisma.join(empCodes)})
        AND q.paid = 'yes'
        AND q.paid_sarf_person = ${payer}
        AND STR_TO_DATE(CONCAT(q.year, '-', LPAD(q.month, 2, '0'), '-01'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    if (!quests.length) return;
    await tx.hr_solaf_quest.updateMany({
      where: { id: { in: quests.map((q) => q.id) } },
      data: { paid: 'no', date_paid: null, time_paid: null, paid_sarf_person: null },
    });
    const loanRkms = [...new Set(quests.map((q) => q.t_rkm_fk).filter((n): n is number => n != null))];
    if (loanRkms.length) {
      await tx.hr_solaf.updateMany({ where: { t_rkm: { in: loanRkms } }, data: { ended: 'no' } });
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────

  private async assertAllActiveEmployeesHaveSalary(month?: number, year?: number, window?: PayrollWindow) {
    const period = window ?? (month != null && year != null ? payrollPeriod(month, year) : undefined);
    const employees = await this.prisma.employees.findMany({
      where: buildPayrollEmployeeWhere(period),
      select: { id: true, emp_code: true, employee: true, basic_salary: true },
      orderBy: { id: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException('لا يوجد موظفون نشطون لإنشاء مسيّرة رواتب');
    }
    const missing = employees.filter((employee) => decimal(employee.basic_salary) <= 0);
    if (missing.length > 0) {
      const names = missing
        .slice(0, 5)
        .map((employee) => `${employee.employee ?? 'موظف'} (${employee.emp_code ?? employee.id})`)
        .join('، ');
      const suffix = missing.length > 5 ? ` و${missing.length - 5} آخرين` : '';
      throw new BadRequestException(`يجب إدخال الراتب الأساسي للموظفين: ${names}${suffix}`);
    }
  }

  private async getPayrollBranchTotals(
    mosayerRkm: number,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<PayrollBranchTotals[]> {
    const details = await client.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: {
        emp_id: true,
        calculation_snapshot: true,
        total_esthkak: true,
        total_khsomat: true,
        safi: true,
        khasm_tamen: true,
        tamin_hesa_oner: true,
        khasm_solaf: true,
        income_tax: true,
      },
    });
    if (details.length === 0) {
      throw new BadRequestException('لا توجد بنود موظفين في مسيّرة الرواتب');
    }
    const employeeIds = Array.from(
      new Set(details.map((detail) => detail.emp_id).filter((id): id is number => id != null)),
    );
    const employees = employeeIds.length
      ? await client.employees.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, branch_id_fk: true },
        })
      : [];
    const employeeBranches = new Map(employees.map((employee) => [employee.id, employee.branch_id_fk]));
    const grouped = new Map<string, PayrollBranchTotals>();
    for (const detail of details) {
      const branchId = detail.emp_id == null ? null : (employeeBranches.get(detail.emp_id) ?? null);
      const key = branchId == null ? 'global' : String(branchId);
      const totals = grouped.get(key) ?? {
        branchId,
        grossEarnings: 0,
        totalDeductions: 0,
        netPay: 0,
        employeeInsurance: 0,
        employerInsurance: 0,
        loanDeductions: 0,
        incomeTax: 0,
        cafeDeductions: 0,
        nonLiabilityDeductions: 0,
      };
      const totalDeductions = decimal(detail.total_khsomat);
      const employeeInsurance = decimal(detail.khasm_tamen);
      const loanDeductions = decimal(detail.khasm_solaf);
      const incomeTax = decimal(detail.income_tax);
      const cafeDeduction = Number((detail.calculation_snapshot as any)?.breakdown?.cafeDeduction ?? 0);
      totals.grossEarnings += decimal(detail.total_esthkak);
      totals.totalDeductions += totalDeductions;
      totals.netPay += decimal(detail.safi);
      totals.employeeInsurance += employeeInsurance;
      totals.employerInsurance += decimal(detail.tamin_hesa_oner);
      totals.loanDeductions += loanDeductions;
      totals.incomeTax += incomeTax;
      totals.cafeDeductions += cafeDeduction;
      totals.nonLiabilityDeductions += totalDeductions - employeeInsurance - loanDeductions - incomeTax - cafeDeduction;
      grouped.set(key, totals);
    }
    return Array.from(grouped.values()).map((totals) => ({
      ...totals,
      grossEarnings: payrollMoney(totals.grossEarnings),
      totalDeductions: payrollMoney(totals.totalDeductions),
      netPay: payrollMoney(totals.netPay),
      employeeInsurance: payrollMoney(totals.employeeInsurance),
      employerInsurance: payrollMoney(totals.employerInsurance),
      loanDeductions: payrollMoney(totals.loanDeductions),
      incomeTax: payrollMoney(totals.incomeTax),
      cafeDeductions: payrollMoney(totals.cafeDeductions),
      nonLiabilityDeductions: payrollMoney(totals.nonLiabilityDeductions),
    }));
  }

  private assertPayrollTotalsBalanced(totals: PayrollBranchTotals, mosayerRkm: number) {
    const creditAllocation = payrollMoney(
      totals.netPay +
        totals.employeeInsurance +
        totals.loanDeductions +
        totals.incomeTax +
        totals.cafeDeductions +
        totals.nonLiabilityDeductions,
    );
    if (
      totals.nonLiabilityDeductions < 0 ||
      totals.totalDeductions > totals.grossEarnings ||
      Math.abs(totals.grossEarnings - creditAllocation) > 0.01
    ) {
      throw new BadRequestException(
        `لا يمكن ترحيل مسيّرة ${mosayerRkm}: الخصومات تتجاوز المستحقات أو الصافي غير مطابق`,
      );
    }
  }

  private async persistComputedSalaries(
    headerId: number,
    mosayerRkm: number,
    month: number,
    year: number,
  ) {
    await this.prisma.$transaction(async tx => {
      const run = await this.lockEditableRun(tx, headerId);
      const old = await tx.hr_mosayer_details.findMany({ where: { mosayer_rkm_fk: mosayerRkm } });
      const overrides = new Map();
      for (const line of old) if (line.emp_id) {
        await this.importLegacyOverrides(tx, headerId, line.emp_id, line.id);
        overrides.set(line.emp_id, await this.monthlyOverrides(tx, headerId, line.emp_id));
      }
      const computed = await this.engine.computeAll(month, year, this.runWindow(run), overrides);
      if (!computed.length) throw new BadRequestException('لا توجد بنود قابلة للاحتساب');
      // Keep history and IDs: do not silently drop a previously included employee.
      if (old.some(l => !computed.some(c => c.empId === l.emp_id))) throw new BadRequestException('تغيرت قائمة الموظفين؛ راجع حالة الموظفين قبل إعادة الاحتساب');
      for (const c of computed) {
        const line = old.find(l => l.emp_id === c.empId);
        if (line) await tx.hr_mosayer_details.update({ where: { id: line.id }, data: this.toDetailRow(mosayerRkm, c) });
        else await tx.hr_mosayer_details.create({ data: this.toDetailRow(mosayerRkm, c) });
      }
      const policy = computed[0];
      await tx.hr_mosayer.update({ where: { id: headerId }, data: { ...this.aggregateTotals(computed), tax_policy_id: policy.taxPolicyId, tax_policy_version: policy.taxPolicyVersion, tax_policy_snapshot: policy.taxPolicySnapshot, total: computed.length, taghez: 'yes', suspend_mohasb: null, suspend_direct_manager: null, suspend_moder_mali: null, taghez_date_ar: todayAr(), taghez_time: timeAr() } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 120000 });
  }

  private toDetailRow(mosayerRkm: number, c: ComputedEmployeeSalary): Prisma.hr_mosayer_detailsCreateInput {
    return {
      mosayer_rkm_fk: mosayerRkm,
      emp_id: c.empId,
      emp_code: c.empCode,
      emp_name: c.empName,
      mosma_wazefy_n: c.mosmaWazefyN,
      emp_bank_id_fk: c.bankId ?? undefined,
      emp_bank_account_num: c.bankAccount ?? undefined,
      bank_code: c.bankCode ?? undefined,
      emp_name_in_bank: c.nameInBank ?? undefined,
      rateb_asasy: c.ratebAsasy,
      badal_sakn: c.badalSakn,
      badal_mowaslat: c.badalMowaslat,
      badal_etsal: c.badalEtsal,
      badal_e3asha: c.badalE3asha,
      badal_tabe3a_amal: c.badalTabe3aAmal,
      badal_taklef: c.badalTaklef,
      tot_edafi: c.totEdafi,
      tot_mokafaa: c.totMokafaa,
      tot_entdab: c.totEntdab,
      tot_okraa_esthkaq: c.otherAllowances,
      tot_okraa_khasm: c.otherDeductions,
      total_esthkak: c.totalEsthkak,
      khasm_keyab: c.khasmKeyab,
      agaza_bdon_rateb: c.agazaBdonRateb,
      khasm_takher: c.khasmTakher,
      khasm_gezaa: c.khasmGezaa,
      khasm_tamen: c.khasmTamen,
      tamin_hesa_oner: c.taminHesaOner,
      khasm_solaf: c.khasmSolaf,
      taxable_earnings: c.taxableEarnings,
      income_tax: c.incomeTax,
      tax_policy_id: c.taxPolicyId,
      tax_policy_version: c.taxPolicyVersion,
      tax_breakdown: c.taxBreakdown,
      calculation_snapshot: this.calculationSnapshot(c),
      total_khsomat: c.totalKhsomat,
      safi: c.safi,
      agr_sa3a: c.agrSa3a,
      ayam_amal: c.breakdown?.workDays != null ? Number(c.breakdown.workDays) : 30,
      sa3at_amal: c.breakdown?.workHours != null ? Number(c.breakdown.workHours) : 8,
      taghez: 'no',
    };
  }

  private calculationSnapshot(
    c: ComputedEmployeeSalary,
    overrides?: { privateBonus?: number; taqeemValue?: number; targetValue?: number },
  ): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify({
      schemaVersion: 1,
      employeeId: c.empId,
      employeeCode: c.empCode,
      taxPolicy: c.taxPolicySnapshot,
      breakdown: c.breakdown,
      overrides: overrides ?? null,
      result: {
        grossEarnings: c.totalEsthkak,
        totalDeductions: c.totalKhsomat,
        netSalary: c.safi,
        taxableEarnings: c.taxableEarnings,
        incomeTax: c.incomeTax,
      },
    })) as Prisma.InputJsonObject;
  }

  /**
   * Recompute the hr_mosayer header totals (egmali_* / egmali_safi) by summing the persisted
   * detail rows. Used after a slip override so the header stays in sync with its lines.
   */
  private async recomputeHeaderTotals(
    tx: Prisma.TransactionClient,
    mosayerRkm: number | null,
    headerId: number,
  ) {
    if (mosayerRkm == null) return;
    const agg = await tx.hr_mosayer_details.aggregate({
      where: { mosayer_rkm_fk: mosayerRkm },
      _sum: {
        rateb_asasy: true,
        badal_sakn: true,
        badal_mowaslat: true,
        badal_etsal: true,
        badal_e3asha: true,
        badal_tabe3a_amal: true,
        badal_taklef: true,
        tot_edafi: true,
        tot_mokafaa: true,
        tot_entdab: true,
        tot_okraa_esthkaq: true,
        tot_okraa_khasm: true,
        total_esthkak: true,
        khasm_keyab: true,
        agaza_bdon_rateb: true,
        khasm_takher: true,
        khasm_gezaa: true,
        khasm_tamen: true,
        tamin_hesa_oner: true,
        khasm_solaf: true,
        income_tax: true,
        total_khsomat: true,
        safi: true,
      },
    });
    const s = agg._sum;
    const n = (v: Prisma.Decimal | null) => decimal(v);
    await tx.hr_mosayer.update({
      where: { id: headerId },
      data: {
        egmali_rateb_asasy: n(s.rateb_asasy),
        egmali_badal_sakn: n(s.badal_sakn),
        egmali_badal_mowaslat: n(s.badal_mowaslat),
        egmali_badal_etsal: n(s.badal_etsal),
        egmali_badal_e3asha: n(s.badal_e3asha),
        egmali_badal_tabe3a_amal: n(s.badal_tabe3a_amal),
        egmali_badal_taklef: n(s.badal_taklef),
        egmali_tot_edafi: n(s.tot_edafi),
        egmali_tot_mokafaa: n(s.tot_mokafaa),
        egmali_tot_entdab: n(s.tot_entdab),
        egmali_tot_okraa_esthkaq: n(s.tot_okraa_esthkaq),
        egmali_tot_okraa_khasm: n(s.tot_okraa_khasm),
        egmali_total_esthkak: n(s.total_esthkak),
        egmali_khasm_keyab: n(s.khasm_keyab),
        egmali_agaza_bdon_rateb: n(s.agaza_bdon_rateb),
        egmali_khasm_takher: n(s.khasm_takher),
        egmali_khasm_gezaa: n(s.khasm_gezaa),
        egmali_khasm_tamen: n(s.khasm_tamen),
        egmali_tamin_hesa_oner: n(s.tamin_hesa_oner),
        egmali_khasm_solaf: n(s.khasm_solaf),
        egmali_income_tax: n(s.income_tax),
        egmali_total_khsomat: n(s.total_khsomat),
        egmali_safi: n(s.safi),
      },
    });
  }

  private aggregateTotals(rows: ComputedEmployeeSalary[]) {
    const sum = (fn: (r: ComputedEmployeeSalary) => number) =>
      rows.reduce((a, r) => a + fn(r), 0);

    return {
      egmali_rateb_asasy: sum((r) => r.ratebAsasy),
      egmali_badal_sakn: sum((r) => r.badalSakn),
      egmali_badal_mowaslat: sum((r) => r.badalMowaslat),
      egmali_badal_etsal: sum((r) => r.badalEtsal),
      egmali_badal_e3asha: sum((r) => r.badalE3asha),
      egmali_badal_tabe3a_amal: sum((r) => r.badalTabe3aAmal),
      egmali_badal_taklef: sum((r) => r.badalTaklef),
      egmali_tot_edafi: sum((r) => r.totEdafi),
      egmali_tot_mokafaa: sum((r) => r.totMokafaa),
      egmali_tot_entdab: sum((r) => r.totEntdab),
      egmali_tot_okraa_esthkaq: sum((r) => r.otherAllowances ?? 0),
      egmali_tot_okraa_khasm: sum((r) => r.otherDeductions ?? 0),
      egmali_total_esthkak: sum((r) => r.totalEsthkak),
      egmali_khasm_keyab: sum((r) => r.khasmKeyab),
      egmali_agaza_bdon_rateb: sum((r) => r.agazaBdonRateb),
      egmali_khasm_takher: sum((r) => r.khasmTakher),
      egmali_khasm_gezaa: sum((r) => r.khasmGezaa),
      egmali_khasm_tamen: sum((r) => r.khasmTamen),
      egmali_tamin_hesa_oner: sum((r) => r.taminHesaOner),
      egmali_khasm_solaf: sum((r) => r.khasmSolaf),
      egmali_income_tax: sum((r) => r.incomeTax),
      egmali_total_khsomat: sum((r) => r.totalKhsomat),
      egmali_safi: sum((r) => r.safi),
    };
  }

  private async getRunOrThrow(id: number, user?: JwtUser) {
    const row = await this.prisma.hr_mosayer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('مسيرة الرواتب غير موجودة');
    const allowed = await this.payrollNumbersForUser(user);
    if (allowed !== null && (row.mosayer_rkm == null || !allowed.includes(row.mosayer_rkm))) {
      throw new NotFoundException('مسيرة الرواتب غير موجودة');
    }
    return row;
  }

  private async payrollIdentities(user?: JwtUser) {
    if (!user || !this.hrScope) return null;
    return this.hrScope.employeeIdentities(user, 'payroll.runs');
  }

  private async payrollNumbersForUser(user?: JwtUser): Promise<number[] | null> {
    const identities = await this.payrollIdentities(user);
    if (identities === null) return null;
    if (!identities.ids.length) return [];
    const rows = await this.prisma.hr_mosayer_details.findMany({
      where: { emp_id: { in: identities.ids }, mosayer_rkm_fk: { not: null } },
      select: { mosayer_rkm_fk: true },
      distinct: ['mosayer_rkm_fk'],
    });
    return rows.map((row) => row.mosayer_rkm_fk).filter((value): value is number => value != null);
  }

  private async assertGlobalPayrollScope(user?: JwtUser): Promise<void> {
    const identities = await this.payrollIdentities(user);
    if (identities !== null) {
      throw new BadRequestException('تنفيذ مسيرة الرواتب يتطلب نطاق بيانات عام');
    }
  }

  private toRunRow(row: {
    id: number;
    mosayer_month: number | null;
    mosayer_year: number | null;
    egmali_safi: Prisma.Decimal | null;
    mosayer_date_ar: string | null;
    taghez: string | null;
    period_start?: string | null;
    period_end?: string | null;
    payout_date?: string | null;
    suspend_mohasb: string | null;
    suspend_direct_manager: string | null;
    suspend_moder_mali: string | null;
    suspend_moder_3am: string | null;
    approved: number | null;
    halet_sarf: string | null;
    file_downloded: string | null;
    tanfez_ezn_sarf: string | null;
    finish_sarf_date: string | null;
  }) {
    const month = row.mosayer_month ?? 0;
    const year = row.mosayer_year ?? 0;
    return {
      id: row.id,
      title: runTitle(month, year),
      periodStart: this.runWindow(row).fromDate,
      periodEnd: this.runWindow(row).toDate,
      payoutDate: row.payout_date ?? this.runWindow(row).toDate,
      month: monthLabel(month),
      year,
      totalAmount: decimal(row.egmali_safi),
      status: mapRunStatus(row as Parameters<typeof mapRunStatus>[0]),
      createdAt: row.mosayer_date_ar ?? undefined,
    };
  }

  private toLineRow(line: {
    id: number;
    emp_code: number | null;
    emp_name: string | null;
    rateb_asasy: Prisma.Decimal | null;
    total_esthkak: Prisma.Decimal | null;
    total_khsomat: Prisma.Decimal | null;
    safi: Prisma.Decimal | null;
  }) {
    const basic = decimal(line.rateb_asasy);
    const totalE = decimal(line.total_esthkak);
    return {
      id: line.id,
      empCode: line.emp_code != null ? String(line.emp_code) : undefined,
      employeeName: line.emp_name ?? undefined,
      basicSalary: basic,
      allowances: totalE - basic,
      deductions: decimal(line.total_khsomat),
      netSalary: decimal(line.safi),
    };
  }
}

/** CSV-escape a cell (RFC 4180: quote when it contains comma/quote/newline). */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Neutralize spreadsheet formula execution while preserving the visible value. */
function csvFormulaSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value.trimStart()) ? `'${value}` : value;
}
