import { BadRequestException } from '@nestjs/common';
import { Prisma, club_subscriptions } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSessionAwareStatus, isOpenEndedEndDate } from './club-subscription.utils';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Freezes in Noamany extend the subscription when they start (the end date moves by the freeze
 * days at once). A renewal already sold for the period after it would then overlap, so the
 * renewals waiting behind a subscription move with it (MetaFit's renewal queue, client 22 Nov).
 */

/** Booked for a later day: saved but not running yet (no actual days, not active). */
export function isScheduledFreeze(row: { is_active: boolean; actual_days: number | null }) {
  return !row.is_active && row.actual_days == null;
}

export function periodStatus(sub: club_subscriptions, end = sub.subscription_end_date, start = sub.subscription_start_date) {
  return deriveSessionAwareStatus({
    startDate: start,
    endDate: end,
    isLinkedToSessions: sub.is_linked_to_sessions,
    sessionsCount: sub.sessions_count,
    sessionsUsed: sub.sessions_used,
  });
}

/**
 * The renewals waiting after `source` whose period ended on `endBefore`: each next one is either
 * linked by `renewed_from_subscription_id` or (renewals sold before that link existed) the
 * member's subscription in the same branch that starts the day after, has not started and was
 * never used. Stops at the first gap.
 */
export async function renewalQueue(client: Client, source: club_subscriptions, endBefore: string) {
  if (!source.member_id || isOpenEndedEndDate(endBefore)) return [] as club_subscriptions[];
  const today = localDateString();
  const queue: club_subscriptions[] = [];
  const seen = new Set([source.id]);
  let current = source;
  let currentEnd = endBefore;
  for (;;) {
    const nextStart = addDays(currentEnd, 1);
    const next = await client.club_subscriptions.findFirst({
      where: {
        member_id: source.member_id,
        branch_id: source.branch_id,
        id: { notIn: [...seen] },
        OR: [
          { renewed_from_subscription_id: current.id },
          // a renewal copies the plan, so another package starting the next day is never taken
          { subscription_start_date: nextStart, subscription_type_id: current.subscription_type_id },
        ],
        subscription_start_date: { gt: today },
      },
      orderBy: [{ subscription_start_date: 'asc' }, { id: 'asc' }],
    });
    if (!next) return queue;
    if ((next.sessions_used ?? 0) > 0) {
      throw new BadRequestException('فيه تجديد بعد الاشتراك ده اتستخدم بالفعل؛ راجع التجديد قبل تعديل الإيقاف');
    }
    seen.add(next.id);
    queue.push(next);
    current = next;
    currentEnd = next.subscription_end_date;
    if (isOpenEndedEndDate(currentEnd)) return queue;
  }
}

/** Move the waiting renewals by `days` (negative = earlier). Returns how many moved. */
export async function shiftRenewals(tx: Prisma.TransactionClient, source: club_subscriptions, endBefore: string, days: number) {
  if (!days) return 0;
  const queue = await renewalQueue(tx, source, endBefore);
  for (const next of queue) {
    const start = addDays(next.subscription_start_date, days);
    const end = isOpenEndedEndDate(next.subscription_end_date) ? next.subscription_end_date : addDays(next.subscription_end_date, days);
    await tx.club_subscriptions.update({
      where: { id: next.id },
      data: { subscription_start_date: start, subscription_end_date: end, status: periodStatus(next, end, start) },
    });
  }
  return queue.length;
}
