import { LeaveType } from '../../common/constants/hr-codes';
import { addDateOnlyDays, cairoDateBounds, cairoDateString, dateOnlyParts } from '../../common/utils/cairo-date';
import { SUSPEND_APPROVED, SuspendStatus } from '../../common/utils/suspend-status.util';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decimal, payrollPeriod } from './payroll-status.util';
import {
  applyNamedAllowance,
  buildPayrollEmployeeWhere,
  clipIsoRange,
  computeComponentAmount,
  countInclusiveDays,
  emptyNamedAllowances,
  ENGINE_BADL,
  isFinanceRowExpired,
  isNamedAllowanceCode,
  resolveEngineBadlCode,
  roundMoney,
} from './salary-component.util';
import { PayrollTaxPolicyService, ResolvedPayrollTaxPolicy } from './payroll-tax-policy.service';
import { calculatePeriodicIncomeTax } from './payroll-tax.util';
import { DisabledGymIncentiveAdapter, GYM_INCENTIVE_ADAPTER, GymIncentiveAdapter } from '../../ports/payroll/gym-incentive.adapter';

export interface ComputedEmployeeSalary {
  empId: number;
  empCode: number;
  empName: string;
  mosmaWazefyN: string | null;
  ratebAsasy: number;
  badalSakn: number;
  badalMowaslat: number;
  badalEtsal: number;
  badalE3asha: number;
  badalTabe3aAmal: number;
  badalTaklef: number;
  totEdafi: number;
  totMokafaa: number;
  totEntdab: number;
  zeyadaRateb: number;
  khasmKeyab: number;
  agazaBdonRateb: number;
  khasmTakher: number;
  khasmEzn: number;
  khasmGezaa: number;
  khasmTamen: number;
  taminHesaOner: number;
  khasmSolaf: number;
  otherAllowances: number;
  otherDeductions: number;
  taxableEarnings: number;
  incomeTax: number;
  taxPolicyId: number;
  taxPolicyVersion: string;
  taxPolicySnapshot: Prisma.InputJsonObject;
  taxBreakdown: Prisma.InputJsonObject;
  totalEsthkak: number;
  totalKhsomat: number;
  safi: number;
  agrSa3a: number;
  agrYom: number;
  // Bank-file fields (per-employee transfer detail).
  bankId: number | null;
  bankAccount: string | null;
  bankCode: string | null;
  nameInBank: string | null;
  breakdown: Record<string, unknown>;
}

/** Manual slip overrides (مكافأة خاصة / تقييم / تارجت) — legacy $overrides on get_employee_detailed_report. */
export interface SalaryOverrides {
  privateBonus?: number;
  taqeemValue?: number;
  targetValue?: number;
  manualIncrease?: number;
  manualDeduction?: number;
  cafeDeduction?: number;
}

