import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { toNum } from './club-fitness.utils';
import { trainerBranchMap, trainersVisibleInBranches } from './trainer-branches.util';

const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const monthDates = (month: string) => ({ from: `${month}-01`, to: `${month}-31` });
const PAID_RECEIPT = ['مدفوعة', 'paid'];
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const pct = (value: number, target: number) => (target > 0 ? (value / target) * 100 : 0);

type TargetRow = { private_sales_target: unknown; subscriptions_target: number | null } | null;

@Injectable()
export class TrainerPerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    @Optional() private readonly permissions?: PermissionEngineService,
  ) {}

  /**
   * A logged-in trainer sees only their own row (monthly evaluation / targets pages).
   * "Manager" = system admin OR holder of `club.fitness.trainers:update`. When the
   * permission engine is unavailable (unit tests), a branch manager (level 3) is
   * treated as a manager and every other trainer account is self-only.
   */
  async isTrainerSelfOnly(user: JwtUser | undefined): Promise<boolean> {
    if (!user || user.trainer_id == null || isSystemAdmin(user)) return false;
    if (this.permissions) return !(await this.permissions.can(user.sub, 'club.fitness.trainers', 'update'));
    return user.level !== 3;
  }

  /** Trainer ids visible to the user; null ⇒ unrestricted. See trainer-branches.util for the branch rule. */
  async visibleTrainerIds(user: JwtUser | undefined): Promise<number[] | null> {
    if (await this.isTrainerSelfOnly(user)) return [Number(user!.trainer_id)];
    const branches = this.branchScope.allowedBranchIds(user);
    if (branches === null) return null;
    if (!branches.length) return [];
    return trainersVisibleInBranches(await trainerBranchMap(this.db()), branches);
  }

  async assertTrainerAccess(user: JwtUser | undefined, trainerId: number): Promise<void> {
    if (!user) return;
    const ids = await this.visibleTrainerIds(user);
    if (ids !== null && !ids.includes(Number(trainerId))) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا المدرب');
    }
  }
  private db() { return this.prisma as any; }
  private month(month: string) { if (!validMonth(month)) throw new BadRequestException('الشهر يجب أن يكون بصيغة YYYY-MM'); }

  private mapTarget(row: TargetRow) {
    return row ? { privateSalesTarget: toNum(row.private_sales_target as never), subscriptionsTarget: Number(row.subscriptions_target ?? 0) } : null;
  }

  /**
   * The ONE target source is club_trainer_targets (fixed) + club_trainer_target_overrides (one month).
   * club_trainer_salaries.monthly_target is legacy: it is read only while a trainer has no target row
   * yet, and the employee form now writes club_trainer_targets.
   */
  async resolveTarget(trainerId: number, month: string) {
    this.month(month);
    const db = this.db();
    const override = await db.club_trainer_target_overrides.findUnique({ where: { trainer_id_target_month: { trainer_id: trainerId, target_month: month } } });
    if (override) return { ...this.mapTarget(override)!, source: 'override' as const };
    const fixed = await db.club_trainer_targets.findUnique({ where: { trainer_id: trainerId } });
    if (fixed) return { ...this.mapTarget(fixed)!, source: 'default' as const };
    const legacy = await db.club_trainer_salaries?.findFirst?.({ where: { trainer_id: trainerId, is_active: true }, orderBy: { effective_date: 'desc' }, select: { monthly_target: true } });
    if (legacy && toNum(legacy.monthly_target) > 0) return { privateSalesTarget: toNum(legacy.monthly_target), subscriptionsTarget: 0, source: 'legacy' as const };
    return { privateSalesTarget: 0, subscriptionsTarget: 0, source: 'default' as const };
  }

  async listCriteria() { return this.db().club_trainer_evaluation_criteria.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }); }

  async listTrainers(user?: JwtUser) {
    const ids = user ? await this.visibleTrainerIds(user) : null;
    const rows: Array<{ id: number; name: string; employee_id: number | null }> = await this.db().club_trainers.findMany({
      where: { is_deleted: false, is_active: true, ...(ids === null ? {} : { id: { in: ids } }) },
      select: { id: true, name: true, employee_id: true },
      orderBy: { name: 'asc' },
    });
    const branches = rows.length ? await trainerBranchMap(this.db(), rows.map((row) => row.id)) : new Map<number, number[]>();
    return rows.map((row) => ({ ...row, branchIds: branches.get(row.id) ?? [] }));
  }

  async saveCriterion(body: any, userId: number) {
    const title = String(body.title ?? '').trim(); const max = Number(body.maxScore);
    if (!title || !Number.isInteger(max) || max <= 0) throw new BadRequestException('اسم البند والدرجة القصوى مطلوبان');
    const data = { title, description: String(body.description ?? '').trim() || null, max_score: max, sort_order: Number(body.sortOrder ?? 0), is_active: body.isActive !== false };
    return body.id ? this.db().club_trainer_evaluation_criteria.update({ where: { id: Number(body.id) }, data }) : this.db().club_trainer_evaluation_criteria.create({ data: { ...data, created_by: userId } });
  }

  /** Current values for the targets form: fixed target, the month's override, and recent overrides. */
  async getTarget(trainerId: number, month: string | undefined, user?: JwtUser) {
    if (!trainerId) throw new BadRequestException('اختر المدرب');
    await this.assertTrainerAccess(user, trainerId);
    if (month) this.month(month);
    const db = this.db();
    const [fixed, override, overrides] = await Promise.all([
      db.club_trainer_targets.findUnique({ where: { trainer_id: trainerId } }),
      month ? db.club_trainer_target_overrides.findUnique({ where: { trainer_id_target_month: { trainer_id: trainerId, target_month: month } } }) : null,
      db.club_trainer_target_overrides.findMany({ where: { trainer_id: trainerId }, orderBy: { target_month: 'desc' }, take: 12 }),
    ]);
    return {
      trainerId,
      month: month ?? null,
      fixed: this.mapTarget(fixed),
      override: this.mapTarget(override),
      resolved: month ? await this.resolveTarget(trainerId, month) : null,
      overrides: overrides.map((row: any) => ({ month: row.target_month, ...this.mapTarget(row)! })),
    };
  }

  async saveTarget(body: any, userId: number, user?: JwtUser) {
    const trainerId = Number(body.trainerId); if (!trainerId) throw new BadRequestException('اختر المدرب');
    await this.assertTrainerAccess(user, trainerId);
    const data = { private_sales_target: Number(body.privateSalesTarget ?? 0), subscriptions_target: Number(body.subscriptionsTarget ?? 0), updated_by: userId };
    if (!Number.isFinite(data.private_sales_target) || !Number.isInteger(data.subscriptions_target) || data.private_sales_target < 0 || data.subscriptions_target < 0) {
      throw new BadRequestException('التارجت لا يمكن أن يكون سالبًا');
    }
    if (body.month) { this.month(body.month); return this.db().club_trainer_target_overrides.upsert({ where: { trainer_id_target_month: { trainer_id: trainerId, target_month: body.month } }, create: { trainer_id: trainerId, target_month: body.month, ...data }, update: data }); }
    return this.db().club_trainer_targets.upsert({ where: { trainer_id: trainerId }, create: { trainer_id: trainerId, ...data }, update: data });
  }

  /** Removes a one-month exception so that month goes back to the fixed target. */
  async deleteTargetOverride(trainerId: number, month: string, user?: JwtUser) {
    this.month(month);
    await this.assertTrainerAccess(user, trainerId);
    await this.db().club_trainer_target_overrides.deleteMany({ where: { trainer_id: trainerId, target_month: month } });
    return { success: true };
  }

  /** Branch an evaluation is filed under: the employee's branch, else the only branch the trainer works in, else the one chosen. */
  private async evaluationBranch(trainerId: number, requested: unknown, user: JwtUser): Promise<number> {
    const branches = (await trainerBranchMap(this.db(), [trainerId])).get(trainerId) ?? [];
    const chosen = Number(requested);
    let branchId: number;
    if (branches.length === 1) branchId = branches[0];
    else if (chosen > 0 && (!branches.length || branches.includes(chosen))) branchId = chosen;
    else {
      const mine = branches.filter((id) => this.branchScope.isBranchAllowed(user, id));
      if (mine.length === 1) branchId = mine[0];
      else throw new BadRequestException('اختر الفرع الذي يُسجَّل عليه التقييم');
    }
    if (!this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    return branchId;
  }

  async getEvaluation(trainerId: number, month: string, user?: JwtUser) {
    this.month(month);
    await this.assertTrainerAccess(user, trainerId);
    const row = await this.db().club_trainer_evaluations.findUnique({
      where: { trainer_id_evaluation_month: { trainer_id: trainerId, evaluation_month: month } },
      include: { items: true },
    });
    return row ?? null;
  }

  async saveEvaluation(body: any, user: JwtUser) {
    const trainerId = Number(body.trainerId); this.month(String(body.month ?? ''));
    await this.assertTrainerAccess(user, trainerId);
    const trainer = await this.db().club_trainers.findFirst({ where: { id: trainerId, is_deleted: false } });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const branchId = await this.evaluationBranch(trainerId, body.branchId, user);
    const criteria = await this.db().club_trainer_evaluation_criteria.findMany({ where: { is_active: true } });
    const byId = new Map<number, { id: number; title: string; max_score: number }>(criteria.map((x: any) => [x.id, x]));
    const items = (Array.isArray(body.items) ? body.items : []).map((item: any) => { const criterion = byId.get(Number(item.criterionId)); const score = Number(item.score); if (!criterion || !Number.isInteger(score) || score < 0 || score > criterion.max_score) throw new BadRequestException('درجة التقييم غير صالحة'); return { criterion_id: criterion.id, criterion_title: criterion.title, max_score: criterion.max_score, score }; });
    if (items.length !== criteria.length || new Set(items.map((item: any) => item.criterion_id)).size !== criteria.length) throw new BadRequestException('أدخل درجة لكل بند تقييم');
    const total = items.reduce((sum: number, item: any) => sum + item.score, 0); const max = items.reduce((sum: number, item: any) => sum + item.max_score, 0);
    const notes = String(body.notes ?? '').trim() || null;
    return this.db().$transaction(async (tx: any) => { const evaluation = await tx.club_trainer_evaluations.upsert({ where: { trainer_id_evaluation_month: { trainer_id: trainerId, evaluation_month: body.month } }, create: { trainer_id: trainerId, evaluation_month: body.month, branch_id: branchId, notes, total_score: total, max_score: max, created_by: user.sub }, update: { branch_id: branchId, notes, total_score: total, max_score: max, created_by: user.sub } }); await tx.club_trainer_evaluation_items.deleteMany({ where: { evaluation_id: evaluation.id } }); await tx.club_trainer_evaluation_items.createMany({ data: items.map((item: any) => ({ ...item, evaluation_id: evaluation.id })) }); return evaluation; });
  }

  /** Private subscriptions the trainer sold per month (net of discount, refunded ones excluded). */
  private async privateSalesByMonth(trainerId: number, fromMonth: string, toMonth: string) {
    const rows: Array<{ registration_date: string; subscription_value: unknown; discount_value: unknown }> = await this.db().club_subscriptions.findMany({
      where: {
        private_trainer_id: trainerId,
        registration_date: { gte: `${fromMonth}-01`, lte: `${toMonth}-31` },
        refunds: { none: { status: 'completed' } },
      },
      select: { registration_date: true, subscription_value: true, discount_value: true },
    });
    const byMonth = new Map<string, { value: number; count: number }>();
    for (const row of rows) {
      const key = row.registration_date.slice(0, 7);
      const current = byMonth.get(key) ?? { value: 0, count: 0 };
      current.value = round(current.value + Math.max(0, toNum(row.subscription_value as never) - toNum(row.discount_value as never)));
      current.count += 1;
      byMonth.set(key, current);
    }
    return byMonth;
  }

  async profile(trainerId: number, month: string, user?: JwtUser) {
    this.month(month); await this.assertTrainerAccess(user, trainerId);
    const db = this.db();
    const firstMonth = shiftMonth(month, -5);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(firstMonth, i));
    const [trainer, sales, evaluations, evaluation] = await Promise.all([
      db.club_trainers.findFirst({ where: { id: trainerId, is_deleted: false }, select: { id: true, name: true, employee_id: true, specialization: true } }),
      this.privateSalesByMonth(trainerId, firstMonth, month),
      db.club_trainer_evaluations.findMany({ where: { trainer_id: trainerId, evaluation_month: { gte: firstMonth, lte: month } }, select: { evaluation_month: true, total_score: true, max_score: true } }),
      db.club_trainer_evaluations.findUnique({ where: { trainer_id_evaluation_month: { trainer_id: trainerId, evaluation_month: month } }, include: { items: true } }),
    ]);
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const evalByMonth = new Map<string, { total_score: number; max_score: number }>(evaluations.map((row: any) => [row.evaluation_month, row]));
    const history: Array<{
      month: string;
      target: Awaited<ReturnType<TrainerPerformanceService['resolveTarget']>>;
      privateSales: number;
      subscriptions: number;
      privateAchievement: number;
      subscriptionsAchievement: number;
      evaluation: { totalScore: number; maxScore: number } | null;
    }> = [];
    for (const m of months) {
      const target = await this.resolveTarget(trainerId, m);
      const sold = sales.get(m) ?? { value: 0, count: 0 };
      const ev = evalByMonth.get(m);
      history.push({
        month: m,
        target,
        privateSales: sold.value,
        subscriptions: sold.count,
        privateAchievement: pct(sold.value, target.privateSalesTarget),
        subscriptionsAchievement: pct(sold.count, target.subscriptionsTarget),
        evaluation: ev ? { totalScore: ev.total_score, maxScore: ev.max_score } : null,
      });
    }
    const current = history[history.length - 1];
    return {
      trainer,
      month,
      target: current.target,
      privateSales: current.privateSales,
      subscriptions: current.subscriptions,
      privateAchievement: current.privateAchievement,
      subscriptionsAchievement: current.subscriptionsAchievement,
      evaluation,
      history: history.reverse(),
    };
  }

  /**
   * Per branch for one month:
   *  - subscriptions: new subscriptions registered in the month (a freeze does not undo a sale; a
   *    subscription refunded in full is not a sale), with their contract value;
   *  - subscriptionCash: subscription receipts actually collected in the month, minus refunds paid
   *    out in the month (not the cumulative paid_amount, which mixes earlier months);
   *  - otherSales: completed POS/café sales in the month — count and collected money.
   */
  async branchAnalysis(user: JwtUser, month: string, requestedBranch?: number | string) {
    this.month(month);
    const { from, to } = monthDates(month);
    const branchIds = this.branchScope.resolveListFilter(user, requestedBranch);
    const inBranch = (id: number | null | undefined) => id != null && (branchIds === null || branchIds.includes(Number(id)));
    const db = this.db();
    const [subscriptions, receipts, refunds, quickSalesRows, branches] = await Promise.all([
      db.club_subscriptions.findMany({
        where: {
          ...(branchIds === null ? {} : { branch_id: { in: branchIds } }),
          registration_date: { gte: from, lte: to },
          plan_transfers_in: { none: {} },
          member_transfer_destination: { is: null },
        },
        select: { branch_id: true, subscription_value: true, discount_value: true },
      }),
      db.club_receipts.findMany({
        where: { receipt_date: { gte: from, lte: to }, status: { in: PAID_RECEIPT }, subscription_id: { not: null } },
        select: { amount: true, branch_id: true, subscription: { select: { branch_id: true } } },
      }),
      db.club_subscription_refunds.findMany({
        where: { status: 'completed', refund_date: { gte: from, lte: to } },
        select: { refund_amount: true, branch_id: true, subscription: { select: { branch_id: true } } },
      }),
      db.sales_quick_sales.groupBy({
        by: ['branch_id'], where: { ...(branchIds === null ? {} : { branch_id: { in: branchIds } }), sale_date: { gte: from, lte: to }, status: 'completed' },
        _count: { _all: true }, _sum: { collected_amount: true },
      }),
      db.tbl_branches.findMany({ where: branchIds === null ? undefined : { branch_id: { in: branchIds } }, select: { branch_id: true, branch_name: true } }),
    ]);
    const branchMap = new Map<number, string>(branches.map((row: any) => [row.branch_id, row.branch_name ?? `#${row.branch_id}`]));
    const data = new Map<number, any>();
    const get = (branchId: number) => {
      let row = data.get(branchId);
      if (!row) {
        row = { branchId, branchName: branchMap.get(branchId) ?? `#${branchId}`, subscriptions: 0, subscriptionValue: 0, subscriptionCash: 0, refunds: 0, quickSales: 0, quickSalesValue: 0 };
        data.set(branchId, row);
      }
      return row;
    };
    for (const row of subscriptions) {
      const current = get(row.branch_id);
      current.subscriptions += 1;
      current.subscriptionValue = round(current.subscriptionValue + Math.max(0, toNum(row.subscription_value) - toNum(row.discount_value)));
    }
    for (const row of receipts) {
      const branchId = row.branch_id ?? row.subscription?.branch_id;
      if (!inBranch(branchId)) continue;
      const current = get(Number(branchId));
      current.subscriptionCash = round(current.subscriptionCash + toNum(row.amount));
    }
    for (const row of refunds) {
      const branchId = row.branch_id ?? row.subscription?.branch_id;
      if (!inBranch(branchId)) continue;
      const current = get(Number(branchId));
      current.refunds = round(current.refunds + toNum(row.refund_amount));
    }
    for (const row of quickSalesRows) {
      const current = get(row.branch_id);
      current.quickSales = row._count._all;
      current.quickSalesValue = toNum(row._sum.collected_amount);
    }
    const rows = [...data.values()]
      .map((row) => ({ ...row, netSubscriptionCash: round(row.subscriptionCash - row.refunds), totalValue: round(row.subscriptionCash - row.refunds + row.quickSalesValue) }))
      .sort((a, b) => b.totalValue - a.totalValue);
    const totals = rows.reduce((sum, row) => ({
      subscriptions: sum.subscriptions + row.subscriptions,
      subscriptionCash: round(sum.subscriptionCash + row.subscriptionCash),
      refunds: round(sum.refunds + row.refunds),
      quickSales: sum.quickSales + row.quickSales,
      quickSalesValue: round(sum.quickSalesValue + row.quickSalesValue),
      totalValue: round(sum.totalValue + row.totalValue),
    }), { subscriptions: 0, subscriptionCash: 0, refunds: 0, quickSales: 0, quickSalesValue: 0, totalValue: 0 });
    return { month, rows, totals };
  }

  /**
   * One row per shift session. Subscriptions are not rung up on the POS shift, so they are matched
   * by who entered them: subscriptions registered and receipts collected by the session's user, on
   * the session date, in the session's branch (counted once if the user had two sessions that day).
   */
  async receptionAnalysis(user: JwtUser, month: string, requestedBranch?: number | string) {
    this.month(month);
    const { from, to } = monthDates(month);
    const branchIds = this.branchScope.resolveListFilter(user, requestedBranch);
    const db = this.db();
    const sessions = await db.sales_shift_sessions.findMany({
      where: { session_date: { gte: from, lte: to }, ...(branchIds === null ? {} : { branch_id: { in: branchIds } }) },
      include: { shift: { select: { shift_name: true } } }, orderBy: [{ session_date: 'desc' }, { start_time: 'asc' }],
    });
    const userIds = [...new Set<number>(sessions.map((row: any) => row.user_id))];
    const [users, subscriptions, receipts] = userIds.length
      ? await Promise.all([
          db.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }),
          db.club_subscriptions.findMany({
            where: { created_by: { in: userIds }, registration_date: { gte: from, lte: to }, ...(branchIds === null ? {} : { branch_id: { in: branchIds } }) },
            select: { created_by: true, registration_date: true, branch_id: true },
          }),
          db.club_receipts.findMany({
            where: { created_by: { in: userIds }, receipt_date: { gte: from, lte: to }, status: { in: PAID_RECEIPT }, subscription_id: { not: null } },
            select: { created_by: true, receipt_date: true, amount: true, branch_id: true, subscription: { select: { branch_id: true } } },
          }),
        ])
      : [[], [], []];
    const names = new Map(users.map((row: any) => [row.user_id, row.name ?? row.username ?? `#${row.user_id}`]));
    const key = (userId: number, date: string, branchId: number | null | undefined) => `${userId}:${date}:${branchId ?? ''}`;
    const subCount = new Map<string, number>();
    for (const row of subscriptions) subCount.set(key(row.created_by, row.registration_date, row.branch_id), (subCount.get(key(row.created_by, row.registration_date, row.branch_id)) ?? 0) + 1);
    const subCash = new Map<string, number>();
    for (const row of receipts) {
      const k = key(row.created_by, row.receipt_date, row.branch_id ?? row.subscription?.branch_id);
      subCash.set(k, round((subCash.get(k) ?? 0) + toNum(row.amount)));
    }
    const used = new Set<string>();
    return {
      month,
      rows: sessions.map((row: any) => {
        const k = key(row.user_id, row.session_date, row.branch_id);
        const first = !used.has(k);
        used.add(k);
        const subscriptionsCount = first ? subCount.get(k) ?? 0 : 0;
        const subscriptionsValue = first ? subCash.get(k) ?? 0 : 0;
        const otherSales = toNum(row.total_sales);
        return {
          id: row.id,
          date: row.session_date,
          branchId: row.branch_id,
          receptionist: names.get(row.user_id) ?? `#${row.user_id}`,
          shift: row.shift?.shift_name ?? 'شِفت',
          subscriptions: subscriptionsCount,
          subscriptionsValue,
          otherSales,
          totalSales: round(subscriptionsValue + otherSales),
          transactions: row.transactions_count,
          status: row.status,
        };
      }),
    };
  }

  async shiftAnalysis(user: JwtUser, month: string, requestedBranch?: number | string) {
    this.month(month);
    const branchIds = this.branchScope.resolveListFilter(user, requestedBranch);
    const db = this.db();
    const rows = await db.sales_shift_sessions.findMany({
      where: { session_date: { gte: `${month}-01`, lte: `${month}-31` }, ...(branchIds === null ? {} : { branch_id: { in: branchIds } }) },
      include: { shift: { select: { shift_name: true } } },
    });
    const grouped = new Map<number, any>();
    for (const row of rows) { const current = grouped.get(row.shift_id) ?? { shiftId: row.shift_id, shift: row.shift?.shift_name ?? 'شِفت', sessions: 0, sales: 0, transactions: 0 }; current.sessions += 1; current.sales += toNum(row.total_sales); current.transactions += row.transactions_count; grouped.set(row.shift_id, current); }
    return { month, rows: [...grouped.values()].map((row) => ({ ...row, averageSales: row.sessions ? row.sales / row.sessions : 0 })).sort((a, b) => b.sales - a.sales) };
  }
}
