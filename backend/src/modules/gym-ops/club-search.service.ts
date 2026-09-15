import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deriveSessionAwareStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import {
  normalizeCardNumber,
  normalizePhoneForStorage,
  normalizePhoneInput,
} from '../club-members/club-member.utils';
import { EntitlementService } from './entitlement.service';

export interface ClubSearchHit {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
  branchId: number;
  isActive: boolean;
  matchType: 'code' | 'card' | 'phone' | 'name' | 'partial';
  activeSubscriptionType: string | null;
  subscriptionStatus: string | null;
  remainingAmount: number | null;
  lastCheckIn: string | null;
  score: number;
}

@Injectable()
export class ClubSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
  ) {}

  private phoneSearchVariants(q: string): string[] {
    const trimmed = q.trim();
    const normalized = normalizePhoneInput(trimmed);
    const stored = normalizePhoneForStorage(trimmed);
    const variants = new Set<string>([trimmed, stored, normalized]);
    if (stored.startsWith('0')) variants.add(`20${stored.slice(1)}`);
    if (normalized.startsWith('201')) variants.add(`0${normalized.slice(2)}`);
    return [...variants].filter(Boolean);
  }

  private scoreHit(
    row: { member_code: string; card_number: string | null; phone: string | null; name: string },
    q: string,
    matchType: ClubSearchHit['matchType'],
  ): number {
    const lower = q.toLowerCase();
    if (row.member_code === q) return 100;
    if (row.card_number === q || row.card_number === normalizeCardNumber(q)) return 95;
    if (row.phone && this.phoneSearchVariants(q).includes(row.phone)) return 90;
    if (matchType === 'name' && row.name.toLowerCase() === lower) return 80;
    if (matchType === 'name') return 50;
    return 40;
  }

  async universalSearch(
    q: string,
    branchIds: number[] | null = null,
    limit = 10,
  ): Promise<ClubSearchHit[]> {
    const query = q.trim();
    if (!query || query.length < 2) return [];

    const take = Math.min(limit, 20);
    const cardNorm = normalizeCardNumber(query);
    const phoneVariants = this.phoneSearchVariants(query);

    const or: Prisma.club_membersWhereInput[] = [
      { member_code: query },
      { member_code: { contains: query } },
      { card_number: query },
      { card_number: cardNorm },
      { name: { contains: query } },
    ];
    for (const p of phoneVariants) {
      or.push({ phone: p }, { phone: { contains: p } });
    }

    const and: Prisma.club_membersWhereInput[] = [{ is_deleted: false }, { OR: or }];
    if (branchIds !== null) and.push({ branch_id: { in: branchIds } });

    const members = await this.prisma.club_members.findMany({
      where: { AND: and },
      take: take * 3,
      orderBy: { updated_at: 'desc' },
    });

    const memberIds = members.map((m) => m.id);
    const [subs, lastAtt] = await Promise.all([
      memberIds.length
        ? this.prisma.club_subscriptions.findMany({
            where: {
              member_id: { in: memberIds },
              ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            },
            orderBy: { subscription_end_date: 'desc' },
          })
        : [],
      memberIds.length
        ? this.prisma.club_attendance.findMany({
            where: {
              member_id: { in: memberIds },
              ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            },
            orderBy: { check_in_time: 'desc' },
            distinct: ['member_id'],
          })
        : [],
    ]);

    const subsByMember = new Map<number, typeof subs>();
    for (const s of subs) {
      if (!s.member_id) continue;
      const list = subsByMember.get(s.member_id) ?? [];
      list.push(s);
      subsByMember.set(s.member_id, list);
    }
    const lastByMember = new Map<number, (typeof lastAtt)[number]>(
      lastAtt.map((a) => [a.member_id, a] as const),
    );

    const hits: ClubSearchHit[] = members.map((m) => {
      let matchType: ClubSearchHit['matchType'] = 'partial';
      if (m.member_code === query) matchType = 'code';
      else if (m.card_number === query || m.card_number === cardNorm) matchType = 'card';
      else if (m.phone && phoneVariants.includes(m.phone)) matchType = 'phone';
      else if (m.name.toLowerCase().includes(query.toLowerCase())) matchType = 'name';

      const memberSubs = subsByMember.get(m.id) ?? [];
      const statusOf = (s: (typeof memberSubs)[number]) =>
        deriveSessionAwareStatus({
          startDate: s.subscription_start_date,
          endDate: s.subscription_end_date,
          isLinkedToSessions: s.is_linked_to_sessions,
          sessionsCount: s.sessions_count,
          sessionsUsed: s.sessions_used,
        });
      const active = memberSubs.find((s) => statusOf(s) === 'active');

      const last = lastByMember.get(m.id);

      return {
        id: m.id,
        memberCode: m.member_code,
        name: m.name,
        phone: m.phone,
        cardNumber: m.card_number,
        branchId: m.branch_id,
        isActive: m.is_active,
        matchType,
        activeSubscriptionType: active?.subscription_type ?? null,
        subscriptionStatus: active
          ? statusOf(active)
          : memberSubs[0]
            ? statusOf(memberSubs[0])
            : null,
        remainingAmount: active ? toNum(active.remaining_amount) : null,
        lastCheckIn: last?.check_in_time.toISOString() ?? null,
        score: this.scoreHit(m, query, matchType),
      };
    });

    return hits.sort((a, b) => b.score - a.score).slice(0, take);
  }

  async recentCheckIns(limit = 20, branchIds: number[] | null = null) {
    // Attendance keeps a denormalized member name for historical reports. Never use those
    // historical rows to surface a member that has since been removed from the active roster.
    const where: Prisma.club_attendanceWhereInput = {
      member: { is_deleted: false },
    };
    if (branchIds !== null) where.branch_id = { in: branchIds };

    const rows = await this.prisma.club_attendance.findMany({
      where,
      orderBy: { check_in_time: 'desc' },
      take: Math.min(limit, 50),
      distinct: ['member_id'],
    });

    return rows.map((r) => ({
      memberId: r.member_id,
      memberCode: r.member_code,
      memberName: r.member_name,
      branchId: r.branch_id,
      checkInTime: r.check_in_time,
      attendanceDate: r.attendance_date,
      status: r.status,
    }));
  }

  async searchWithEntitlement(q: string, branchIds: number[] | null = null) {
    const hits = await this.universalSearch(q, branchIds, 10);
    const top = hits[0];
    if (!top) return { hits: [], entitlement: null };

    let entitlement: Awaited<ReturnType<EntitlementService['validate']>> | null = null;
    try {
      entitlement = await this.entitlement.validate({
        memberId: top.id,
        branchId: top.branchId,
      });
    } catch {
      entitlement = null;
    }

    return { hits, entitlement, topMatch: top };
  }
}
