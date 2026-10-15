import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { allocateDocumentNumber } from '../../common/number-series/document-number-series';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { BusinessAuditService } from '../../common/audit/business-audit.service';
import { FailClosedHrLedgerAdapter, HR_LEDGER_ADAPTER, HrLedgerAdapter } from '../../ports/accounting/hr-ledger.adapter';
import { cairoDateString, dateOnlyUtcDate } from '../../common/utils/cairo-date';
import { accruedAnnualLeave } from '../leaves/leave-balance.policy';
import { CreateFinalSettlementDto } from './dto/final-settlement.dto';
import { calculateFinalSettlementBenefits, serviceYearsBetween } from './final-settlement.util';
import { FinalSettlementPolicyService } from './final-settlement-policy.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollTaxPolicyService } from './payroll-tax-policy.service';
import { calculatePeriodicIncomeTax } from './payroll-tax.util';
import { payrollPeriod } from './payroll-status.util';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BANK_PAYMENT_ADAPTER, BankPaymentAdapter, DisabledBankPaymentAdapter } from '../../ports/payroll/bank-payment.adapter';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function payrollCoordinates(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (day <= 25) return { month, year };
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

@Injectable()
export class FinalSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
    private readonly settlementPolicies: FinalSettlementPolicyService,
    private readonly taxPolicies: PayrollTaxPolicyService,
    private readonly audit: BusinessAuditService,
    @Optional() @Inject(HR_LEDGER_ADAPTER)
    private readonly ledger: HrLedgerAdapter = new FailClosedHrLedgerAdapter(),
    @Optional() private readonly hrScope?: HrDataScopeService,
    @Optional() @Inject(BANK_PAYMENT_ADAPTER)
    private readonly bankPayment: BankPaymentAdapter = new DisabledBankPaymentAdapter(),
  ) {}

  async list(q: PaginationDto, user?: JwtUser) {
    const and: Prisma.hr_final_settlementsWhereInput[] = [await this.settlementScopeWhere(user)];
    if (q.search?.trim()) and.push({ OR: [{ employee_name: { contains: q.search.trim() } }, ...(Number.isFinite(Number(q.search)) ? [{ settlement_number: Number(q.search) }] : [])] });
    const where: Prisma.hr_final_settlementsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.hr_final_settlements.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_final_settlements.count({ where }),
    ]);
    return paginated(rows, total, q.page, q.pageSize);
  }

  async get(id: number, user?: JwtUser) {
    const row = await this.prisma.hr_final_settlements.findFirst({
      where: { AND: [{ id }, await this.settlementScopeWhere(user)] },
    });
    if (!row) throw new NotFoundException('التسوية النهائية غير موجودة');
    return row;
  }

  async create(dto: CreateFinalSettlementDto, userId?: number, user?: JwtUser) {
    await this.assertEmployeeAllowed(dto.employeeId, user);
    const employee = await this.prisma.employees.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    const recordedTermination = employee.end_service_date_m?.slice(0, 10);
    if (employee.leave_emp !== 1 || recordedTermination !== dto.terminationDate) {
      throw new BadRequestException('يجب إنهاء خدمة الموظف وتسجيل نفس تاريخ آخر يوم عمل أولًا');
    }
    const serviceStart = employee.start_work_date_m?.slice(0, 10);
    if (!serviceStart) throw new BadRequestException('تاريخ بداية خدمة الموظف غير مسجل');
    const { month, year } = payrollCoordinates(dto.terminationDate);
    await this.assertNotInPayrollRun(employee.id, month, year);
    const computed = await this.engine.computeOneById(employee.id, month, year);
    if (!computed) throw new BadRequestException('تعذر احتساب راتب فترة العمل الأخيرة');
    const { fromDate, toDate } = payrollPeriod(month, year);
    const [settlementPolicy, taxPolicy, contract, usedLeave, outstandingLoans] = await Promise.all([
      this.settlementPolicies.resolve(dto.terminationDate),
      this.taxPolicies.resolveForPeriod(fromDate, toDate),
      employee.emp_code == null ? null : this.prisma.contract_employe.findFirst({ where: { emp_code: String(employee.emp_code) } }),
      employee.emp_code == null ? Promise.resolve({ _sum: { num_days: null } }) : this.prisma.hr_all_agzat_orders.aggregate({ where: { emp_code_fk: BigInt(employee.emp_code), year: Number(dto.terminationDate.slice(0, 4)), suspend: SuspendStatus.APPROVED }, _sum: { num_days: true } }),
      this.outstandingLoans(employee.emp_code),
    ]);
    const annualQuota = contract ? Number.parseFloat(contract.year_vacation_num) || 0 : 0;
    const accrued = accruedAnnualLeave({ annualQuota, previousBalance: contract?.vacation_previous_balance ?? 0, accrualStartDate: contract?.vacation_start_m, employmentStartDate: serviceStart, asOfDate: dto.terminationDate });
    const unusedLeaveDays = Math.max(0, accrued - (usedLeave._sum.num_days ?? 0));
    const serviceYears = serviceYearsBetween(serviceStart, dto.terminationDate);
    const benefitBase = settlementPolicy.row.benefit_base === 'gross' ? computed.totalEsthkak : computed.ratebAsasy;
    const benefits = calculateFinalSettlementBenefits({
      serviceYears, monthlyBenefitBase: benefitBase, unusedLeaveDays,
      leaveDailyBase: benefitBase / settlementPolicy.row.leave_day_divisor,
      maxCompensatedLeaveDays: settlementPolicy.row.max_compensated_leave_days == null ? null : Number(settlementPolicy.row.max_compensated_leave_days),
      tiers: settlementPolicy.tiers,
    });
    const otherEarnings = money(dto.otherEarnings ?? 0);
    const otherDeductions = money(dto.otherDeductions ?? 0);
    const loanRecovery = settlementPolicy.row.recover_all_outstanding_loans ? outstandingLoans : 0;
    const additionalTaxable = otherEarnings +
      (settlementPolicy.row.benefit_taxable ? benefits.endOfServiceBenefit : 0) +
      (settlementPolicy.row.leave_taxable ? benefits.unusedLeaveCompensation : 0);
    const taxResult = calculatePeriodicIncomeTax({
      periodicTaxableEarnings: computed.taxableEarnings + additionalTaxable,
      periodicReliefs: computed.khasmTamen,
      periodsPerYear: taxPolicy.periodsPerYear,
      annualAllowance: taxPolicy.annualAllowance,
      annualTaxCredit: taxPolicy.annualTaxCredit,
      brackets: taxPolicy.brackets,
    });
    const workedDeductionsBeforeTaxLoan = money(computed.totalKhsomat - computed.incomeTax - computed.khasmSolaf);
    const grossEntitlements = money(computed.totalEsthkak + benefits.unusedLeaveCompensation + benefits.endOfServiceBenefit + otherEarnings);
    const totalDeductions = money(workedDeductionsBeforeTaxLoan + loanRecovery + otherDeductions + taxResult.periodicTax);
    const netPayable = money(Math.max(0, grossEntitlements - totalDeductions));
    if (totalDeductions > grossEntitlements) {
      throw new BadRequestException('إجمالي استقطاعات التسوية يتجاوز المستحقات؛ يجب تسوية المديونية بشكل مستقل');
    }
    const snapshot: Prisma.InputJsonObject = {
      employee: { id: employee.id, code: employee.emp_code, name: employee.employee ?? '', branchId: employee.branch_id_fk, serviceStart, terminationDate: dto.terminationDate, serviceYears },
      payrollPeriod: { month, year, fromDate, toDate }, settlementPolicy: settlementPolicy.snapshot,
      taxPolicy: taxPolicy.snapshot, workedPeriod: computed.breakdown as Prisma.InputJsonObject,
      workedPeriodTotals: { gross: computed.totalEsthkak, deductions: computed.totalKhsomat, tax: computed.incomeTax, dueLoanInstallment: computed.khasmSolaf },
      leave: { annualQuota, accrued, approvedUsed: usedLeave._sum.num_days ?? 0, unused: unusedLeaveDays, compensation: benefits.unusedLeaveCompensation },
      benefit: benefits, outstandingLoans, otherEarnings, otherDeductions,
      tax: { additionalTaxable, result: taxResult }, totals: { grossEntitlements, totalDeductions, netPayable },
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const max = await tx.hr_final_settlements.aggregate({ _max: { settlement_number: true } });
        const number = await allocateDocumentNumber(tx, 'hr.final-settlement', (max._max.settlement_number ?? 0) + 1);
        const row = await tx.hr_final_settlements.create({ data: {
          settlement_number: number, employee_id: employee.id, employee_code: employee.emp_code,
          employee_name: employee.employee ?? '', branch_id: employee.branch_id_fk,
          termination_date: dateOnlyUtcDate(dto.terminationDate), service_start_date: dateOnlyUtcDate(serviceStart), service_years: serviceYears,
          policy_id: settlementPolicy.row.id, policy_version: settlementPolicy.key,
          tax_policy_id: taxPolicy.id, tax_policy_version: taxPolicy.key,
          worked_period_gross: computed.totalEsthkak, worked_period_deductions_before_tax_loan: workedDeductionsBeforeTaxLoan,
          employee_insurance: computed.khasmTamen, employer_insurance: computed.taminHesaOner,
          unused_leave_days: benefits.compensatedLeaveDays, unused_leave_compensation: benefits.unusedLeaveCompensation,
          end_of_service_benefit: benefits.endOfServiceBenefit, other_earnings: otherEarnings,
          loan_recovery: loanRecovery, other_deductions: otherDeductions, income_tax: taxResult.periodicTax,
          gross_entitlements: grossEntitlements, total_deductions: totalDeductions, net_payable: netPayable,
          calculation_snapshot: snapshot, reason: dto.reason?.trim(), created_by: userId,
        } });
        await this.audit.log({ entityType: 'hr_final_settlement', entityId: row.id, action: 'final_settlement.created', actorUserId: userId, branchId: employee.branch_id_fk ?? undefined, after: { status: row.status, netPayable }, reason: dto.reason }, tx);
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('توجد تسوية نهائية لهذا الموظف وتاريخ الإنهاء');
      throw error;
    }
  }

  async approve(id: number, userId?: number, user?: JwtUser) {
    const row = await this.get(id, user);
    const coords = payrollCoordinates(row.termination_date.toISOString().slice(0, 10));
    return this.prisma.$transaction(async (tx) => {
      const periodKey = `${coords.year}-${String(coords.month).padStart(2, '0')}`;
      await tx.payroll_period_controls.upsert({ where: { period_key: periodKey }, create: { period_key: periodKey }, update: {} });
      await tx.$queryRaw`SELECT period_key FROM payroll_period_controls WHERE period_key = ${periodKey} FOR UPDATE`;
      await this.assertNotInPayrollRun(row.employee_id, coords.month, coords.year, tx);
      await tx.$queryRaw`SELECT id FROM hr_final_settlements WHERE id = ${id} FOR UPDATE`;
      const claimed = await tx.hr_final_settlements.updateMany({ where: { id, status: 'draft' }, data: { status: 'approved', approved_by: userId, approved_at: new Date() } });
      if (!claimed.count) throw new BadRequestException('التسوية ليست في حالة مسودة قابلة للاعتماد');
      await this.audit.log({ entityType: 'hr_final_settlement', entityId: id, action: 'final_settlement.approved', actorUserId: userId, branchId: row.branch_id ?? undefined, before: { status: 'draft' }, after: { status: 'approved' } }, tx);
      return tx.hr_final_settlements.findUniqueOrThrow({ where: { id } });
    });
  }

  async post(id: number, userId?: number, user?: JwtUser) {
    const row = await this.get(id, user);
    if (row.status !== 'approved') throw new BadRequestException('يجب اعتماد التسوية قبل الترحيل');
    await this.ledger.ensureReady();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hr_final_settlements.updateMany({ where: { id, status: 'approved' }, data: { status: 'posted', posted_by: userId, posted_at: new Date() } });
      if (!claimed.count) throw new BadRequestException('تم ترحيل التسوية أو تغيرت حالتها');
      const nonLiability = money(Number(row.total_deductions) - Number(row.employee_insurance) - Number(row.loan_recovery) - Number(row.income_tax));
      await this.ledger.postFinalSettlementAccrual({
        settlementNumber: row.settlement_number, branchId: row.branch_id ?? undefined,
        date: row.termination_date.toISOString().slice(0, 10),
        grossEarnings: Number(row.gross_entitlements), netPay: Number(row.net_payable),
        employeeInsurance: Number(row.employee_insurance), employerInsurance: Number(row.employer_insurance),
        loanRecovery: Number(row.loan_recovery), incomeTax: Number(row.income_tax),
        nonLiabilityDeductions: nonLiability, createdBy: userId,
      }, tx);
      if (Number(row.loan_recovery) > 0 && row.employee_code != null) {
        await this.settleOutstandingLoans(tx, row.employee_code, row.settlement_number);
      }
      await this.audit.log({ entityType: 'hr_final_settlement', entityId: id, action: 'final_settlement.posted', actorUserId: userId, branchId: row.branch_id ?? undefined, before: { status: 'approved' }, after: { status: 'posted' } }, tx);
      return tx.hr_final_settlements.findUniqueOrThrow({ where: { id } });
    });
  }

  async pay(id: number, userId?: number, user?: JwtUser) {
    const row = await this.get(id, user);
    if (row.status !== 'posted') throw new BadRequestException('يجب ترحيل التسوية قبل الصرف');
    const expectedAmount = money(Number(row.net_payable));
    const settlement = await this.bankPayment.getFinalSettlement({
      settlementNumber: row.settlement_number,
      expectedAmount,
    });
    if (
      settlement.status !== 'settled'
      || money(settlement.settledAmount) !== expectedAmount
      || !settlement.reference?.trim()
    ) {
      throw new BadRequestException('لا يمكن اعتماد صرف التسوية دون مرجع بنكي وتسوية كاملة مؤكدة');
    }
    await this.ledger.ensureReady();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hr_final_settlements.updateMany({ where: { id, status: 'posted' }, data: {
        status: 'paid', paid_by: userId, paid_at: new Date(), bank_reference: settlement.reference,
        payment_snapshot: JSON.parse(JSON.stringify(settlement)),
      } });
      if (!claimed.count) throw new BadRequestException('تم صرف التسوية أو تغيرت حالتها');
      await this.ledger.postFinalSettlementPayment({ settlementNumber: row.settlement_number, branchId: row.branch_id ?? undefined, date: cairoDateString(), netPay: Number(row.net_payable), createdBy: userId }, tx);
      await this.audit.log({ entityType: 'hr_final_settlement', entityId: id, action: 'final_settlement.paid', actorUserId: userId, branchId: row.branch_id ?? undefined, before: { status: 'posted' }, after: { status: 'paid', bankReference: settlement.reference } }, tx);
      return tx.hr_final_settlements.findUniqueOrThrow({ where: { id } });
    });
  }

  private async assertNotInPayrollRun(employeeId: number, month: number, year: number, client: Prisma.TransactionClient = this.prisma) {
    const run = await client.hr_mosayer.findFirst({ where: { mosayer_month: month, mosayer_year: year }, select: { mosayer_rkm: true } });
    if (!run?.mosayer_rkm) return;
    const line = await client.hr_mosayer_details.findFirst({ where: { mosayer_rkm_fk: run.mosayer_rkm, emp_id: employeeId }, select: { id: true } });
    if (line) throw new ConflictException('الموظف موجود بالفعل في مسيرة فترة الإنهاء؛ احذف المسيرة غير المعتمدة أو اعكسها قبل إنشاء التسوية');
  }

  private async outstandingLoans(empCode: number | null): Promise<number> {
    if (empCode == null) return 0;
    const rows = await this.prisma.$queryRaw<{ total: Prisma.Decimal | number | null }[]>`
      SELECT COALESCE(SUM(q.value_of_qst), 0) total FROM hr_solaf_quest q
      INNER JOIN hr_solaf s ON s.t_rkm = q.t_rkm_fk
      WHERE q.emp_code_fk = ${empCode} AND q.paid = 'no'
        AND s.suspend = ${SuspendStatus.APPROVED} AND (s.ended IS NULL OR s.ended <> 'yes')
    `;
    return money(Number(rows[0]?.total ?? 0));
  }

  private async settleOutstandingLoans(tx: Prisma.TransactionClient, empCode: number, settlementNumber: number) {
    const quests = await tx.$queryRaw<{ id: number; t_rkm_fk: number | null }[]>`
      SELECT q.id, q.t_rkm_fk FROM hr_solaf_quest q
      INNER JOIN hr_solaf s ON s.t_rkm = q.t_rkm_fk
      WHERE q.emp_code_fk = ${empCode} AND q.paid = 'no'
        AND s.suspend = ${SuspendStatus.APPROVED} AND (s.ended IS NULL OR s.ended <> 'yes')
      FOR UPDATE
    `;
    if (!quests.length) return;
    await tx.hr_solaf_quest.updateMany({ where: { id: { in: quests.map((row) => row.id) } }, data: {
      paid: 'yes', date_paid: cairoDateString(), paid_sarf_person: `final-settlement:${settlementNumber}`,
    } });
    const loanNumbers = [...new Set(quests.map((row) => row.t_rkm_fk).filter((value): value is number => value != null))];
    if (loanNumbers.length) await tx.hr_solaf.updateMany({ where: { t_rkm: { in: loanNumbers } }, data: { ended: 'yes' } });
  }

  private async settlementScopeWhere(user?: JwtUser): Promise<Prisma.hr_final_settlementsWhereInput> {
    if (!user || !this.hrScope) return {};
    const identities = await this.hrScope.employeeIdentities(user, 'payroll.final_settlements');
    if (identities === null) return {};
    return identities.ids.length ? { employee_id: { in: identities.ids } } : { id: -1 };
  }

  private async assertEmployeeAllowed(employeeId: number, user?: JwtUser): Promise<void> {
    if (!user || !this.hrScope) return;
    const identities = await this.hrScope.employeeIdentities(user, 'payroll.final_settlements');
    if (identities !== null && !identities.ids.includes(employeeId)) {
      throw new NotFoundException('الموظف غير موجود');
    }
  }
}
