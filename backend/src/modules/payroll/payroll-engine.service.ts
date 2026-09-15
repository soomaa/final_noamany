import { EmployeeType, LeaveType } from '../../common/constants/hr-codes';
import { SUSPEND_APPROVED, SuspendStatus } from '../../common/utils/suspend-status.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { allocateCollectedCafeSale } from '../targets/cafe-target-classification';
import { decimal, payrollPeriod } from './payroll-status.util';

/** Allowance/deduction codes (badl) keyed in hr_finance_employes. */
const BADL = {
  BASIC: 100,
  HOUSING: 101,
  TRANSPORT: 102,
  NATURE: 103,
  ASSIGNMENT: 104,
  MEAL: 105,
  COMM: 106,
  INSURANCE: 200,
} as const;

export interface ComputedEmployeeSalary {
  empId: number;
  empCode: number;
  empName: string;
  mosmaWazefyN: string | null;
  branchId: number | null;
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
  manualEarnings: number;
  khasmKeyab: number;
  agazaBdonRateb: number;
  khasmAgazat: number;
  khasmBasma: number;
  khasmTakher: number;
  khasmEzn: number;
  khasmGezaa: number;
  khasmTamen: number;
  taminHesaOner: number;
  khasmSolaf: number;
  totOkraaKhasm: number;
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
  ) {
    this.workingDays = config.get<number>('payroll.workingDays') ?? 30;
    this.hoursPerDay = config.get<number>('payroll.hoursPerDay') ?? 8;
    this.defaultOffDay = config.get<string>('payroll.defaultOffDay') ?? 'Friday';
    this.deductionExemptEmpCodes = new Set(
      config.get<number[]>('payroll.deductionExemptEmpCodes') ?? [],
    );
  }

  async computeAll(month: number, year: number): Promise<ComputedEmployeeSalary[]> {
    const { fromDate, toDate } = payrollPeriod(month, year);
    return this.computeAllForPeriod(fromDate, toDate);
  }

  /** Live legacy salary sheet for an arbitrary date range and optional branch. */
  async computeAllForPeriod(
    fromDate: string,
    toDate: string,
    branchIds?: number[],
  ): Promise<ComputedEmployeeSalary[]> {
    const end = new Date(`${toDate}T00:00:00Z`);
    const month = end.getUTCMonth() + 1;
    const year = end.getUTCFullYear();
    const employees = await this.prisma.employees.findMany({
      where: {
        employee_type: EmployeeType.ACTIVE,
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
        ...(branchIds != null ? { branch_id_fk: { in: branchIds } } : {}),
      },
      orderBy: { id: 'asc' },
    });

    // Insurance rates are nationality-keyed and shared across employees → load once.
    const insuranceRates = await this.loadInsuranceRates();

    const results: ComputedEmployeeSalary[] = [];
    for (const emp of employees) {
      if (!emp.emp_code) continue;
      const computed = await this.computeOne(emp, fromDate, toDate, month, year, insuranceRates);
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
  ): Promise<ComputedEmployeeSalary | null> {
    const { fromDate, toDate } = payrollPeriod(month, year);
    const emp = await this.prisma.employees.findFirst({
      where: { id: empId, employee_type: EmployeeType.ACTIVE },
    });
    if (!emp || !emp.emp_code) return null;
    const insuranceRates = await this.loadInsuranceRates();
    return this.computeOne(emp, fromDate, toDate, month, year, insuranceRates, overrides);
  }

  private async computeOne(
    emp: {
      id: number;
      emp_code: number | null;
      employee: string | null;
      mosma_wazefy_n: string | null;
      emp_sign: string | null;
      emp_code_gym: number | null;
      branch_id_fk: number | null;
      nationality: string | null;
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
    overrides?: SalaryOverrides,
  ): Promise<ComputedEmployeeSalary | null> {
    const empCode = emp.emp_code!;
    const badlBasic = await this.getBadlValue(BADL.BASIC, empCode);
    const ratebAsasy = decimal(emp.basic_salary) || badlBasic;

    const badalSakn = await this.getBadlValue(BADL.HOUSING, empCode);
    const badalMowaslat = await this.getBadlValue(BADL.TRANSPORT, empCode);
    const badalTabe3aAmal = await this.getBadlValue(BADL.NATURE, empCode);
    const badalTaklef = await this.getBadlValue(BADL.ASSIGNMENT, empCode);
    // The active legacy salary sheet uses codes 100,101,102,103,104 and 106.
    // Code 105 is not included in its earnings formula.
    const badalE3asha = 0;
    const badalEtsal = await this.getBadlValue(BADL.COMM, empCode);
    const zeyadaRateb = await this.getZeyadaRateb(empCode);

    // ── Insurance (GOSI): rate-based from hr_insurance_settings × nationality. ──
    // Rates calculate the employer share; the employee deduction remains legacy badl-200.
    const ins = this.computeInsurance(emp, ratebAsasy, badalSakn, insuranceRates);
    // Active Employee_salaries_model deducts finance component 200 verbatim.
    const khasmTamen = await this.getBadlValue(BADL.INSURANCE, empCode);
    ins.empShare = khasmTamen;
    const taminHesaOner = ins.ownerShare;

    const baseSalary = ratebAsasy + badalSakn + badalMowaslat + zeyadaRateb;
    const agrSa3a = baseSalary / (this.workingDays * this.hoursPerDay);
    const agrYom = agrSa3a * this.hoursPerDay;

    const hoursEdafi = await this.getHoursEdafi(empCode, fromDate, toDate);
    const sheftEdafi = await this.getSheftEdafi(empCode, fromDate, toDate);
    const hoursEdafiValue = hoursEdafi * agrSa3a;
    const daysEdafiValue = sheftEdafi * agrYom;
    const totEdafi = hoursEdafiValue + daysEdafiValue;

    const khasmGezaa = await this.getGezaaByDate(empCode, fromDate, toDate);
    const khasmSolaf = await this.getSolafByDate(empCode, fromDate, toDate);
    // Bonuses (مكافآت): sum hr_mokafat_details suspend=4 option='rateb' in window.
    const totMokafaa = await this.getMokafaaByDate(empCode, fromDate, toDate);

    // Incentives / commissions (حوافز): gym target+sales+classes paid out by configured
    // split rate (tbl_gym_setting for_user). Persisted into tot_entdab (commissions report).
    const incentives = await this.getIncentives(emp.id, empCode, fromDate, toDate);
    // The legacy sheet pays classes and protein from the configured employee percentage.
    // Target is kept separate because its payable amount remains editable in the sheet.
    const totEntdab = incentives.classCommission + incentives.proteinCommission;

    const absence = await this.getActualAbsence(empCode, fromDate, toDate);
    const keyab = await this.getKeyabByDate(empCode, fromDate, toDate);
    let absenceDays = absence.count;
    let paidLeaveDays = keyab.withSalaryDays;
    let unpaidLeaveDays = keyab.withoutSalaryDays;
    let forgottenFingerprint = await this.getForgottenFingerprintByDate(empCode, fromDate, toDate);
    let late = await this.getLateByDate(empCode, fromDate, toDate);
    let khasmKeyabAmount = absenceDays * agrYom;
    let khasmAgazat = paidLeaveDays * agrYom;
    let agazaBdonRateb = unpaidLeaveDays * agrYom;
    let khasmBasma = forgottenFingerprint.deductionDays * agrYom;
    let khasmTakherAmount = (late.lateWithoutPermission / 60) * agrSa3a;
    let khasmEznAmount = (late.lateWithPermission / 60) * agrSa3a;

    if (this.deductionExemptEmpCodes.has(empCode)) {
      absenceDays = 0;
      paidLeaveDays = 0;
      unpaidLeaveDays = 0;
      khasmKeyabAmount = 0;
      khasmAgazat = 0;
      agazaBdonRateb = 0;
      khasmBasma = 0;
      forgottenFingerprint = { count: 0, deductionDays: 0 };
      khasmTakherAmount = 0;
      khasmEznAmount = 0;
      late = { lateWithPermission: 0, lateWithoutPermission: 0 };
    }

    // Manual slip overrides (مكافأة خاصة / تقييم / تارجت) — earnings additions.
    const privateBonus = overrides?.privateBonus ?? 0;
    const taqeemValue = overrides?.taqeemValue ?? 0;
    // Default target payable = target base × configured employee rate. Payroll officers can
    // still replace that value from the editable "نسبة التارجت" cell, as in the legacy sheet.
    const targetValue = legacyTargetPayable(incentives.targetCommission, overrides?.targetValue);

    const totalEsthkak =
      ratebAsasy +
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
      privateBonus +
      taqeemValue +
      targetValue;

    const totalKhsomat =
      khasmKeyabAmount +
      khasmAgazat +
      agazaBdonRateb +
      khasmBasma +
      khasmTakherAmount +
      khasmEznAmount +
      khasmGezaa +
      khasmTamen +
      khasmSolaf;

    // Active legacy formula: net salary is gross earnings minus all deductions, without flooring.
    const safi = legacyNetPay(totalEsthkak, totalKhsomat);
    const totOkraaKhasm = khasmAgazat + khasmBasma;

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
      branchId: emp.branch_id_fk,
      ratebAsasy,
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
      manualEarnings: privateBonus + taqeemValue + targetValue,
      khasmKeyab: khasmKeyabAmount,
      agazaBdonRateb,
      khasmAgazat,
      khasmBasma,
      khasmTakher: khasmTakherAmount + khasmEznAmount,
      khasmEzn: khasmEznAmount,
      khasmGezaa,
      khasmTamen,
      taminHesaOner,
      khasmSolaf,
      totOkraaKhasm,
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
        sheftEdafi,
        hoursEdafiValue,
        daysEdafiValue,
        absenceDays,
        paidLeaveDays,
        unpaidLeaveDays,
        forgottenFingerprint,
        late,
        khasmTakherAmount,
        khasmEznAmount,
        privateBonus,
        taqeemValue,
        targetValue,
        incentives,
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

  /** Legacy get_badl_value — respects specific_period expiry. */
  async getBadlValue(badlCode: number, empCode: number): Promise<number> {
    const row = await this.prisma.hr_finance_employes.findFirst({
      where: { badl_code: badlCode, emp_code: empCode },
    });
    if (!row) return 0;
    if (row.specific_period === '1' && row.date_to) {
      const today = new Date().toISOString().slice(0, 10);
      if (row.date_to <= today) return 0;
    }
    return row.value ?? 0;
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
    const res = await client.$executeRaw`
      UPDATE hr_gezaat
      SET mosayer_rkm_fk = ${mosayerRkm}
      WHERE suspend = ${SuspendStatus.APPROVED}
        AND mosayer_rkm_fk IS NULL
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
    const res = await client.$executeRaw`
      UPDATE hr_mokafat_details
      SET mosayer_rkm_fk = ${mosayerRkm}
      WHERE suspend = ${SuspendStatus.APPROVED}
        AND mokafa_option = 'rateb'
        AND mosayer_rkm_fk IS NULL
        AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-25'), '%Y-%m-%d')
            BETWEEN STR_TO_DATE(${fromDate}, '%Y-%m-%d') AND STR_TO_DATE(${toDate}, '%Y-%m-%d')
    `;
    return Number(res);
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
        member_code: empCode,
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
        member_code: empCode,
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

  /** Paid/unpaid leave day counts in window (get_emp_keyab_by_date). type 17 = unpaid. */
  async getKeyabByDate(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ withSalaryDays: number; withoutSalaryDays: number }> {
    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        suspend: { in: SUSPEND_APPROVED },
        agaza_from_date_m: { lte: toDate },
        agaza_to_date_m: { gte: fromDate },
      },
      select: { num_days: true, no3_agaza: true },
    });
    let withSalaryDays = 0;
    let withoutSalaryDays = 0;
    for (const r of rows) {
      const days = Number(r.num_days ?? 0);
      if (r.no3_agaza === LeaveType.UNPAID) withoutSalaryDays += days;
      else withSalaryDays += days;
    }
    return { withSalaryDays, withoutSalaryDays };
  }

  /**
   * Missing one side of the fingerprint pair counts progressively like the active legacy sheet:
   * first occurrence = 1/4 day, second = 1/2 day, every later occurrence = one full day.
   */
  async getForgottenFingerprintByDate(
    empCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{ count: number; deductionDays: number }> {
    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        member_code: empCode,
        action_date: { gte: fromDate, lte: toDate },
      },
      select: { hdoor_time: true, ensraf_time: true },
    });
    const count = rows.reduce((total, row) => {
      const hasIn = Boolean(row.hdoor_time?.trim());
      const hasOut = Boolean(row.ensraf_time?.trim());
      return total + (hasIn !== hasOut ? 1 : 0);
    }, 0);
    const deductionDays =
      count === 0 ? 0 : 0.25 + (count >= 2 ? 0.5 : 0) + Math.max(0, count - 2);
    return { count, deductionDays };
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

  // ── Incentives / gym commissions ───────────────────────────────────────────

  /**
   * Gym incentives are calculated from Noamany documents. Subscription/class attribution
   * keeps the legacy employee/user bridge. Café attribution is the immutable employee and
   * explicit Protein classification captured when the completed sale was approved.
   */
  async getIncentives(
    employeeId: number,
    employeeCode: number,
    fromDate: string,
    toDate: string,
  ): Promise<{
    targetBase: number;
    proteinBase: number;
    classesBase: number;
    targetCommission: number;
    proteinCommission: number;
    classCommission: number;
  }> {
    const users = await this.prisma.users.findMany({
      where: { emp_code: employeeCode },
      select: { user_id: true },
    });
    const userIds = users.map((u) => u.user_id);
    const createdBy = userIds.length ? { in: userIds } : { in: [-1] };
    const settings = await this.prisma.tbl_gym_setting.findMany({
      select: { ttype: true, for_user: true },
      orderBy: { id: 'desc' },
    });
    const rate = (type: 'target' | 'proten' | 'classes') =>
      Number(settings.find((s) => s.ttype === type)?.for_user ?? 0) / 100;

    const [targetReceipts, lockers, sales, classReceipts] = await Promise.all([
      this.prisma.club_receipts.aggregate({
        where: {
          receipt_date: { gte: fromDate, lte: toDate },
          status: { in: ['مدفوعة', 'paid'] },
          subscription: {
            is: {
              is_special: false,
              type: { is: { is_part_of_target: true } },
              OR: [{ employee_id: employeeId }, { created_by: createdBy }],
            },
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.club_locker_subscriptions.aggregate({
        where: {
          subscription_start_date: { gte: fromDate, lte: toDate },
          OR: [{ recommended_employee_id: employeeId }, { created_by: createdBy }],
        },
        _sum: { paid_amount: true },
      }),
      this.prisma.sales_quick_sale_items.findMany({
        where: {
          sale: {
            business_date: { gte: fromDate, lte: toDate },
            status: 'completed',
            target_employee_id: employeeId,
          },
        },
        select: {
          id: true,
          business_classification: true,
          line_total: true,
          unit_price: true,
          quantity: true,
          free_quantity: true,
          sale: { select: { id: true, collected_amount: true } },
        },
      }),
      this.prisma.club_receipts.aggregate({
        where: {
          receipt_date: { gte: fromDate, lte: toDate },
          status: { in: ['مدفوعة', 'paid'] },
          subscription: {
            is: {
              is_special: true,
              OR: [{ employee_id: employeeId }, { created_by: createdBy }],
            },
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const targetBase =
      decimal(targetReceipts._sum.amount) + decimal(lockers._sum.paid_amount);
    const cafeLinesBySale = new Map<number, typeof sales>();
    for (const line of sales) {
      const group = cafeLinesBySale.get(line.sale.id) ?? [];
      group.push(line);
      cafeLinesBySale.set(line.sale.id, group);
    }
    const salesBase = [...cafeLinesBySale.values()].reduce((total, saleLines) => {
      const allocated = allocateCollectedCafeSale(saleLines.map((line) => ({
        classification: line.business_classification,
        grossAmount: decimal(line.line_total),
        paidAmount: decimal(line.unit_price) * Math.max(
          0,
          decimal(line.quantity) - Number(line.free_quantity ?? 0),
        ),
      })), decimal(saleLines[0].sale.collected_amount));
      return total + allocated
        .filter((line) => line.classification === 'protein')
        .reduce((sum, line) => sum + line.amount, 0);
    }, 0);
    const classesBase = decimal(classReceipts._sum.amount);
    return {
      targetBase: roundMoney(targetBase),
      proteinBase: roundMoney(salesBase),
      classesBase: roundMoney(classesBase),
      targetCommission: roundMoney(targetBase * rate('target')),
      proteinCommission: roundMoney(salesBase * rate('proten')),
      classCommission: roundMoney(classesBase * rate('classes')),
    };
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

/** Round a money amount to 2 decimals (avoids binary-float drift, e.g. 0.1+0.2). */
function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function legacyNetPay(totalEarnings: number, totalDeductions: number): number {
  return roundMoney(totalEarnings - totalDeductions);
}

/** The configured target commission is the default; an explicit sheet value replaces it. */
export function legacyTargetPayable(calculatedCommission: number, override?: number): number {
  return override ?? calculatedCommission;
}

/** nationality_type → { summed emp/society rate, whether any rows exist }. */
type InsuranceRateTable = Map<number, { emp: number; society: number; hasRows: boolean }>;

/** Inclusive day iterator over Y-m-d strings, computed in UTC to avoid TZ drift. */
function* eachDay(fromDate: string, toDate: string): Generator<string> {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

/** Weekday name for a Y-m-d string (UTC-stable, matches PHP DateTime::format('l')). */
function weekdayName(ds: string): string {
  return new Date(`${ds}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}
