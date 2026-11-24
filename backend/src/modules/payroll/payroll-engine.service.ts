import { EmployeeType, LeaveType } from '../../common/constants/hr-codes';
import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decimal, payrollPeriod } from './payroll-status.util';
import { legacyBusinessIsoDate, legacyDateMatchValues } from '../../common/utils/legacy-date.util';
import { finalApprovalSuspendFilter } from './leave-approval.util';
import { ScheduleResolver } from '../attendance-exceptions/scheduled-shifts.util';
import { ResolutionIndex, loadResolutions } from '../attendance-exceptions/resolutions.repo';
import { dayAbsence, forgottenFingerprint, lateTreatment, round4 } from './payroll-attendance.util';

/**
 * Per-employee attendance inputs shared by the absence, missing-punch and late calculations:
 * the scheduled shift slots (split shifts) and the managers' daily-exception resolutions.
 */
export interface PayrollAttendanceContext {
  schedule: ScheduleResolver | null;
  resolutions: ResolutionIndex;
}

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

    const attendanceCtx = await this.loadAttendanceContext(
      { id: emp.id, emp_code: empCode, branch_id_fk: emp.branch_id_fk },
      fromDate,
      toDate,
    );
    const absence = await this.getActualAbsence(empCode, fromDate, toDate, attendanceCtx);
    const keyab = await this.getKeyabByDate(empCode, fromDate, toDate);
    let absenceDays = absence.count;
    // Leave decided by a manager on the daily-exceptions page counts like an approved leave.
    let paidLeaveDays = round4(keyab.withSalaryDays + absence.resolutionLeave.paidDays);
    let unpaidLeaveDays = round4(keyab.withoutSalaryDays + absence.resolutionLeave.unpaidDays);
    let forgottenFingerprint = await this.getForgottenFingerprintByDate(empCode, fromDate, toDate, attendanceCtx);
    let late = await this.getLateByDate(empCode, fromDate, toDate, attendanceCtx);
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

  /**
   * Extra shifts (tbl_emps_shef_edafi ttype=2) paid as days — only those actually worked: a
   * tbl_hdoor_emps row with a punch for the same employee and date, and the same shift when the
   * extra shift names one. A booked extra shift that was never punched is not paid.
   */
  async getSheftEdafi(empCode: number, fromDate: string, toDate: string): Promise<number> {
    const extras = await this.prisma.tbl_emps_shef_edafi.findMany({
      where: {
        emp_code_fk: empCode,
        ttype: 2,
        sheft_date: { gte: fromDate, lte: toDate },
      },
      select: { sheft_date: true, dwam_id_fk: true },
    });
    if (!extras.length) return 0;
    const dates = [...new Set(extras.map((extra) => extra.sheft_date.slice(0, 10)))];
    const punches = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        member_code: empCode,
        OR: [
          { action_date: { in: dates } },
          { action_date_s: { in: dates.flatMap((date) => legacyDateMatchValues(date)) } },
        ],
      },
      select: { action_date: true, action_date_s: true, dwam_id_fk: true, hdoor_time: true, ensraf_time: true },
    });
    const worked = punches
      .filter((row) => Boolean(row.hdoor_time?.trim()) || Boolean(row.ensraf_time?.trim()))
      .map((row) => ({
        date: row.action_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
          ?? legacyBusinessIsoDate(row.action_date_s)?.slice(0, 10)
          ?? '',
        shiftId: row.dwam_id_fk,
      }));
    return extras.filter((extra) => {
      const date = extra.sheft_date.slice(0, 10);
      return worked.some((row) => row.date === date && (!extra.dwam_id_fk || row.shiftId === extra.dwam_id_fk));
    }).length;
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
    ctx?: PayrollAttendanceContext,
  ): Promise<{ lateWithPermission: number; lateWithoutPermission: number }> {
    const attendance = ctx ?? (await this.loadAttendanceContext({ emp_code: empCode }, fromDate, toDate));
    // Permissions count only once finally approved (not at the direct manager's step).
    const ozonat = await this.prisma.hr_all_ozonat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        ezn_date: { gte: fromDate, lte: toDate },
        suspend: finalApprovalSuspendFilter(),
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
      select: { late_min: true, action_date: true, dwam_id_fk: true },
    });

    let lateWithPermission = 0;
    let lateWithoutPermission = 0;
    for (const row of lateRows) {
      let late = Math.floor(row.late_min ?? 0);
      const date = row.action_date ?? '';
      const splitDay = this.countedSlots(attendance, empCode, date).length > 1;
      const resolution = splitDay
        ? attendance.resolutions.forSlot(date, row.dwam_id_fk)
        : attendance.resolutions.forDay(date, row.dwam_id_fk);
      const treatment = lateTreatment(resolution);
      if (treatment === 'drop') continue;
      if (approvedDates.has(date) || treatment === 'permission') {
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
    ctx?: PayrollAttendanceContext,
  ): Promise<{
    count: number;
    days: string[];
    /** Leave days granted by manager resolutions (fractions for a split-shift slot). */
    resolutionLeave: { paidDays: number; unpaidDays: number };
  }> {
    const attendanceCtx = ctx ?? (await this.loadAttendanceContext({ emp_code: empCode }, fromDate, toDate));
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
      select: { action_date: true, dwam_id_fk: true, sheft_type: true, hdoor_time: true, ensraf_time: true },
    });
    const rowsByDate = new Map<string, typeof attendance>();
    for (const row of attendance) {
      if (!row.action_date) continue;
      const list = rowsByDate.get(row.action_date) ?? [];
      list.push(row);
      rowsByDate.set(row.action_date, list);
    }
    const attendanceDates = [...rowsByDate.keys()];

    // 4) candidate absence: every working day; judged per scheduled shift slot in step 9.
    const fingerprintAbsence = allDates;

    // 5) finally-approved vacations (see leave-approval.util), excluding off-day.
    const vacations = await this.prisma.hr_all_agzat_orders.findMany({
      where: {
        emp_code_fk: empCode,
        suspend: finalApprovalSuspendFilter(),
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
          suspend: finalApprovalSuspendFilter(),
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

    // 9) final absence = working days − vacations − holidays − replacement-leave, each remaining
    //    day judged per scheduled shift slot and by the managers' resolutions (dayAbsence).
    const actualAbsence: string[] = [];
    let count = 0;
    const resolutionLeave = { paidDays: 0, unpaidDays: 0 };
    for (const d of fingerprintAbsence) {
      if (vacationDays.has(d) || officialHolidays.has(d) || replacementDays.has(d)) continue;
      const day = dayAbsence(
        d,
        this.countedSlots(attendanceCtx, empCode, d),
        rowsByDate.get(d) ?? [],
        attendanceCtx.resolutions,
      );
      if (day.fraction > 0) {
        actualAbsence.push(d);
        count += day.fraction;
      }
      for (const leave of day.leave) {
        if (leave.leaveTypeId === LeaveType.UNPAID) resolutionLeave.unpaidDays += leave.days;
        else resolutionLeave.paidDays += leave.days;
      }
    }
    return {
      count: round4(count),
      days: actualAbsence,
      resolutionLeave: {
        paidDays: round4(resolutionLeave.paidDays),
        unpaidDays: round4(resolutionLeave.unpaidDays),
      },
    };
  }

  /**
   * Schedule + resolutions for one employee over the window. `employee.id` / branch are looked up
   * when not supplied (direct calls of the public helpers).
   */
  async loadAttendanceContext(
    employee: { id?: number; emp_code: number; branch_id_fk?: number | null },
    fromDate: string,
    toDate: string,
  ): Promise<PayrollAttendanceContext> {
    let ref = employee.id != null
      ? { id: employee.id, emp_code: employee.emp_code, branch_id_fk: employee.branch_id_fk ?? null }
      : null;
    if (!ref) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (this.prisma as any).employees?.findFirst?.({
        where: { emp_code: employee.emp_code },
        select: { id: true, emp_code: true, branch_id_fk: true },
      });
      ref = found ? { id: found.id, emp_code: employee.emp_code, branch_id_fk: found.branch_id_fk ?? null } : null;
    }
    const schedule = ref
      ? await ScheduleResolver.load(this.prisma, [ref], fromDate, toDate, {
          defaultOffDay: this.defaultOffDay,
          includeSpecial: true,
        })
      : null;
    const resolutions = new ResolutionIndex(
      await loadResolutions(this.prisma, [employee.emp_code], fromDate, toDate),
    );
    return { schedule, resolutions };
  }

  /** Main/replacement shift slots scheduled for the date ([] when unknown → single-shift rules). */
  private countedSlots(ctx: PayrollAttendanceContext, empCode: number, date: string) {
    if (!ctx.schedule || !date) return [];
    return ctx.schedule.day(empCode, date).slots.filter((slot) => slot.source !== 'extra');
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
        suspend: finalApprovalSuspendFilter(),
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
   * Split-shift days count at most once, weighted by the affected shifts' share of the day; slots a
   * manager resolved on the daily-exceptions page are not penalised (payroll-attendance.util).
   */
  async getForgottenFingerprintByDate(
    empCode: number,
    fromDate: string,
    toDate: string,
    ctx?: PayrollAttendanceContext,
  ): Promise<{ count: number; deductionDays: number }> {
    const attendance = ctx ?? (await this.loadAttendanceContext({ emp_code: empCode }, fromDate, toDate));
    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        member_code: empCode,
        action_date: { gte: fromDate, lte: toDate },
      },
      select: { hdoor_time: true, ensraf_time: true, action_date: true, dwam_id_fk: true, sheft_type: true },
    });
    return forgottenFingerprint(
      rows,
      (date) => this.countedSlots(attendance, empCode, date),
      attendance.resolutions,
    );
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
   * Gym incentives are calculated from the live ONE80 documents. Attribution accepts either
   * the employee selected on the document or the authenticated user linked to that employee.
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
      this.prisma.sales_quick_sales.aggregate({
        where: {
          sale_date: { gte: fromDate, lte: toDate },
          status: 'completed',
          OR: [{ employee_id: employeeId }, { created_by: createdBy }],
        },
        _sum: { collected_amount: true },
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
    const salesBase = decimal(sales._sum.collected_amount);
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
