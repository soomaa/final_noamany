import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, daysBetween } from './club-subscription.utils';

export type RenewalChainNode = { id: number; memberId: number | null; branchId: number; startDate: string; endDate: string; isLinkedToSessions: boolean; sessionsCount: number | null; sessionsUsed: number; status: string };
export type RenewalPromotionResult = { activatedSubscriptionId: number | null; shiftedSubscriptionIds: number[]; shiftDays: number };
type RenewalClient = Prisma.TransactionClient | PrismaService;
type LoadedChainNode = RenewalChainNode & { successorId: number | null; isFrozen: boolean };

@Injectable()
export class ClubSubscriptionLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async findTail(sourceId: number, client: RenewalClient = this.prisma): Promise<RenewalChainNode> {
    const chain = await this.loadChain(sourceId, client);
    this.assertChainNotFrozen(chain);
    const { successorId: _successorId, isFrozen: _isFrozen, ...node } = chain.at(-1)!;
    return node;
  }

  async promoteAfterQuotaExhaustion(exhaustedSubscriptionId: number, today: string, client: Prisma.TransactionClient): Promise<RenewalPromotionResult> {
    const chain = await this.loadChain(exhaustedSubscriptionId, client);
    this.assertChainNotFrozen(chain);
    const successor = chain[1];
    if (!successor || successor.startDate <= today) return { activatedSubscriptionId: successor?.id ?? null, shiftedSubscriptionIds: [], shiftDays: 0 };
    const shiftDays = daysBetween(today, successor.startDate);
    const descendants = chain.slice(1);
    for (const node of descendants) {
      const startDate = addDays(node.startDate, -shiftDays);
      const endDate = addDays(node.endDate, -shiftDays);
      await client.club_subscriptions.update({ where: { id: node.id }, data: { subscription_start_date: startDate, subscription_end_date: endDate, status: this.statusAt(node, startDate, endDate, today) } });
    }
    return { activatedSubscriptionId: successor.id, shiftedSubscriptionIds: descendants.map((node) => node.id), shiftDays };
  }

  /** Keep the member profile aligned with the entitlement activated by an early quota transition. */
  async syncActivatedMember(subscriptionId: number): Promise<void> {
    const subscription = await this.prisma.club_subscriptions.findUnique({
      where: { id: subscriptionId },
      select: { member_id: true, subscription_start_date: true, subscription_end_date: true },
    });
    if (!subscription?.member_id) return;
    await this.prisma.club_members.update({
      where: { id: subscription.member_id },
      data: { start_date: subscription.subscription_start_date, end_date: subscription.subscription_end_date, is_active: true },
    });
  }

  private async loadChain(sourceId: number, client: RenewalClient): Promise<LoadedChainNode[]> {
    const seen = new Set<number>(); const chain: LoadedChainNode[] = []; let nextId: number | null = sourceId;
    let identity: Pick<LoadedChainNode, 'memberId' | 'branchId'> | null = null;
    while (nextId != null) {
      if (seen.has(nextId) || seen.size >= 100) throw new ConflictException('سلسلة التجديد غير سليمة — تواصل مع الدعم الفني');
      seen.add(nextId); const node = await this.loadNode(nextId, client);
      if (!identity) identity = { memberId: node.memberId, branchId: node.branchId };
      else if (node.memberId !== identity.memberId || node.branchId !== identity.branchId) throw new ConflictException('سلسلة التجديد مرتبطة بعضو أو فرع مختلف — تواصل مع الدعم الفني');
      chain.push(node); nextId = node.successorId;
    }
    return chain;
  }

  private async loadNode(id: number, client: RenewalClient): Promise<LoadedChainNode> {
    // renewal_successor becomes a generated Prisma relation when the additive migration is applied.
    const raw = await (client.club_subscriptions as unknown as { findUnique(args: unknown): Promise<unknown> }).findUnique({
      where: { id }, include: { renewal_successor: { select: { id: true } }, freezes: { where: { is_active: true }, select: { id: true }, take: 1 } },
    });
    if (!raw) throw new NotFoundException('الاشتراك غير موجود');
    const row = raw as { id: number; member_id: number | null; branch_id: number; subscription_start_date: string; subscription_end_date: string; is_linked_to_sessions: boolean; sessions_count: number | null; sessions_used: number; status: string; renewal_successor?: { id: number } | null; freezes?: Array<{ id: number }> };
    return { id: row.id, memberId: row.member_id, branchId: row.branch_id, startDate: row.subscription_start_date, endDate: row.subscription_end_date, isLinkedToSessions: row.is_linked_to_sessions, sessionsCount: row.sessions_count, sessionsUsed: row.sessions_used, status: row.status, successorId: row.renewal_successor?.id ?? null, isFrozen: row.status === 'frozen' || Boolean(row.freezes?.length) };
  }

  private assertChainNotFrozen(chain: LoadedChainNode[]) { if (chain.some((node) => node.isFrozen)) throw new ConflictException('سلسلة التجديد فيها اشتراك مجمّد — ألغِ التجميد أولاً'); }
  private statusAt(node: LoadedChainNode, startDate: string, endDate: string, today: string) {
    if (startDate > today) return 'upcoming'; if (endDate < today) return 'expired';
    return node.isLinkedToSessions && node.sessionsCount != null && node.sessionsUsed >= node.sessionsCount ? 'expired' : 'active';
  }
}
