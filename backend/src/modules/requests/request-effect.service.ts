import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertDateOrder, assertPositive, assertTimeOrder } from '../../common/validators/validation.util';
import { buildLoanInstallments, khsmToDateM } from '../../common/utils/loan-installments.util';
import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { cairoDateString, dateOnlyEpochSeconds } from '../../common/utils/cairo-date';
import { FailClosedHrLedgerAdapter, HR_LEDGER_ADAPTER, HrLedgerAdapter } from '../../ports/accounting/hr-ledger.adapter';
import { markEmployeeExited } from '../employees/employee-exit.util';
import { resolveEngineBadlCode } from '../payroll/salary-component.util';
import { syncEmployeeUserRole } from '../rbac/job-title-role.util';
import { allocateDocumentNumber } from '../../common/number-series/document-number-series';
import { computeComponentAmount } from '../payroll/salary-component.util';
import { computeLoanCeiling, LOAN_BADAL_CODES } from '../loans/loan-ceiling.util';
import { LeavesService } from '../leaves/leaves.service';
import { inclusiveLeaveDays } from '../leaves/leave-balance.policy';

type Tx = Prisma.TransactionClient;
type Employee = Prisma.employeesGetPayload<Record<string, never>>;

export interface RequestEffectResult {
  snapshot: Prisma.InputJsonObject;
  result: Prisma.InputJsonObject;
}

const DATA_CHANGE_FIELDS: Record<string, keyof Prisma.employeesUncheckedUpdateInput> = {
  phone: 'phone',
  mobile: 'phone',
  'رقم الجوال': 'phone',
  email: 'email',
  'البريد الإلكتروني': 'email',
  address: 'adress',
  adress: 'adress',
  'العنوان': 'adress',
  another_phone: 'another_phone',
  'رقم بديل': 'another_phone',
};

function requiredString(payload: Record<string, unknown>, key: string, label: string): string {
  const value = String(payload[key] ?? '').trim();
  if (!value) throw new BadRequestException(`${label} مطلوب`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new BadRequestException(`${label} غير صالح`);
  }
  return number;
}

@Injectable()
export class RequestEffectService {
  constructor(
    @Optional() @Inject(HR_LEDGER_ADAPTER)
    private readonly ledger: HrLedgerAdapter = new FailClosedHrLedgerAdapter(),
    private readonly leaves: LeavesService,
  ) {}

  async prepare(type: string): Promise<void> {
    if (type === 'loan' || type === 'advance') await this.ledger.ensureReady();
  }

  async apply(
    tx: Tx,
    type: string,
    requestId: number,
    employeeId: number | null,
    employeeCode: number | null,
    payload: Record<string, unknown>,
    actorUserId: number,
  ): Promise<RequestEffectResult> {
    const employee = employeeId
      ? await tx.employees.findUnique({ where: { id: employeeId } })
      : employeeCode
        ? await tx.employees.findFirst({ where: { emp_code: employeeCode } })
        : null;
    if (!employee) throw new NotFoundException('الموظف المرتبط بالطلب غير موجود');
    if (employee.leave_emp === 1 && type !== 'salary-certificate') {
      throw new BadRequestException('لا يمكن تنفيذ الطلب لموظف منتهي الخدمة');
    }

    switch (type) {
      case 'leave':
        return this.leave(tx, employee, payload);
      case 'permission':
        return this.permission(tx, employee, payload);
      case 'advance':
      case 'loan':
        return this.loan(tx, employee, payload, actorUserId, type === 'loan');
      case 'allowance':
        return this.allowance(tx, employee, payload, actorUserId);
      case 'salary-certificate':
        return this.salaryCertificate(tx, employee, payload);
      case 'resignation':
        return this.resignation(tx, employee, payload, actorUserId);
      case 'transfer':
        return this.transfer(tx, employee, payload, actorUserId);
      case 'promotion':
        return this.promotion(tx, employee, payload);
      case 'data-change':
        return this.dataChange(tx, employee, payload);
      default:
        throw new BadRequestException(`لا يوجد منفذ معتمد لنوع الطلب: ${type}`);
    }
  }

