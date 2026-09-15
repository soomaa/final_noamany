import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { hr_solaf, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { todayIso } from '../../common/utils/legacy-date.util';
import {
  buildLoanInstallments,
  khsmToDateM,
  resolveLoanInstallmentCount,
} from '../../common/utils/loan-installments.util';
import { buildSuspendWhere, SuspendStatus, suspendToListStatus } from '../../common/utils/suspend-status.util';
import { isDryRun } from '../../common/preview/dry-run.util';
import { previewResponse } from '../../common/preview/preview.types';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ListLoansDto } from './dto/list-loans.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { PostponeInstallmentDto } from './dto/postpone-installment.dto';
import { computeLoanCeiling, LOAN_BADAL_CODES } from './loan-ceiling.util';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { JwtUser } from '../../common/types/jwt-user';
import { insertLegacyNotification } from '../../common/utils/legacy-notification.util';
import {
  ACCEPT_SUSPEND,
  LeaveStage,
  nextRecipientMosama,
  REJECT_SUSPEND,
} from '../leaves/approval-chain.util';

type MobileLoanCreate = {
  amount: number;
  repaymentMethod: 1 | 2 | 3;
  reason: string;
  installments?: number;
  deductionStartDate?: string;
};

type MobileLoanAction = { action: 'accept' | 'reject'; reason?: string };
type MobileLoanList = {
  page: number;
  perPage: number;
  mode?: 'sader' | 'wared' | 'accept' | 'reject' | 'cancelled';
};

