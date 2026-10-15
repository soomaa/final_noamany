import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, club_freeze_requests } from '@prisma/client';
import { isCalendarDate } from '../../common/validators';
import { lockFreezeSource } from './freeze-integrity';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { localDateString } from '../club-fitness/club-fitness.utils';
import { ClubSubscriptionsService } from './club-subscriptions.service';

export const FREEZE_REQUEST_STATUSES = ['pending', 'scheduled', 'approved', 'rejected', 'failed'] as const;
export type FreezeRequestStatus = (typeof FREEZE_REQUEST_STATUSES)[number];

const OPEN_STATUSES: FreezeRequestStatus[] = ['pending', 'scheduled'];
const MAX_FREEZE_DAYS = 365;

/**
 * Member-app freeze requests. Approval runs ClubSubscriptionsService.freeze, so the package
 * freeze count and day budget are the same rules reception already uses.
 */
@Injectable()
export class FreezeRequestsService {
  private readonly logger = new Logger(FreezeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: ClubSubscriptionsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async createFromApp(member: MemberJwtUser, body: Record<string, unknown>) {
    const subscriptionId = Number(body.subs_id ?? body.subscriptionId);
    const startDate = String(body.strat_from_date ?? body.startDate ?? '').trim();
    const days = Number(body.stoped_num_days ?? body.days);
    const reasonRaw = String(body.stopped_reason ?? body.reason ?? '').trim();

    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      throw new BadRequestException('اختر الاشتراك المراد وقفه');
    }
    if (!isCalendarDate(startDate)) {
      throw new BadRequestException('تاريخ بداية الوقف غير صحيح');
    }
    if (startDate < localDateString()) {
      throw new BadRequestException('تاريخ بداية الوقف لا يمكن أن يكون في الماضي');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_FREEZE_DAYS) {
      throw new BadRequestException(`عدد أيام الوقف يجب أن يكون من 1 إلى ${MAX_FREEZE_DAYS}`);
    }
    if (reasonRaw.length > 500) throw new BadRequestException('سبب الوقف طويل جدًا');

    await this.prisma.$transaction(async tx => {
      await lockFreezeSource(tx, subscriptionId);
      const sub = await tx.club_subscriptions.findUnique({ where: { id: subscriptionId },
        select: { id: true, member_id: true, branch_id: true, subscription_end_date: true } });
      if (!sub || sub.member_id !== member.memberId) throw new NotFoundException('الاشتراك غير موجود');
      if (startDate > sub.subscription_end_date) throw new BadRequestException('تاريخ الوقف بعد انتهاء الاشتراك');
      const open = await tx.club_freeze_requests.findFirst({
        where: { subscription_id: sub.id, status: { in: OPEN_STATUSES } }, select: { id: true },
      });
      if (open) throw new BadRequestException('يوجد طلب وقف لهذا الاشتراك قيد المراجعة بالفعل');
      await this.subscriptions.assertFreezable(sub.id, days, undefined, tx);
      await tx.club_freeze_requests.create({ data: {
        member_id: member.memberId, subscription_id: sub.id, branch_id: sub.branch_id,
        start_date: startDate, days, reason: reasonRaw || null, status: 'pending',
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    return {
      status: 200,
      message: 'تم إرسال طلب الوقف. إدارة النادي هتراجع الطلب وهتوصلك رسالة بالرد',
    };
  }

  async list(user: JwtUser, query: { status?: string; branchId?: string }) {
    const status = query.status && query.status !== 'all' ? query.status : undefined;
    if (status && !(FREEZE_REQUEST_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException('حالة غير معروفة');
    }
    const requested = query.branchId && query.branchId !== 'all' ? Number(query.branchId) : null;
    if (requested != null && (!Number.isInteger(requested) || requested <= 0)) throw new BadRequestException('الفرع غير صالح');
    const branches = this.branchScope.resolveListFilter(user, requested);
    const where: Prisma.club_freeze_requestsWhereInput = {
      ...(status ? { status } : {}),
      ...(branches ? { branch_id: { in: branches } } : {}),
    };
    const rows = await this.prisma.club_freeze_requests.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const [members, subs, deciders] = await Promise.all([
      this.prisma.club_members.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.member_id))] } },
        select: { id: true, name: true, member_code: true, phone: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.subscription_id))] } },
        select: { id: true, subscription_number: true, subscription_type: true, subscription_end_date: true, status: true },
      }),
      this.prisma.users.findMany({
        where: { user_id: { in: [...new Set(rows.map((r) => r.decided_by).filter((v): v is number => v != null))] } },
        select: { user_id: true, name: true, username: true },
      }),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const subById = new Map(subs.map((s) => [s.id, s]));
    const deciderById = new Map(deciders.map((u) => [u.user_id, u]));
    const counts = await this.prisma.club_freeze_requests.groupBy({
      by: ['status'],
      where: branches ? { branch_id: { in: branches } } : {},
      _count: { _all: true },
    });
    return {
      data: rows.map((r) => {
        const m = memberById.get(r.member_id);
        const s = subById.get(r.subscription_id);
        const d = r.decided_by != null ? deciderById.get(r.decided_by) : undefined;
        return {
          id: r.id,
          status: r.status,
          startDate: r.start_date,
          days: r.days,
          reason: r.reason,
          decisionNote: r.decision_note,
          decidedAt: r.decided_at,
          decidedByName: d?.name ?? d?.username ?? null,
          freezeAppliedAt: r.freeze_applied_at,
          createdAt: r.created_at,
          branchId: r.branch_id,
          memberId: r.member_id,
          memberName: m?.name ?? null,
          memberCode: m?.member_code ?? null,
          memberPhone: m?.phone ?? null,
          subscriptionId: r.subscription_id,
          subscriptionNumber: s?.subscription_number ?? null,
          subscriptionType: s?.subscription_type ?? null,
          subscriptionEndDate: s?.subscription_end_date ?? null,
          subscriptionStatus: s?.status ?? null,
        };
      }),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  private async openRequest(id: number, user?: JwtUser) {
    const row = await this.prisma.club_freeze_requests.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب الوقف غير موجود');
    if (user && !this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية على طلبات هذا الفرع');
    }
    return row;
  }

  private async withLockedRequest<T>(id: number, user: JwtUser | undefined,
    work: (row: club_freeze_requests, tx: Prisma.TransactionClient) => Promise<T>, validateSubscription = true): Promise<T> {
    const initial = await this.openRequest(id, user);
    return this.prisma.$transaction(async tx => {
      // Same member/subscription order as reception freezes, renewals and refunds.
      if (validateSubscription) await lockFreezeSource(tx, initial.subscription_id);
      else {
        await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${initial.member_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${initial.subscription_id} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM club_freeze_requests WHERE id = ${id} FOR UPDATE`;
      const row = await tx.club_freeze_requests.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('طلب الوقف غير موجود');
      if (user && !this.branchScope.isBranchAllowed(user, row.branch_id)) throw new ForbiddenException('لا تملك صلاحية على طلبات هذا الفرع');
      if (validateSubscription) {
        const sub = await tx.club_subscriptions.findUnique({ where: { id: row.subscription_id },
          select: { member_id: true, branch_id: true, subscription_end_date: true } });
        if (!sub || sub.member_id !== row.member_id || sub.branch_id !== row.branch_id) {
          throw new BadRequestException('تغير صاحب الاشتراك أو فرعه؛ أعد تقديم طلب الوقف');
        }
        if (row.start_date > sub.subscription_end_date) throw new BadRequestException('تاريخ الوقف بعد انتهاء الاشتراك');
      }
      return work(row, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  }

  async approve(id: number, user: JwtUser) {
    const today = localDateString();
    const result = await this.withLockedRequest(id, user, async (row, tx) => {
      if (row.status !== 'pending') throw new BadRequestException('الطلب ده اتراجع قبل كده');
      const scheduled = row.start_date > today;
      if (scheduled) await this.subscriptions.assertFreezable(row.subscription_id, row.days, user, tx);
      else await this.subscriptions.freeze(row.subscription_id, row.days, this.freezeReason(row), user.sub, user, tx);
      const status = scheduled ? 'scheduled' as const : 'approved' as const;
      await tx.club_freeze_requests.update({ where: { id }, data: {
        status, decided_by: user.sub, decided_at: new Date(), ...(scheduled ? {} : { freeze_applied_at: new Date() }),
      } });
      return { row, status };
    });
    await this.notify(result.row, 'تمت الموافقة على طلب الوقف', result.status === 'scheduled'
      ? `اشتراكك هيتوقف ${result.row.days} يوم ابتداءً من ${result.row.start_date}.`
      : `تم وقف اشتراكك ${result.row.days} يوم ابتداءً من اليوم.`);
    return { id, status: result.status };
  }

  async reject(id: number, note: string | undefined, user: JwtUser) {
    if (note != null && typeof note !== 'string') throw new BadRequestException('سبب الرفض غير صالح');
    const decisionNote = note?.trim() ? note.trim().slice(0, 255) : null;
    const row = await this.withLockedRequest(id, user, async (row, tx) => {
      if (!OPEN_STATUSES.includes(row.status as FreezeRequestStatus)) throw new BadRequestException('الطلب ده اتراجع قبل كده');
      await tx.club_freeze_requests.update({ where: { id },
        data: { status: 'rejected', decision_note: decisionNote, decided_by: user.sub, decided_at: new Date() } });
      return row;
    }, false);
    await this.notify(row, 'تم رفض طلب الوقف', decisionNote ? `السبب: ${decisionNote}` : 'تواصل مع الاستقبال لو محتاج تفاصيل.');
    return { id, status: 'rejected' as const };
  }

  @Cron('0 */5 * * * *', { timeZone: 'Africa/Cairo' })
  async handleDueScheduled() {
    await this.runDueScheduled();
  }

  async runDueScheduled(today = localDateString()) {
    const due = await this.prisma.club_freeze_requests.findMany({
      where: { status: 'scheduled', start_date: { lte: today } },
      orderBy: { id: 'asc' },
    });
    let applied = 0;
    for (const pending of due) {
      try {
        const row = await this.withLockedRequest(pending.id, undefined, async (row, tx) => {
          if (row.status !== 'scheduled' || row.start_date > today) return null;
          await this.subscriptions.freeze(row.subscription_id, row.days, this.freezeReason(row), row.decided_by ?? undefined, undefined, tx);
          await tx.club_freeze_requests.update({ where: { id: row.id }, data: { status: 'approved', freeze_applied_at: new Date() } });
          return row;
        });
        if (!row) continue;
        await this.notify(row, 'بدأ وقف اشتراكك', `اشتراكك متوقف ${row.days} يوم ابتداءً من النهارده.`);
        applied += 1;
      } catch (error) {
        const note = error instanceof Error ? error.message.slice(0, 255) : 'تعذر تنفيذ الوقف';
        // A transient DB/connection failure is retried on the next run, not made permanent.
        if (error instanceof BadRequestException || error instanceof NotFoundException) {
          const changed = await this.prisma.club_freeze_requests.updateMany({
            where: { id: pending.id, status: 'scheduled' }, data: { status: 'failed', decision_note: note },
          });
          if (changed.count) await this.notify(pending, 'تعذر تنفيذ وقف الاشتراك', `${note}. تواصل مع الاستقبال.`);
        }
        this.logger.warn(`Freeze request ${pending.id} failed: ${note}`);
      }
    }
    return { due: due.length, applied };
  }

  private freezeReason(row: { reason: string | null }) {
    return row.reason ? `طلب من التطبيق: ${row.reason}` : 'طلب من التطبيق';
  }

  private async notify(row: { member_id: number; branch_id: number; id: number }, title: string, body: string) {
    try {
      await this.prisma.am_member_notifications.create({
        data: {
          member_id: row.member_id,
          branch_id: row.branch_id,
          title,
          body,
          type: 'freeze_request',
          data: JSON.stringify({ target: 'freeze_request', requestId: row.id }),
        },
      });
    } catch (error) {
      this.logger.warn(`Freeze request ${row.id} notification failed: ${String(error)}`);
    }
  }
}
