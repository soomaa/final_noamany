import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { classifyFollowUps, matchesExpiryRange } from './renewal-follow-up.utils';
import { CreateSubscriptionFollowUpDto, RenewalFollowUpQuery } from './dto/renewal-follow-up.dto';

@Injectable()
export class RenewalFollowUpService {
  constructor(private readonly prisma: PrismaService, private readonly branches: BranchScopeService) {}

  private scope(user: JwtUser, branch?: string): Prisma.club_subscriptionsWhereInput {
    const ids = this.branches.resolveListFilter(user, branch);
    return { AND: [
      { member: { is_deleted: false } },
      ...(ids === null ? [] : [{ branch_id: { in: ids } }]),
      ...(branch && branch !== 'all' ? [{ branch_id: Number(branch) || -1 }] : []),
    ] };
  }

  async list(q: RenewalFollowUpQuery, user: JwtUser) {
    if (q.mode === 'not_renewed' && q.expiryFrom && q.expiryTo && q.expiryFrom > q.expiryTo) {
      throw new BadRequestException('تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له');
    }
    const today = localDateString();
    // Keep complete lineages in scope: search/package filters must not hide a later renewal.
    const rows = await this.prisma.club_subscriptions.findMany({
      where: this.scope(user, q.branch),
      include: {
        member: { select: { id: true, name: true, member_code: true, phone: true } },
        renewal_successor: { select: { id: true } },
        plan_transfers_out: { select: { id: true } },
        member_transfer_source: { select: { id: true } },
        freezes: { orderBy: { id: 'desc' } },
        follow_ups: { orderBy: { id: 'desc' }, take: 1 },
      },
      orderBy: { id: 'desc' },
    });
    const branchIds = this.branches.resolveListFilter(user, q.branch);
    const attendanceWhere: Prisma.club_attendanceWhereInput = {
      member: { is_deleted: false }, attendance_date: { lte: today },
      AND: [
        ...(branchIds === null ? [] : [{ branch_id: { in: branchIds } }]),
        ...(q.branch && q.branch !== 'all' ? [{ branch_id: Number(q.branch) || -1 }] : []),
      ],
    };
    const [visits, sessions] = await Promise.all([
      this.prisma.club_attendance.groupBy({ by: ['member_id', 'branch_id'], where: attendanceWhere, _max: { attendance_date: true } }),
      this.prisma.club_attendance.groupBy({ by: ['subscription_id'], where: { ...attendanceWhere, subscription_id: { not: null }, is_grace_session: false }, _max: { attendance_date: true } }),
    ]);
    const lastVisit = new Map(visits.map(v => [`${v.member_id}:${v.branch_id}`, v._max.attendance_date]));
    const lastSession = new Map(sessions.map(v => [v.subscription_id, v._max.attendance_date]));
    const mapped = rows.filter(r => r.member !== null).map(r => ({
      id: r.id, memberId: r.member_id!, memberName: r.member!.name, memberCode: r.member!.member_code,
      phone: r.member!.phone, branchId: r.branch_id,
      packageKey: r.private_package_id ? `private:${r.private_package_id}` : r.special_class_type_id ? `class:${r.special_class_type_id}` : r.subscription_type_id ? `type:${r.subscription_type_id}` : `legacy:${r.subscription_type ?? r.id}`,
      packageName: r.subscription_type ?? '—', subscriptionNumber: r.subscription_number,
      startDate: r.subscription_start_date, endDate: r.subscription_end_date,
      lastRenewalDate: r.renewed_from_subscription_id ? r.registration_date : null,
      registrationDate: r.registration_date, status: r.status,
      sessionsCount: r.sessions_count, sessionsUsed: r.sessions_used, isLinkedToSessions: r.is_linked_to_sessions,
      successorId: r.renewal_successor?.id ?? null,
      transferred: r.plan_transfers_out.length > 0 || !!r.member_transfer_source,
      lastAttendance: lastVisit.get(`${r.member_id}:${r.branch_id}`) ?? null,
      lastSessionDate: lastSession.get(r.id) ?? null,
      lastFreezeEnd: r.freezes.filter(f => !f.is_active).map(f => f.freeze_end_date).filter((d): d is string => !!d).sort().at(-1) ?? null,
      contactStatus: r.follow_ups[0]?.status ?? 'not_contacted',
      lastContactAt: r.follow_ups[0]?.created_at ?? null,
      nextContactOn: r.follow_ups[0]?.next_contact_on ?? null,
      canRenew: !!(r.subscription_type_id || r.private_package_id || r.special_class_type_id),
    }));
    const packages = [...new Map(mapped.map(r => [r.packageKey, { key: r.packageKey, name: r.packageName }])).values()];
    let candidates = classifyFollowUps(mapped, today, q.mode, q.absenceDays);
    const search = q.search?.trim().toLocaleLowerCase();
    candidates = candidates.filter(r =>
      (!search || [r.memberName, r.memberCode, r.phone, r.subscriptionNumber].some(v => v?.toLocaleLowerCase().includes(search))) &&
      (!q.packageKey || r.packageKey === q.packageKey) &&
      (!q.contactStatus || r.contactStatus === q.contactStatus) &&
      (q.minDays === undefined || (r.daysSince !== null && r.daysSince >= q.minDays)) &&
      (q.mode !== 'not_renewed' || matchesExpiryRange(r.effectiveEndDate, q.expiryFrom, q.expiryTo)),
    );
    return { data: candidates.slice(q.skip, q.skip + q.take), total: candidates.length, page: q.page, pageSize: q.pageSize, packages };
  }

  private async accessible(id: number, user: JwtUser) {
    const row = await this.prisma.club_subscriptions.findUnique({ where: { id }, include: { member: true } });
    if (!row || !row.member || row.member.is_deleted) throw new NotFoundException('الاشتراك غير موجود');
    if (!this.branches.isBranchAllowed(user, row.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    return row;
  }

  async history(id: number, user: JwtUser) {
    const source = await this.accessible(id, user);
    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { AND: [this.scope(user), { member_id: source.member_id }] },
      select: { id: true, subscription_number: true, subscription_type: true, registration_date: true, subscription_start_date: true, subscription_end_date: true, status: true, sessions_count: true, sessions_used: true, renewed_from_subscription_id: true,
        follow_ups: { orderBy: { id: 'desc' } },
      },
      orderBy: [{ subscription_start_date: 'desc' }, { id: 'desc' }],
    });
    return { member: { id: source.member!.id, name: source.member!.name, code: source.member!.member_code, phone: source.member!.phone }, subscriptions };
  }

  async contact(id: number, dto: CreateSubscriptionFollowUpDto, user: JwtUser) {
    await this.accessible(id, user);
    return this.prisma.club_subscription_follow_ups.create({ data: {
      subscription_id: id, status: dto.status, note: dto.note?.trim() || null,
      next_contact_on: dto.nextContactOn ?? null, created_by: user.sub, created_by_name: user.name,
    } });
  }
}
