import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { cairoDateString, cairoMidnightUtc, dateOnlyParts } from '../../common/utils/cairo-date';
import { todayIso } from '../../common/utils/legacy-date.util';
import { addCalendarMonths, buildLoanInstallments, khsmToDateM } from '../../common/utils/loan-installments.util';
import { buildSuspendWhere, SuspendStatus, suspendToListStatus } from '../../common/utils/suspend-status.util';
import { isDryRun } from '../../common/preview/dry-run.util';
import { previewResponse } from '../../common/preview/preview.types';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ListLoansDto } from './dto/list-loans.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { PostponeInstallmentDto } from './dto/postpone-installment.dto';
import { computeLoanCeiling, LOAN_BADAL_CODES } from './loan-ceiling.util';
import { computeComponentAmount, resolveEngineBadlCode } from '../payroll/salary-component.util';
import { FailClosedHrLedgerAdapter, HR_LEDGER_ADAPTER, HrLedgerAdapter } from '../../ports/accounting/hr-ledger.adapter';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

export interface LoanRow {
  id: number;
  employeeName: string | null;
  amount: number;
  remaining: number;
  installments: number;
  status: string;
  createdAt: string | null;
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrScope: HrDataScopeService,
    @Optional() @Inject(HR_LEDGER_ADAPTER)
    private readonly moduleLedger: HrLedgerAdapter = new FailClosedHrLedgerAdapter(),
  ) {}

  async list(q: ListLoansDto, user?: JwtUser) {
    const and: Prisma.hr_solafWhereInput[] = [];
    and.push(await this.loanScopeWhere(user));
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
        employeeName: row.emp_name,
        amount: row.qemt_solaf ?? 0,
        remaining: row.suspend != null && [1, 4].includes(row.suspend) ? remaining : (row.qemt_solaf ?? 0),
        installments: row.qst_num ?? 0,
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
  async ceiling(empId: number, user?: JwtUser) {
    await this.assertEmployeeAllowed(empId, user);
    const emp = await this.prisma.employees.findUnique({ where: { id: empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const ceiling = await this.computeCeiling(emp.id);
    const aqsaSetting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const hasActiveLoan = await this.hasActiveLoan(emp.id);

    return {
      empId: emp.id,
      ceiling,
      maxInstallments: aqsaSetting?.aqsa_moda_sadad ?? 0,
      hasActiveLoan,
    };
  }

  /** SUM(value) grouped by badl_code (100..106) for the employee, then the ceiling formula. */
  private async computeCeiling(empId: number): Promise<number> {
    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    if (!setting) return 0;

    const emp = await this.prisma.employees.findUnique({
      where: { id: empId },
      select: { basic_salary: true, emp_code: true },
    });
    const rows = await this.prisma.hr_finance_employes.findMany({ where: { emp_id: empId } });
    const catalogIds = [
      ...new Set(rows.map((r) => r.badl_discount_id_fk).filter((n): n is number => n != null && n > 0)),
    ];
    const catalogs = catalogIds.length
      ? await this.prisma.all_defined_setting.findMany({
          where: { defined_id: { in: catalogIds } },
          select: { defined_id: true, defined_title: true },
        })
      : [];
    const catalogById = new Map(catalogs.map((c) => [c.defined_id, c]));
    const basic = Number(emp?.basic_salary ?? 0);
    const sumByCode = new Map<number, number>();
    if (basic > 0) sumByCode.set(100, basic);
    for (const row of rows) {
      if (row.badl_type === 2) continue;
      const catalog = row.badl_discount_id_fk ? catalogById.get(row.badl_discount_id_fk) : undefined;
      const code = resolveEngineBadlCode({
        badlCode: row.badl_code,
        catalogId: row.badl_discount_id_fk,
        title: catalog?.defined_title,
      });
      if (code == null || !LOAN_BADAL_CODES.some((b) => b.code === code)) continue;
      const amount = computeComponentAmount({
        value: row.value ?? 0,
        method: row.method_to_count,
        basicSalary: basic,
        periodDays: 30,
      });
      sumByCode.set(code, (sumByCode.get(code) ?? 0) + amount);
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

  async create(dto: CreateLoanDto, publisherId?: number, user?: JwtUser) {
    await this.assertEmployeeAllowed(dto.empId, user);
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

    // Max installments cap (aqsa_moda_sadad).
    const setting = await this.prisma.hr_solaf_main_setting.findFirst({ where: { id: 1 } });
    const maxInstallments = setting?.aqsa_moda_sadad ?? 0;
    if (maxInstallments > 0 && dto.installments > maxInstallments) {
      throw new BadRequestException(`عدد الأقساط يتجاوز الحد الأقصى المسموح به (${maxInstallments})`);
    }

    const today = cairoDateString();
    const qemtQst = Math.round(dto.amount / dto.installments);

    const prevCount = await this.prisma.hr_solaf.count({ where: { emp_id_fk: emp.id } });
    const lastLoan = await this.prisma.hr_solaf.findFirst({
      where: { emp_id_fk: emp.id },
      orderBy: { id: 'desc' },
    });

    // Race-safe loan تسلسل (t_rkm): recompute max+1 and insert together, retrying on a concurrent collision.
    const loan = await retryOnUniqueViolation(async () => {
      const maxRkm = await this.prisma.hr_solaf.aggregate({ _max: { t_rkm: true } });
      const tRkm = (maxRkm._max.t_rkm ?? 0) + 1;
      return this.prisma.hr_solaf.create({
      data: {
        t_rkm: tRkm,
        t_rkm_date_m: today,
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
        sadad_solfa: dto.sadadSolfa ?? 0,
        qst_num: dto.installments,
        khsm_form_date_m: dto.deductionStartDate,
        khsm_to_date_m: khsmToDateM(dto.deductionStartDate, dto.installments),
        solaf_reason: dto.reason ?? '',
        num_previous_requests: prevCount,
        previous_request_date_m: lastLoan?.t_rkm_date_m ?? null,
        suspend: SuspendStatus.INCOMING,
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
    });

    return { id: loan.id, tRkm: loan.t_rkm };
  }

  async approve(id: number, userId?: number, user?: JwtUser) {
    const loan = await this.findLoanOrThrow(id, user);
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
    await this.moduleLedger.ensureReady();
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

  async reject(id: number, user?: JwtUser) {
    const loan = await this.findLoanOrThrow(id, user);
    await this.prisma.hr_solaf.update({ where: { id }, data: { suspend: SuspendStatus.REJECTED } });
    return { id, status: 'rejected', tRkm: loan.t_rkm };
  }

  async schedule(id: number, user?: JwtUser) {
    const loan = await this.findLoanOrThrow(id, user);
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
  async payInstallment(questId: number, dto: PayInstallmentDto, userId?: number, user?: JwtUser) {
    const quest = await this.prisma.hr_solaf_quest.findUnique({ where: { id: questId } });
    if (!quest) throw new NotFoundException('القسط غير موجود');
    if (quest.paid === 'yes') throw new BadRequestException('تم سداد هذا القسط مسبقًا');

    const loan = quest.t_rkm_fk
      ? await this.prisma.hr_solaf.findFirst({ where: { t_rkm: quest.t_rkm_fk } })
      : null;
    if (!loan) throw new NotFoundException('السلفة غير موجودة');
    await this.assertLoanAllowed(loan, user);
    const employee = loan?.emp_id_fk
      ? await this.prisma.employees.findUnique({
          where: { id: loan.emp_id_fk },
          select: { branch_id_fk: true },
        })
      : null;
    await this.moduleLedger.ensureReady();
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_solaf_quest.update({
        where: { id: questId },
        data: {
          paid: 'yes',
          date_paid: cairoDateString(),
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
  async autoDeduct(loanId: number, month?: number, user?: JwtUser) {
    await this.findLoanOrThrow(loanId, user);
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
    user?: JwtUser,
  ) {
    const loan = await this.findLoanOrThrow(loanId, user);
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
        const baseDate = latest?.qst_date_ar ?? cairoDateString();
        const dueDate = addCalendarMonths(baseDate, 1);
        const { year, month: dueMonth } = dateOnlyParts(dueDate);
        await tx.hr_solaf_quest.create({
          data: {
            t_rkm_fk: tRkm,
            emp_code_fk: loan.emp_code_fk,
            value_of_qst: qemtQst,
            qst_date_ar: dueDate,
            qst_date: String(Math.floor(cairoMidnightUtc(dueDate).getTime() / 1000)),
            paid: 'no',
            year,
            month: dueMonth,
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
  async statementGrid(user?: JwtUser) {
    const loans = await this.prisma.hr_solaf.findMany({
      where: { AND: [{ suspend: SuspendStatus.APPROVED }, await this.loanScopeWhere(user)] },
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

  async statement(user?: JwtUser) {
    const approved = await this.prisma.hr_solaf.findMany({
      where: { AND: [{ suspend: SuspendStatus.APPROVED }, await this.loanScopeWhere(user)] },
    });
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

  async remove(id: number, user?: JwtUser) {
    const loan = await this.findLoanOrThrow(id, user);
    if (loan.t_rkm) {
      await this.prisma.hr_solaf_quest.deleteMany({ where: { t_rkm_fk: loan.t_rkm } });
    }
    await this.prisma.hr_solaf.delete({ where: { id } });
    return { id };
  }

  private async findLoanOrThrow(id: number, user?: JwtUser) {
    const loan = await this.prisma.hr_solaf.findFirst({
      where: { AND: [{ id }, await this.loanScopeWhere(user)] },
    });
    if (!loan) throw new NotFoundException('السلفة غير موجودة');
    return loan;
  }

  private async loanScopeWhere(user?: JwtUser): Promise<Prisma.hr_solafWhereInput> {
    if (!user) return {};
    const identities = await this.hrScope.employeeIdentities(user, 'finance.loans');
    if (identities === null) return {};
    const or: Prisma.hr_solafWhereInput[] = [
      ...(identities.ids.length ? [{ emp_id_fk: { in: identities.ids } }] : []),
      ...(identities.codes.length ? [{ emp_code_fk: { in: identities.codes } }] : []),
    ];
    return or.length ? { OR: or } : { id: -1 };
  }

  private async assertEmployeeAllowed(empId: number, user?: JwtUser): Promise<void> {
    if (!user) return;
    const identities = await this.hrScope.employeeIdentities(user, 'finance.loans');
    if (identities !== null && !identities.ids.includes(empId)) {
      throw new NotFoundException('الموظف غير موجود');
    }
  }

  private async assertLoanAllowed(
    loan: { id: number; emp_id_fk: number | null; emp_code_fk: number | null },
    user?: JwtUser,
  ): Promise<void> {
    if (!user) return;
    const identities = await this.hrScope.employeeIdentities(user, 'finance.loans');
    if (identities !== null &&
      !(loan.emp_id_fk != null && identities.ids.includes(loan.emp_id_fk)) &&
      !(loan.emp_code_fk != null && identities.codes.includes(loan.emp_code_fk))) {
      throw new NotFoundException('السلفة غير موجودة');
    }
  }
}
