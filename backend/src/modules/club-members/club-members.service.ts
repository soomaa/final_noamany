import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../common/constants/member-auth.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { assertDateOrder } from '../../common/validators';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { buildDuplicateMessage, findMemberDuplicates } from './club-member-duplicates';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import {
  isMarketingRepJobTitle,
  marketingRepEmployeeWhere,
  marketingRepJobTitleWhere,
} from '../employees/marketing-rep.util';
import {
  branchCodePrefix,
  computeSubscriptionStatus,
  formatBranchMemberCode,
  getEmailValidationError,
  getNationalIdFormatError,
  getPhoneValidationError,
  localDateString,
  normalizeName,
  normalizeMemberSearchQuery,
  normalizeNationalIdForStorage,
  normalizePhoneForStorage,
  nextSeqFromMax,
} from './club-member.utils';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { UpsertClubMemberDto } from './dto/upsert-club-member.dto';
import { ClubSubscriptionRefundsService, RefundPreview } from '../club-subscriptions/club-subscription-refunds.service';
import { toNum } from '../club-subscriptions/club-subscription.utils';
import { buildMemberProfileSummary } from './club-member-profile-summary';
import { createDefaultMemberAppUser } from './member-app-account';
import { pickCommissionTier, roundMoney } from '../club-sales/club-sales.constants';
import { resolveTargetCycle } from '../club-sales/target-period';
import { resolveDatabaseSalesSettings } from '../club-sales/sales-defaults';
import { GateCredentialService } from '../gate-access/gate-credential.service';

