import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubGymPoliciesService } from '../gym-ops/club-gym-policies.service';
import { ClubLeadsService } from './club-leads.service';
import { normalizePhone, phoneIdentityKey } from './club-sales.constants';
import { CreateInvitationDto } from './dto/leads.dto';
import { invitationLeadPackage, parseOptionalGuestAge } from './invitation-package.util';

@Injectable()
export class ClubInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly policies: ClubGymPoliciesService,
    private readonly leads: ClubLeadsService,
  ) {}

  private allowedCount(type: { invitations_count: number | null } | null) {
    return Math.max(0, Number(type?.invitations_count) || 0);
  }

  /**
   * Old imported subscriptions can carry only the package name. Resolve that legacy shape
   * only when exactly one package with the same name is assigned to the subscription branch;
   * ambiguity must stay at zero rather than borrowing an allowance from the wrong package.
   */
  private async invitationTypeForSubscription(
    subscription: {
      branch_id: number;
      subscription_type: string | null;
      type: { id: number; name: string; invitations_count: number | null } | null;
    },
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (subscription.type) return subscription.type;
    const name = subscription.subscription_type?.trim();
    if (!name) return null;
    const candidates = await client.club_subscription_types.findMany({
      where: {
        name,
        OR: [
          { apply_to_all_branches: true },
          { branch_id: subscription.branch_id },
          { branches: { some: { branch_id: subscription.branch_id } } },
        ],
      },
      select: {
        id: true,
        name: true,
        invitations_count: true,
      },
      take: 2,
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  async summaryForMember(memberId: number, user: JwtUser) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { id: true, branch_id: true, name: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!this.branchScope.isBranchAllowed(user, member.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId, status: { in: ['active', 'frozen'] } },
      include: { type: { select: { id: true, invitations_count: true, name: true } } },
      orderBy: { id: 'desc' },
    });
    const ids = subscriptions.map((row) => row.id);
    const [receptionUsedRows, memberAppUsedRows, resolvedTypes] = await Promise.all([
      ids.length
        ? this.prisma.club_guest_invitations.groupBy({
            by: ['subscription_id'],
            where: { subscription_id: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.am_invitations.groupBy({
            by: ['subscription_id'],
            where: { subscription_id: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      Promise.all(subscriptions.map((row) => this.invitationTypeForSubscription(row))),
    ]);
    const usedById = new Map<number, number>();
    for (const row of [...receptionUsedRows, ...memberAppUsedRows]) {
      if (row.subscription_id == null) continue;
      usedById.set(row.subscription_id, (usedById.get(row.subscription_id) ?? 0) + row._count._all);
    }
    const items = subscriptions.map((row, index) => {
      const allowed = this.allowedCount(resolvedTypes[index]);
      const used = usedById.get(row.id) ?? 0;
      return {
        subscriptionId: row.id,
        subscriptionNumber: row.subscription_number,
        subscriptionType: row.subscription_type ?? row.type?.name ?? null,
        status: row.status,
        includesInvitations: allowed > 0,
        allowed,
        used,
        remaining: Math.max(0, allowed - used),
      };
    });
    const remaining = items.reduce((sum, item) => sum + item.remaining, 0);
    const invitationRows = await this.prisma.club_guest_invitations.findMany({
      where: { member_id: member.id, branch_id: member.branch_id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        guest_name: true,
        guest_phone: true,
        guest_age: true,
        subscription_id: true,
        lead_id: true,
        branch_id: true,
        created_at: true,
      },
    });
    const historySubscriptionIds = [...new Set(invitationRows.map((row) => row.subscription_id))];
    const historyLeadIds = [...new Set(invitationRows.map((row) => row.lead_id).filter((id): id is number => id != null))];
    const historySubscriptions = historySubscriptionIds.length
      ? await this.prisma.club_subscriptions.findMany({
          where: { id: { in: historySubscriptionIds } },
          select: {
            id: true,
            subscription_number: true,
            subscription_type: true,
            type: { select: { name: true } },
          },
        })
      : [];
    const historyLeads = historyLeadIds.length
      ? await this.prisma.club_sales_crm_leads.findMany({
          where: { id: { in: historyLeadIds }, branch_id: member.branch_id },
          select: { id: true, status: true },
        })
      : [];
    const historySubscriptionById = new Map(historySubscriptions.map((row) => [row.id, row]));
    const historyLeadStatusById = new Map(historyLeads.map((row) => [row.id, row.status]));
    return {
      memberId: member.id,
      memberName: member.name,
      remaining,
      allowed: items.reduce((sum, item) => sum + item.allowed, 0),
      used: items.reduce((sum, item) => sum + item.used, 0),
      subscriptions: items,
      history: invitationRows.map((row) => {
        const subscription = historySubscriptionById.get(row.subscription_id);
        return {
          id: row.id,
          guestName: row.guest_name,
          guestPhone: row.guest_phone,
          guestAge: row.guest_age,
          subscriptionId: row.subscription_id,
          subscriptionNumber: subscription?.subscription_number ?? `#${row.subscription_id}`,
          subscriptionType: subscription?.subscription_type ?? subscription?.type?.name ?? null,
          leadId: row.lead_id,
          leadStatus: row.lead_id ? historyLeadStatusById.get(row.lead_id) ?? null : null,
          branchId: row.branch_id,
          createdAt: row.created_at,
        };
      }),
    };
  }

  async listRecent(user: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, null);
    const rows = await this.prisma.club_guest_invitations.findMany({
      where: scope ? { branch_id: { in: scope } } : undefined,
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        guest_name: true,
        guest_phone: true,
        guest_age: true,
        lead_id: true,
        subscription_id: true,
        member_id: true,
        branch_id: true,
        created_at: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        guestName: row.guest_name,
        guestPhone: row.guest_phone,
        guestAge: row.guest_age,
        leadId: row.lead_id,
        subscriptionId: row.subscription_id,
        memberId: row.member_id,
        branchId: row.branch_id,
        createdAt: row.created_at,
      })),
    };
  }

  async create(dto: CreateInvitationDto, user: JwtUser) {
    const subscription = await this.prisma.club_subscriptions.findUnique({
      where: { id: dto.subscriptionId },
      include: { type: true, member: true },
    });
    if (!subscription) throw new NotFoundException('الاشتراك غير موجود');
    if (!subscription.member_id || !subscription.member) {
      throw new BadRequestException('لا يمكن إضافة دعوة لاشتراك غير مرتبط بعضو');
    }
    if (!this.branchScope.isBranchAllowed(user, subscription.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    if (subscription.status !== 'active') {
      throw new BadRequestException('يمكن إصدار دعوة من اشتراك نشط فقط');
    }
    const resolvedType = await this.invitationTypeForSubscription(subscription);
    const allowed = this.allowedCount(resolvedType);
    if (allowed < 1) {
      throw new BadRequestException('هذه الخطة لا تتضمن دعوات');
    }
    const phone = normalizePhone(dto.guestPhone);
    const phoneKey = phoneIdentityKey(dto.guestPhone);
    if (phoneKey.length < 6) {
      throw new BadRequestException('رقم هاتف الضيف غير صالح');
    }
    const policies = await this.policies.get();
    const guestAge = parseOptionalGuestAge(dto.guestAge);
    const pkg = invitationLeadPackage({ ...subscription, type: resolvedType });
    let invitation: { id: number; guest_name: string; guest_phone: string; guest_age: number | null };
    let lead: { id: number };

    try {
      ({ invitation, lead } = await this.prisma.$transaction(async (tx) => {
        const [receptionUsed, memberAppUsed] = await Promise.all([
          tx.club_guest_invitations.count({ where: { subscription_id: subscription.id } }),
          tx.am_invitations.count({ where: { subscription_id: subscription.id } }),
        ]);
        const used = receptionUsed + memberAppUsed;
        if (used >= allowed) {
          throw new BadRequestException('لا توجد دعوات متبقية على هذا الاشتراك');
        }

        if (!policies.allowSameGuestMultipleInvitations) {
          const existing = await tx.club_guest_invitations.findFirst({
            where: {
              OR: [
                { guest_phone_unique_key: phoneKey },
                { guest_phone: phone },
              ],
            },
            select: { id: true },
          });
          if (existing) {
            throw new BadRequestException('هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم');
          }
        } else {
          const existingOnSub = await tx.club_guest_invitations.findFirst({
            where: { subscription_id: subscription.id, guest_phone: phone },
            select: { id: true },
          });
          if (existingOnSub) {
            throw new BadRequestException('هذا الرقم مسجّل بالفعل على دعوة لهذا الاشتراك');
          }
        }

        const createdInvitation = await tx.club_guest_invitations.create({
          data: {
            subscription_id: subscription.id,
            member_id: subscription.member_id!,
            guest_name: dto.guestName.trim(),
            guest_phone: phone,
            guest_phone_unique_key: policies.allowSameGuestMultipleInvitations ? null : phoneKey,
            guest_age: guestAge ?? null,
            branch_id: subscription.branch_id,
            created_by: user.sub,
          },
        });

        const createdLead = await this.leads.create({
          fullName: dto.guestName.trim(),
          phone,
          source: 'member_invitation',
          subscriptionTypeId: pkg.subscriptionTypeId ?? undefined,
          interestedProgram: pkg.interestedProgram ?? undefined,
          notes: `دعوة من العضو ${subscription.member!.name} — اشتراك ${subscription.subscription_number}`,
          branchId: subscription.branch_id,
          assignmentMode: 'automatic',
        }, user, { invitationId: createdInvitation.id, prisma: tx });

        await tx.club_guest_invitations.update({
          where: { id: createdInvitation.id },
          data: { lead_id: createdLead.id },
        });

        return { invitation: createdInvitation, lead: createdLead };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      const duplicateTarget = error && typeof error === 'object' && 'code' in error
        && error.code === 'P2002'
        && 'meta' in error
        && JSON.stringify(error.meta).includes('guest_phone_unique_key');
      if (duplicateTarget) {
        throw new BadRequestException('هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم');
      }
      throw error;
    }

    const summary = await this.summaryForMember(subscription.member_id, user);
    return {
      invitation: {
        id: invitation.id,
        guestName: invitation.guest_name,
        guestPhone: invitation.guest_phone,
        guestAge: invitation.guest_age,
        leadId: lead.id,
      },
      lead,
      remaining: summary.remaining,
      summary,
    };
  }
}