  private async leave(tx: Tx, employee: Employee, payload: Record<string, unknown>) {
    const from = requiredString(payload, 'date_from', 'تاريخ بداية الإجازة');
    const to = requiredString(payload, 'date_to', 'تاريخ نهاية الإجازة');
    const days = inclusiveLeaveDays(from, to);
    const leaveTypeId = positiveInteger(payload.leave_type_id, 'نوع الإجازة');
    const leaveType = await tx.holiday_setting.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) throw new BadRequestException('نوع الإجازة غير موجود');
    if (leaveType.min_days != null && leaveType.min_days > 0 && days < leaveType.min_days) {
      throw new BadRequestException(`الحد الأدنى لهذا النوع ${leaveType.min_days} يوم`);
    }
    if (leaveType.max_days != null && leaveType.max_days > 0 && days > leaveType.max_days) {
      throw new BadRequestException(`الحد الأقصى لهذا النوع ${leaveType.max_days} يوم`);
    }
    await this.leaves.assertLeaveAvailable(tx, employee, leaveTypeId, from, to, days);
    const max = await tx.hr_all_agzat_orders.aggregate({ _max: { agaza_rkm: true } });
    const number = await allocateDocumentNumber(tx, 'hr.leave', (max._max.agaza_rkm ?? 0) + 1);
    const created = await tx.hr_all_agzat_orders.create({
      data: {
        agaza_rkm: number,
        agaza_date_ar: cairoDateString(),
        emp_id_fk: employee.id,
        emp_code_fk: employee.emp_code != null ? BigInt(employee.emp_code) : undefined,
        edara_id_fk: employee.edara_id,
        edara_n: employee.edara_n,
        qsm_id_fk: employee.qsm_id,
        qsm_n: employee.qsm_n,
        no3_agaza: leaveTypeId,
        agaza_from_date_m: from,
        agaza_to_date_m: to,
        num_days: days,
        month: Number(from.slice(5, 7)),
        year: Number(from.slice(0, 4)),
        reason: String(payload.notes ?? payload.reason ?? ''),
        suspend: SuspendStatus.APPROVED,
      },
    });
    return {
      snapshot: { from, to, days, leaveTypeId, employeeId: employee.id },
      result: { domain: 'hr_all_agzat_orders', id: created.id, number },
    };
  }

  private async permission(tx: Tx, employee: Employee, payload: Record<string, unknown>) {
    const date = requiredString(payload, 'permission_date', 'تاريخ الإذن');
    assertDateOrder(date, date);
    const from = requiredString(payload, 'time_from', 'وقت البداية');
    const to = requiredString(payload, 'time_to', 'وقت النهاية');
    assertTimeOrder(from, to);
    const reason = requiredString(payload, 'reason', 'سبب الإذن');
    const max = await tx.hr_all_ozonat_orders.aggregate({ _max: { ezn_rkm: true } });
    const number = await allocateDocumentNumber(tx, 'hr.permission', (max._max.ezn_rkm ?? 0) + 1);
    const created = await tx.hr_all_ozonat_orders.create({
      data: {
        ezn_rkm: number,
        ezn_date_ar: cairoDateString(),
        emp_id_fk: employee.id,
        emp_code_fk: employee.emp_code ?? undefined,
        emp_name: employee.employee,
        edara_id_fk: employee.edara_id,
        edara_n: employee.edara_n,
        qsm_id_fk: employee.qsm_id,
        qsm_n: employee.qsm_n,
        job_title: employee.mosma_wazefy_n,
        date_ar: date,
        from_hour: from,
        to_hour: to,
        reason,
        suspend: SuspendStatus.APPROVED,
      },
    });
    return {
      snapshot: { date, from, to, reason, employeeId: employee.id },
      result: { domain: 'hr_all_ozonat_orders', id: created.id, number },
    };
  }

  private async loan(
    tx: Tx,
    employee: Employee,
    payload: Record<string, unknown>,
    actorUserId: number,
    isLoan: boolean,
  ) {
    const amountRaw = assertPositive(payload.amount, 'المبلغ');
    if (!Number.isInteger(amountRaw)) throw new BadRequestException('المبلغ يجب أن يكون رقمًا صحيحًا');
    const installments = isLoan
      ? positiveInteger(payload.installments, 'عدد الأقساط')
      : positiveInteger(payload.installments ?? 1, 'عدد الأقساط');
    const deductionStart = String(payload.deductionStartDate ?? cairoDateString());
    assertDateOrder(deductionStart, deductionStart);
    const active = await tx.hr_solaf.findFirst({
      where: { emp_id_fk: employee.id, suspend: SuspendStatus.APPROVED, ended: 'no' },
      select: { id: true },
    });
    if (active) throw new BadRequestException('لا يمكن اعتماد الطلب لوجود سلفة قائمة لم تُسدّد');
    const setting = await tx.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    if ((setting?.aqsa_moda_sadad ?? 0) > 0 && installments > setting!.aqsa_moda_sadad!) {
      throw new BadRequestException(`عدد الأقساط يتجاوز الحد الأقصى (${setting!.aqsa_moda_sadad})`);
    }
    if (setting) {
      const finance = await tx.hr_finance_employes.findMany({ where: { emp_id: employee.id } });
      const catalogIds = [...new Set(finance.map((row) => row.badl_discount_id_fk).filter((id) => id > 0))];
      const catalogs = catalogIds.length
        ? await tx.all_defined_setting.findMany({
            where: { defined_id: { in: catalogIds } },
            select: { defined_id: true, defined_title: true },
          })
        : [];
      const catalogById = new Map(catalogs.map((row) => [row.defined_id, row]));
      const basic = Number(employee.basic_salary ?? 0);
      const sumByCode = new Map<number, number>();
      if (basic > 0) sumByCode.set(100, basic);
      for (const row of finance) {
        if (row.badl_type === 2) continue;
        const code = resolveEngineBadlCode({
          badlCode: row.badl_code,
          catalogId: row.badl_discount_id_fk,
          title: catalogById.get(row.badl_discount_id_fk)?.defined_title,
        });
        if (code == null || !LOAN_BADAL_CODES.some((candidate) => candidate.code === code)) continue;
        const component = computeComponentAmount({
          value: row.value ?? 0,
          method: row.method_to_count,
          basicSalary: basic,
          periodDays: 30,
        });
        sumByCode.set(code, (sumByCode.get(code) ?? 0) + component);
      }
      const ceiling = computeLoanCeiling(setting, sumByCode);
      if (ceiling > 0 && amountRaw > ceiling) {
        throw new BadRequestException(`قيمة السلفة تتجاوز الحد الأقصى المسموح به (${ceiling})`);
      }
    }
    const max = await tx.hr_solaf.aggregate({ _max: { t_rkm: true } });
    const number = await allocateDocumentNumber(tx, 'hr.loan', (max._max.t_rkm ?? 0) + 1);
    const previousCount = await tx.hr_solaf.count({ where: { emp_id_fk: employee.id } });
    const previous = await tx.hr_solaf.findFirst({
      where: { emp_id_fk: employee.id },
      orderBy: { id: 'desc' },
      select: { t_rkm_date_m: true },
    });
    const loan = await tx.hr_solaf.create({
      data: {
        t_rkm: number,
        t_rkm_date_m: cairoDateString(),
        emp_id_fk: employee.id,
        emp_code_fk: employee.emp_code,
        emp_name: employee.employee,
        edara_id_fk: employee.edara_id ?? 0,
        edara_n: employee.edara_n,
        qsm_id_fk: employee.qsm_id ?? 0,
        qsm_n: employee.qsm_n,
        job_title: employee.mosma_wazefy_n,
        qemt_solaf: amountRaw,
        qemt_qst: amountRaw / installments,
        qst_num: installments,
        khsm_form_date_m: deductionStart,
        khsm_to_date_m: khsmToDateM(deductionStart, installments),
        solaf_reason: String(payload.reason ?? (isLoan ? 'قرض' : 'سلفة')),
        num_previous_requests: previousCount,
        previous_request_date_m: previous?.t_rkm_date_m ?? null,
        suspend: SuspendStatus.APPROVED,
        level: 0,
        ended: 'no',
        publisher: actorUserId,
        action_direct_manager: 0,
        action_mowazf_moktas: 0,
        action_moder_hr: 0,
        action_moder_fr: 0,
        action_moder_final: 0,
        current_from_user_id: actorUserId,
        current_from_user_name: employee.employee ?? '',
        current_to_user_id: 0,
        talab_in_fk: 0,
        talab_in_title: '',
        talab_msg: '',
        reason_action: 'approved_from_request',
      },
    });
    const schedule = buildLoanInstallments(amountRaw, installments, deductionStart);
    await tx.hr_solaf_quest.createMany({
      data: schedule.map((item) => ({
        t_rkm_fk: number,
        emp_code_fk: employee.emp_code,
        value_of_qst: item.amount,
        month: item.month,
        year: item.year,
        qst_date_ar: item.dueDate,
        qst_date: item.qstDate,
        paid: 'no',
      })),
    });
    await this.ledger.postEmployeeLoanDisbursement({
      loanNumber: number,
      branchId: employee.branch_id_fk ?? undefined,
      date: cairoDateString(),
      amount: amountRaw,
      employeeName: employee.employee,
      createdBy: actorUserId,
    }, tx);
    return {
      snapshot: { employeeId: employee.id, amount: amountRaw, installments, deductionStart },
      result: { domain: 'hr_solaf', id: loan.id, number, scheduleCount: schedule.length },
    };
  }

  private async allowance(
    tx: Tx,
    employee: Employee,
    payload: Record<string, unknown>,
    actorUserId: number,
  ) {
    const catalogId = positiveInteger(payload.allowance_type_id, 'نوع البدل');
    const amount = assertPositive(payload.amount, 'قيمة البدل');
    const catalog = await tx.all_defined_setting.findUnique({ where: { defined_id: catalogId } });
    if (!catalog || catalog.defined_type === 2) throw new BadRequestException('نوع البدل غير صالح');
    const current = await tx.hr_finance_employes.findMany({ where: { emp_id: employee.id } });
    const allowanceTotal = current
      .filter((row) => row.badl_type === 1)
      .reduce((sum, row) => sum + (row.value ?? 0), amount);
    const deductionTotal = current
      .filter((row) => row.badl_type === 2)
      .reduce((sum, row) => sum + (row.value ?? 0), 0);
    const insuredAllowanceTotal = current
      .filter((row) => row.badl_type === 1 && row.insurance_affect === 1)
      .reduce((sum, row) => sum + (row.value ?? 0), 0);
    await tx.hr_finance_employes.updateMany({
      where: { emp_id: employee.id },
      data: {
        having_all_value: allowanceTotal,
        discut_all_value: deductionTotal,
        having_tamin_value: insuredAllowanceTotal,
      },
    });
    const created = await tx.hr_finance_employes.create({
      data: {
        emp_id: employee.id,
        emp_code: employee.emp_code ?? 0,
        badl_discount_id_fk: catalogId,
        badl_code: resolveEngineBadlCode({ catalogId, title: catalog.defined_title }),
        badl_type: 1,
        value: amount,
        method_to_count: 1,
        specific_period: '0',
        insurance_affect: 0,
        having_all_value: allowanceTotal,
        discut_all_value: deductionTotal,
        having_tamin_value: insuredAllowanceTotal,
        publisher: actorUserId,
      },
    });
    return {
      snapshot: { employeeId: employee.id, catalogId, amount, reason: String(payload.reason ?? '') },
      result: { domain: 'hr_finance_employes', id: created.id },
    };
  }

  private async salaryCertificate(tx: Tx, employee: Employee, payload: Record<string, unknown>) {
    const purpose = requiredString(payload, 'purpose', 'الغرض من التعريف');
    const company = await tx.global_settings.findFirst({
      select: {
        institute_name: true,
        institute_code: true,
        institute_email: true,
        address: true,
        currency: true,
        currency_symbol: true,
      },
    });
    const finance = await tx.hr_finance_employes.findMany({ where: { emp_id: employee.id } });
    const allowances = finance
      .filter((row) => row.badl_type === 1)
      .reduce((sum, row) => sum + (row.value ?? 0), 0);
    const deductions = finance
      .filter((row) => row.badl_type === 2)
      .reduce((sum, row) => sum + (row.value ?? 0), 0);
    const basicSalary = Number(employee.basic_salary ?? 0);
    const snapshot: Prisma.InputJsonObject = {
      employeeId: employee.id,
      employeeCode: employee.emp_code ?? null,
      employeeName: employee.employee ?? null,
      jobTitle: employee.mosma_wazefy_n ?? null,
      branchId: employee.branch_id_fk ?? null,
      issuedOn: cairoDateString(),
      directedTo: String(payload.directed_to ?? '').trim() || null,
      purpose,
      basicSalary,
      allowances,
      deductions,
      grossSalary: basicSalary + allowances,
      netBeforeStatutory: basicSalary + allowances - deductions,
      company: company ?? null,
    };
    return { snapshot, result: { domain: 'salary_certificate_snapshot', immutable: true } };
  }

  private async resignation(
    tx: Tx,
    employee: Employee,
    payload: Record<string, unknown>,
    actorUserId: number,
  ) {
    const lastWorkDay = requiredString(payload, 'last_work_day', 'آخر يوم عمل');
    assertDateOrder(lastWorkDay, lastWorkDay);
    const reason = requiredString(payload, 'reason', 'سبب الاستقالة');
    const created = await tx.hr_tayi_qyed.create({
      data: {
        emp_id: String(employee.id),
        edara_id_fk: String(employee.edara_id ?? ''),
        qsm_id_fk: String(employee.qsm_id ?? ''),
        direct_manger_id_fk: employee.manger ?? '',
        from_date: String(dateOnlyEpochSeconds(lastWorkDay)),
        from_date_ar: lastWorkDay,
        to_date: String(dateOnlyEpochSeconds(lastWorkDay)),
        to_date_ar: lastWorkDay,
        date: String(Math.floor(Date.now() / 1000)),
        date_s: String(Math.floor(Date.now() / 1000)),
        publisher: String(actorUserId),
      },
    });
    await markEmployeeExited(tx, {
      employeeId: employee.id,
      lastWorkingDate: lastWorkDay,
      reason: `استقالة: ${reason}`,
      actorUserId,
    });
    return {
      snapshot: { employeeId: employee.id, lastWorkDay, reason },
      result: { domain: 'hr_tayi_qyed', id: created.id, offboarded: true },
    };
  }

  private async transfer(
    tx: Tx,
    employee: Employee,
    payload: Record<string, unknown>,
    actorUserId: number,
  ) {
    const branchId = positiveInteger(payload.target_branch_id, 'الفرع المستهدف');
    const branch = await tx.tbl_branches.findUnique({ where: { branch_id: branchId } });
    if (!branch) throw new BadRequestException('الفرع المستهدف غير موجود');
    const departmentId = payload.target_department_id
      ? positiveInteger(payload.target_department_id, 'الإدارة المستهدفة')
      : null;
    const department = departmentId
      ? await tx.hr_edarat_aqsam.findUnique({ where: { id: departmentId } })
      : null;
    if (departmentId && !department) throw new BadRequestException('الإدارة المستهدفة غير موجودة');
    const before = { branchId: employee.branch_id_fk, departmentId: employee.edara_id };
    await tx.employees.update({
      where: { id: employee.id },
      data: {
        branch_id_fk: branchId,
        ...(department ? { edara_id: department.id, edara_n: department.title } : {}),
      },
    });
    const history = await tx.employees_branches.create({
      data: {
        branch_id_fk: branchId,
        emp_id_fk: employee.id,
        date: cairoDateString(),
        publisher: actorUserId,
      },
    });
    return {
      snapshot: { employeeId: employee.id, before, branchId, departmentId },
      result: { domain: 'employees', id: employee.id, historyId: history.id },
    };
  }

  private async promotion(tx: Tx, employee: Employee, payload: Record<string, unknown>) {
    const jobIdRaw = payload.new_job_title_id ?? payload.new_job_title;
    const jobId = Number(jobIdRaw);
    const job = Number.isInteger(jobId) && jobId > 0
      ? await tx.department_jobs.findUnique({ where: { id: jobId } })
      : await tx.department_jobs.findFirst({
          where: { name: String(jobIdRaw ?? '').trim(), status: { not: 2 } },
        });
    if (!job) throw new BadRequestException('المسمى الوظيفي الجديد يجب أن يكون مسمى مسجلًا');
    const salary = payload.new_salary == null || payload.new_salary === ''
      ? null
      : assertPositive(payload.new_salary, 'الراتب الجديد');
    const before = {
      jobTitleId: employee.mosma_wazefy_code,
      jobTitle: employee.mosma_wazefy_n,
      basicSalary: Number(employee.basic_salary ?? 0),
    };
    await tx.employees.update({
      where: { id: employee.id },
      data: {
        mosma_wazefy_code: job.id,
        mosma_wazefy_n: job.name,
        ...(salary != null ? { basic_salary: salary } : {}),
      },
    });
    await syncEmployeeUserRole(tx, employee.id);
    return {
      snapshot: { employeeId: employee.id, before, jobTitleId: job.id, jobTitle: job.name, salary },
      result: { domain: 'employees', id: employee.id },
    };
  }

  private async dataChange(tx: Tx, employee: Employee, payload: Record<string, unknown>) {
    const requested = requiredString(payload, 'field_name', 'الحقل المطلوب تعديله').toLowerCase();
    const field = DATA_CHANGE_FIELDS[requested];
    if (!field) throw new BadRequestException('هذا الحقل لا يمكن تعديله من خلال طلب تعديل البيانات');
    const newValue = requiredString(payload, 'new_value', 'القيمة الجديدة');
    const currentValue = String(employee[field as keyof Employee] ?? '');
    const submittedOld = String(payload.old_value ?? '').trim();
    if (submittedOld && submittedOld !== currentValue) {
      throw new BadRequestException('القيمة الحالية تغيرت؛ راجع البيانات وأعد تقديم الطلب');
    }
    await tx.employees.update({
      where: { id: employee.id },
      data: { [field]: newValue },
    });
    return {
      snapshot: { employeeId: employee.id, field: String(field), before: currentValue, after: newValue },
      result: { domain: 'employees', id: employee.id },
    };
  }
}
