import { projectedFreezeEnd, FreezeDates } from '../club-subscriptions/freeze-end-projection';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addDays,
  daysBetween,
  deriveSessionAwareStatus,
  toNum,
} from '../club-subscriptions/club-subscription.utils';
import { localDateString } from '../club-members/club-member.utils';
import { ClubGymPoliciesService } from './club-gym-policies.service';
import {
  EntitlementReason,
  EntitlementResult,
  EntitlementSubscriptionSnapshot,
  ValidateEntitlementOptions,
} from './entitlement.types';

const EGYPT_TZ = 'Africa/Cairo';

function calendarDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function currentLocalTimeHHMM(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function isWithinTimeWindow(timeFrom: string, timeTo: string, at: Date): boolean {
  const current = currentLocalTimeHHMM(at);
  if (timeFrom <= timeTo) return current >= timeFrom && current <= timeTo;
  return current >= timeFrom || current <= timeTo;
}

@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymPolicies: ClubGymPoliciesService,
  ) {}

  private mapSubscription(row: {
    freezes?: FreezeDates[];
    renewal_hold?: boolean;
    id: number;
    subscription_number: string;
    subscription_type: string | null;
    status: string;
    subscription_start_date: string;
    subscription_end_date: string;
    remaining_amount: unknown;
    is_time_based: boolean;
    time_from: string | null;
    time_to: string | null;
    is_linked_to_sessions: boolean;
    is_special: boolean;
    special_class_type_id: number | null;
    sessions_count: number | null;
    sessions_used: number;
    allow_multiple_daily_entries: boolean;
    branch_id: number;
  }, at = new Date()): EntitlementSubscriptionSnapshot {
    const derivedStatus = deriveSessionAwareStatus({
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
      isLinkedToSessions: row.is_linked_to_sessions,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
    }, at);
    const sessionsRemaining =
      row.is_linked_to_sessions && row.sessions_count != null
        ? Math.max(0, row.sessions_count - row.sessions_used)
        : null;
    // For period (non-session) subscriptions: days left until the end date. Mirrors the
    // sessions-remaining concept so the scanner can show "متبقي X يوم والاشتراك ينتهي".
    const daysRemaining = row.is_linked_to_sessions
      ? null
      : Math.max(0, daysBetween(localDateString(at), row.subscription_end_date));

    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      subscriptionType: row.subscription_type,
      status: row.renewal_hold || row.freezes?.length ? 'frozen' : row.status,
      derivedStatus,
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
      projectedEndDate: projectedFreezeEnd(row.subscription_end_date, row.freezes?.[0], localDateString(at)),
      remainingAmount: toNum(row.remaining_amount),
      isTimeBased: row.is_time_based,
      timeFrom: row.time_from,
      timeTo: row.time_to,
      isLinkedToSessions: row.is_linked_to_sessions,
      isSpecial: row.is_special,
      specialClassTypeId: row.special_class_type_id,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      sessionsRemaining,
      daysRemaining,
      allowMultipleDailyEntries: row.allow_multiple_daily_entries,
      branchId: row.branch_id,
    };
  }

  private reason(
    code: string,
    messageAr: string,
    messageEn: string,
    severity: EntitlementReason['severity'],
  ): EntitlementReason {
    return { code, messageAr, messageEn, severity };
  }

  /**
   * Every date-active subscription of the member in this branch, each validated on its own
   * (time window, remaining sessions, dues, freeze). A self-service entry point uses this to
   * tell "exactly one usable subscription" — safe to apply without a person — from "several",
   * where only reception knows which one the member came for.
   */
  async usableSubscriptions(options: { memberId: number; branchId: number; at?: Date }) {
    const at = options.at ?? new Date();
    const [policies, member, subs] = await Promise.all([
      this.gymPolicies.get(),
      this.prisma.club_members.findFirst({ where: { id: options.memberId, is_deleted: false } }),
      this.prisma.club_subscriptions.findMany({
        include: { freezes: { where: { is_active: true }, orderBy: { id: 'desc' }, take: 1 } },
        where: { member_id: options.memberId, branch_id: options.branchId },
        orderBy: { subscription_end_date: 'desc' },
      }),
    ]);
    return Promise.all(subs.filter((s) => s.status !== 'frozen' && s.status !== 'expired' &&
      deriveSessionAwareStatus({ startDate: s.subscription_start_date, endDate: s.subscription_end_date,
        isLinkedToSessions: s.is_linked_to_sessions, sessionsCount: s.sessions_count,
        sessionsUsed: s.sessions_used }, at) === 'active'
    ).map((sub) => this.validate({ ...options, at, subscriptionId: sub.id }, { policies, member, subs })));
  }

  async validate(options: ValidateEntitlementOptions, context?: {
    policies: Awaited<ReturnType<ClubGymPoliciesService['get']>>;
    member: Awaited<ReturnType<PrismaService['club_members']['findFirst']>>;
    subs: Awaited<ReturnType<PrismaService['club_subscriptions']['findMany']>>;
  }): Promise<EntitlementResult> {
    const {
      memberId,
      branchId,
      subscriptionId,
      at = new Date(),
      blockOnOutstanding,
      requireActiveSubscription = true,
    } = options;

    const policies = context?.policies ?? await this.gymPolicies.get();
    const effectiveBlockOnOutstanding =
      blockOnOutstanding === true || !policies.allowCheckInWithOutstanding;

    const member = context?.member ?? await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');

    const reasons: EntitlementReason[] = [];
    const warnings: EntitlementReason[] = [];

    if (branchId != null && member.branch_id !== branchId) {
      reasons.push(
        this.reason(
          'member_branch_mismatch',
          'العضو غير مسجّل في هذا الفرع',
          'Member is not registered in this branch',
          'block',
        ),
      );
    }

    if (member.is_blocked) {
      const reason = member.block_reason?.trim();
      reasons.push(
        this.reason(
          'member_blocked',
          `العضو محظور${reason ? ` — السبب: ${reason}` : ''}`,
          `Member is blocked${reason ? ` — reason: ${reason}` : ''}`,
          'block',
        ),
      );
    }

    const subs = context?.subs ?? await this.prisma.club_subscriptions.findMany({
        include: { freezes: { where: { is_active: true }, orderBy: { id: 'desc' }, take: 1 } },
      where: {
        member_id: memberId,
        ...(branchId != null ? { branch_id: branchId } : {}),
      },
      orderBy: { subscription_end_date: 'desc' },
    });

    // The member flag is only a denormalized summary. Legacy data and older sync logic can leave
    // it false while another subscription is still usable; the live subscription is the source
    // of truth for entry, while an explicit member block always remains authoritative.
    const memberHasUsableSubscription = subs.some(
      (s) =>
        s.status !== 'frozen' &&
        s.status !== 'expired' &&
        deriveSessionAwareStatus({
          startDate: s.subscription_start_date,
          endDate: s.subscription_end_date,
          isLinkedToSessions: s.is_linked_to_sessions,
          sessionsCount: s.sessions_count,
          sessionsUsed: s.sessions_used,
        }, at) === 'active',
    );

    if (!member.is_blocked && !member.is_active && !memberHasUsableSubscription) {
      reasons.push(
        this.reason(
          'member_inactive',
          'العضو غير نشط',
          'Member account is inactive',
          'block',
        ),
      );
    }

    let activeSub: (typeof subs)[number] | null;
    if (subscriptionId != null) {
      // Reception picked a specific subscription to check in on (a member may hold several,
      // e.g. a monthly + a Zumba-sessions package). Validate that exact one.
      activeSub = subs.find((s) => s.id === subscriptionId) ?? null;
      if (!activeSub) {
        reasons.push(
          this.reason(
            'subscription_not_found',
            'الاشتراك غير موجود لهذا العضو',
            'Subscription not found for this member',
            'block',
          ),
        );
      }
    } else {
      const activeCandidates = subs.filter(
        (s) =>
          s.status !== 'frozen' &&
          s.status !== 'expired' &&
          deriveSessionAwareStatus({
            startDate: s.subscription_start_date,
            endDate: s.subscription_end_date,
            isLinkedToSessions: s.is_linked_to_sessions,
            sessionsCount: s.sessions_count,
            sessionsUsed: s.sessions_used,
          }, at) === 'active',
      );

      activeSub = activeCandidates[0] ?? null;
    }

    if (requireActiveSubscription && !activeSub) {
      const latest = subs[0];
      const endHint = latest?.subscription_end_date
        ? ` — آخر اشتراك انتهى في ${latest.subscription_end_date}`
        : '';
      reasons.push(
        this.reason(
          'no_active_subscription',
          `لا يوجد اشتراك نشط${endHint}`,
          latest?.subscription_end_date
            ? `No active subscription (last ended ${latest.subscription_end_date})`
            : 'No active subscription',
          'block',
        ),
      );
    }

    let snapshot: EntitlementSubscriptionSnapshot | null = null;
    if (activeSub) {
      snapshot = this.mapSubscription(activeSub, at);

      // A frozen subscription (stored status) is denied check-in regardless of its date-derived
      // status. The freeze is an explicit hold on the subscription.
      if (snapshot.status === 'frozen') {
        reasons.push(
          this.reason(
            'subscription_frozen',
            'الاشتراك مجمد',
            'Subscription is frozen',
            'block',
          ),
        );
      }

      // A specifically chosen subscription must be date-active (monthly within its period,
      // a session package within its validity). Expired / not-yet-started is denied.
      if (snapshot.derivedStatus !== 'active' || snapshot.status === 'expired') {
        reasons.push(
          this.reason(
            'subscription_not_active',
            `الاشتراك غير نشط — تاريخ الانتهاء ${snapshot.endDate}`,
            `Subscription is not active — ended ${snapshot.endDate}`,
            'block',
          ),
        );
      }

      const elapsedDays = Math.max(0, calendarDayNumber(localDateString(at)) - calendarDayNumber(snapshot.startDate));
      const graceDays = policies.outstandingGraceDays ?? 7;
      const reachedPaymentDeadline = elapsedDays >= graceDays;
      const reachedLegacyDeadline = false;
      if (snapshot.remainingAmount > 0) {
        if (effectiveBlockOnOutstanding || reachedPaymentDeadline || reachedLegacyDeadline) {
          reasons.push(this.reason('outstanding_balance',
            `غير مسموح بالدخول — عليك متبقي ${snapshot.remainingAmount}، مر ${elapsedDays} يوم من بداية الاشتراك (مهلة السداد ${graceDays} يوم)`,
            `Entry denied: outstanding ${snapshot.remainingAmount}; ${elapsedDays} days since subscription start (payment grace ${graceDays} days)`, 'block'));
        } else if (policies.outstandingAlertEnabled) {
          warnings.push(this.reason('outstanding_balance',
            `عليك متبقي ${snapshot.remainingAmount} — متاح للسداد ${graceDays - elapsedDays} يوم قبل منع الدخول`,
            `Outstanding ${snapshot.remainingAmount}: ${graceDays - elapsedDays} days left before entry is blocked`, 'warn'));
        }
      }

      if (snapshot.isTimeBased && snapshot.timeFrom && snapshot.timeTo) {
        if (!isWithinTimeWindow(snapshot.timeFrom, snapshot.timeTo, at)) {
          reasons.push(
            this.reason(
              'outside_time_window',
              `الدخول مسموح من ${snapshot.timeFrom} إلى ${snapshot.timeTo} فقط`,
              `Access allowed only ${snapshot.timeFrom}–${snapshot.timeTo}`,
              'block',
            ),
          );
        }
      }

      if (snapshot.isLinkedToSessions) {
        const remaining = snapshot.sessionsRemaining ?? 0;
        if (remaining <= 0) {
          reasons.push(
            this.reason(
              'no_sessions_remaining',
              'لا توجد حصص متبقية',
              'No sessions remaining',
              'block',
            ),
          );
        }
      }

      if (branchId != null && snapshot.branchId !== branchId) {
        reasons.push(
          this.reason(
            'subscription_branch_mismatch',
            'الاشتراك غير مسجّل في هذا الفرع',
            'Subscription is not registered in this branch',
            'block',
          ),
        );
      }
    }

    const blocking = reasons.some((r) => r.severity === 'block');
    const latestSubscription =
      snapshot ?? (subs[0] ? this.mapSubscription(subs[0], at) : null);

    let accessValidUntil = snapshot?.endDate ?? null;
    if (snapshot && snapshot.remainingAmount > 0) {
      const paymentEnd = addDays(snapshot.startDate, (policies.outstandingGraceDays ?? 7) - 1);
      if (accessValidUntil == null || paymentEnd < accessValidUntil) accessValidUntil = paymentEnd;
    }

    return {
      accessValidUntil,
      allowed: !blocking,
      allowGraceSessions: policies.allowGraceSessions === true && !reasons.some((r) =>
        ['no_active_subscription', 'subscription_not_active', 'outstanding_balance', 'member_blocked'].includes(r.code)),
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
        phone: member.phone,
        branchId: member.branch_id,
        isActive: !member.is_blocked && (member.is_active || memberHasUsableSubscription),
      },
      // Keep returning the evaluated snapshot even when blocked so force/grace can attach it.
      activeSubscription: snapshot,
      latestSubscription,
      reasons,
      warnings,
    };
  }
}
