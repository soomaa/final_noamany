import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, club_subscriptions } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, daysBetween, deriveSessionAwareStatus, isOpenEndedEndDate } from './club-subscription.utils';
import { purchasedBenefits } from './purchased-benefits';

type Client = PrismaService | Prisma.TransactionClient;
export function periodStatus(sub: club_subscriptions, end = sub.subscription_end_date) {
  return deriveSessionAwareStatus({ startDate: sub.subscription_start_date, endDate: end,
    isLinkedToSessions: sub.is_linked_to_sessions, sessionsCount: sub.sessions_count, sessionsUsed: sub.sessions_used });
}
export async function renewalQueue(client: Client, source: club_subscriptions) {
  const queue: club_subscriptions[] = [];
  const visited = new Set([source.id]);
  let id = source.id;
  for (;;) {
    const next = await client.club_subscriptions.findUnique({ where: { renewed_from_subscription_id: id } });
    if (!next) return queue;
    if (visited.has(next.id) || next.member_id !== source.member_id || next.branch_id !== source.branch_id) {
      throw new BadRequestException('سلسلة التجديد غير متسقة؛ راجع ربط العضو والفرع قبل تعديلها');
    }
    visited.add(next.id); queue.push(next); id = next.id;
  }
}
export async function freezeAllowance(client: Client, sub: club_subscriptions) {
  const type = sub.subscription_type_id ? await client.club_subscription_types.findUnique({ where: { id: sub.subscription_type_id } }) : null;
  const policy = purchasedBenefits(sub, type);
  const history = await client.club_subscription_freezes.findMany({ where: { subscription_id: sub.id } });
  const usedDays = history.filter(row => !row.is_active).reduce((sum, row) => sum + Math.max(0, row.actual_days ?? row.planned_days ?? 0), 0);
  return { policy, history, remainingTimes: policy.freeze_days == null ? null : Math.max(0, policy.freeze_days - history.length),
    remainingDays: policy.freeze_total_days == null ? null : Math.max(0, policy.freeze_total_days - usedDays) };
}
export async function assertCanFreeze(client: Client, id: number, days: number, authorize: (branch: number) => void) {
  const sub = await client.club_subscriptions.findUnique({ where: { id } });
  if (!sub) throw new NotFoundException('الاشتراك غير موجود');
  authorize(sub.branch_id);
  if (sub.status === 'frozen' || sub.renewal_hold) throw new BadRequestException('الاشتراك مجمّد بالفعل أو ينتظر فك تجميد الاشتراك السابق');
  if (['cancelled', 'transferred', 'refunded'].includes(sub.status) || periodStatus(sub) !== 'active') throw new BadRequestException('لا يمكن تجميد اشتراك غير نشط');
  const allowance = await freezeAllowance(client, sub);
  if (allowance.history.some(row => row.is_active)) throw new BadRequestException('يوجد تجميد نشط لهذا الاشتراك بالفعل');
  if (allowance.policy.is_linked_to_freeze === false) throw new BadRequestException('نوع الاشتراك لا يدعم التجميد');
  if (allowance.remainingTimes === 0) throw new BadRequestException('تم استنفاذ عدد مرات التجميد المسموح بها');
  if (allowance.remainingDays === 0) throw new BadRequestException('تم استنفاذ إجمالي أيام التجميد');
  if (days > 0 && allowance.remainingDays != null && days > allowance.remainingDays) throw new BadRequestException(`المتبقي من رصيد التجميد ${allowance.remainingDays} يوم فقط`);
  if (days > 0 && days < (allowance.policy.min_freeze ?? 0)) throw new BadRequestException(`الحد الأدنى للتجميد ${allowance.policy.min_freeze} يوم`);
  return { sub, freezeBudgetDays: days === 0 ? allowance.remainingDays ?? 0 : 0, ...allowance };
}
export function normalizedFreezeDays(days?: number) {
  if (days == null || days === 0) return 0;
  if (!Number.isInteger(days) || days < 1) throw new BadRequestException('أيام التجميد يجب أن تكون عددًا صحيحًا موجبًا');
  return days;
}
export async function lockFreezeSource(tx: Prisma.TransactionClient, id: number) {
  const initial = await tx.club_subscriptions.findUnique({ where: { id } });
  if (!initial) throw new NotFoundException('الاشتراك غير موجود');
  // Same order as renewal and booking: member, then subscription.
  if (initial.member_id) await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${initial.member_id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${id} FOR UPDATE`;
}
export async function thawPeriod(tx: Prisma.TransactionClient, id: number, authorize: (branch: number) => void, auto = false) {
  await lockFreezeSource(tx, id);
  const sub = await tx.club_subscriptions.findUnique({ where: { id } });
  if (!sub) throw new NotFoundException('الاشتراك غير موجود');
  authorize(sub.branch_id);
  if (sub.renewal_hold) throw new BadRequestException('فك تجميد الاشتراك السابق أولًا؛ هذا التجديد موقوف تبعًا له');
  const { policy, history, remainingDays } = await freezeAllowance(tx, sub);
  const freeze = history.find(row => row.is_active);
  if (!freeze && sub.status !== 'frozen') {
    if (auto) return null;
    throw new BadRequestException('لا يوجد تجميد نشط لهذا الاشتراك');
  }
  const today = localDateString();
  // A late scheduler must use the agreed thaw date, not grant additional free days.
  const effective = freeze?.freeze_end_date && freeze.freeze_end_date < today ? freeze.freeze_end_date : today;
  if (auto && (!freeze?.freeze_end_date || freeze.freeze_end_date > today)) return null;
  let actualDays = freeze ? Math.max(0, daysBetween(freeze.freeze_start_date, effective)) : 0;
  if (remainingDays != null) actualDays = Math.min(actualDays, remainingDays);
  if (!auto && freeze && actualDays < (policy.min_freeze ?? 0) && (!freeze.freeze_end_date || today < freeze.freeze_end_date)) {
    throw new BadRequestException(`الحد الأدنى للتجميد ${policy.min_freeze} يوم`);
  }
  const queue = await renewalQueue(tx, sub);
  const base = freeze?.original_end_date || sub.subscription_end_date;
  const newEnd = isOpenEndedEndDate(base) ? base : addDays(base, actualDays);
  let previousEnd = newEnd;
  for (const next of queue) {
    if (next.sessions_used > 0 || ['cancelled', 'transferred', 'refunded'].includes(next.status)) throw new BadRequestException('يوجد تجديد لاحق مستخدم أو ملغي؛ راجع سلسلة التجديد قبل فك التجميد');
    const start = addDays(previousEnd, 1);
    const end = isOpenEndedEndDate(next.subscription_end_date) ? next.subscription_end_date : addDays(start, daysBetween(next.subscription_start_date, next.subscription_end_date));
    await tx.club_subscriptions.update({ where: { id: next.id }, data: { subscription_start_date: start, subscription_end_date: end,
      renewal_hold: false, status: periodStatus({ ...next, subscription_start_date: start }, end) } });
    previousEnd = end;
  }
  if (freeze) await tx.club_subscription_freezes.update({ where: { id: freeze.id }, data: { is_active: false, freeze_end_date: effective, actual_days: actualDays } });
  const row = await tx.club_subscriptions.update({ where: { id }, data: { subscription_end_date: newEnd, status: periodStatus(sub, newEnd) } });
  return { row, sub, actualDays, repairedOrphan: !freeze, shiftedRenewals: queue.length };
}