@Injectable()
export class PayrollEngineService {
  private readonly workingDays: number;
  private readonly hoursPerDay: number;
  private readonly defaultOffDay: string;
  private readonly deductionExemptEmpCodes: Set<number>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly taxPolicies: PayrollTaxPolicyService,
    @Optional() @Inject(GYM_INCENTIVE_ADAPTER)
    private readonly incentives: GymIncentiveAdapter = new DisabledGymIncentiveAdapter(),
  ) {
    this.workingDays = config.get<number>('payroll.workingDays') ?? 30;
    this.hoursPerDay = config.get<number>('payroll.hoursPerDay') ?? 8;
    this.defaultOffDay = config.get<string>('payroll.defaultOffDay') ?? 'Friday';
    this.deductionExemptEmpCodes = new Set(
      config.get<number[]>('payroll.deductionExemptEmpCodes') ?? [],
    );
  }

  async computeAll(month: number, year: number, window?: { fromDate: string; toDate: string }, overridesByEmployee: Map<number, SalaryOverrides> = new Map()): Promise<ComputedEmployeeSalary[]> {
    const { fromDate, toDate } = window ?? payrollPeriod(month, year);
    const taxPolicy = await this.taxPolicies.resolveForPeriod(fromDate, toDate);
    const settlementBounds = cairoDateBounds(fromDate, toDate);
    const settledEmployees = await this.prisma.hr_final_settlements.findMany({
      where: {
        status: { in: ['approved', 'posted', 'paid'] },
        termination_date: {
          gte: settlementBounds.start,
          lt: settlementBounds.endExclusive,
        },
      },
      select: { employee_id: true },
    });
    const employees = await this.prisma.employees.findMany({
      where: {
        AND: [
          buildPayrollEmployeeWhere({ fromDate, toDate }),
          ...(settledEmployees.length
            ? [{ id: { notIn: settledEmployees.map((row) => row.employee_id) } }]
            : []),
        ],
      },
      orderBy: { id: 'asc' },
    });

    // Insurance rates are nationality-keyed and shared across employees → load once.
    const insuranceRates = await this.loadInsuranceRates();

    const results: ComputedEmployeeSalary[] = [];
    for (const emp of employees) {
      if (!emp.emp_code) continue;
      const computed = await this.computeOne(emp, fromDate, toDate, month, year, insuranceRates, taxPolicy, overridesByEmployee.get(emp.id));
      if (computed) results.push(computed);
    }
    return results;
  }

  /** Compute a single employee's salary, optionally with manual slip overrides. */
  async computeOneById(
    empId: number,
    month: number,
    year: number,
    overrides?: SalaryOverrides,
    window?: { fromDate: string; toDate: string },
  ): Promise<ComputedEmployeeSalary | null> {
    const { fromDate, toDate } = window ?? payrollPeriod(month, year);
    const emp = await this.prisma.employees.findFirst({
      where: { id: empId, ...buildPayrollEmployeeWhere({ fromDate, toDate }) },
    });
    if (!emp || !emp.emp_code) return null;
    const insuranceRates = await this.loadInsuranceRates();
    const taxPolicy = await this.taxPolicies.resolveForPeriod(fromDate, toDate);
    return this.computeOne(emp, fromDate, toDate, month, year, insuranceRates, taxPolicy, overrides);
  }

  private async computeOne(
    emp: {
      id: number;
      emp_code: number | null;
      employee: string | null;
      mosma_wazefy_n: string | null;
      emp_sign: string | null;
      nationality: string | null;
      leave_emp: number | null;
      end_service_date_m: string | null;
      basic_salary: Prisma.Decimal | null;
      tamin_rateb: Prisma.Decimal | null;
      tamin_hesa_emp: Prisma.Decimal | null;
      tamin_hesa_oner: Prisma.Decimal | null;
    },
    fromDate: string,
    toDate: string,
    month: number,
    year: number,
    insuranceRates: InsuranceRateTable,
    taxPolicy: ResolvedPayrollTaxPolicy,
    overrides?: SalaryOverrides,
  ): Promise<ComputedEmployeeSalary | null> {
    const empCode = emp.emp_code!;
    const profileBasic = decimal(emp.basic_salary);
    const components = await this.resolveSalaryComponents(emp.id, empCode, profileBasic);
    const ratebAsasy = profileBasic || components.named.basicFallback;

    let badalSakn = components.named.housing;
    let badalMowaslat = components.named.transport;
    let badalTabe3aAmal = components.named.nature;
    let badalTaklef = components.named.assignment;
    let badalE3asha = components.named.meal;
    let badalEtsal = components.named.communication;
    let otherAllowances = components.otherAllowances;
    const recurringDeductions = components.recurringDeductions;
    const zeyadaRateb = await this.getZeyadaRateb(empCode);

    // Final / pro-rata settlement: a leaver whose last day falls in this window
    // is paid only through that day, then excluded from later ordinary runs.
    let prorationFactor = 1;
    const lastDay = emp.end_service_date_m?.slice(0, 10) ?? null;
    if (emp.leave_emp === 1 && lastDay && lastDay >= fromDate && lastDay <= toDate) {
      const periodDays = countInclusiveDays(fromDate, toDate);
      const workedDays = countInclusiveDays(fromDate, lastDay);
      prorationFactor = periodDays > 0 ? workedDays / periodDays : 1;
      const prorate = (n: number) => roundMoney(n * prorationFactor);
      badalSakn = prorate(badalSakn);
      badalMowaslat = prorate(badalMowaslat);
      badalTabe3aAmal = prorate(badalTabe3aAmal);
      badalTaklef = prorate(badalTaklef);
      badalE3asha = prorate(badalE3asha);
      badalEtsal = prorate(badalEtsal);
      otherAllowances = prorate(otherAllowances);
    }
    const ratebAsasyPaid = roundMoney(ratebAsasy * prorationFactor);

    // ── Insurance (GOSI): rate-based from hr_insurance_settings × nationality. ──
    // Legacy salary path used flat badl-200; here we apply the configured rates
    // (Hr_insurance_settings_model / Finance_employee_model::get_emp_setting) to the
    // insurable base, falling back to the stored flat values when no rates exist.
    const ins = this.computeInsurance(emp, ratebAsasyPaid, badalSakn, insuranceRates);
    const khasmTamen = ins.empShare;
    const taminHesaOner = ins.ownerShare;

    const baseSalary = ratebAsasyPaid + badalSakn + badalMowaslat + zeyadaRateb;
    const agrSa3a = baseSalary / (this.workingDays * this.hoursPerDay);
    const agrYom = agrSa3a * this.hoursPerDay;

    const hoursEdafiManual = await this.getHoursEdafi(empCode, fromDate, toDate);
    const sheftEdafi = await this.getSheftEdafi(empCode, fromDate, toDate);
    const attendanceOt = await this.getAttendanceOvertimeHours(empCode, fromDate, toDate);
    // Prefer extra-hours table on a given day; add attendance OT only for days
    // that were not already entered manually (no double pay).
    const hoursEdafi = hoursEdafiManual + attendanceOt.hours;
    const hoursEdafiValue = hoursEdafi * agrSa3a;
    const daysEdafiValue = sheftEdafi * agrYom;
    const totEdafi = hoursEdafiValue + daysEdafiValue;
    const khasmEarlyLeave = (attendanceOt.earlyLeaveMin / 60) * agrSa3a;

    const khasmGezaa = await this.getGezaaByDate(empCode, fromDate, toDate);
    const khasmSolaf = await this.getSolafByDate(empCode, fromDate, toDate);
    // Bonuses (مكافآت): sum hr_mokafat_details suspend=4 option='rateb' in window.
    const totMokafaa = await this.getMokafaaByDate(empCode, fromDate, toDate);

    // Optional provider incentives. The portable default is explicitly disabled (zero).
    const totEntdab = await this.getIncentives(emp.id, empCode, fromDate, toDate);

    // An open month is a projection: tomorrow (and today's unfinished shift) is not absence.
    const lastFinishedDay = addDateOnlyDays(cairoDateString(), -1);
    const absenceTo = toDate < lastFinishedDay ? toDate : lastFinishedDay;
    const absence = absenceTo < fromDate ? { count: 0, days: [] } : await this.getActualAbsence(empCode, fromDate, absenceTo);
    const keyab = await this.getKeyabByDate(empCode, fromDate, toDate);
    let absenceDays = absence.count;
    let unpaidLeaveDays = keyab.withoutSalaryDays;
    let late = await this.getLateByDate(empCode, fromDate, toDate);
    let khasmKeyabAmount = absenceDays * agrYom;
    let agazaBdonRateb = unpaidLeaveDays * agrYom;
    let khasmTakherAmount = (late.lateWithoutPermission / 60) * agrSa3a;
    let khasmEznAmount = (late.lateWithPermission / 60) * agrSa3a;

    if (this.deductionExemptEmpCodes.has(empCode)) {
      absenceDays = 0;
      unpaidLeaveDays = 0;
      khasmKeyabAmount = 0;
      agazaBdonRateb = 0;
      khasmTakherAmount = 0;
      khasmEznAmount = 0;
      late = { lateWithPermission: 0, lateWithoutPermission: 0 };
    }

    // Manual slip overrides (مكافأة خاصة / تقييم / تارجت) — earnings additions.
    const privateBonus = overrides?.privateBonus ?? 0;
    const taqeemValue = overrides?.taqeemValue ?? 0;
    const targetValue = overrides?.targetValue ?? 0;

    const otherDeductions = roundMoney(recurringDeductions + khasmEarlyLeave + (overrides?.manualDeduction ?? 0) + (overrides?.cafeDeduction ?? 0));

    const totalEsthkak =
      ratebAsasyPaid +
      badalSakn +
      badalMowaslat +
      badalTabe3aAmal +
      badalTaklef +
      badalE3asha +
      badalEtsal +
      zeyadaRateb +
      totEdafi +
      totMokafaa +
      totEntdab +
      otherAllowances +
      privateBonus +
      taqeemValue +
      targetValue + (overrides?.manualIncrease ?? 0);

    const taxableEarnings = roundMoney(totalEsthkak);
    const taxResult = calculatePeriodicIncomeTax({
      periodicTaxableEarnings: taxableEarnings,
      periodicReliefs: khasmTamen,
      periodsPerYear: taxPolicy.periodsPerYear,
      annualAllowance: taxPolicy.annualAllowance,
      annualTaxCredit: taxPolicy.annualTaxCredit,
      brackets: taxPolicy.brackets,
    });
    const incomeTax = taxResult.periodicTax;

    const totalKhsomat =
      khasmKeyabAmount +
      agazaBdonRateb +
      khasmTakherAmount +
      khasmEznAmount +
      khasmGezaa +
      khasmTamen +
      khasmSolaf +
      incomeTax +
      otherDeductions;

    // Net pay is floored at 0: a large penalty / loan / unpaid-absence must never produce a
    // NEGATIVE net that would be persisted to hr_mosayer_details.safi and emitted as a negative
    // line in the bank CSV. The gross (totalEsthkak) and deduction (totalKhsomat) breakdown are
    // kept intact for the slip — only the payable net is floored.
    const safi = Math.max(0, roundMoney(totalEsthkak - totalKhsomat));

    const bank = await this.getBankDetails(empCode);

    const dwam = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: emp.id } });
    const dayFlags = dwam
      ? [dwam.saturday, dwam.sunday, dwam.monday, dwam.tuesday, dwam.wednesday, dwam.thursday, dwam.friday]
      : [];
    const workDays = dayFlags.length ? dayFlags.filter((d) => d === 1).length : this.workingDays;
    const parseHm = (t: string | null | undefined) => {
      const m = (t ?? '').match(/^(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };
    const inMin = parseHm(dwam?.attend_time);
    const outMin = parseHm(dwam?.leave_time);
    const workHours =
      inMin != null && outMin != null && outMin > inMin
        ? Math.round((outMin - inMin) / 60)
        : this.hoursPerDay;

    return {
      empId: emp.id,
      empCode,
      empName: emp.employee ?? '',
      mosmaWazefyN: emp.mosma_wazefy_n,
      ratebAsasy: ratebAsasyPaid,
      badalSakn,
      badalMowaslat,
      badalEtsal,
      badalE3asha,
      badalTabe3aAmal,
      badalTaklef,
      totEdafi,
      totMokafaa,
      totEntdab,
      zeyadaRateb,
      khasmKeyab: khasmKeyabAmount,
      agazaBdonRateb,
      khasmTakher: khasmTakherAmount + khasmEznAmount,
      khasmEzn: khasmEznAmount,
      khasmGezaa,
      khasmTamen,
      taminHesaOner,
      khasmSolaf,
      otherAllowances: roundMoney(otherAllowances + privateBonus + taqeemValue + targetValue + (overrides?.manualIncrease ?? 0)),
      otherDeductions,
      taxableEarnings,
      incomeTax,
      taxPolicyId: taxPolicy.id,
      taxPolicyVersion: taxPolicy.key,
      taxPolicySnapshot: taxPolicy.snapshot,
      taxBreakdown: {
        policy: taxPolicy.snapshot,
        inputs: {
          periodicTaxableEarnings: taxableEarnings,
          periodicReliefs: khasmTamen,
        },
        result: taxResult,
      },
      totalEsthkak,
      totalKhsomat,
      safi,
      agrSa3a,
      agrYom,
      bankId: bank.bankId,
      bankAccount: bank.account,
      bankCode: bank.code,
      nameInBank: bank.nameInBank,
      breakdown: {
        period: { fromDate, toDate, month, year },
        hoursEdafi,
        hoursEdafiManual,
        attendanceOtHours: attendanceOt.hours,
        attendanceOtDates: attendanceOt.dates,
        earlyLeaveMin: attendanceOt.earlyLeaveMin,
        sheftEdafi,
        hoursEdafiValue,
        daysEdafiValue,
        khasmEarlyLeave,
        otherAllowances,
        recurringDeductions,
        prorationFactor,
        absenceDays,
        unpaidLeaveDays,
        late,
        khasmTakherAmount,
        khasmEznAmount,
        manualIncrease: overrides?.manualIncrease ?? 0,
        manualDeduction: overrides?.manualDeduction ?? 0,
        cafeDeduction: overrides?.cafeDeduction ?? 0,
        privateBonus,
        taqeemValue,
        targetValue,
        insurance: {
          base: ins.base,
          empRate: ins.empRate,
          societyRate: ins.societyRate,
          empShare: ins.empShare,
          ownerShare: ins.ownerShare,
          nationalityType: ins.nationalityType,
        },
        workDays,
        workHours,
      },
    };
  }

  /**
   * Resolve one named allowance/deduction for an employee. Prefers the unified
   * catalog+title mapping; still accepts a legacy 100–106 `badl_code`.
   */
  async getBadlValue(badlCode: number, empCode: number, empId?: number): Promise<number> {
    const components = await this.resolveSalaryComponents(empId ?? null, empCode, 0);
    switch (badlCode) {
      case ENGINE_BADL.BASIC:
        return components.named.basicFallback;
      case ENGINE_BADL.HOUSING:
        return components.named.housing;
      case ENGINE_BADL.TRANSPORT:
        return components.named.transport;
      case ENGINE_BADL.NATURE:
        return components.named.nature;
      case ENGINE_BADL.ASSIGNMENT:
        return components.named.assignment;
      case ENGINE_BADL.MEAL:
        return components.named.meal;
      case ENGINE_BADL.COMM:
        return components.named.communication;
      default:
        return 0;
    }
  }

  /**
   * Single salary-component resolution: catalog id + title + stored code, then
   * apply type (1=allowance, 2=deduction) and method_to_count.
   */
  async resolveSalaryComponents(
    empId: number | null,
    empCode: number,
    basicSalary: number,
  ): Promise<{
    named: ReturnType<typeof emptyNamedAllowances>;
    otherAllowances: number;
    recurringDeductions: number;
  }> {
    const named = emptyNamedAllowances();
    let otherAllowances = 0;
    let recurringDeductions = 0;
    const where: Prisma.hr_finance_employesWhereInput = empId
      ? { OR: [{ emp_id: empId }, { emp_code: empCode }] }
      : { emp_code: empCode };
    const rows = await this.prisma.hr_finance_employes.findMany({ where });
    const catalogIds = [
      ...new Set(
        rows
          .map((r) => r.badl_discount_id_fk)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    const catalogs = catalogIds.length
      ? await this.prisma.all_defined_setting.findMany({
          where: { defined_id: { in: catalogIds } },
          select: { defined_id: true, defined_title: true, defined_type: true },
        })
      : [];
    const catalogById = new Map(catalogs.map((c) => [c.defined_id, c]));
    const today = cairoDateString();
    const seen = new Set<number>();

    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (isFinanceRowExpired(row, today)) continue;
      const catalog = row.badl_discount_id_fk
        ? catalogById.get(row.badl_discount_id_fk)
        : undefined;
      const code = resolveEngineBadlCode({
        badlCode: row.badl_code,
        catalogId: row.badl_discount_id_fk,
        title: catalog?.defined_title,
      });
      const amount = computeComponentAmount({
        value: row.value ?? 0,
        method: row.method_to_count,
        basicSalary,
        periodDays: this.workingDays,
      });
      if (amount === 0) continue;
      const type = row.badl_type ?? catalog?.defined_type ?? 1;
      if (type === 2) {
        recurringDeductions = roundMoney(recurringDeductions + amount);
        continue;
      }
      if (code != null && isNamedAllowanceCode(code)) {
        applyNamedAllowance(named, code, amount);
      } else {
        otherAllowances = roundMoney(otherAllowances + amount);
      }
    }

    return { named, otherAllowances, recurringDeductions };
  }

  async getZeyadaRateb(empCode: number): Promise<number> {
    const agg = await this.prisma.tbl_zeyada_rateb.aggregate({
      where: { emp_code: empCode },
      _sum: { value: true },
    });
    return Number(agg._sum.value ?? 0);
  }

  async getHoursEdafi(empCode: number, fromDate: string, toDate: string): Promise<number> {
    const agg = await this.prisma.tbl_emps_hours_edafi.aggregate({
      where: {
        emp_code_fk: empCode,
        edafa_date: { gte: fromDate, lte: toDate },
      },
      _sum: { num_hours: true },
    });
    return agg._sum.num_hours ?? 0;
  }

  async getSheftEdafi(empCode: number, fromDate: string, toDate: string): Promise<number> {
    return this.prisma.tbl_emps_shef_edafi.count({
      where: {
        emp_code_fk: empCode,
        ttype: 2,
        sheft_date: { gte: fromDate, lte: toDate },
      },
    });
  }

  /**
   * Attendance checkout writes overtime (`num_min`) and early leave (`mobaker_min`)
   * on tbl_hdoor_emps. Extra-hours table remains authoritative for a given date
   * so the same minutes are not paid twice.
   */
  async getAttendanceOvertimeHours(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ hours: number; earlyLeaveMin: number; dates: string[] }> {
    const [manualHours, punches] = await Promise.all([
      this.prisma.tbl_emps_hours_edafi.findMany({
        where: {
          emp_code_fk: empCode,
          edafa_date: { gte: fromDate, lte: toDate },
        },
        select: { edafa_date: true },
      }),
      this.prisma.tbl_hdoor_emps.findMany({
        where: {
          employee_code: empCode,
          action_date: { gte: fromDate, lte: toDate },
          OR: [{ num_min: { gt: 0 } }, { mobaker_min: { gt: 0 } }],
        },
        select: { action_date: true, num_min: true, mobaker_min: true },
      }),
    ]);
    const manualDates = new Set(
      manualHours.map((r) => r.edafa_date).filter((d): d is string => !!d),
    );
    let otMin = 0;
    let earlyLeaveMin = 0;
    const dates: string[] = [];
    for (const row of punches) {
      const date = row.action_date ?? '';
      earlyLeaveMin += Math.max(0, row.mobaker_min ?? 0);
      if (date && manualDates.has(date)) continue;
      const minutes = Math.max(0, row.num_min ?? 0);
      if (minutes > 0) {
        otMin += minutes;
        if (date) dates.push(date);
      }
    }
    return { hours: otMin / 60, earlyLeaveMin, dates };
  }

  async getGezaaByDate(empCode: number, fromDate: string, toDate: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ total: number | null }[]>`
      SELECT SUM(CAST(geza_value AS DECIMAL(19,2))) AS total
      FROM hr_gezaat
      WHERE emp_code = ${empCode}
        AND suspend = ${SuspendStatus.APPROVED}
        AND mosayer_rkm_fk IS NULL
        AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-25'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    return Number(rows[0]?.total ?? 0);
  }

  async getSolafByDate(empCode: number, fromDate: string, toDate: string): Promise<number> {
    const quests = await this.findUnpaidLoanQuests(empCode, fromDate, toDate);
    return quests.reduce((sum, q) => sum + Number(q.value_of_qst ?? 0), 0);
  }

  /**
   * Unpaid installments (hr_solaf_quest paid='no') of APPROVED loans falling due in the
   * payroll window. Single source of truth shared by:
   *   - getSolafByDate() → the khasm_solaf salary deduction, and
   *   - PayrollService.runAction('post') → marking those exact quests paid,
   * so the amount deducted from the salary always equals the installments settled on the
   * loan (prevents double collection). Accepts a transaction client so the post action
   * can run it inside the posting transaction.
   */
  async findUnpaidLoanQuests(
    empCode: number,
    fromDate: string,
    toDate: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: number; t_rkm_fk: number | null; value_of_qst: number | null }[]> {
    return client.$queryRaw<{ id: number; t_rkm_fk: number | null; value_of_qst: number | null }[]>`
      SELECT q.id, q.t_rkm_fk, q.value_of_qst
      FROM hr_solaf_quest q
      LEFT JOIN hr_solaf s ON s.t_rkm = q.t_rkm_fk
      WHERE q.emp_code_fk = ${empCode}
        AND q.paid = 'no'
        AND s.suspend = ${SuspendStatus.APPROVED}
        AND STR_TO_DATE(CONCAT(q.year, '-', LPAD(q.month, 2, '0'), '-01'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
  }

  /**
   * On payroll POST: stamp mosayer_rkm_fk on exactly the penalties (hr_gezaat) that mapped into
   * this run's window — the same rows getGezaaByDate summed (approved, not yet consumed, anchor
   * date-25 within window). Mirrors the loan-quest settlement pattern so a recompute or an
   * overlapping-period run can't collect the same penalty twice. Runs inside the post tx.
   */
  async stampConsumedPenalties(
    mosayerRkm: number,
    fromDate: string,
    toDate: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const empCodes = await this.runEmployeeCodes(mosayerRkm, client);
    if (!empCodes.length) return 0;
    const res = await client.$executeRaw`
      UPDATE hr_gezaat
      SET mosayer_rkm_fk = ${mosayerRkm}
      WHERE suspend = ${SuspendStatus.APPROVED}
        AND mosayer_rkm_fk IS NULL
        AND emp_code IN (${Prisma.join(empCodes)})
        AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-25'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    return Number(res);
  }

  /**
   * On payroll POST: stamp mosayer_rkm_fk on exactly the salary-borne bonuses
   * (hr_mokafat_details, suspend=4 option='rateb') that mapped into this run's window — the same
   * rows getMokafaaByDate summed. Runs inside the post tx.
   */
  async stampConsumedBonuses(
    mosayerRkm: number,
    fromDate: string,
    toDate: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const empCodes = await this.runEmployeeCodes(mosayerRkm, client);
    if (!empCodes.length) return 0;
    const res = await client.$executeRaw`
      UPDATE hr_mokafat_details
      SET mosayer_rkm_fk = ${mosayerRkm}
      WHERE suspend = ${SuspendStatus.APPROVED}
        AND mokafa_option = 'rateb'
        AND mosayer_rkm_fk IS NULL
        AND emp_code IN (${Prisma.join(empCodes)})
        AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-25'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    return Number(res);
  }

  private async runEmployeeCodes(
    mosayerRkm: number,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number[]> {
    const details = await client.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: { emp_code: true },
    });
    return Array.from(
      new Set(details.map((d) => d.emp_code).filter((c): c is number => c != null)),
    );
  }

  /**
   * On payroll run delete / unpost: release every penalty + bonus stamped with this run's number
   * (mosayer_rkm_fk = run) back to unconsumed (NULL) so a corrected run can collect them again.
   */
  async releaseConsumedByRun(
    mosayerRkm: number,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.$executeRaw`
      UPDATE hr_gezaat SET mosayer_rkm_fk = NULL WHERE mosayer_rkm_fk = ${mosayerRkm}
    `;
    await client.$executeRaw`
      UPDATE hr_mokafat_details SET mosayer_rkm_fk = NULL WHERE mosayer_rkm_fk = ${mosayerRkm}
    `;
  }

  async getLateByDate(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ lateWithPermission: number; lateWithoutPermission: number }> {
    const ozonat = await this.prisma.hr_all_ozonat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        ezn_date: { gte: fromDate, lte: toDate },
        suspend: { in: SUSPEND_APPROVED },
      },
      select: { ezn_date: true },
    });
    const approvedDates = new Set(ozonat.map((o) => o.ezn_date).filter(Boolean));

    const lateRows = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        employee_code: empCode,
        action_date: { gte: fromDate, lte: toDate },
        late_min: { gt: 0 },
      },
      select: { late_min: true, action_date: true },
    });

    let lateWithPermission = 0;
    let lateWithoutPermission = 0;
    for (const row of lateRows) {
      let late = Math.floor(row.late_min ?? 0);
      const date = row.action_date ?? '';
      if (approvedDates.has(date)) {
        lateWithPermission += late;
      } else {
        if (late > 120) late = 240;
        lateWithoutPermission += late;
      }
    }
    return { lateWithPermission, lateWithoutPermission };
  }

  /** Faithful get_actual_absence from Employee_salaries_model (incl. off-day & type-19 replacement leave). */
  async getActualAbsence(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ count: number; days: string[] }> {
    const offRow = await this.prisma.hr_emp_agazat_dayes.findFirst({
      where: { emp_code_fk: empCode },
    });
    const empOffDay = offRow?.off_day ?? this.defaultOffDay;
    const weekday = (ds: string) => weekdayName(ds);

    // 1+2) all working days in window, excluding the weekly off-day.
    const allDates: string[] = [];
    for (const ds of eachDay(fromDate, toDate)) {
      if (weekday(ds) !== empOffDay) allDates.push(ds);
    }

    // 3) actual attendance days.
    const attendance = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        employee_code: empCode,
        action_date: { gte: fromDate, lte: toDate },
      },
      select: { action_date: true },
      distinct: ['action_date'],
    });
    const attendanceDates = (attendance.map((a) => a.action_date).filter(
      (x): x is string => !!x,
    ));
    const attendanceSet = new Set(attendanceDates);

    // 4) fingerprint absence (working days with no attendance).
    const fingerprintAbsence = allDates.filter((d) => !attendanceSet.has(d));

    // 5) approved vacations (suspend 1|4) days, excluding off-day.
    const vacations = await this.prisma.hr_all_agzat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        suspend: { in: SUSPEND_APPROVED },
        agaza_from_date_m: { lte: toDate },
        agaza_to_date_m: { gte: fromDate },
      },
      select: { agaza_from_date_m: true, agaza_to_date_m: true },
    });
    const vacationDays = new Set<string>();
    for (const v of vacations) {
      if (!v.agaza_from_date_m || !v.agaza_to_date_m) continue;
      for (const ds of eachDay(v.agaza_from_date_m, v.agaza_to_date_m)) {
        if (ds >= fromDate && ds <= toDate && weekday(ds) !== empOffDay) {
          vacationDays.add(ds);
        }
      }
    }

    // 6) official holidays.
    const holidays = await this.prisma.holiday_setting.findMany({
      where: {
        active: 'yes',
        agaza_ttype: 1,
        date_from: { lte: toDate },
        date_to: { gte: fromDate },
      },
      select: { date_from: true, date_to: true },
    });
    const officialHolidays = new Set<string>();
    for (const h of holidays) {
      if (!h.date_from || !h.date_to) continue;
      for (const ds of eachDay(h.date_from, h.date_to)) officialHolidays.add(ds);
    }

    // 7) attendance that fell on the weekly off-day.
    const attendanceOffday = attendanceDates.filter((d) => weekday(d) === empOffDay);

    // 8) type-19 replacement-leave orders covering those off-day attendance dates.
    const replacementDays = new Set<string>();
    if (attendanceOffday.length > 0) {
      const offdaySet = new Set(attendanceOffday);
      const replacements = await this.prisma.hr_all_agzat_orders.findMany({
        where: {
          emp_code_fk: empCode,
          suspend: { in: SUSPEND_APPROVED },
          no3_agaza: LeaveType.REPLACEMENT,
          agaza_from_date_m: { lte: toDate },
          agaza_to_date_m: { gte: fromDate },
        },
        select: { agaza_from_date_m: true, agaza_to_date_m: true },
      });
      for (const v of replacements) {
        if (!v.agaza_from_date_m || !v.agaza_to_date_m) continue;
        for (const ds of eachDay(v.agaza_from_date_m, v.agaza_to_date_m)) {
          if (offdaySet.has(ds)) replacementDays.add(ds);
        }
      }
    }

    // 9) final absence = fingerprint − vacations − holidays − replacement-leave.
    const actualAbsence = fingerprintAbsence.filter(
      (d) =>
        !vacationDays.has(d) &&
        !officialHolidays.has(d) &&
        !replacementDays.has(d),
    );
    return { count: actualAbsence.length, days: actualAbsence };
  }

  /** Bonuses: hr_mokafat_details suspend=4 option='rateb', dated 25th-in-window. */
  async getMokafaaByDate(empCode: number, fromDate: string, toDate: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ total: number | null }[]>`
      SELECT SUM(value) AS total
      FROM hr_mokafat_details
      WHERE emp_code = ${empCode}
        AND suspend = ${SuspendStatus.APPROVED}
        AND mokafa_option = 'rateb'
        AND mosayer_rkm_fk IS NULL
        AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-25'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    return Number(rows[0]?.total ?? 0);
  }

  /** Paid/unpaid leave day counts in the window, driven by leave-type policy. */
  async getKeyabByDate(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ withSalaryDays: number; withoutSalaryDays: number }> {
    const offRow = await this.prisma.hr_emp_agazat_dayes.findFirst({
      where: { emp_code_fk: empCode },
    });
    const empOffDay = offRow?.off_day ?? this.defaultOffDay;
    const weekday = (ds: string) => weekdayName(ds);

    const unpaidTypes = await this.prisma.holiday_setting.findMany({
      where: { is_paid: false },
      select: { id: true },
    });
    const unpaidTypeIds = new Set(unpaidTypes.map((type) => type.id));

    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        suspend: { in: SUSPEND_APPROVED },
        agaza_from_date_m: { lte: toDate },
        agaza_to_date_m: { gte: fromDate },
      },
      select: { num_days: true, no3_agaza: true, agaza_from_date_m: true, agaza_to_date_m: true },
    });
    let withSalaryDays = 0;
    let withoutSalaryDays = 0;
    for (const r of rows) {
      if (!r.agaza_from_date_m || !r.agaza_to_date_m) continue;
      const clipped = clipIsoRange(r.agaza_from_date_m, r.agaza_to_date_m, fromDate, toDate);
      if (!clipped) continue;
      let days = 0;
      for (const ds of eachDay(clipped.from, clipped.to)) {
        if (weekday(ds) !== empOffDay) days += 1;
      }
      if (r.no3_agaza != null && unpaidTypeIds.has(r.no3_agaza)) withoutSalaryDays += days;
      else withSalaryDays += days;
    }
    return { withSalaryDays, withoutSalaryDays };
  }

  // ── Insurance (GOSI) rate table ────────────────────────────────────────────

  /** Summed emp_average / society_average per nationality_type (Finance_employee_model::get_emp_setting). */
  async loadInsuranceRates(): Promise<InsuranceRateTable> {
    const rows = await this.prisma.hr_insurance_settings.findMany({
      select: { nationality_type: true, emp_average: true, society_average: true },
    });
    const table: InsuranceRateTable = new Map();
    for (const r of rows) {
      const key = r.nationality_type ?? 0;
      const acc = table.get(key) ?? { emp: 0, society: 0, hasRows: false };
      acc.emp += parseFloat(r.emp_average ?? '0') || 0;
      acc.society += parseFloat(r.society_average ?? '0') || 0;
      acc.hasRows = true;
      table.set(key, acc);
    }
    return table;
  }

  /** Map employee nationality string → nationality_type (0=Egyptian, 1=non-Egyptian). */
  private nationalityType(nationality: string | null): number {
    const n = (nationality ?? '').trim();
    if (n === 'مصر' || n === 'مصري' || n === 'مصرى' || n === 'مصرية' || n === 'مصريه') return 0;
    return 1;
  }

  /**
   * GOSI computation. Base = insurable salary (employee.tamin_rateb if set,
   * else basic + housing per legacy GOSI convention). empShare = base × Σemp_average%,
   * ownerShare = base × Σsociety_average%. Falls back to stored flat values / badl-200
   * when no rate rows exist for the nationality.
   */
  private computeInsurance(
    emp: {
      nationality: string | null;
      tamin_rateb: Prisma.Decimal | null;
      tamin_hesa_emp: Prisma.Decimal | null;
      tamin_hesa_oner: Prisma.Decimal | null;
    },
    ratebAsasy: number,
    badalSakn: number,
    rates: InsuranceRateTable,
  ): {
    base: number;
    empRate: number;
    societyRate: number;
    empShare: number;
    ownerShare: number;
    nationalityType: number;
  } {
    const nationalityType = this.nationalityType(emp.nationality);
    const rate = rates.get(nationalityType);
    const base = decimal(emp.tamin_rateb) || ratebAsasy + badalSakn;

    if (rate && rate.hasRows) {
      const empRate = rate.emp;
      const societyRate = rate.society;
      return {
        base,
        empRate,
        societyRate,
        empShare: (base * empRate) / 100,
        ownerShare: (base * societyRate) / 100,
        nationalityType,
      };
    }

    // No configured rates → fall back to the stored flat amounts (legacy badl-200 path).
    return {
      base,
      empRate: 0,
      societyRate: 0,
      empShare: decimal(emp.tamin_hesa_emp),
      ownerShare: decimal(emp.tamin_hesa_oner),
      nationalityType,
    };
  }

  // ── Optional provider incentives ───────────────────────────────────────────

  async getIncentives(
    employeeId: number,
    employeeCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    return this.incentives.calculate({ employeeId, employeeCode, fromDate, toDate });
  }

  // ── Bank details ───────────────────────────────────────────────────────────

  async getBankDetails(empCode: number): Promise<{
    bankId: number | null;
    account: string | null;
    code: string | null;
    nameInBank: string | null;
  }> {
    const row = await this.prisma.bank_employes_details.findFirst({
      where: { emp_code: empCode },
    });
    if (!row) return { bankId: null, account: null, code: null, nameInBank: null };
    return {
      bankId: row.bank_id_fk ?? null,
      account: row.bank_account_num ?? null,
      code: row.bank_code ?? null,
      nameInBank: row.emp_bank_name ?? null,
    };
  }
}

/** nationality_type → { summed emp/society rate, whether any rows exist }. */
type InsuranceRateTable = Map<number, { emp: number; society: number; hasRows: boolean }>;

/** Inclusive day iterator over Y-m-d strings, computed in UTC to avoid TZ drift. */
function* eachDay(fromDate: string, toDate: string): Generator<string> {
  let current = fromDate;
  while (current <= toDate) {
    yield current;
    current = addDateOnlyDays(current, 1);
  }
}

/** Weekday name for a Y-m-d string (UTC-stable, matches PHP DateTime::format('l')). */
function weekdayName(ds: string): string {
  const { year, month, day } = dateOnlyParts(ds);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}
