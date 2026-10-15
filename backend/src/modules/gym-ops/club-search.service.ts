import { Injectable } from '@nestjs/common';
import { ClubGender, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deriveSessionAwareStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import {
  normalizeCardNumber,
  normalizePhoneForStorage,
  normalizePhoneInput,
  normalizeMemberSearchQuery,
  memberCodeSearchTerms,
  memberCodeSearchRank,
} from '../club-members/club-member.utils';
import { EntitlementService } from './entitlement.service';

const searchMemberSelect = {
  id: true, member_code: true, name: true, phone: true, card_number: true,
  branch_id: true, gender: true, is_active: true,
} satisfies Prisma.club_membersSelect;

export interface ClubSearchHit {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
  branchId: number;
  gender: ClubGender;
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

  private normalizeSearchQuery(q: string): string {
    return normalizeMemberSearchQuery(q);
  }

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
    const codeRank = memberCodeSearchRank(row.member_code, q);
    if (codeRank === 0) return 1000;
    if (codeRank === 1) return 800;
    if (codeRank === 2) return 600;
    if (row.card_number === q || row.card_number === normalizeCardNumber(q)) return 95;
    if (row.phone && this.phoneSearchVariants(q).includes(row.phone)) return 90;
    if (matchType === 'name' && row.name.toLowerCase() === lower) return 80;
    if (matchType === 'name') return 50;
    return 40;
  }

  private sortHits(hits: ClubSearchHit[], query: string): ClubSearchHit[] {
    const codeRank = (code: string) => memberCodeSearchRank(code, query);
    return hits.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rank = codeRank(left.memberCode) - codeRank(right.memberCode);
      if (rank !== 0) return rank;
      if (codeRank(left.memberCode) < 2) return left.memberCode.length - right.memberCode.length;
      return 0;
    });
  }

  async universalSearch(
    q: string,
    branchIds: number[] | null = null,
    limit = 10,
    gender?: ClubGender,
    brief = false,
  ): Promise<ClubSearchHit[]> {
    const query = this.normalizeSearchQuery(q);
    const numeric = /^\d+$/.test(query);
    const codeQuery = /^[a-z\d-]+$/i.test(query);
    if (!query || (!numeric && query.length < 2)) return [];

    const take = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 20)) : 10;
    const cardNorm = normalizeCardNumber(query);
    const phoneVariants = this.phoneSearchVariants(query);
    const codeTerms = memberCodeSearchTerms(query, branchIds);

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
    // Reception may work one section at a time (men / women); keep hits inside it.
    if (gender) and.push({ gender });

    const codeScope: Prisma.club_membersWhereInput[] = [{ is_deleted: false }];
    if (branchIds !== null) codeScope.push({ branch_id: { in: branchIds } });
    if (gender) codeScope.push({ gender });
    // Try indexed identities / code prefixes first. Lower-ranked substring matches
    // cannot change a full page of these matches, so avoid that scan when possible.
    const codeMatches = codeQuery || /^[+\d\s()-]+$/.test(query) ? await this.prisma.club_members.findMany({
      where: {
        AND: [
          ...codeScope,
          { OR: [
            ...codeTerms.exact.map((member_code) => ({ member_code })),
            ...(!(numeric && query.length <= 6) ? [
              { card_number: query }, { card_number: cardNorm },
              ...phoneVariants.map((phone) => ({ phone })),
            ] : []),
            ...(codeQuery ? codeTerms.prefixes.map((prefix) => ({ member_code: { startsWith: prefix } })) : []),
          ] },
        ],
      },
      take: take * 2,
      orderBy: { member_code: 'asc' },
      select: searchMemberSelect,
    }) : [];
    const codeCount = (rows: typeof codeMatches) => rows.filter((row) =>
      memberCodeSearchRank(row.member_code, query) < 3).length;
    const fullCodeFound = /^[a-z]{1,3}\d{6}$/i.test(query)
      && codeMatches.some((row) => memberCodeSearchRank(row.member_code, query) === 0);
    const needFallback = !fullCodeFound && (codeQuery ? codeCount(codeMatches) : codeMatches.length) < take;
    // Run the independent fallback scans together, rather than three serial reads.
    const [partialCodes, broadMatches] = needFallback ? await Promise.all([
      codeQuery ? this.prisma.club_members.findMany({
        where: { AND: [...codeScope, { member_code: { contains: query } }] },
        take: take * 2,
        orderBy: { member_code: 'asc' },
        select: searchMemberSelect,
      }) : Promise.resolve([]),
      this.prisma.club_members.findMany({
        where: { AND: and }, take: take * 3,
        orderBy: { updated_at: 'desc' }, select: searchMemberSelect,
      }),
    ]) : [[], []];
    const membersById = new Map<number, (typeof broadMatches)[number]>();
    for (const row of [...codeMatches, ...partialCodes, ...broadMatches]) membersById.set(row.id, row);
    const members = [...membersById.values()];

    const hits: ClubSearchHit[] = members.map((m) => {
      let matchType: ClubSearchHit['matchType'] = 'partial';
      if (memberCodeSearchRank(m.member_code, query) < 3) matchType = 'code';
      else if (m.card_number === query || m.card_number === cardNorm) matchType = 'card';
      else if (m.phone && phoneVariants.includes(m.phone)) matchType = 'phone';
      else if (m.name.toLowerCase().includes(query.toLowerCase())) matchType = 'name';
      return {
        id: m.id, memberCode: m.member_code, name: m.name, phone: m.phone,
        cardNumber: m.card_number, branchId: m.branch_id, gender: m.gender,
        isActive: m.is_active, matchType, activeSubscriptionType: null,
        subscriptionStatus: null, remainingAmount: null, lastCheckIn: null,
        score: this.scoreHit(m, query, matchType),
      };
    });
    const ranked = this.sortHits(hits, query).slice(0, take);
    if (brief || !ranked.length) return ranked;

    // Enrich only the visible hits, selecting only the fields used by search.
    const memberIds = ranked.map((m) => m.id);
    const [subs, attendanceMembers] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: {
          member_id: { in: memberIds },
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        },
        orderBy: { subscription_end_date: 'desc' },
        select: {
          member_id: true, subscription_type: true, subscription_start_date: true,
          subscription_end_date: true, is_linked_to_sessions: true,
          sessions_count: true, sessions_used: true, remaining_amount: true,
        },
      }),
      this.prisma.club_members.findMany({
        where: { AND: [...codeScope, { id: { in: memberIds } }] },
        select: {
          id: true,
          attendances: {
            where: {
              ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            },
            orderBy: { check_in_time: 'desc' },
            take: 1,
            select: { check_in_time: true },
          },
        },
      }),
    ]);

    const subsByMember = new Map<number, typeof subs>();
    for (const s of subs) {
      if (!s.member_id) continue;
      const list = subsByMember.get(s.member_id) ?? [];
      list.push(s);
      subsByMember.set(s.member_id, list);
    }
    const lastByMember = new Map(
      attendanceMembers.map((m) => [m.id, m.attendances?.[0]?.check_in_time] as const),
    );

    return ranked.map((m) => {
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
        ...m,
        activeSubscriptionType: active?.subscription_type ?? null,
        subscriptionStatus: active
          ? statusOf(active)
          : memberSubs[0]
            ? statusOf(memberSubs[0])
            : null,
        remainingAmount: active ? toNum(active.remaining_amount) : null,
        lastCheckIn: last?.toISOString() ?? null,
      };
    });
  }

  /** Package labels for visible identities only; never repeat the member search. */
  async subscriptionLabels(memberIds: number[], branchIds: number[] | null = null, gender?: ClubGender) {
    const ids = [...new Set(memberIds.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
    if (!ids.length || branchIds?.length === 0) return [];
    const subs = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: { in: ids },
        ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        member: {
          is_deleted: false,
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
          ...(gender ? { gender } : {}),
        },
      },
      orderBy: { subscription_end_date: 'desc' },
      select: {
        member_id: true, subscription_type: true, subscription_start_date: true,
        subscription_end_date: true, is_linked_to_sessions: true,
        sessions_count: true, sessions_used: true,
      },
    });
    const labels = new Map<number, string | null>();
    for (const sub of subs) {
      if (!sub.member_id || labels.has(sub.member_id)) continue;
      if (deriveSessionAwareStatus({
        startDate: sub.subscription_start_date, endDate: sub.subscription_end_date,
        isLinkedToSessions: sub.is_linked_to_sessions,
        sessionsCount: sub.sessions_count, sessionsUsed: sub.sessions_used,
      }) === 'active') labels.set(sub.member_id, sub.subscription_type);
    }
    return [...labels].map(([id, activeSubscriptionType]) => ({ id, activeSubscriptionType }));
  }

  async recentCheckIns(
    limit = 20,
    branchIds: number[] | null = null,
    gender?: ClubGender,
  ) {
    // Attendance keeps a denormalized member name for historical reports. Never use those
    // historical rows to surface a member that has since been removed from the active roster.
    const where: Prisma.club_attendanceWhereInput = {
      member: { is_deleted: false, ...(gender ? { gender } : {}) },
    };
    if (branchIds !== null) where.branch_id = { in: branchIds };

    const rows = await this.prisma.club_attendance.findMany({
      where,
      orderBy: { check_in_time: 'desc' },
      take: Math.min(limit, 50),
      distinct: ['member_id'],
      include: { member: { select: { gender: true } } },
    });

    return rows.map((r) => ({
      memberId: r.member_id,
      memberCode: r.member_code,
      memberName: r.member_name,
      branchId: r.branch_id,
      gender: r.member?.gender ?? null,
      checkInTime: r.check_in_time,
      attendanceDate: r.attendance_date,
      status: r.status,
    }));
  }

  async searchWithEntitlement(
    q: string,
    branchIds: number[] | null = null,
    gender?: ClubGender,
  ) {
    const hits = await this.universalSearch(q, branchIds, 10, gender);
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