export interface LoanRow {
  id: number;
  tRkm: number | null;
  employeeName: string | null;
  amount: number;
  remaining: number;
  installments: number;
  installmentAmount: number;
  repaymentMethod: number;
  deductionStartDate: string | null;
  status: string;
  createdAt: string | null;
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  async list(q: ListLoansDto) {
    const and: Prisma.hr_solafWhereInput[] = [];
    const statusWhere = buildSuspendWhere(q.status);
    if (statusWhere) and.push(statusWhere as Prisma.hr_solafWhereInput);
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ emp_name: { contains: s } }, { solaf_reason: { contains: s } }] });
    }

    const where: Prisma.hr_solafWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_solaf.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_solaf.count({ where }),
    ]);

    const tRkms = rows.map((r) => r.t_rkm).filter((v): v is number => v != null);
    const quests = tRkms.length
      ? await this.prisma.hr_solaf_quest.findMany({ where: { t_rkm_fk: { in: tRkms } } })
      : [];
    const questsByLoan = new Map<number, typeof quests>();
    for (const quest of quests) {
      if (quest.t_rkm_fk == null) continue;
      const list = questsByLoan.get(quest.t_rkm_fk) ?? [];
      list.push(quest);
      questsByLoan.set(quest.t_rkm_fk, list);
    }

    const data: LoanRow[] = rows.map((row) => {
      const loanQuests = row.t_rkm != null ? (questsByLoan.get(row.t_rkm) ?? []) : [];
      const remaining = loanQuests
        .filter((x) => x.paid !== 'yes')
        .reduce((sum, x) => sum + (x.value_of_qst ?? 0), 0);
      const allPaid = loanQuests.length > 0 && loanQuests.every((x) => x.paid === 'yes');
      return {
        id: row.id,
        tRkm: row.t_rkm,
        employeeName: row.emp_name,
        amount: row.qemt_solaf ?? 0,
        remaining: row.suspend != null && [1, 4].includes(row.suspend) ? remaining : (row.qemt_solaf ?? 0),
        installments: row.qst_num ?? 0,
        installmentAmount: row.qemt_qst ?? 0,
        repaymentMethod: row.sadad_solfa ?? 0,
        deductionStartDate: row.khsm_form_date_m,
        status: suspendToListStatus(row.suspend, allPaid),
        createdAt: row.t_rkm_date_m,
      };
    });

    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * Loan ceiling (حد السلفة) for an employee — mirrors get_had_solfa_new.
   * Also returns whether the employee currently has an unfinished active loan
   * (get_solf_suspend_new) so the FE can pre-validate.
   */
  async ceiling(empId: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id: empId },
      // The real legacy employee table may contain invalid values in unrelated
      // enum columns. Loan metadata only needs these display/identity fields.
      select: {
        id: true,
        employee: true,
        emp_code: true,
        mosma_wazefy_n: true,
        edara_n: true,
        qsm_n: true,
      },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const ceiling = await this.computeCeiling(emp.id);
    const aqsaSetting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const hasActiveLoan = await this.hasActiveLoan(emp.id);
    const previousLoans = await this.prisma.hr_solaf.findMany({
      where: { emp_id_fk: emp.id, suspend: SuspendStatus.APPROVED },
      orderBy: { t_rkm: 'desc' },
      select: { t_rkm_date_m: true },
    });

    return {
      empId: emp.id,
      employeeName: emp.employee,
      employeeCode: emp.emp_code,
      jobTitle: emp.mosma_wazefy_n,
      department: emp.edara_n,
      section: emp.qsm_n,
      ceiling,
      maxInstallments: aqsaSetting?.aqsa_moda_sadad ?? 0,
      hasActiveLoan,
      previousRequests: previousLoans.length,
      previousRequestDate: previousLoans[0]?.t_rkm_date_m ?? todayIso(),
    };
  }

  async formMeta() {
    const [maxRkm, setting] = await Promise.all([
      this.prisma.hr_solaf.aggregate({ _max: { t_rkm: true } }),
      this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } }),
    ]);
    return {
      nextRequestNumber: (maxRkm._max.t_rkm ?? 0) + 1,
      requestDate: todayIso(),
      maxInstallments: setting?.aqsa_moda_sadad ?? 0,
    };
  }

  /** Employee-app metadata. Identity is always derived from the JWT. */
  async mobileMeta(user: JwtUser) {
    const employee = await this.mobileEmployee(user);
    const meta = await this.ceiling(employee.id);
    return {
      ...meta,
      repaymentMethods: [
        { id: 1, name: 'دفع نقداً' },
        { id: 2, name: 'تخصم مرة واحدة من الراتب' },
        { id: 3, name: 'تخصم شهرياً من الراتب' },
      ],
    };
  }

  /** Mobile tabs: outgoing, incoming, accepted, rejected, and cancelled loan requests. */
  async mobileList(user: JwtUser, query: MobileLoanList) {
    const employee = await this.mobileEmployee(user);
    const mode = query.mode ?? 'sader';
    let where: Prisma.hr_solafWhereInput;
    switch (mode) {
      case 'wared':
        where = {
          current_to_user_id: user.sub,
          suspend: { in: [SuspendStatus.INCOMING, SuspendStatus.APPROVED_L1] },
        };
        break;
      case 'accept':
        where = { publisher: user.sub, suspend: { in: [SuspendStatus.APPROVED_L1, SuspendStatus.APPROVED] } };
        break;
      case 'reject':
        where = { publisher: user.sub, suspend: { in: [SuspendStatus.REJECTED, SuspendStatus.CANCELLED] } };
        break;
      case 'cancelled':
        where = { publisher: user.sub, suspend: SuspendStatus.CANCELLED };
        break;
      case 'sader':
      default:
        where = { OR: [{ publisher: user.sub }, { emp_id_fk: employee.id }] };
        break;
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_solaf.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.hr_solaf.count({ where }),
    ]);
    return paginated(rows.map((row) => this.mobileLoanRow(row, user.sub)), total, query.page, query.perPage);
  }

  async mobileDetail(user: JwtUser, id: number) {
    const employee = await this.mobileEmployee(user);
    const row = await this.prisma.hr_solaf.findFirst({
      where: {
        id,
        OR: [{ publisher: user.sub }, { emp_id_fk: employee.id }, { current_to_user_id: user.sub }],
      },
    });
    if (!row) throw new NotFoundException('طلب السلفة غير موجود أو غير متاح لك');
    return this.mobileLoanRow(row, user.sub);
  }

  /**
   * Creates a pending request and routes it to the direct manager. No schedule
   * or accounting entry is created until the general manager's final approval.
   */
  async mobileCreate(user: JwtUser, dto: MobileLoanCreate) {
    const employee = await this.mobileEmployee(user);
    if (!dto.reason?.trim()) throw new BadRequestException('سبب السلفة مطلوب');

    const openRequest = await this.prisma.hr_solaf.findFirst({
      where: {
        emp_id_fk: employee.id,
        OR: [
          { suspend: { in: [SuspendStatus.INCOMING, SuspendStatus.APPROVED_L1] } },
          { suspend: SuspendStatus.APPROVED, ended: 'no' },
        ],
      },
      select: { id: true },
    });
    if (openRequest) {
      throw new BadRequestException('لا يمكن تقديم سلفة جديدة لوجود طلب أو سلفة قائمة');
    }

    const ceiling = await this.computeCeiling(employee.id);
    if (ceiling > 0 && dto.amount > ceiling) {
      throw new BadRequestException(`قيمة السلفة تتجاوز الحد الأقصى المسموح به (${ceiling})`);
    }

    const installments = resolveLoanInstallmentCount(dto.repaymentMethod, dto.installments ?? 1);
    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const maxInstallments = setting?.aqsa_moda_sadad ?? 0;
    if (maxInstallments > 0 && installments > maxInstallments) {
      throw new BadRequestException(`عدد الأقساط يتجاوز الحد الأقصى المسموح به (${maxInstallments})`);
    }

    const deductionStartDate = dto.deductionStartDate ?? this.firstDayOfNextMonth();
    const installmentDrafts = buildLoanInstallments(dto.amount, installments, deductionStartDate);
    if (!installmentDrafts.length) throw new BadRequestException('تاريخ بداية الخصم غير صحيح');

    const managerRef = employee.manger ? Number(employee.manger) : NaN;
    const manager = Number.isInteger(managerRef) && managerRef > 0
      ? await this.prisma.employees.findFirst({
          where: { OR: [{ id: managerRef }, { emp_code: managerRef }] },
          select: { id: true, emp_code: true, employee: true },
        })
      : null;
    let managerUser = manager
      ? await this.prisma.users.findFirst({ where: { emp_code: manager.id, approved: 1 } })
      : null;
    if (!managerUser && manager?.emp_code != null) {
      managerUser = await this.prisma.users.findFirst({ where: { emp_code: manager.emp_code, approved: 1 } });
    }
    const hrRecipient = !managerUser ? await this.resolveByMosama(44) : null;
    if (!managerUser && !hrRecipient) {
      throw new BadRequestException('لا يوجد مدير مباشر أو مسؤول موارد بشرية لاستلام طلب السلفة');
    }
    const initialRecipient = managerUser
      ? { userId: managerUser.user_id, name: manager?.employee ?? null, employeeId: manager?.id ?? null }
      : hrRecipient!;
    const goesStraightToHr = !managerUser;

    const [previousCount, previousLoan] = await Promise.all([
      this.prisma.hr_solaf.count({ where: { emp_id_fk: employee.id, suspend: SuspendStatus.APPROVED } }),
      this.prisma.hr_solaf.findFirst({
        where: { emp_id_fk: employee.id, suspend: SuspendStatus.APPROVED },
        orderBy: { t_rkm: 'desc' },
      }),
    ]);

    const requestDate = todayIso();
    const row = await retryOnUniqueViolation(() => this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.hr_solaf.aggregate({ _max: { t_rkm: true } });
      return tx.hr_solaf.create({
        data: {
          t_rkm: (aggregate._max.t_rkm ?? 0) + 1,
          t_rkm_date_m: requestDate,
          emp_id_fk: employee.id,
          emp_code_fk: employee.emp_code,
          emp_name: employee.employee,
          edara_id_fk: employee.edara_id ?? 0,
          edara_n: employee.edara_n,
          qsm_id_fk: employee.qsm_id ?? 0,
          qsm_n: employee.qsm_n,
          job_title: employee.mosma_wazefy_n,
          qemt_solaf: dto.amount,
          qemt_qst: dto.amount / installments,
          sadad_solfa: dto.repaymentMethod,
          qst_num: installments,
          khsm_form_date_m: deductionStartDate,
          khsm_to_date_m: khsmToDateM(deductionStartDate, installments),
          hd_solfa: ceiling,
          solaf_reason: dto.reason.trim(),
          num_previous_requests: previousCount,
          previous_request_date_m: previousLoan?.t_rkm_date_m ?? requestDate,
          suspend: SuspendStatus.INCOMING,
          direct_manager_id_fk: manager?.id ?? null,
          direct_manager_code_fk: manager?.emp_code ?? null,
          direct_manager_n: manager?.employee ?? null,
          action_direct_manager: goesStraightToHr ? 1 : 0,
          action_mowazf_moktas: goesStraightToHr ? 1 : 0,
          action_moder_hr: 0,
          action_moder_fr: 0,
          action_moder_final: 0,
          current_from_user_id: user.sub,
          current_from_user_name: employee.employee ?? user.name ?? '',
          current_to_user_id: initialRecipient.userId,
          current_to_user_name: initialRecipient.name,
          talab_in_fk: initialRecipient.employeeId ?? 0,
          talab_in_title: goesStraightToHr ? 'مسؤول الموارد البشرية' : 'المدير المباشر',
          level: goesStraightToHr ? 4 : 2,
          talab_msg: 'طلب سلفة جديد',
          reason_action: '',
          ended: 'no',
          publisher: user.sub,
        },
      });
    }));

    await insertLegacyNotification(this.prisma, row.id, 101, user.sub, initialRecipient.userId);
    return this.mobileLoanRow(row, user.sub);
  }

  /** Same four approval stations used by leave requests. */
  async mobileAction(user: JwtUser, id: number, dto: MobileLoanAction) {
    const row = await this.findLoanOrThrow(id);
    if (row.current_to_user_id !== user.sub) {
      throw new BadRequestException('هذا الطلب غير محول إليك');
    }
    const stage = this.mobileLoanStage(row);
    if (!stage) throw new BadRequestException('لا يوجد إجراء متاح على هذا الطلب');

    const employee = row.emp_id_fk
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk } })
      : null;
    let toUserId: number | null = row.publisher ?? null;
    let toUserName: string | null = row.emp_name;
    let suspend: number;

    if (dto.action === 'accept') {
      // Keep every intermediate station pending in the loans module. The loan
      // only becomes financially approved (suspend=4) at the final station.
      suspend = stage === 'approve_moder_3am'
        ? ACCEPT_SUSPEND[stage]
        : SuspendStatus.APPROVED_L1;
      if (stage !== 'approve_moder_3am') {
        const mosama = nextRecipientMosama(stage, {
          empType: employee?.emp_type ?? null,
          edaraId: employee?.edara_id ?? null,
        });
        const recipient = mosama == null ? null : await this.resolveByMosama(mosama);
        toUserId = recipient?.userId ?? row.publisher ?? null;
        toUserName = recipient?.name ?? row.emp_name;
      }
    } else {
      suspend = REJECT_SUSPEND[stage];
    }

    const flagField = this.mobileStageFlag(stage);
    const updateData: Record<string, unknown> = {
      [flagField]: dto.action === 'accept' ? 1 : 2,
      suspend,
      current_from_user_id: user.sub,
      current_from_user_name: user.name ?? '',
      current_to_user_id: toUserId ?? 0,
      current_to_user_name: toUserName,
      talab_msg: dto.action === 'accept' ? 'تم اعتماد مرحلة الطلب' : 'تم رفض الطلب',
      reason_action: dto.reason?.trim() ?? '',
    };

    if (stage === 'approve_moder_3am' && dto.action === 'accept') {
      if (!row.t_rkm || !row.qst_num || !row.qemt_solaf || !row.khsm_form_date_m) {
        throw new BadRequestException('بيانات السلفة غير مكتملة');
      }
      const drafts = buildLoanInstallments(row.qemt_solaf, row.qst_num, row.khsm_form_date_m);
      if (!drafts.length) throw new BadRequestException('بيانات أقساط السلفة غير صحيحة');
      await this.moduleLedger.ensureChart();
      await this.prisma.$transaction(async (tx) => {
        await tx.hr_solaf_quest.deleteMany({ where: { t_rkm_fk: row.t_rkm! } });
        await tx.hr_solaf_quest.createMany({
          data: drafts.map((draft) => ({
            t_rkm_fk: row.t_rkm,
            emp_code_fk: row.emp_code_fk,
            value_of_qst: draft.amount,
            month: draft.month,
            year: draft.year,
            qst_date_ar: draft.dueDate,
            qst_date: draft.qstDate,
            paid: 'no',
          })),
        });
        await tx.hr_solaf.update({
          where: { id },
          data: updateData as Prisma.hr_solafUpdateInput,
        });
        await this.moduleLedger.postEmployeeLoanDisbursement({
          loanNumber: row.t_rkm!,
          branchId: employee?.branch_id_fk ?? undefined,
          date: row.t_rkm_date_m ?? todayIso(),
          amount: row.qemt_solaf!,
          employeeName: row.emp_name,
          createdBy: user.sub,
        }, tx);
      });
    } else {
      await this.prisma.hr_solaf.update({
        where: { id },
        data: updateData as Prisma.hr_solafUpdateInput,
      });
    }

    const notificationCode = stage === 'approve_direct_manager' ? 105
      : stage === 'approve_moder_edara' ? 106
        : stage === 'approve_hr' ? 107
          : dto.action === 'accept' ? 110 : 111;
    await insertLegacyNotification(this.prisma, id, notificationCode, user.sub, toUserId);
    if (row.publisher != null && row.publisher !== toUserId && row.publisher !== user.sub) {
      await insertLegacyNotification(this.prisma, id, notificationCode, user.sub, row.publisher);
    }
    return { id, stage, status: suspendToListStatus(suspend), suspend };
  }

  async mobileCancel(user: JwtUser, id: number) {
    const employee = await this.mobileEmployee(user);
    const row = await this.prisma.hr_solaf.findFirst({
      where: { id, emp_id_fk: employee.id, publisher: user.sub },
    });
    if (!row) throw new NotFoundException('طلب السلفة غير موجود');
    if (row.suspend !== SuspendStatus.INCOMING || row.action_direct_manager !== 0) {
      throw new BadRequestException('لا يمكن إلغاء الطلب بعد بدء إجراءات الموافقة');
    }
    await this.prisma.hr_solaf.update({
      where: { id },
      data: {
        suspend: SuspendStatus.CANCELLED,
        reason_action: 'cancel',
        current_from_user_id: user.sub,
        current_from_user_name: user.name ?? employee.employee ?? '',
        current_to_user_id: user.sub,
        current_to_user_name: employee.employee,
      },
    });
    return { id, status: 'cancelled' };
  }

  /** SUM(value) grouped by badl_code (100..106) for the employee, then the ceiling formula. */
  private async computeCeiling(empId: number): Promise<number> {
    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    if (!setting) return 0;

    const codes = LOAN_BADAL_CODES.map((b) => b.code);
    const grouped = await this.prisma.hr_finance_employes.groupBy({
      by: ['badl_code'],
      where: { emp_id: empId, badl_code: { in: codes } },
      _sum: { value: true },
    });
    const sumByCode = new Map<number, number>();
    for (const g of grouped) {
      if (g.badl_code != null) sumByCode.set(g.badl_code, g._sum.value ?? 0);
    }
    return computeLoanCeiling(setting, sumByCode);
  }

  /** get_solf_suspend_new: an active loan = suspend 4 AND ended='no'. */
  private async hasActiveLoan(empId: number): Promise<boolean> {
    const active = await this.prisma.hr_solaf.findFirst({
      where: { emp_id_fk: empId, suspend: SuspendStatus.APPROVED, ended: 'no' },
      select: { id: true },
    });
    return active != null;
  }

  async create(dto: CreateLoanDto, publisherId?: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    // Eligibility guard (get_solf_suspend_new): block a new loan while one is active/unfinished.
    if (await this.hasActiveLoan(emp.id)) {
      throw new BadRequestException('لا يمكن تقديم سلفة جديدة لوجود سلفة قائمة لم تُسدّد بعد');
    }

    // Loan ceiling guard (get_had_solfa_new): requested amount must not exceed the ceiling.
    const ceiling = await this.computeCeiling(emp.id);
    if (ceiling > 0 && dto.amount > ceiling) {
      throw new BadRequestException(`قيمة السلفة تتجاوز الحد الأقصى المسموح به (${ceiling})`);
    }

    // The legacy form forces cash and one-time payroll repayment to one installment.
    const installments = resolveLoanInstallmentCount(dto.sadadSolfa, dto.installments);

    // Max installments cap (aqsa_moda_sadad).
    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const maxInstallments = setting?.aqsa_moda_sadad ?? 0;
    if (maxInstallments > 0 && installments > maxInstallments) {
      throw new BadRequestException(`عدد الأقساط يتجاوز الحد الأقصى المسموح به (${maxInstallments})`);
    }

    const requestDate = dto.requestDate ?? todayIso();
    const qemtQst = Math.round(dto.amount / installments);
    const drafts = buildLoanInstallments(dto.amount, installments, dto.deductionStartDate);
    if (drafts.length !== installments) {
      throw new BadRequestException('تاريخ بداية الخصم غير صحيح');
    }

    const prevCount = await this.prisma.hr_solaf.count({
      where: { emp_id_fk: emp.id, suspend: SuspendStatus.APPROVED },
    });
    const lastLoan = await this.prisma.hr_solaf.findFirst({
      where: { emp_id_fk: emp.id, suspend: SuspendStatus.APPROVED },
      orderBy: { t_rkm: 'desc' },
    });

    await this.moduleLedger.ensureChart();

    // The old add_solfa path creates an approved loan and its schedule in one save.
    // Keep that workflow, while generating the request number safely on the server.
    const loan = await retryOnUniqueViolation(async () => {
      return this.prisma.$transaction(async (tx) => {
        const maxRkm = await tx.hr_solaf.aggregate({ _max: { t_rkm: true } });
        const tRkm = (maxRkm._max.t_rkm ?? 0) + 1;
        const created = await tx.hr_solaf.create({
          data: {
            t_rkm: tRkm,
            t_rkm_date_m: requestDate,
            emp_id_fk: emp.id,
            emp_code_fk: emp.emp_code,
            emp_name: emp.employee,
            edara_id_fk: emp.edara_id ?? 0,
            edara_n: emp.edara_n,
            qsm_id_fk: emp.qsm_id ?? 0,
            qsm_n: emp.qsm_n,
            job_title: emp.mosma_wazefy_n,
            qemt_solaf: dto.amount,
            qemt_qst: qemtQst,
            sadad_solfa: dto.sadadSolfa,
            qst_num: installments,
            khsm_form_date_m: dto.deductionStartDate,
            khsm_to_date_m: khsmToDateM(dto.deductionStartDate, installments),
            solaf_reason: dto.reason ?? '',
            num_previous_requests: prevCount,
            previous_request_date_m: lastLoan?.t_rkm_date_m ?? requestDate,
            suspend: SuspendStatus.APPROVED,
            level: 0,
            ended: 'no',
            publisher: publisherId ?? 0,
            action_direct_manager: 0,
            action_mowazf_moktas: 0,
            action_moder_hr: 0,
            action_moder_fr: 0,
            action_moder_final: 0,
            current_from_user_id: publisherId ?? 0,
            current_from_user_name: emp.employee ?? '',
            current_to_user_id: 0,
            talab_in_fk: 0,
            talab_in_title: '',
            talab_msg: '',
            reason_action: '',
          },
        });

        await tx.hr_solaf_quest.createMany({
          data: drafts.map((draft) => ({
            t_rkm_fk: tRkm,
            emp_code_fk: emp.emp_code,
            value_of_qst: draft.amount,
            month: draft.month,
            year: draft.year,
            qst_date_ar: draft.dueDate,
            qst_date: draft.qstDate,
            paid: 'no',
          })),
        });

        await this.moduleLedger.postEmployeeLoanDisbursement(
          {
            loanNumber: tRkm,
            branchId: emp.branch_id_fk ?? undefined,
            date: requestDate,
            amount: dto.amount,
            employeeName: emp.employee,
            createdBy: publisherId,
          },
          tx,
        );

        return created;
      });
    });

    return { id: loan.id, tRkm: loan.t_rkm, status: 'approved', installments };
  }

  async approve(id: number, userId?: number) {
    const loan = await this.findLoanOrThrow(id);
    if (loan.suspend != null && [1, 4].includes(loan.suspend)) {
      throw new BadRequestException('السلفة معتمدة مسبقًا');
    }
    if (!loan.t_rkm || !loan.qst_num || !loan.qemt_solaf || !loan.khsm_form_date_m) {
      throw new BadRequestException('بيانات السلفة غير مكتملة');
    }

    const drafts = buildLoanInstallments(loan.qemt_solaf, loan.qst_num, loan.khsm_form_date_m);
    const employee = loan.emp_id_fk
      ? await this.prisma.employees.findUnique({
          where: { id: loan.emp_id_fk },
          select: { branch_id_fk: true },
        })
      : null;
    await this.moduleLedger.ensureChart();
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_solaf_quest.deleteMany({ where: { t_rkm_fk: loan.t_rkm! } });
      if (drafts.length) {
        await tx.hr_solaf_quest.createMany({
          data: drafts.map((d) => ({
            t_rkm_fk: loan.t_rkm,
            emp_code_fk: loan.emp_code_fk,
            value_of_qst: d.amount,
            month: d.month,
            year: d.year,
            qst_date_ar: d.dueDate,
            qst_date: d.qstDate,
            paid: 'no',
          })),
        });
      }
      await tx.hr_solaf.update({
        where: { id },
        data: { suspend: SuspendStatus.APPROVED, ended: 'no' },
      });
      await this.moduleLedger.postEmployeeLoanDisbursement(
        {
          loanNumber: loan.t_rkm!,
          branchId: employee?.branch_id_fk ?? undefined,
          date: loan.t_rkm_date_m ?? todayIso(),
          amount: loan.qemt_solaf!,
          employeeName: loan.emp_name,
          createdBy: userId,
        },
        tx,
      );
    });
    return { id, status: 'approved' };
  }

  async reject(id: number) {
    const loan = await this.findLoanOrThrow(id);
    await this.prisma.hr_solaf.update({ where: { id }, data: { suspend: SuspendStatus.REJECTED } });
    return { id, status: 'rejected', tRkm: loan.t_rkm };
  }

  async schedule(id: number) {
    const loan = await this.findLoanOrThrow(id);
    if (!loan.t_rkm) throw new BadRequestException('رقم السلفة غير موجود');

    const quests = await this.prisma.hr_solaf_quest.findMany({
      where: { t_rkm_fk: loan.t_rkm },
      orderBy: [{ qst_date_ar: 'asc' }, { id: 'asc' }],
    });

    const installments = quests.map((q, idx) => ({
      id: q.id,
      no: idx + 1,
      month: q.month,
      year: q.year,
      dueDate: q.qst_date_ar,
      amount: q.value_of_qst ?? 0,
      paid: q.paid === 'yes',
      pending: q.paid === 'wait',
      datePaid: q.date_paid,
    }));

    const total = installments.reduce((s, x) => s + x.amount, 0);
    const paid = installments.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);

    return {
      loan: {
        id: loan.id,
        tRkm: loan.t_rkm,
        employeeName: loan.emp_name,
        amount: loan.qemt_solaf,
        installments: loan.qst_num,
        status: suspendToListStatus(loan.suspend),
        ended: loan.ended,
      },
      installments,
      summary: { total, paid, remaining: total - paid },
    };
  }

  /**
   * Mark a single installment paid — mirrors Solaf::update_quest (paid='yes').
   * Also performs the auto-deduct hook: when the LAST unpaid installment of a
   * loan is settled, the loan is flagged ended='yes' (end_solfa).
   */
  async payInstallment(questId: number, dto: PayInstallmentDto, userId?: number) {
    const quest = await this.prisma.hr_solaf_quest.findUnique({ where: { id: questId } });
    if (!quest) throw new NotFoundException('القسط غير موجود');
    if (quest.paid === 'yes') throw new BadRequestException('تم سداد هذا القسط مسبقًا');

    const loan = quest.t_rkm_fk
      ? await this.prisma.hr_solaf.findFirst({ where: { t_rkm: quest.t_rkm_fk } })
      : null;
    const employee = loan?.emp_id_fk
      ? await this.prisma.employees.findUnique({
          where: { id: loan.emp_id_fk },
          select: { branch_id_fk: true },
        })
      : null;
    await this.moduleLedger.ensureChart();
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_solaf_quest.update({
        where: { id: questId },
        data: {
          paid: 'yes',
          date_paid: todayIso(),
          time_paid: new Date().toTimeString().slice(0, 8),
          paid_sarf_person: dto.paidBy ?? null,
        },
      });
      await this.moduleLedger.postEmployeeLoanRepayment(
        {
          installmentId: questId,
          branchId: employee?.branch_id_fk ?? undefined,
          date: todayIso(),
          amount: quest.value_of_qst ?? 0,
          employeeName: loan?.emp_name,
          createdBy: userId,
        },
        tx,
      );
    });

    await this.settleLoanIfFullyPaid(quest.t_rkm_fk);
    return { id: questId, paid: true };
  }

  /**
   * Auto-deduct hook: settle (mark paid) the current month's installment for an
   * employee's active loan, e.g. when payroll is run. Mirrors the legacy
   * monthly deduction where the matching `month` quest is set paid='yes'.
   */
  async autoDeduct(loanId: number, month?: number) {
    await this.findLoanOrThrow(loanId);
    void month;
    throw new BadRequestException(
      'لا يمكن خصم قسط السلفة منفرداً؛ يتم الخصم والترحيل المحاسبي من خلال مسيرة الرواتب',
    );
  }

  /** end_solfa: once no unpaid/pending quests remain, the loan is closed. */
  private async settleLoanIfFullyPaid(tRkm: number | null) {
    if (tRkm == null) return;
    const outstanding = await this.prisma.hr_solaf_quest.count({
      where: { t_rkm_fk: tRkm, paid: { not: 'yes' } },
    });
    if (outstanding === 0) {
      await this.prisma.hr_solaf.updateMany({ where: { t_rkm: tRkm }, data: { ended: 'yes' } });
    }
  }

  /**
   * Postponement (تأجيل قسط / تعجيل) — faithful port of make_tagel_transformation_direct.
   * Records the request in hr_solaf_ta3gel (the current/active postponement table —
   * the legacy controller resolves it via get_solfa_ta3gel_by_id) and redistributes
   * the deferred amount across the remaining installments according to `mode` (fe2a).
   */
  async postponeInstallment(
    loanId: number,
    dto: PostponeInstallmentDto,
    publisherId?: number,
    publisherName?: string | null,
    dryRun = false,
  ) {
    const loan = await this.findLoanOrThrow(loanId);
    if (loan.suspend !== 4) throw new BadRequestException('السلفة غير معتمدة');
    if (!loan.t_rkm) throw new BadRequestException('رقم السلفة غير موجود');
    const tRkm = loan.t_rkm;

    const month = dto.month;
    const fe2a = dto.mode;

    const monthQuest = await this.prisma.hr_solaf_quest.findFirst({
      where: { t_rkm_fk: tRkm, month },
      orderBy: { id: 'asc' },
    });
    if (!monthQuest) throw new NotFoundException('لا يوجد قسط لهذا الشهر');
    if (monthQuest.paid === 'yes') throw new BadRequestException('لا يمكن تأجيل قسط مسدّد');
    const qemtQst = monthQuest.value_of_qst ?? 0;

    const unpaid = await this.prisma.hr_solaf_quest.findMany({
      where: { t_rkm_fk: tRkm, paid: 'no' },
      orderBy: [{ qst_date_ar: 'asc' }, { id: 'asc' }],
    });

    if (isDryRun(dryRun)) {
      return previewResponse(
        { loanId, month, mode: fe2a, deferredAmount: qemtQst },
        {
          rows: unpaid.map((q, i) => ({
            label: `قسط ${i + 1} (${q.month}/${q.year})`,
            before: String(q.value_of_qst ?? 0),
            after:
              q.month === month
                ? '0 (مؤجل)'
                : fe2a === 1 && q.month === (month < 12 ? month + 1 : 1)
                  ? String(Math.round((q.value_of_qst ?? 0) + qemtQst))
                  : String(q.value_of_qst ?? 0),
          })),
          warning: 'سيتم إعادة توزيع مبلغ القسط المؤجل على الأقساط المتبقية',
        },
      );
    }

    // The installment being postponed (legacy get_qemt_qst by month).

    // Record the postponement request (hr_solaf_ta3gel). suspend=1 mirrors the
    // legacy make_tagel_transformation_direct which sets the ta3gel row suspend=1.
    const maxRkm = await this.prisma.hr_solaf_ta3gel.aggregate({ _max: { t_rkm: true } });
    await this.prisma.hr_solaf_ta3gel.create({
      data: {
        t_rkm: (maxRkm._max.t_rkm ?? 0) + 1,
        solfa_rkm: tRkm,
        t_rkm_date_m: todayIso(),
        emp_id_fk: loan.emp_id_fk,
        emp_code_fk: loan.emp_code_fk,
        emp_name: loan.emp_name,
        edara_id_fk: loan.edara_id_fk,
        qsm_id_fk: loan.qsm_id_fk,
        edara_n: loan.edara_n,
        qsm_n: loan.qsm_n,
        job_title: loan.job_title,
        fe2a_ta3gel: fe2a,
        for_month: String(month),
        qemt_qst: Math.round(qemtQst),
        ta3gel_reason: dto.reason ?? null,
        suspend: SuspendStatus.APPROVED_L1,
        publisher: publisherId ?? 0,
        publisher_name: publisherName ?? null,
        current_from_user_id: publisherId ?? 0,
        current_from_user_name: publisherName ?? null,
      },
    });

    // Relocate the deferred installment's amount so the schedule sum stays exactly
    // equal to the principal (the legacy code left the deferred amount on the 'wait'
    // row AND added it to other rows, over-collecting one full installment; the 'wait'
    // row also blocked the loan from ever closing). We zero the postponed row and mark
    // it resolved ('yes'), then add its amount to the target installment(s).
    const round2 = (n: number) => Math.round(n * 100) / 100;
    await this.prisma.$transaction(async (tx) => {
      // Zero + resolve the postponed month (skipped now, recovered elsewhere).
      await tx.hr_solaf_quest.updateMany({
        where: { t_rkm_fk: tRkm, month },
        data: { value_of_qst: 0, paid: 'yes' },
      });

      // Re-open the deferred row unchanged if there is nowhere to relocate the amount,
      // so nothing is silently lost.
      const reopenDeferred = async () => {
        await tx.hr_solaf_quest.updateMany({
          where: { t_rkm_fk: tRkm, month },
          data: { value_of_qst: qemtQst, paid: 'no' },
        });
      };

      if (fe2a === 1) {
        // Roll the deferred amount into the NEXT unpaid installment (wraps 12 -> 1).
        const nextMonth = month < 12 ? month + 1 : 1;
        const next = await tx.hr_solaf_quest.findFirst({
          where: { t_rkm_fk: tRkm, month: nextMonth, paid: 'no' },
          orderBy: { id: 'asc' },
        });
        if (next) {
          await tx.hr_solaf_quest.update({
            where: { id: next.id },
            data: { value_of_qst: round2((next.value_of_qst ?? 0) + qemtQst) },
          });
        } else {
          await reopenDeferred();
        }
      } else if (fe2a === 2) {
        // Roll the deferred amount into the LAST unpaid installment.
        const last = await tx.hr_solaf_quest.findFirst({
          where: { t_rkm_fk: tRkm, paid: 'no' },
          orderBy: { id: 'desc' },
        });
        if (last) {
          await tx.hr_solaf_quest.update({
            where: { id: last.id },
            data: { value_of_qst: round2((last.value_of_qst ?? 0) + qemtQst) },
          });
        } else {
          await reopenDeferred();
        }
      } else if (fe2a === 3) {
        // Spread the deferred amount equally across remaining unpaid installments,
        // last row absorbing the rounding remainder so the total moved == qemtQst.
        const remaining = await tx.hr_solaf_quest.findMany({
          where: { t_rkm_fk: tRkm, paid: 'no' },
          orderBy: { id: 'asc' },
        });
        if (remaining.length > 0) {
          const share = round2(qemtQst / remaining.length);
          let distributed = 0;
          for (let i = 0; i < remaining.length; i++) {
            const q = remaining[i];
            const add = i === remaining.length - 1 ? round2(qemtQst - distributed) : share;
            distributed = round2(distributed + share);
            await tx.hr_solaf_quest.update({
              where: { id: q.id },
              data: { value_of_qst: round2((q.value_of_qst ?? 0) + add) },
            });
          }
        } else {
          await reopenDeferred();
        }
      } else if (fe2a === 4) {
        // Move the deferred amount to a brand-new installment one month after the latest.
        const latest = await tx.hr_solaf_quest.findFirst({
          where: { t_rkm_fk: tRkm },
          orderBy: { qst_date_ar: 'desc' },
        });
        const baseDate = latest?.qst_date_ar ? new Date(latest.qst_date_ar) : new Date();
        const next = new Date(baseDate);
        next.setMonth(next.getMonth() + 1);
        const dueDate = this.formatDate(next);
        await tx.hr_solaf_quest.create({
          data: {
            t_rkm_fk: tRkm,
            emp_code_fk: loan.emp_code_fk,
            value_of_qst: qemtQst,
            qst_date_ar: dueDate,
            qst_date: String(Math.floor(next.getTime() / 1000)),
            paid: 'no',
            year: next.getFullYear(),
            month: next.getMonth() + 1,
          },
        });
      } else {
        // Unknown mode: don't lose the amount.
        await reopenDeferred();
      }
    });

    return { loanId, month, mode: fe2a, status: 'postponed' };
  }

  /**
   * Per-month statement grid — mirrors get_solf_report.
   * For each approved loan, a 12-cell row (month 1..12) of the installment due
   * that month, plus paid flag. Includes whole-fund aggregate totals.
   */
  async statementGrid() {
    const loans = await this.prisma.hr_solaf.findMany({
      where: { suspend: SuspendStatus.APPROVED },
      orderBy: { t_rkm: 'desc' },
    });

    const tRkms = loans.map((l) => l.t_rkm).filter((v): v is number => v != null);
    const quests = tRkms.length
      ? await this.prisma.hr_solaf_quest.findMany({ where: { t_rkm_fk: { in: tRkms } } })
      : [];

    // index quests by loan -> month
    const byLoanMonth = new Map<number, Map<number, (typeof quests)[number]>>();
    for (const q of quests) {
      if (q.t_rkm_fk == null || q.month == null) continue;
      const m = byLoanMonth.get(q.t_rkm_fk) ?? new Map();
      m.set(q.month, q);
      byLoanMonth.set(q.t_rkm_fk, m);
    }

    const rows = loans.map((loan) => {
      const months: Record<number, { amount: number; paid: boolean; pending: boolean } | null> = {};
      const m = loan.t_rkm != null ? byLoanMonth.get(loan.t_rkm) : undefined;
      for (let i = 1; i <= 12; i++) {
        const q = m?.get(i);
        months[i] = q
          ? { amount: q.value_of_qst ?? 0, paid: q.paid === 'yes', pending: q.paid === 'wait' }
          : null;
      }
      const loanQuests = loan.t_rkm != null ? quests.filter((x) => x.t_rkm_fk === loan.t_rkm) : [];
      const paidCount = loanQuests.filter((x) => x.paid === 'yes').length;
      const notPaidCount = loanQuests.filter((x) => x.paid !== 'yes').length;
      return {
        id: loan.id,
        tRkm: loan.t_rkm,
        employeeName: loan.emp_name,
        edara: loan.edara_n,
        amount: loan.qemt_solaf ?? 0,
        installments: loan.qst_num ?? 0,
        ended: loan.ended,
        paidCount,
        notPaidCount,
        months,
      };
    });

    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const sumAllSolaf = loans.reduce((s, l) => s + (l.qemt_solaf ?? 0), 0);
    const sumPaid = quests.filter((q) => q.paid === 'yes').reduce((s, q) => s + (q.value_of_qst ?? 0), 0);
    const sumNotPaid = quests.filter((q) => q.paid !== 'yes').reduce((s, q) => s + (q.value_of_qst ?? 0), 0);

    return {
      rows,
      summary: {
        sumAllSolaf,
        sumPaid,
        sumNotPaid,
        da3m: setting?.da3m_value ?? 0,
        count: loans.length,
      },
    };
  }

  async statement() {
    const approved = await this.prisma.hr_solaf.findMany({ where: { suspend: SuspendStatus.APPROVED } });
    const tRkms = approved.map((r) => r.t_rkm).filter((v): v is number => v != null);
    const quests = tRkms.length
      ? await this.prisma.hr_solaf_quest.findMany({
          where: { t_rkm_fk: { in: tRkms } },
        })
      : [];

    const totalLoans = approved.reduce((s, r) => s + (r.qemt_solaf ?? 0), 0);
    const paid = quests.filter((q) => q.paid === 'yes').reduce((s, q) => s + (q.value_of_qst ?? 0), 0);
    const remaining = quests.filter((q) => q.paid !== 'yes').reduce((s, q) => s + (q.value_of_qst ?? 0), 0);
    const supportFund = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });

    return {
      totalLoans,
      paid,
      remaining,
      supportFund: supportFund?.da3m_value ?? 0,
      count: approved.length,
    };
  }

  async remove(id: number) {
    const loan = await this.findLoanOrThrow(id);
    if (loan.t_rkm) {
      await this.prisma.hr_solaf_quest.deleteMany({ where: { t_rkm_fk: loan.t_rkm } });
    }
    await this.prisma.hr_solaf.delete({ where: { id } });
    return { id };
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async mobileEmployee(user: JwtUser) {
    if (user.emp_code == null) throw new BadRequestException('الحساب غير مرتبط بموظف');
    // Legacy invariant: users.emp_code stores employees.id.
    const employee = await this.prisma.employees.findUnique({
      where: { id: user.emp_code },
      // Avoid decoding unrelated legacy enum columns imported from the old DB.
      select: {
        id: true,
        emp_code: true,
        employee: true,
        branch_id_fk: true,
        manger: true,
        edara_id: true,
        edara_n: true,
        qsm_id: true,
        qsm_n: true,
        mosma_wazefy_n: true,
      },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  private firstDayOfNextMonth() {
    const now = new Date();
    return this.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  }

  private mobileLoanStage(row: hr_solaf): LeaveStage | null {
    if (row.suspend === SuspendStatus.REJECTED || row.suspend === SuspendStatus.CANCELLED) return null;
    if (row.action_direct_manager === 0) return 'approve_direct_manager';
    if (row.action_direct_manager === 1 && row.action_mowazf_moktas === 0) return 'approve_moder_edara';
    if (row.action_mowazf_moktas === 1 && row.action_moder_hr === 0) return 'approve_hr';
    if (row.action_moder_hr === 1 && row.action_moder_final === 0) return 'approve_moder_3am';
    return null;
  }

  private mobileStageFlag(stage: LeaveStage) {
    switch (stage) {
      case 'approve_direct_manager': return 'action_direct_manager';
      case 'approve_moder_edara': return 'action_mowazf_moktas';
      case 'approve_hr': return 'action_moder_hr';
      case 'approve_moder_3am': return 'action_moder_final';
    }
  }

  private async resolveByMosama(
    code: number,
  ): Promise<{ userId: number; name: string | null; employeeId: number | null } | null> {
    const setting = await this.prisma.hr_egraat_emp_setting.findFirst({
      where: { job_title_code_fk: code, person_suspend: 1 },
    });
    if (!setting?.person_id) return null;
    const account = await this.prisma.users.findFirst({
      where: { emp_code: setting.person_id, role_id_fk: 3, approved: 1 },
    });
    return account
      ? { userId: account.user_id, name: setting.person_name ?? null, employeeId: setting.person_id }
      : null;
  }

  private mobileLoanRow(row: hr_solaf, currentUserId: number) {
    const stage = this.mobileLoanStage(row);
    const stageNames: Record<LeaveStage, string> = {
      approve_direct_manager: 'موافقة المدير المباشر',
      approve_moder_edara: 'موافقة مدير الإدارة',
      approve_hr: 'موافقة الموارد البشرية',
      approve_moder_3am: 'الموافقة النهائية',
    };
    const repaymentNames: Record<number, string> = {
      1: 'دفع نقداً',
      2: 'تخصم مرة واحدة من الراتب',
      3: 'تخصم شهرياً من الراتب',
    };
    const status = row.suspend === SuspendStatus.APPROVED && row.action_moder_final === 1
      ? 'approved'
      : row.suspend === SuspendStatus.CANCELLED
        ? 'cancelled'
        : row.suspend === SuspendStatus.REJECTED
          ? 'rejected'
        : 'pending';
    return {
      id: row.id,
      requestNumber: row.t_rkm,
      requestDate: row.t_rkm_date_m,
      employeeId: row.emp_id_fk,
      employeeName: row.emp_name,
      amount: row.qemt_solaf ?? 0,
      reason: row.solaf_reason ?? '',
      repaymentMethod: row.sadad_solfa ?? 0,
      repaymentMethodName: repaymentNames[row.sadad_solfa ?? 0] ?? '',
      installments: row.qst_num ?? 0,
      installmentAmount: row.qemt_qst ?? 0,
      deductionStartDate: row.khsm_form_date_m,
      deductionEndDate: row.khsm_to_date_m,
      status,
      suspend: row.suspend ?? 0,
      currentStage: stage,
      currentStageName: stage ? stageNames[stage] : '',
      currentToUserId: row.current_to_user_id,
      currentToUserName: row.current_to_user_name,
      reasonAction: row.reason_action,
      canAction: stage != null && row.current_to_user_id === currentUserId,
      canCancel:
        row.publisher === currentUserId &&
        row.suspend === SuspendStatus.INCOMING &&
        row.action_direct_manager === 0,
    };
  }

  private async findLoanOrThrow(id: number) {
    const loan = await this.prisma.hr_solaf.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException('السلفة غير موجودة');
    return loan;
  }
}
