import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { toNum } from './club-fitness.utils';

const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const monthDates = (month: string) => ({ from: `${month}-01`, to: `${month}-31` });

@Injectable()
export class TrainerPerformanceService {
  constructor(private readonly prisma: PrismaService, private readonly branchScope: BranchScopeService) {}
  private db() { return this.prisma as any; }
  private month(month: string) { if (!validMonth(month)) throw new BadRequestException('الشهر يجب أن يكون بصيغة YYYY-MM'); }

  async resolveTarget(trainerId: number, month: string) {
    this.month(month);
    const override = await this.db().club_trainer_target_overrides.findUnique({ where: { trainer_id_target_month: { trainer_id: trainerId, target_month: month } } });
    const row = override ?? await this.db().club_trainer_targets.findUnique({ where: { trainer_id: trainerId } });
    return { privateSalesTarget: toNum(row?.private_sales_target), subscriptionsTarget: Number(row?.subscriptions_target ?? 0), source: override ? 'override' as const : 'default' as const };
  }

  async listCriteria() { return this.db().club_trainer_evaluation_criteria.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }); }
  async listTrainers() {
    return this.db().club_trainers.findMany({
      where: { is_deleted: false, is_active: true },
      select: { id: true, name: true, employee_id: true },
      orderBy: { name: 'asc' },
    });
  }
  async saveCriterion(body: any, userId: number) {
    const title = String(body.title ?? '').trim(); const max = Number(body.maxScore);
    if (!title || !Number.isInteger(max) || max <= 0) throw new BadRequestException('اسم البند والدرجة القصوى مطلوبان');
    const data = { title, description: String(body.description ?? '').trim() || null, max_score: max, sort_order: Number(body.sortOrder ?? 0), is_active: body.isActive !== false };
    return body.id ? this.db().club_trainer_evaluation_criteria.update({ where: { id: Number(body.id) }, data }) : this.db().club_trainer_evaluation_criteria.create({ data: { ...data, created_by: userId } });
  }
  async saveTarget(body: any, userId: number) {
    const trainerId = Number(body.trainerId); if (!trainerId) throw new BadRequestException('اختر المدرب');
    const data = { private_sales_target: Number(body.privateSalesTarget ?? 0), subscriptions_target: Number(body.subscriptionsTarget ?? 0), updated_by: userId };
    if (data.private_sales_target < 0 || data.subscriptions_target < 0) throw new BadRequestException('التارجت لا يمكن أن يكون سالبًا');
    if (body.month) { this.month(body.month); return this.db().club_trainer_target_overrides.upsert({ where: { trainer_id_target_month: { trainer_id: trainerId, target_month: body.month } }, create: { trainer_id: trainerId, target_month: body.month, ...data }, update: data }); }
    return this.db().club_trainer_targets.upsert({ where: { trainer_id: trainerId }, create: { trainer_id: trainerId, ...data }, update: data });
  }
  async saveEvaluation(body: any, user: JwtUser) {
    const trainerId = Number(body.trainerId); this.month(String(body.month ?? ''));
    const trainer = await this.db().club_trainers.findFirst({ where: { id: trainerId, is_deleted: false } });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const employee = trainer.employee_id ? await this.db().employees.findUnique({ where: { id: trainer.employee_id }, select: { branch_id_fk: true } }) : null;
    const branchId = employee?.branch_id_fk ?? Number(body.branchId);
    if (!branchId || !this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    const criteria = await this.db().club_trainer_evaluation_criteria.findMany({ where: { is_active: true } });
    const byId = new Map<number, { id: number; title: string; max_score: number }>(criteria.map((x: any) => [x.id, x]));
    const items = (Array.isArray(body.items) ? body.items : []).map((item: any) => { const criterion = byId.get(Number(item.criterionId)); const score = Number(item.score); if (!criterion || !Number.isInteger(score) || score < 0 || score > criterion.max_score) throw new BadRequestException('درجة التقييم غير صالحة'); return { criterion_id: criterion.id, criterion_title: criterion.title, max_score: criterion.max_score, score }; });
    if (items.length !== criteria.length) throw new BadRequestException('أدخل درجة لكل بند تقييم');
    const total = items.reduce((sum: number, item: any) => sum + item.score, 0); const max = items.reduce((sum: number, item: any) => sum + item.max_score, 0);
    return this.db().$transaction(async (tx: any) => { const evaluation = await tx.club_trainer_evaluations.upsert({ where: { trainer_id_evaluation_month: { trainer_id: trainerId, evaluation_month: body.month } }, create: { trainer_id: trainerId, evaluation_month: body.month, branch_id: branchId, notes: String(body.notes ?? '') || null, total_score: total, max_score: max, created_by: user.sub }, update: { notes: String(body.notes ?? '') || null, total_score: total, max_score: max, created_by: user.sub } }); await tx.club_trainer_evaluation_items.deleteMany({ where: { evaluation_id: evaluation.id } }); await tx.club_trainer_evaluation_items.createMany({ data: items.map((item: any) => ({ ...item, evaluation_id: evaluation.id })) }); return evaluation; });
  }
  async profile(trainerId: number, month: string) {
    this.month(month); const { from, to } = monthDates(month); const db = this.db(); const [trainer, target, privateSales, subscriptions, evaluation] = await Promise.all([db.club_trainers.findFirst({ where: { id: trainerId, is_deleted: false } }), this.resolveTarget(trainerId, month), db.club_subscriptions.aggregate({ where: { private_trainer_id: trainerId, registration_date: { gte: from, lte: to } }, _sum: { subscription_value: true } }), db.club_subscriptions.count({ where: { private_trainer_id: trainerId, registration_date: { gte: from, lte: to } } }), db.club_trainer_evaluations.findUnique({ where: { trainer_id_evaluation_month: { trainer_id: trainerId, evaluation_month: month } }, include: { items: true } })]);
    if (!trainer) throw new NotFoundException('المدرب غير موجود'); const privateValue = toNum(privateSales._sum.subscription_value); return { trainer, month, target, privateSales: privateValue, subscriptions, privateAchievement: target.privateSalesTarget ? (privateValue / target.privateSalesTarget) * 100 : 0, subscriptionsAchievement: target.subscriptionsTarget ? (subscriptions / target.subscriptionsTarget) * 100 : 0, evaluation };
  }

  async branchAnalysis(user: JwtUser, month: string, requestedBranch?: number | string) {
    this.month(month);
    const { from, to } = monthDates(month);
    const branchIds = this.branchScope.resolveListFilter(user, requestedBranch);
    const branchWhere = branchIds === null ? {} : { branch_id: { in: branchIds } };
    const db = this.db();
    const [subscriptionRows, quickSalesRows, branches] = await Promise.all([
      db.club_subscriptions.groupBy({
        by: ['branch_id'], where: { ...branchWhere, registration_date: { gte: from, lte: to } },
        _count: { _all: true }, _sum: { subscription_value: true, paid_amount: true },
      }),
      db.sales_quick_sales.groupBy({
        by: ['branch_id'], where: { ...branchWhere, sale_date: { gte: from, lte: to }, status: 'completed' },
        _count: { _all: true }, _sum: { collected_amount: true },
      }),
      db.tbl_branches.findMany({ where: branchIds === null ? undefined : { branch_id: { in: branchIds } }, select: { branch_id: true, branch_name: true } }),
    ]);
    const branchMap = new Map(branches.map((row: any) => [row.branch_id, row.branch_name ?? `#${row.branch_id}`]));
    const data = new Map<number, any>();
    for (const row of subscriptionRows) data.set(row.branch_id, { branchId: row.branch_id, branchName: branchMap.get(row.branch_id) ?? `#${row.branch_id}`, subscriptions: row._count._all, subscriptionValue: toNum(row._sum.subscription_value), subscriptionPaid: toNum(row._sum.paid_amount), quickSales: 0, quickSalesValue: 0 });
    for (const row of quickSalesRows) { const current = data.get(row.branch_id) ?? { branchId: row.branch_id, branchName: branchMap.get(row.branch_id) ?? `#${row.branch_id}`, subscriptions: 0, subscriptionValue: 0, subscriptionPaid: 0, quickSales: 0, quickSalesValue: 0 }; current.quickSales = row._count._all; current.quickSalesValue = toNum(row._sum.collected_amount); data.set(row.branch_id, current); }
    const rows = [...data.values()].map((row) => ({ ...row, totalValue: row.subscriptionPaid + row.quickSalesValue })).sort((a, b) => b.totalValue - a.totalValue);
    return { month, rows, totals: rows.reduce((sum, row) => ({ subscriptions: sum.subscriptions + row.subscriptions, quickSales: sum.quickSales + row.quickSales, totalValue: sum.totalValue + row.totalValue }), { subscriptions: 0, quickSales: 0, totalValue: 0 }) };
  }

  async receptionAnalysis(user: JwtUser, month: string, requestedBranch?: number | string) {
    this.month(month);
    const branchIds = this.branchScope.resolveListFilter(user, requestedBranch);
    const sessions = await this.db().sales_shift_sessions.findMany({
      where: { session_date: { gte: `${month}-01`, lte: `${month}-31` }, ...(branchIds === null ? {} : { branch_id: { in: branchIds } }) },
      include: { shift: { select: { shift_name: true } } }, orderBy: [{ session_date: 'desc' }, { start_time: 'desc' }],
    });
    const userIds = [...new Set(sessions.map((row: any) => row.user_id))];
    const users = userIds.length ? await this.db().users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }) : [];
    const names = new Map(users.map((row: any) => [row.user_id, row.name ?? row.username ?? `#${row.user_id}`]));
    return { month, rows: sessions.map((row: any) => ({ id: row.id, date: row.session_date, branchId: row.branch_id, receptionist: names.get(row.user_id) ?? `#${row.user_id}`, shift: row.shift?.shift_name ?? 'شِفت', subscriptions: 0, otherSales: toNum(row.total_sales), totalSales: toNum(row.total_sales), transactions: row.transactions_count, status: row.status })) };
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