/** True when a P2002 unique violation came from a constraint/index whose name contains `needle`. */
function isUniqueTarget(e: Prisma.PrismaClientKnownRequestError, needle: string): boolean {
  const target = (e.meta as { target?: string | string[] } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.toLowerCase().includes(needle.toLowerCase());
}

@Injectable()
export class ClubMembersService {
  @Inject(GateCredentialService)
  private readonly gateCredentials!: GateCredentialService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
    private readonly subscriptionRefunds: ClubSubscriptionRefundsService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  /** One real number, written to the audit log. Lists keep the number masked. */
  async revealPhone(id: number, user: JwtUser) {
    const row = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, phone: true, branch_id: true, name: true },
    });
    if (!row || !this.branchScope.isBranchAllowed(user, row.branch_id)) throw new NotFoundException('العضو غير موجود');
    await this.audit.log({
      entityType: 'club_member',
      entityId: row.id,
      action: 'reveal_phone',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: row.branch_id,
      after: { memberName: row.name },
    });
    return { id: row.id, phone: row.phone };
  }

  async revealLeadPhone(id: number, user: JwtUser) {
    const lead = await this.prisma.club_sales_crm_leads.findFirst({
      where: { id },
      select: { id: true, phone: true, full_name: true, branch_id: true },
    });
    if (!lead || !this.branchScope.isBranchAllowed(user, lead.branch_id)) {
      throw new NotFoundException('العميل المحتمل غير موجود');
    }
    await this.audit.log({
      entityType: 'club_sales_crm_lead',
      entityId: lead.id,
      action: 'reveal_phone',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: lead.branch_id,
      after: { leadName: lead.full_name },
    });
    return { id: lead.id, phone: lead.phone };
  }

  private mapMember(row: {
    id: number;
    member_code: string;
    name: string;
    phone: string | null;
    email: string | null;
    gender: string;
    card_number: string | null;
    date_of_birth: string | null;
    address: string | null;
    marital_status: string | null;
    job_title: string | null;
    profile_picture: string | null;
    branch_id: number;
    membership_type_id: number | null;
    start_date: string | null;
    end_date: string | null;
    notes: string | null;
    is_active: boolean;
    is_blocked: boolean;
    block_reason: string | null;
    blocked_at: Date | null;
    blocked_by: number | null;
    sales_id: number | null;
    employee_id: number | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    created_by: number | null;
    app_user_id: number | null;
    created_at: Date;
    updated_at: Date;
    membership_type?: { id: number; name: string; price: Prisma.Decimal; duration_days: number } | null;
    gate_credential?: { credential_no: string; is_active: boolean } | null;
    attendances?: { check_in_time: Date }[];
  }) {
    return {
      id: row.id,
      memberCode: row.member_code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      gender: row.gender,
      cardNumber: row.card_number,
      scannerCode: row.gate_credential?.is_active ? row.gate_credential.credential_no : null,
      dateOfBirth: row.date_of_birth,
      address: row.address,
      maritalStatus: row.marital_status,
      jobTitle: row.job_title,
      profilePicture: row.profile_picture,
      branchId: row.branch_id,
      membershipTypeId: row.membership_type_id,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      isActive: row.is_active,
      isBlocked: row.is_blocked,
      blockReason: row.block_reason,
      blockedAt: row.blocked_at,
      blockedBy: row.blocked_by,
      salesId: row.sales_id,
      employeeId: row.employee_id,
      createdBy: row.created_by,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      appUserId: row.app_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCheckIn: row.attendances?.[0]?.check_in_time ?? null,
      membershipType: row.membership_type
        ? {
            id: row.membership_type.id,
            name: row.membership_type.name,
            price: Number(row.membership_type.price),
            durationDays: row.membership_type.duration_days,
          }
        : null,
    };
  }

  async list(q: ListClubMembersDto, user?: JwtUser) {
    const and: Prisma.club_membersWhereInput[] = [{ is_deleted: false }];

    if (q.search?.trim()) {
      const s = normalizeMemberSearchQuery(q.search);
      and.push({
        OR: [
          { name: { contains: s } },
          { member_code: { contains: s } },
          { phone: { contains: s } },
          ...(/^[+\d\s()-]+$/.test(s) ? [{ phone: { contains: normalizePhoneForStorage(s) } }] : []),
        ],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    // Default a branch-scoped user to their allowed branches when they omit/broaden the branch param.
    // Added as a separate AND clause so it INTERSECTS any explicit branch filter above (never replaces it).
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    if (q.gender && q.gender !== 'all') and.push({ gender: q.gender as 'male' | 'female' });
    // Only employees whose primary job is sales are ownership-scoped here.
    // An additional sales assignment grants the sales portal without hiding the
    // full reception member/barcode list from receptionists.
    if (!q.forSelect && user && (await this.hasSalesJobTitle(user.emp_code))) {
      and.push({ created_by: user.sub });
    }
    if (q.createdFrom || q.createdTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (q.createdFrom) range.gte = new Date(`${q.createdFrom}T00:00:00`);
      if (q.createdTo) range.lte = new Date(`${q.createdTo}T23:59:59.999`);
      and.push({ created_at: range });
    }

    const where: Prisma.club_membersWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.club_members.findMany({
        where,
        include: {
          membership_type: { select: { id: true, name: true, price: true, duration_days: true } },
          gate_credential: { select: { credential_no: true, is_active: true } },
          ...(!q.forSelect
            ? {
                attendances: {
                  orderBy: { check_in_time: 'desc' as const },
                  take: 1,
                  select: { check_in_time: true },
                },
              }
            : {}),
        },
        orderBy: q.forSelect ? { name: 'asc' } : { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_members.count({ where }),
    ]);

    // QR management explicitly opts in. Work only on this already-scoped page,
    // and preserve existing credentials, including disabled credentials.
    if (q.includeGateCredentials && !q.forSelect) {
      const missing = rows.filter((row) => !row.gate_credential);
      for (let offset = 0; offset < missing.length; offset += 20) {
        await Promise.all(missing.slice(offset, offset + 20).map(async (row) => {
          row.gate_credential = await this.gateCredentials.ensureForMember(row.id);
        }));
      }
    }

    return paginated(rows.map((r) => this.mapMember(r)), total, q.page, q.pageSize);
  }

  async statistics(user?: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, null);
    const branchWhere: Prisma.club_membersWhereInput =
      scope === null ? {} : { branch_id: { in: scope } };
    const memberWhere: Prisma.club_membersWhereInput = { is_deleted: false, ...branchWhere };
    const total = await this.prisma.club_members.count({ where: memberWhere });

    const today = localDateString();
    const activeSubs = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: { not: null },
        member: memberWhere,
        OR: [{ status: 'active' }, { subscription_end_date: { gte: today } }],
      },
      select: { member_id: true },
      distinct: ['member_id'],
    });
    const active = activeSubs.length;

    return { total, active, inactive: total - active };
  }

  async salesPortal(user: JwtUser) {
    if (!user.emp_code || !(await this.isSalesEmployee(user.emp_code))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }

    const scope = this.branchScope.resolveListFilter(user, null);
    const ownerWhere: Prisma.club_membersWhereInput = {
      is_deleted: false,
      ...(scope === null ? {} : { branch_id: { in: scope } }),
      OR: [{ sales_id: user.emp_code }, { created_by: user.sub }],
    };
    const today = localDateString();
    const todayStart = new Date(`${today}T00:00:00`);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00`);
    const settings = await this.prisma.club_sales_rep_settings.findUnique({
      where: { employee_id: user.emp_code },
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    const salesDefaults = await this.prisma.club_sales_default_settings?.findUnique({
      where: { id: 1 },
      include: { tiers: true },
    }) ?? null;
    const effectiveSalesSettings = resolveDatabaseSalesSettings(settings, salesDefaults);
    const cycle = resolveTargetCycle({
      mode: effectiveSalesSettings.targetPeriodMode,
      startDate: effectiveSalesSettings.targetStartDate,
      endDate: effectiveSalesSettings.targetEndDate,
      days: effectiveSalesSettings.targetDays,
    }, today);
    const [
      totalAssigned,
      registeredToday,
      registeredThisMonth,
      activeMembers,
      recentRows,
      subscriptions,
      leads,
    ] = await Promise.all([
      this.prisma.club_members.count({ where: ownerWhere }),
      this.prisma.club_members.count({
        where: { ...ownerWhere, created_at: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.club_members.count({ where: { ...ownerWhere, created_at: { gte: monthStart } } }),
      this.prisma.club_members.count({ where: { ...ownerWhere, is_active: true } }),
      this.prisma.club_members.findMany({
        where: ownerWhere,
        select: {
          id: true,
          member_code: true,
          name: true,
          phone: true,
          is_active: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          sales_id: user.emp_code,
          registration_date: { gte: cycle.startDate, lte: cycle.endDate },
          ...(scope === null ? {} : { branch_id: { in: scope } }),
        },
        select: {
          id: true,
          subscription_number: true,
          customer_name: true,
          paid_amount: true,
          registration_date: true,
          subscription_type: true,
        },
        orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_sales_crm_leads.findMany({
        where: {
          assigned_to_id: user.emp_code,
          ...(scope === null ? {} : { branch_id: { in: scope } }),
        },
        select: {
          id: true,
          full_name: true,
          phone: true,
          status: true,
          created_at: true,
          last_contacted_at: true,
        },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    const actualRevenue = roundMoney(
      subscriptions.reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0),
    );
    const target = effectiveSalesSettings.monthlyTarget;
    const achievementPct = target > 0
      ? roundMoney((actualRevenue / target) * 100)
      : actualRevenue > 0 ? 100 : 0;
    let commissionPercent = effectiveSalesSettings.flatCommissionPercent;
    if (effectiveSalesSettings.commissionMode === 'tiered') {
      const tier = pickCommissionTier(
        effectiveSalesSettings.tiers,
        achievementPct,
      );
      commissionPercent = tier?.commissionPercent ?? 0;
    }
    const convertedLeads = leads.filter((row) => row.status === 'converted').length;
    const overdueBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const overdueLeads = leads.filter((row) =>
      ['new', 'in_progress'].includes(row.status)
      && (row.last_contacted_at ?? row.created_at) <= overdueBefore,
    ).length;
    const responseHours = leads
      .filter((row) => row.last_contacted_at)
      .map((row) => (row.last_contacted_at!.getTime() - row.created_at.getTime()) / 36e5);
    const pipeline = {
      new: leads.filter((row) => row.status === 'new').length,
      inProgress: leads.filter((row) => row.status === 'in_progress').length,
      followLater: leads.filter((row) => row.status === 'follow_later').length,
      qualified: leads.filter((row) => row.status === 'qualified').length,
      converted: convertedLeads,
      lost: leads.filter((row) => row.status === 'lost').length,
    };

    // The personal portal may expose team position, but never another rep's
    // sales, target, or commission amounts. Calculate the ranking server-side
    // and return only the safe fields the portal needs.
    const salesJobs = await this.prisma.department_jobs.findMany({
      where: marketingRepJobTitleWhere,
      select: { id: true },
    });
    const salesReps = await this.prisma.employees.findMany({
      where: {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          { employee_type: 1 },
          marketingRepEmployeeWhere(salesJobs.map((job) => job.id)),
          ...(scope === null ? [] : [{ branch_id_fk: { in: scope } }]),
        ],
      },
      select: { id: true, employee: true, branch_id_fk: true },
      orderBy: { employee: 'asc' },
    });
    const repIds = salesReps.map((rep) => rep.id);
    const repSettings = repIds.length
      ? await this.prisma.club_sales_rep_settings.findMany({
          where: { employee_id: { in: repIds } },
          select: {
            employee_id: true,
            monthly_target: true,
            target_period_mode: true,
            target_start_date: true,
            target_end_date: true,
            target_days: true,
            use_defaults: true,
          },
        })
      : [];
    const settingsByRep = new Map(repSettings.map((row) => [row.employee_id, row]));
    const rankingCycles = salesReps.map((rep) => {
      const repSetting = settingsByRep.get(rep.id);
      const effective = resolveDatabaseSalesSettings(repSetting, salesDefaults);
      return {
        rep,
        target: effective.monthlyTarget,
        cycle: resolveTargetCycle({
          mode: effective.targetPeriodMode,
          startDate: effective.targetStartDate,
          endDate: effective.targetEndDate,
          days: effective.targetDays,
        }, today),
      };
    });
    const rankingStart = rankingCycles.reduce(
      (earliest, row) => row.cycle.startDate < earliest ? row.cycle.startDate : earliest,
      rankingCycles[0]?.cycle.startDate ?? today,
    );
    const rankingEnd = rankingCycles.reduce(
      (latest, row) => row.cycle.endDate > latest ? row.cycle.endDate : latest,
      rankingCycles[0]?.cycle.endDate ?? today,
    );
    const rankingSubscriptions = repIds.length
      ? await this.prisma.club_subscriptions.findMany({
          where: {
            sales_id: { in: repIds },
            registration_date: { gte: rankingStart, lte: rankingEnd },
            ...(scope === null ? {} : { branch_id: { in: scope } }),
          },
          select: { sales_id: true, paid_amount: true, registration_date: true },
        })
      : [];
    const leaderboard = rankingCycles
      .map(({ rep, target: repTarget, cycle: repCycle }) => {
        const revenue = roundMoney(rankingSubscriptions
          .filter((row) => row.sales_id === rep.id
            && row.registration_date >= repCycle.startDate
            && row.registration_date <= repCycle.endDate)
          .reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0));
        return {
          employeeId: rep.id,
          name: rep.employee?.trim() || `#${rep.id}`,
          achievementPct: repTarget > 0
            ? roundMoney((revenue / repTarget) * 100)
            : revenue > 0 ? 100 : 0,
        };
      })
      .sort((a, b) => b.achievementPct - a.achievementPct || a.name.localeCompare(b.name, 'ar'))
      .map((row, index) => ({
        rank: index + 1,
        ...row,
        isCurrent: row.employeeId === user.emp_code,
      }));

    return {
      specialist: { employeeId: user.emp_code, name: user.name, branchId: user.branch },
      statistics: { totalAssigned, registeredToday, registeredThisMonth, activeMembers },
      performance: {
        periodStart: cycle.startDate,
        periodEnd: cycle.endDate,
        resetDate: cycle.resetDate,
        payoutDate: cycle.payoutDate,
        target,
        actualRevenue,
        achievementPct,
        commissionPercent,
        commissionDue: roundMoney(actualRevenue * commissionPercent / 100),
        assignedLeads: leads.length,
        overdueLeads,
        convertedLeads,
        conversionRate: leads.length ? roundMoney((convertedLeads / leads.length) * 100) : 0,
        averageResponseHours: responseHours.length
          ? roundMoney(responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length)
          : null,
        closedDeals: subscriptions.length,
      },
      pipeline,
      leaderboard,
      closedDeals: subscriptions.slice(0, 10).map((row) => ({
        id: row.id,
        subscriptionNumber: row.subscription_number,
        customerName: row.customer_name,
        paidAmount: Number(row.paid_amount ?? 0),
        registrationDate: row.registration_date,
        subscriptionType: row.subscription_type,
      })),
      recentMembers: recentRows.map((row) => ({
        id: row.id,
        memberCode: row.member_code,
        name: row.name,
        phone: row.phone,
        isActive: row.is_active,
        createdAt: row.created_at,
      })),
    };
  }

  async salesRenewals(user: JwtUser, query: {
    window?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (!user.emp_code || !(await this.isSalesEmployee(user.emp_code))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }
    const scope = this.branchScope.resolveListFilter(user, null);
    const soldByMe = await this.prisma.club_subscriptions.findMany({
      where: { sales_id: user.emp_code, member_id: { not: null } },
      select: { member_id: true },
      distinct: ['member_id'],
    });
    const soldMemberIds = soldByMe
      .map((row) => row.member_id)
      .filter((id): id is number => id != null);
    const members = await this.prisma.club_members.findMany({
      where: {
        is_deleted: false,
        ...(scope === null ? {} : { branch_id: { in: scope } }),
        OR: [
          { sales_id: user.emp_code },
          { created_by: user.sub },
          ...(soldMemberIds.length ? [{ id: { in: soldMemberIds } }] : []),
        ],
      },
      select: { id: true, member_code: true, name: true, phone: true, branch_id: true },
    });
    const pageSize = Number.isInteger(query.pageSize)
      ? Math.min(Math.max(query.pageSize!, 1), 100)
      : 25;
    if (!members.length) {
      return { data: [], total: 0, page: 1, pageSize, summary: { expired: 0, dueSoon: 0, total: 0 } };
    }

    const memberIds = members.map((member) => member.id);
    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: { in: memberIds },
        ...(scope === null ? {} : { branch_id: { in: scope } }),
      },
      select: {
        id: true,
        member_id: true,
        subscription_type: true,
        paid_amount: true,
        renewed_from_subscription_id: true,
        subscription_start_date: true,
        subscription_end_date: true,
        status: true,
        type: { select: { name: true } },
      },
      orderBy: [{ member_id: 'asc' }, { subscription_end_date: 'desc' }, { id: 'desc' }],
    });
    const latestByMember = new Map<number, (typeof subscriptions)[number]>();
    for (const subscription of subscriptions) {
      if (subscription.member_id != null && !latestByMember.has(subscription.member_id)) {
        latestByMember.set(subscription.member_id, subscription);
      }
    }

    const phones = members
      .map((member) => (member.phone ? normalizePhoneForStorage(member.phone) : null))
      .filter((phone): phone is string => Boolean(phone));
    const leads = await this.prisma.club_sales_crm_leads.findMany({
      where: {
        assigned_to_id: user.emp_code,
        ...(scope === null ? {} : { branch_id: { in: scope } }),
        OR: [
          { converted_member_id: { in: memberIds } },
          ...(phones.length ? [{ phone: { in: phones } }] : []),
        ],
      },
      select: { id: true, phone: true, converted_member_id: true, last_contacted_at: true },
      orderBy: [{ last_contacted_at: 'desc' }, { id: 'desc' }],
    });
    const leadByMember = new Map<number, (typeof leads)[number]>();
    const leadByPhone = new Map<string, (typeof leads)[number]>();
    for (const lead of leads) {
      if (lead.converted_member_id != null && !leadByMember.has(lead.converted_member_id)) {
        leadByMember.set(lead.converted_member_id, lead);
      }
      const phone = normalizePhoneForStorage(lead.phone);
      if (phone && !leadByPhone.has(phone)) leadByPhone.set(phone, lead);
    }

    const today = localDateString();
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const rows = members.flatMap((member) => {
      const subscription = latestByMember.get(member.id);
      if (!subscription) return [];
      const endMs = Date.parse(`${subscription.subscription_end_date}T00:00:00Z`);
      if (!Number.isFinite(endMs)) return [];
      const daysRemaining = Math.round((endMs - todayMs) / 86_400_000);
      const phoneKey = member.phone ? normalizePhoneForStorage(member.phone) : '';
      const lead = leadByMember.get(member.id) ?? (phoneKey ? leadByPhone.get(phoneKey) : undefined);
      return [{
        memberId: member.id,
        memberCode: member.member_code,
        memberName: member.name,
        phone: member.phone,
        branchId: member.branch_id,
        subscriptionId: subscription.id,
        subscriptionType: subscription.type?.name ?? subscription.subscription_type ?? 'اشتراك',
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        status: subscription.status,
        paidAmount: toNum(subscription.paid_amount),
        isRenewed: subscription.renewed_from_subscription_id != null,
        daysRemaining,
        leadId: lead?.id ?? null,
        lastContactedAt: lead?.last_contacted_at ?? null,
      }];
    });
    const summary = {
      expired: rows.filter((row) => row.daysRemaining < 0).length,
      dueSoon: rows.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length,
      total: rows.filter((row) => row.daysRemaining <= 14).length,
    };
    const renewalWindow = ['expired', '5', '7', '14', 'all', 'renewed'].includes(query.window ?? '')
      ? query.window!
      : 'all';
    const search = query.search?.trim().toLocaleLowerCase('ar') ?? '';
    const filtered = rows.filter((row) => {
      if (renewalWindow === 'renewed' && (!row.isRenewed || row.daysRemaining < 0)) return false;
      if (renewalWindow === 'all' && row.daysRemaining > 14) return false;
      if (renewalWindow === 'expired' && row.daysRemaining >= 0) return false;
      if (!['all', 'expired', 'renewed'].includes(renewalWindow)) {
        const days = Number(renewalWindow);
        if (row.daysRemaining < 0 || row.daysRemaining > days) return false;
      }
      if (!search) return true;
      return [row.memberName, row.memberCode, row.phone ?? '', row.subscriptionType]
        .some((value) => value.toLocaleLowerCase('ar').includes(search));
    });
    filtered.sort((a, b) => {
      const aExpired = a.daysRemaining < 0;
      const bExpired = b.daysRemaining < 0;
      if (aExpired !== bExpired) return aExpired ? -1 : 1;
      return aExpired ? b.daysRemaining - a.daysRemaining : a.daysRemaining - b.daysRemaining;
    });
    const page = Number.isInteger(query.page) && query.page! > 0 ? query.page! : 1;
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
      summary,
    };
  }

  async checkDuplicates(query: {
    phone?: string;
    cardNumber?: string;
    branchId?: number;
    excludeMemberId?: number;
  }, user?: JwtUser) {
    const branchId = query.branchId ?? Number(user?.branch ?? 0);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('الفرع مطلوب لفحص التكرار');
    }
    this.assertBranchAccess(user, branchId);
    const duplicates = await findMemberDuplicates(this.prisma, {
      branchId,
      phone: query.phone,
      cardNumber: query.cardNumber,
      excludeMemberId: query.excludeMemberId,
    });
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
      message: duplicates.length ? buildDuplicateMessage(duplicates) : null,
    };
  }

  async nextCode(branchId?: number, user?: JwtUser): Promise<{ memberCode: string }> {
    const resolvedBranchId = branchId ?? Number(user?.branch ?? 0);
    if (!Number.isInteger(resolvedBranchId) || resolvedBranchId <= 0) {
      throw new BadRequestException('الفرع مطلوب');
    }
    this.assertBranchAccess(user, resolvedBranchId);
    const code = await this.generateMemberCode(resolvedBranchId);
    return { memberCode: code };
  }

  /**
   * Generate a member code continuing the legacy branch sequence (e.g. A012254 after A012253).
   * Uses a MySQL advisory lock to serialize concurrent code generation.
   */
  private async generateMemberCode(branchId: number): Promise<string> {
    return this.prisma.$transaction((tx) => this.generateMemberCodeInTx(tx, branchId));
  }

  private async generateMemberCodeInTx(tx: Prisma.TransactionClient, branchId: number): Promise<string> {
    const prefix = branchCodePrefix(branchId);
    const pattern = `^${prefix}[0-9]+$`;
    const startPos = prefix.length + 1;
    await tx.$queryRaw`SELECT GET_LOCK('club_member_code', 10)`;
    try {
      const rows = await tx.$queryRaw<{ maxNum: unknown }[]>`
        SELECT MAX(CAST(SUBSTRING(member_code, ${startPos}) AS UNSIGNED)) AS maxNum
        FROM club_members
        WHERE member_code REGEXP ${pattern}
      `;
      return formatBranchMemberCode(branchId, nextSeqFromMax(rows[0]?.maxNum));
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK('club_member_code')`;
    }
  }

  /** ONE80's documented first-login password. */
  private defaultAppPassword(): string {
    return MEMBER_DEFAULT_PASSWORD;
  }

  private shouldCreateAppAccount(dto: Pick<UpsertClubMemberDto, 'phone'>): boolean {
    return normalizePhoneForStorage(dto.phone ?? '').length > 0;
  }

  /** Mobile app login for gym members — stored in api_users, not HR users. */
  private async provisionAppUser(
    tx: Prisma.TransactionClient,
    dto: UpsertClubMemberDto,
  ): Promise<{ username: string; plaintextPassword: string; appUserId: number } | null> {
    return createDefaultMemberAppUser(tx, dto);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      include: {
        membership_type: { select: { id: true, name: true, price: true, duration_days: true } },
        gate_credential: { select: { credential_no: true, is_active: true } },
      },
    });
    if (!row) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return this.mapMember(row);
  }

  async profileSummary(id: number, user?: JwtUser) {
    const member = await this.findOne(id, user);
    const [subscriptions, attendances, handoffs] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: { member_id: id, branch_id: member.branchId },
        select: {
          id: true,
          subscription_number: true,
          subscription_type: true,
          subscription_type_id: true,
          status: true,
          subscription_start_date: true,
          subscription_end_date: true,
          freezes: { where: { is_active: true }, orderBy: { id: 'desc' }, take: 1, select: { freeze_start_date: true, freeze_end_date: true, original_end_date: true } },
          is_linked_to_sessions: true,
          sessions_count: true,
          sessions_used: true,
        },
        orderBy: [{ subscription_start_date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_attendance.findMany({
        where: { member_id: id, branch_id: member.branchId },
        select: {
          id: true,
          subscription_id: true,
          attendance_date: true,
          check_in_time: true,
          check_out_time: true,
          duration: true,
          status: true,
        },
        orderBy: { check_in_time: 'desc' },
      }),
      this.prisma.club_locker_handoffs.findMany({
        where: { member_id: id, branch_id: member.branchId },
        orderBy: { assigned_at: 'desc' },
        take: 50,
        include: { locker: { select: { locker_number: true } } },
      }),
    ]);
    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const renewalRows = subscriptionIds.length
      ? await this.prisma.business_audit_log.findMany({
          where: {
            entity_type: 'club_subscription',
            action: 'renew',
            entity_id: { in: subscriptionIds.map(String) },
          },
          select: { entity_id: true },
        })
      : [];
    const renewalSubscriptionIds = new Set(
      renewalRows.map((row) => Number(row.entity_id)).filter(Number.isFinite),
    );

    return {
      member,
      ...buildMemberProfileSummary({
        today: localDateString(),
        subscriptions,
        attendances,
        renewalSubscriptionIds,
        renewalCount: renewalRows.length,
      }),
      lockerHandoffs: handoffs.map((row) => ({
        id: row.id,
        lockerNumber: row.locker.locker_number,
        assignedAt: row.assigned_at.toISOString(),
        releasedAt: row.released_at ? row.released_at.toISOString() : null,
      })),
    };
  }

  async financialHistory(id: number, user?: JwtUser, dateFrom?: string, dateTo?: string) {
    const member = await this.findOne(id, user);

    const subWhere: { member_id: number; registration_date?: { gte?: string; lte?: string } } = {
      member_id: id,
    };
    if (dateFrom && dateTo) subWhere.registration_date = { gte: dateFrom, lte: dateTo };

    const receiptWhere: { member_id: number; receipt_date?: { gte?: string; lte?: string } } = {
      member_id: id,
    };
    if (dateFrom && dateTo) receiptWhere.receipt_date = { gte: dateFrom, lte: dateTo };

    const [subs, receipts] = await Promise.all([
      this.prisma.club_subscriptions.findMany({ where: subWhere, orderBy: { registration_date: 'desc' } }),
      this.prisma.club_receipts.findMany({ where: receiptWhere, orderBy: { receipt_date: 'desc' } }),
    ]);

    const subscriptions = subs.map((s) => {
      const net = Number(s.subscription_value) - (s.discount_enabled ? Number(s.discount_value) : 0);
      return {
        id: s.id,
        subscriptionNumber: s.subscription_number,
        registrationDate: s.registration_date,
        subscriptionType: s.subscription_type,
        subscriptionStartDate: s.subscription_start_date,
        subscriptionEndDate: s.subscription_end_date,
        subscriptionValue: Number(s.subscription_value),
        netValue: net,
        paidAmount: Number(s.paid_amount),
        remainingAmount: Number(s.remaining_amount),
        status: computeSubscriptionStatus(s.subscription_start_date, s.subscription_end_date),
      };
    });

    const receiptRows = receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number,
      amount: Number(r.amount),
      receiptDate: r.receipt_date,
      type: r.type,
      status: r.status,
      description: r.description,
    }));

    const timeline = [
      ...subscriptions.map((s) => ({
        kind: 'subscription' as const,
        sortDate: s.registrationDate,
        data: s,
      })),
      ...receiptRows.map((r) => ({
        kind: 'receipt' as const,
        sortDate: r.receiptDate,
        data: r,
      })),
    ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));

    const summary = {
      totalSubscriptions: subscriptions.length,
      totalSubscriptionValue: subscriptions.reduce((s, x) => s + x.netValue, 0),
      totalPaidOnSubscriptions: subscriptions.reduce((s, x) => s + x.paidAmount, 0),
      totalRemaining: subscriptions.reduce((s, x) => s + x.remainingAmount, 0),
      totalReceipts: receiptRows.length,
      totalReceiptAmount: receiptRows.reduce((s, x) => s + x.amount, 0),
    };

    return { member, subscriptions, receipts: receiptRows, timeline, summary, dateFrom: dateFrom ?? null, dateTo: dateTo ?? null };
  }

  private async validateMemberInput(dto: UpsertClubMemberDto, existingCard?: string | null) {
    if (!dto.branchId) throw new BadRequestException('الفرع مطلوب');
    if (!dto.name?.trim()) throw new BadRequestException('اسم العضو مطلوب');

    const card = dto.cardNumber ?? existingCard;
    if (card?.trim()) {
      const cardErr = getNationalIdFormatError(card);
      if (cardErr) throw new BadRequestException(cardErr);
    }

    if (dto.phone) {
      const phoneErr = getPhoneValidationError(dto.phone);
      if (phoneErr) throw new BadRequestException(phoneErr);
    }

    const emailErr = getEmailValidationError(dto.email);
    if (emailErr) throw new BadRequestException(emailErr);

    if (dto.startDate && dto.endDate) {
      assertDateOrder(dto.startDate, dto.endDate);
    }
  }

  async create(dto: UpsertClubMemberDto, user: JwtUser) {
    const userId = user.sub;
    if (user.branch && user.branch > 0) {
      dto.branchId = user.branch;
    }
    await this.validateMemberInput(dto);
    this.assertBranchAccess(user, dto.branchId);
    const scannerCode = dto.scannerCode?.trim() || null;
    if (scannerCode) await this.assertScannerCodeAvailable(scannerCode);

    const duplicates = await findMemberDuplicates(this.prisma, {
      branchId: dto.branchId,
      phone: dto.phone,
      cardNumber: dto.cardNumber,
    });
    if (duplicates.length) {
      throw new ConflictException({
        message: buildDuplicateMessage(duplicates),
        duplicates,
      });
    }

    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: dto.branchId } });
    if (!branch) throw new BadRequestException('الفرع المحدد غير موجود');

    if (dto.membershipTypeId) {
      const mt = await this.prisma.club_membership_types.findUnique({ where: { id: dto.membershipTypeId } });
      if (!mt) throw new BadRequestException('نوع العضوية المحدد غير موجود');
    }

    if (dto.salesId) {
      const salesRep = await this.prisma.employees.findUnique({
        where: { id: dto.salesId },
        select: { id: true, branch_id_fk: true },
      });
      const [salesSettings, salesBranches] = await Promise.all([
        this.prisma.club_sales_rep_settings.findUnique({ where: { employee_id: dto.salesId }, select: { is_active: true } }),
        this.prisma.club_sales_rep_branches.findMany({ where: { employee_id: dto.salesId }, select: { branch_id: true } }),
      ]);
      const allowedBranches = salesBranches.length ? salesBranches.map((row) => row.branch_id) : salesRep?.branch_id_fk == null ? [] : [salesRep.branch_id_fk];
      if (!salesRep || salesSettings?.is_active === false || !allowedBranches.includes(dto.branchId)) {
        throw new BadRequestException('أخصائي المبيعات المحدد غير نشط في هذا الفرع');
      }
    }

    const registeringEmployeeId = user.emp_code && user.emp_code > 0 ? user.emp_code : null;

    const shouldCreateUser = this.shouldCreateAppAccount(dto);

    let createdAppUserId: number | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const memberCode = await this.generateMemberCodeInTx(tx, dto.branchId);

      const data: Prisma.club_membersUncheckedCreateInput = {
        member_code: memberCode,
        name: normalizeName(dto.name),
        phone: normalizePhoneForStorage(dto.phone),
        email: dto.email?.trim() || null,
        gender: dto.gender,
        card_number: dto.cardNumber?.trim() ? normalizeNationalIdForStorage(dto.cardNumber) : null,
        date_of_birth: dto.dateOfBirth || null,
        address: dto.address || null,
        marital_status: dto.maritalStatus || null,
        job_title: dto.jobTitle || null,
        profile_picture: dto.profilePicture || null,
        profile_photo_locked: !!dto.profilePicture?.trim(),
        branch_id: dto.branchId,
        membership_type_id: dto.membershipTypeId ?? null,
        start_date: dto.startDate || null,
        end_date: dto.endDate || null,
        notes: dto.notes || null,
        is_active: dto.isActive ?? true,
        sales_id: dto.salesId ?? null,
        employee_id: registeringEmployeeId,
        guardian_name: dto.guardianName?.trim() || null,
        guardian_phone: dto.guardianPhone?.trim() || null,
        created_by: userId,
      };

      const row = await tx.club_members.create({
        data,
        include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
      });

      if (scannerCode) {
        await tx.gate_credentials.upsert({
          where: { member_id: row.id },
          create: { member_id: row.id, credential_no: scannerCode, is_active: true },
          update: { credential_no: scannerCode, is_active: true },
        });
      }

      let credentials: { username: string; plaintextPassword: string; appUserId: number } | null = null;
      if (shouldCreateUser) {
        credentials = await this.provisionAppUser(tx, dto);
        if (credentials) {
          createdAppUserId = credentials.appUserId;
          const updatedRow = await tx.club_members.update({
            where: { id: row.id },
            data: { app_user_id: credentials.appUserId },
            include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
          });
          return { row: updatedRow, credentials };
        }
      }

      return { row, credentials };
    }, { maxWait: 10000, timeout: 15000 }).catch(async (error) => {
      if (createdAppUserId != null) {
        await this.prisma.api_users.delete({ where: { user_id: createdAppUserId } }).catch(() => undefined);
      }
      throw error;
    });

    await this.audit.log({
      entityType: 'club_member',
      entityId: result.row.id,
      action: 'create',
      actorUserId: userId,
      actorName: user.name ?? undefined,
      branchId: result.row.branch_id,
      after: { memberCode: result.row.member_code, name: result.row.name, phone: result.row.phone },
    });

    const member = { ...this.mapMember(result.row), scannerCode };
    return {
      member,
      generatedCredentials: result.credentials
        ? { username: result.credentials.username, password: result.credentials.plaintextPassword }
        : null,
    };
  }

  async update(id: number, dto: Partial<UpsertClubMemberDto>, user?: JwtUser) {
    const existing = await this.prisma.club_members.findFirst({ where: { id, is_deleted: false } });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    // A member's subscriptions, visits and receipts are all booked to its branch; moving the
    // member from the edit form would silently strand them in the old branch.
    if (dto.branchId != null && Number(dto.branchId) !== existing.branch_id) {
      throw new BadRequestException(
        'لا يمكن تغيير فرع العضو من شاشة التعديل لضمان عزل اشتراكاته وحركاته',
      );
    }
    const scannerCode = dto.scannerCode === undefined ? undefined : (dto.scannerCode.trim() || null);
    if (scannerCode) await this.assertScannerCodeAvailable(scannerCode, id);

    // Only re-validate identity fields the operator actually changed. Imported members often
    // carry a legacy card/phone value that fails today's format rules; re-checking those on every
    // save used to block even a plain name edit («الرقم القومي غير صحيح»).
    const cardChanged =
      dto.cardNumber !== undefined &&
      normalizeNationalIdForStorage(dto.cardNumber ?? '') !==
        normalizeNationalIdForStorage(existing.card_number ?? '');
    const phoneChanged =
      dto.phone != null &&
      normalizePhoneForStorage(dto.phone) !== normalizePhoneForStorage(existing.phone ?? '');
    const cardNumber = cardChanged ? (dto.cardNumber ?? '') : undefined;
    await this.validateMemberInput(
      {
        branchId: dto.branchId ?? existing.branch_id,
        name: dto.name ?? existing.name,
        phone: phoneChanged ? dto.phone! : '',
        gender: (dto.gender ?? existing.gender) as 'male' | 'female',
        cardNumber: cardNumber ?? '',
        startDate: dto.startDate ?? existing.start_date ?? undefined,
        endDate: dto.endDate ?? existing.end_date ?? undefined,
      },
    );
    if (dto.phone != null && !dto.phone.trim()) {
      throw new BadRequestException('رقم الموبايل مطلوب');
    }

    const duplicates = await findMemberDuplicates(this.prisma, {
      branchId: dto.branchId ?? existing.branch_id,
      phone: phoneChanged ? dto.phone : undefined,
      cardNumber: cardChanged ? cardNumber : undefined,
      excludeMemberId: id,
    });
    if (duplicates.length) {
      throw new ConflictException({
        message: buildDuplicateMessage(duplicates, true),
        duplicates,
      });
    }

    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);

    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.club_members.update({
          where: { id },
          data: {
        ...(dto.name != null ? { name: normalizeName(dto.name) } : {}),
        ...(phoneChanged ? { phone: normalizePhoneForStorage(dto.phone!) } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.gender != null ? { gender: dto.gender } : {}),
        ...(cardChanged ? { card_number: normalizeNationalIdForStorage(cardNumber ?? '') || null } : {}),
        ...(dto.dateOfBirth !== undefined ? { date_of_birth: dto.dateOfBirth || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.maritalStatus !== undefined ? { marital_status: dto.maritalStatus || null } : {}),
        ...(dto.jobTitle !== undefined ? { job_title: dto.jobTitle || null } : {}),
        ...(dto.profilePicture !== undefined ? { profile_picture: dto.profilePicture || null, profile_photo_locked: true } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.membershipTypeId !== undefined ? { membership_type_id: dto.membershipTypeId ?? null } : {}),
        ...(dto.startDate !== undefined ? { start_date: dto.startDate || null } : {}),
        ...(dto.endDate !== undefined ? { end_date: dto.endDate || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        ...(dto.salesId !== undefined ? { sales_id: dto.salesId ?? null } : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId ?? null } : {}),
        ...(dto.guardianName !== undefined ? { guardian_name: dto.guardianName?.trim() || null } : {}),
        ...(dto.guardianPhone !== undefined ? { guardian_phone: dto.guardianPhone?.trim() || null } : {}),
          },
          include: {
            membership_type: { select: { id: true, name: true, price: true, duration_days: true } },
            gate_credential: { select: { credential_no: true, is_active: true } },
          },
        });
        if (dto.profilePicture !== undefined && updated.app_user_id != null) {
          // Imported memberships can reference an app account that no longer exists.
          await tx.api_users.updateMany({
            where: { user_id: updated.app_user_id }, data: { m_image: dto.profilePicture || null },
          });
        }
        if (scannerCode !== undefined) {
          if (scannerCode) {
            await tx.gate_credentials.upsert({
              where: { member_id: id },
              create: { member_id: id, credential_no: scannerCode, is_active: true },
              update: { credential_no: scannerCode, is_active: true },
            });
          } else {
            await tx.gate_credentials.deleteMany({ where: { member_id: id } });
          }
        }
        return scannerCode === undefined
          ? updated
          : { ...updated, gate_credential: scannerCode ? { credential_no: scannerCode, is_active: true } : null };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && isUniqueTarget(e, 'phone')) {
        throw new ConflictException({
          message: 'رقم الهاتف مستخدم بالفعل من قبل عضو آخر داخل نفس الفرع',
          duplicates: [{ field: 'phone', fieldLabel: 'رقم الهاتف' }],
        });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && isUniqueTarget(e, 'credential')) {
        throw new ConflictException('كود السكانر مستخدم بالفعل لعضو آخر');
      }
      throw e;
    }

    await this.audit.log({
      entityType: 'club_member',
      entityId: id,
      action: 'update',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: row.branch_id,
      before: {
        name: existing.name,
        phone: existing.phone,
        branchId: existing.branch_id,
        isActive: existing.is_active,
        profilePicture: existing.profile_picture,
      },
      after: {
        name: row.name,
        phone: row.phone,
        branchId: row.branch_id,
        isActive: row.is_active,
        profilePicture: row.profile_picture,
      },
    });

    return this.mapMember(row);
  }

  async block(id: number, reason: string, user: JwtUser) {
    const existing = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    const normalizedReason = reason?.trim();
    if (!normalizedReason || normalizedReason.length < 3) {
      throw new BadRequestException('اكتب سببًا واضحًا للحظر لا يقل عن 3 أحرف');
    }

    const row = await this.prisma.club_members.update({
      where: { id },
      data: {
        is_blocked: true,
        block_reason: normalizedReason,
        blocked_at: new Date(),
        blocked_by: user.sub,
        is_active: false,
      },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
    });

    await this.audit.log({
      entityType: 'club_member',
      entityId: id,
      action: 'block',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: row.branch_id,
      before: { isBlocked: existing.is_blocked, blockReason: existing.block_reason },
      after: { isBlocked: true, blockReason: normalizedReason },
    });

    return this.mapMember(row);
  }

  async unblock(id: number, user: JwtUser) {
    const existing = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    const row = await this.prisma.club_members.update({
      where: { id },
      data: {
        is_blocked: false,
        block_reason: null,
        blocked_at: null,
        blocked_by: null,
        is_active: true,
      },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
    });

    await this.audit.log({
      entityType: 'club_member',
      entityId: id,
      action: 'unblock',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: row.branch_id,
      before: { isBlocked: existing.is_blocked, blockReason: existing.block_reason },
      after: { isBlocked: false },
    });

    return this.mapMember(row);
  }

  /**
   * One-screen financial summary used before removing a member.
   *
   * Posted financial documents are history, not disposable child rows. The preview therefore
   * separates money that still needs to be returned from history that will remain attached to the
   * archived member.
   */
  async deletionPreview(id: number, user?: JwtUser, requestedStopDate?: string) {
    const member = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, member.branch_id);

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { member_id: id },
      include: {
        receipts: {
          select: {
            id: true,
            receipt_number: true,
            amount: true,
            receipt_date: true,
            payment_method: true,
          },
          orderBy: { id: 'desc' },
        },
        refunds: {
          where: { status: { not: 'cancelled' } },
          select: {
            id: true,
            invoice_number: true,
            refund_amount: true,
            refund_date: true,
            status: true,
          },
          orderBy: { id: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
    });
    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const effectiveRequestedDate = requestedStopDate || localDateString();

    const subscriptionRows = await Promise.all(
      subscriptions.map(async (subscription) => {
        const stopDate =
          effectiveRequestedDate < subscription.subscription_start_date
            ? subscription.subscription_start_date
            : effectiveRequestedDate > subscription.subscription_end_date
              ? subscription.subscription_end_date
              : effectiveRequestedDate;
        let refundPreview: RefundPreview | null = null;
        let refundUnavailableReason: string | null = null;

        if (subscription.status !== 'expired' && toNum(subscription.paid_amount) > 0) {
          try {
            refundPreview = await this.subscriptionRefunds.computePreview(
              { subscriptionId: subscription.id, stopDate },
              user,
            );
          } catch (error) {
            refundUnavailableReason =
              error instanceof Error ? error.message : 'تعذّر حساب مبلغ الاسترداد';
          }
        }

        const receiptTotal = subscription.receipts.reduce(
          (sum, receipt) => sum + toNum(receipt.amount),
          0,
        );
        const refundedTotal = subscription.refunds.reduce(
          (sum, refund) => sum + toNum(refund.refund_amount),
          0,
        );

        return {
          id: subscription.id,
          subscriptionNumber: subscription.subscription_number,
          subscriptionType: subscription.subscription_type,
          status: subscription.status,
          startDate: subscription.subscription_start_date,
          endDate: subscription.subscription_end_date,
          paidAmount: toNum(subscription.paid_amount),
          remainingAmount: toNum(subscription.remaining_amount),
          receiptTotal,
          refundedTotal,
          receipts: subscription.receipts.map((receipt) => ({
            id: receipt.id,
            receiptNumber: receipt.receipt_number,
            amount: toNum(receipt.amount),
            receiptDate: receipt.receipt_date,
            paymentMethod: receipt.payment_method,
          })),
          refunds: subscription.refunds.map((refund) => ({
            id: refund.id,
            invoiceNumber: refund.invoice_number,
            amount: toNum(refund.refund_amount),
            refundDate: refund.refund_date,
            status: refund.status,
          })),
          refundPreview,
          refundUnavailableReason,
          requiresRefund: (refundPreview?.refundAmount ?? 0) > 0,
        };
      }),
    );

    const eventRegistrations = await this.prisma.club_event_registrations.findMany({
      where: { member_id: id },
      select: { id: true },
    });
    const eventRegistrationIds = eventRegistrations.map((registration) => registration.id);
    const subscriptionFilter = subscriptionIds.length
      ? { subscription_id: { in: subscriptionIds } }
      : { subscription_id: -1 };

    const [
      allReceipts,
      spaInvoices,
      inbodyInvoices,
      eventPayments,
      lockerSubscriptions,
    ] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where: { OR: [{ member_id: id }, subscriptionFilter] },
        select: { id: true, amount: true, subscription_id: true },
      }),
      this.prisma.club_spa_invoices.findMany({
        where: { OR: [{ member_id: id }, subscriptionFilter] },
        select: { id: true, total_amount: true },
      }),
      this.prisma.club_inbody_invoices.findMany({
        where: { OR: [{ member_id: id }, subscriptionFilter] },
        select: { id: true, total_amount: true },
      }),
      this.prisma.club_event_payments.findMany({
        where: { registration_id: { in: eventRegistrationIds } },
        select: { id: true, type: true, amount: true, status: true },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: { member_id: id, paid_amount: { gt: 0 } },
        select: { id: true, paid_amount: true },
      }),
    ]);

    const directReceiptRows = allReceipts.filter(
      (receipt) =>
        receipt.subscription_id == null || !subscriptionIds.includes(receipt.subscription_id),
    );
    const completedEventPayments = eventPayments.filter((payment) => payment.status === 'completed');
    const eventNet = completedEventPayments.reduce(
      (sum, payment) =>
        sum + (payment.type === 'refund' ? -toNum(payment.amount) : toNum(payment.amount)),
      0,
    );
    const refundableTotal = subscriptionRows.reduce(
      (sum, subscription) => sum + (subscription.refundPreview?.refundAmount ?? 0),
      0,
    );
    const refundHistoryCount = subscriptionRows.reduce(
      (sum, subscription) => sum + subscription.refunds.length,
      0,
    );

    const otherFinancialItems = [
      {
        kind: 'direct_receipts',
        label: 'إيصالات غير مرتبطة باشتراك',
        count: directReceiptRows.length,
        amount: directReceiptRows.reduce((sum, receipt) => sum + toNum(receipt.amount), 0),
      },
      {
        kind: 'spa',
        label: 'فواتير السبا',
        count: spaInvoices.length,
        amount: spaInvoices.reduce((sum, invoice) => sum + toNum(invoice.total_amount), 0),
      },
      {
        kind: 'inbody',
        label: 'فواتير InBody',
        count: inbodyInvoices.length,
        amount: inbodyInvoices.reduce((sum, invoice) => sum + toNum(invoice.total_amount), 0),
      },
      {
        kind: 'events',
        label: 'مدفوعات الفعاليات (صافي)',
        count: eventPayments.length,
        amount: eventNet,
      },
      {
        kind: 'lockers',
        label: 'اشتراكات الخزائن المدفوعة',
        count: lockerSubscriptions.length,
        amount: lockerSubscriptions.reduce(
          (sum, lockerSubscription) => sum + toNum(lockerSubscription.paid_amount),
          0,
        ),
      },
    ].filter((item) => item.count > 0);

    const hasFinancialHistory =
      allReceipts.length > 0 ||
      refundHistoryCount > 0 ||
      otherFinancialItems.length > 0;

    return {
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
      },
      stopDate: effectiveRequestedDate,
      subscriptions: subscriptionRows,
      otherFinancialItems,
      totals: {
        receipts: allReceipts.reduce((sum, receipt) => sum + toNum(receipt.amount), 0),
        refunded: subscriptionRows.reduce(
          (sum, subscription) => sum + subscription.refundedTotal,
          0,
        ),
        refundable: refundableTotal,
      },
      hasFinancialHistory,
      requiresRefund: refundableTotal > 0,
      archiveKeepsFinancialHistory: hasFinancialHistory,
    };
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_members.findFirst({ where: { id, is_deleted: false } });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    const preview = await this.deletionPreview(id, user);
    if (preview.hasFinancialHistory) {
      if (preview.requiresRefund) {
        throw new BadRequestException(
          `يوجد مبلغ ${preview.totals.refundable.toFixed(2)} واجب الاسترداد. افتح نافذة حذف العضو ونفّذ الاسترداد أولاً`,
        );
      }

      const subscriptionIds = preview.subscriptions.map((subscription) => subscription.id);
      const activeLockerRows = await this.prisma.club_locker_subscriptions.findMany({
        where: { member_id: id, status: { not: 'expired' } },
        select: { locker_id: true },
      });

      await this.prisma.$transaction(async (tx) => {
        if (subscriptionIds.length) {
          await tx.club_subscriptions.updateMany({
            where: {
              id: { in: subscriptionIds },
              status: { not: 'expired' },
            },
            data: { status: 'expired' },
          });
        }
        await tx.club_locker_subscriptions.updateMany({
          where: { member_id: id, status: { not: 'expired' } },
          data: { status: 'expired' },
        });
        if (activeLockerRows.length) {
          await tx.club_lockers.updateMany({
            where: { id: { in: activeLockerRows.map((row) => row.locker_id) } },
            data: { is_available: true },
          });
        }
        await tx.club_members.update({
          where: { id },
          data: { is_deleted: true, is_active: false },
        });
        if (existing.app_user_id) {
          await tx.api_users.updateMany({
            where: { user_id: existing.app_user_id },
            data: { status: 0 },
          });
        }
      });

      await this.audit.log({
        entityType: 'club_member',
        entityId: id,
        action: 'delete',
        actorUserId: user?.sub,
        actorName: user?.name ?? undefined,
        branchId: existing.branch_id,
        before: {
          name: existing.name,
          memberCode: existing.member_code,
          phone: existing.phone,
          subscriptions: preview.subscriptions.length,
        },
        after: {
          archived: true,
          financialHistoryPreserved: true,
          refundedTotal: preview.totals.refunded,
        },
      });

      return { success: true, archived: true };
    }

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { member_id: id },
      select: { id: true },
    });
    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const subscriptionFilter = subscriptionIds.length
      ? { subscription_id: { in: subscriptionIds } }
      : { subscription_id: -1 };
    const eventRegistrations = await this.prisma.club_event_registrations.findMany({
      where: { member_id: id },
      select: { id: true },
    });
    const eventRegistrationIds = eventRegistrations.map((registration) => registration.id);

    // Keep posted financial history auditable. Production demo data is removed by the guarded
    // db:prepare:production command, which resets the matching demo ledger in one operation.
    const [
      receiptCount,
      refundCount,
      wellnessInvoiceCount,
      eventPaymentCount,
      paidLockerCount,
    ] = await Promise.all([
      this.prisma.club_receipts.count({
        where: { OR: [{ member_id: id }, subscriptionFilter] },
      }),
      this.prisma.club_subscription_refunds.count({
        where: { OR: [{ member_id: id }, subscriptionFilter] },
      }),
      Promise.all([
        this.prisma.club_spa_invoices.count({
          where: { OR: [{ member_id: id }, subscriptionFilter] },
        }),
        this.prisma.club_inbody_invoices.count({
          where: { OR: [{ member_id: id }, subscriptionFilter] },
        }),
      ]).then((counts) => counts[0] + counts[1]),
      eventRegistrationIds.length
        ? this.prisma.club_event_payments.count({
            where: { registration_id: { in: eventRegistrationIds } },
          })
        : 0,
      this.prisma.club_locker_subscriptions.count({
        where: { member_id: id, paid_amount: { gt: 0 } },
      }),
    ]);

    if (
      receiptCount > 0 ||
      refundCount > 0 ||
      wellnessInvoiceCount > 0 ||
      eventPaymentCount > 0 ||
      paidLockerCount > 0
    ) {
      throw new BadRequestException(
        'لا يمكن حذف عضو له حركة مالية. ألغِ أو استرد الحركات المالية أولاً، ثم أعد الحذف',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const groupMemberships = await tx.club_member_group_members.findMany({
        where: { member_id: id },
        select: { group_id: true },
      });
      const surveyResponses = await tx.club_survey_responses.findMany({
        where: { member_id: id },
        select: { survey_id: true },
      });
      // App ratings carry the member in both member_id and app_member_id.
      const trainerRatings = await tx.club_trainer_ratings.findMany({
        where: { OR: [{ member_id: id }, { app_member_id: id }] },
        select: { trainer_id: true },
      });
      const lockerSubscriptions = await tx.club_locker_subscriptions.findMany({
        where: { member_id: id },
        select: { locker_id: true },
      });

      if (eventRegistrationIds.length) {
        await tx.club_event_checkins.deleteMany({
          where: { registration_id: { in: eventRegistrationIds } },
        });
        await tx.club_event_registrations.deleteMany({
          where: { id: { in: eventRegistrationIds } },
        });
      }
      await tx.club_event_registrations.updateMany({
        where: { converted_member_id: id },
        data: { converted_member_id: null },
      });

      await tx.am_member_notifications.deleteMany({ where: { member_id: id } });
      await tx.am_invitations.updateMany({
        where: { inviter_member_id: id },
        data: { inviter_member_id: null },
      });
      await tx.staff_tasks.deleteMany({
        where: {
          OR: [
            { member_id: id },
            ...(subscriptionIds.length
              ? [{ subscription_id: { in: subscriptionIds } }]
              : []),
          ],
        },
      });
      await tx.club_attendance.deleteMany({
        where: {
          OR: [
            { member_id: id },
            ...(subscriptionIds.length
              ? [{ subscription_id: { in: subscriptionIds } }]
              : []),
          ],
        },
      });
      await tx.club_class_enrollments.deleteMany({
        where: {
          OR: [
            { member_id: id },
            ...(subscriptionIds.length
              ? [{ subscription_id: { in: subscriptionIds } }]
              : []),
          ],
        },
      });
      await tx.club_class_waitlist.deleteMany({ where: { member_id: id } });
      await tx.club_workout_programs.deleteMany({ where: { member_id: id } });
      await tx.club_member_progress.deleteMany({ where: { member_id: id } });
      await tx.club_physical_assessments.deleteMany({ where: { member_id: id } });
      await tx.club_inbody_measurements.deleteMany({ where: { member_id: id } });
      await tx.club_spa_bookings.deleteMany({ where: { member_id: id } });
      await tx.club_hall_bookings.deleteMany({ where: { member_id: id } });
      await tx.club_trainer_ratings.deleteMany({ where: { OR: [{ member_id: id }, { app_member_id: id }] } });
      await tx.club_survey_responses.deleteMany({ where: { member_id: id } });
      await tx.club_member_group_members.deleteMany({ where: { member_id: id } });

      if (subscriptionIds.length) {
        await tx.club_subscription_waivers.deleteMany({
          where: { subscription_id: { in: subscriptionIds } },
        });
        await tx.club_subscription_freezes.deleteMany({
          where: { subscription_id: { in: subscriptionIds } },
        });
        await tx.club_subscription_transfers.deleteMany({
          where: {
            OR: [
              { member_id: id },
              { subscription_id: { in: subscriptionIds } },
            ],
          },
        });
        await tx.club_subscriptions.deleteMany({ where: { id: { in: subscriptionIds } } });
      }

      await tx.club_locker_subscriptions.deleteMany({ where: { member_id: id } });
      if (lockerSubscriptions.length) {
        await tx.club_lockers.updateMany({
          where: { id: { in: lockerSubscriptions.map((row) => row.locker_id) } },
          data: { is_available: true },
        });
      }

      // Keep the member row as an auditable tombstone.  The regular member
      // lists already exclude is_deleted rows, while the audit log can always
      // show exactly what was removed and by whom.
      await tx.club_members.update({
        where: { id },
        data: { is_deleted: true, is_active: false },
      });

      for (const { group_id } of groupMemberships) {
        const count = await tx.club_member_group_members.count({ where: { group_id } });
        await tx.club_member_groups.update({
          where: { id: group_id },
          data: { current_members: count },
        });
      }
      for (const { survey_id } of surveyResponses) {
        const count = await tx.club_survey_responses.count({ where: { survey_id } });
        await tx.club_surveys.update({
          where: { id: survey_id },
          data: { responses_count: count },
        });
      }
      for (const { trainer_id } of trainerRatings) {
        const aggregate = await tx.club_trainer_ratings.aggregate({
          where: { trainer_id },
          _avg: { rating: true },
        });
        await tx.club_trainers.update({
          where: { id: trainer_id },
          data: { rating_avg: aggregate._avg.rating ?? 0 },
        });
      }

      if (existing.app_user_id) {
        const linkedEmployeeCount = await tx.employees.count({
          where: { app_user_id: existing.app_user_id },
        });
        const linkedMemberCount = await tx.club_members.count({
          where: { app_user_id: existing.app_user_id },
        });
        if (linkedEmployeeCount === 0 && linkedMemberCount === 0) {
          await tx.api_users.updateMany({
            where: { user_id: existing.app_user_id },
            data: {
              user_name: null,
              user_phone: null,
              user_email: null,
              user_city: null,
              user_pass: null,
              status: 0,
              rand_key: null,
              m_image: null,
            },
          });
        }
      }
    });

    await this.audit.log({
      entityType: 'club_member',
      entityId: id,
      action: 'delete',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: existing.branch_id,
      before: {
        name: existing.name,
        memberCode: existing.member_code,
        phone: existing.phone,
        subscriptions: subscriptionIds.length,
      },
    });

    return { success: true };
  }

  /**
   * Resolve a scan / typed value for attendance: member id, member code, scanner (gate)
   * credential, card / national id, or exact phone. With `branchId` the lookup stays inside
   * that branch. The strongest identity wins (code > scanner credential > card > phone); two
   * members tied on the strongest identity are refused instead of guessing which one came in.
   */
  async resolveByIdOrCode(memberId?: number, memberCode?: string, branchId?: number) {
    if (memberId) {
      const m = await this.prisma.club_members.findFirst({ where: { id: memberId, is_deleted: false } });
      if (!m) throw new NotFoundException('العضو غير موجود');
      return m;
    }
    if (memberCode?.trim()) {
      const code = memberCode.trim();
      const card = normalizeNationalIdForStorage(code);
      const phone = normalizePhoneForStorage(code);
      const phoneLike = /^\d{8,}$/.test(phone);
      const rows = await this.prisma.club_members.findMany({
        where: {
          is_deleted: false,
          ...(branchId != null ? { branch_id: branchId } : {}),
          OR: [
            { member_code: code },
            { card_number: code },
            ...(card && card !== code ? [{ card_number: card }] : []),
            { gate_credential: { is: { credential_no: code, is_active: true } } },
            ...(phoneLike ? [{ phone }] : []),
          ],
        },
        include: { gate_credential: { select: { credential_no: true, is_active: true } } },
        orderBy: { id: 'asc' },
        take: 10,
      });
      if (!rows.length) throw new NotFoundException('العضو غير موجود');
      const rank = (row: (typeof rows)[number]) => {
        if (row.member_code === code) return 0;
        if (row.gate_credential?.is_active && row.gate_credential.credential_no === code) return 1;
        if (row.card_number != null && (row.card_number === code || row.card_number === card)) return 2;
        return 3;
      };
      const best = Math.min(...rows.map(rank));
      const matches = rows.filter((row) => rank(row) === best);
      if (matches.length > 1) {
        throw new BadRequestException(
          branchId != null
            ? 'البحث يطابق أكثر من عضو في هذا الفرع — استخدم كود العضوية'
            : 'حدد الفرع لأن البحث يطابق أكثر من عضوية',
        );
      }
      const { gate_credential: _credential, ...member } = matches[0];
      return member;
    }
    throw new BadRequestException('كود العضو مطلوب');
  }

  private async assertScannerCodeAvailable(scannerCode: string, excludeMemberId?: number) {
    const existing = await this.prisma.gate_credentials.findUnique({
      where: { credential_no: scannerCode },
      select: { member_id: true },
    });
    if (existing && existing.member_id !== excludeMemberId) {
      throw new ConflictException('كود السكانر مستخدم بالفعل لعضو آخر');
    }
  }

  private async isSalesEmployee(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const emp = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: {
        mosma_wazefy_code: true,
        mosma_wazefy_n: true,
        leave_emp: true,
        employee_type: true,
        is_sales: true,
      },
    });
    if (!emp) return false;
    if ((emp.leave_emp != null && emp.leave_emp !== 0) || emp.employee_type !== 1) return false;
    if (emp.is_sales || isMarketingRepJobTitle(emp.mosma_wazefy_n)) return true;
    if (emp.mosma_wazefy_code) {
      const job = await this.prisma.department_jobs.findUnique({
        where: { id: emp.mosma_wazefy_code },
        select: { name: true },
      });
      if (isMarketingRepJobTitle(job?.name)) return true;
    }
    return false;
  }

  private async hasSalesJobTitle(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const emp = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: {
        mosma_wazefy_code: true,
        mosma_wazefy_n: true,
        leave_emp: true,
        employee_type: true,
      },
    });
    if (!emp) return false;
    if ((emp.leave_emp != null && emp.leave_emp !== 0) || emp.employee_type !== 1) return false;
    if (isMarketingRepJobTitle(emp.mosma_wazefy_n)) return true;
    if (emp.mosma_wazefy_code) {
      const job = await this.prisma.department_jobs.findUnique({
        where: { id: emp.mosma_wazefy_code },
        select: { name: true },
      });
      if (isMarketingRepJobTitle(job?.name)) return true;
    }
    return false;
  }
}
