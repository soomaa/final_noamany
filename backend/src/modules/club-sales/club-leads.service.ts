import { leadSubscriptionContexts } from './lead-subscription-context';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockPayrollEmployee } from './payroll-employee-lock';
import { planLeadTransfer, servesSalesBranch } from './lead-transfer-plan';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ExportService } from '../../common/export/export.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from '../employees/employees.service';
import { localDateString } from '../club-fitness/club-fitness.utils';
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_ACTIVITY_TYPES,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  PROGRAM_LABELS,
  isLeadSource,
  isLeadStatus,
  normalizePhone,
  type LeadSource,
  type LeadStatus,
  FOLLOW_LATER_STATUSES,
  LEGACY_LEAD_STATUS,
  SYSTEM_LEAD_SOURCES,
} from './club-sales.constants';
import {
  CompleteLeadReminderDto,
  AssignLeadDto,
  CreateLeadDto,
  CreateGuestLeadDto,
  FollowUpLeadDto,
  ListLeadsDto,
  UpsertLeadDto,
} from './dto/leads.dto';

import { nextFollowUpFromDate } from '../club-mos/lead-follow-up-date';
import { feedbackOption } from '../club-mos/lead-feedback';
import { syncLeadReminder } from '../club-mos/lead-reminder.sync';

/** The states a lead leaves the working list in — reachable through their own filter. */
const CLOSED_LEAD_STATUSES = ['membership_done', 'lost', 'converted'];

@Injectable()
export class ClubLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly employees: EmployeesService,
    private readonly exporter: ExportService,
  ) {}

  /**
   * A lead with no branch (only the ported sales workspace can create one) is readable by an
   * unrestricted account alone — scoped staff fail closed rather than see an unowned record.
   */
  private assertBranch(user: JwtUser | undefined, branchId: number | null) {
    const allowed = branchId == null
      ? this.branchScope.allowedBranchIds(user) === null
      : this.branchScope.isBranchAllowed(user, branchId);
    if (!allowed) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private async isPersonalSalesUser(user: JwtUser) {
    return Boolean(user.emp_code && await this.employees.isSalesEmployee(user.emp_code));
  }

  private async assertLeadAccess(
    user: JwtUser,
    lead: { branch_id: number | null; assigned_to: number | null },
  ) {
    this.assertBranch(user, lead.branch_id);
    if (await this.isPersonalSalesUser(user)) {
      if (!user.emp_code || lead.assigned_to !== user.emp_code) {
        throw new ForbiddenException('هذا العميل المحتمل غير مسند إلى حسابك');
      }
    }
  }

  private branchWhere(user?: JwtUser, branchId?: number): Prisma.club_leadsWhereInput {
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    return scope === null ? {} : { branch_id: { in: scope } };
  }

  private map(row: {
    id: number;
    name: string;
    phone: string | null;
    email?: string | null;
    source: string;
    source_id?: number | null;
    follow_up_at?: string | null;
    assigned_at?: Date | null;
    assignment_seen_at?: Date | null;
    facebook_profile_url: string | null;
    interested_program: string | null;
    subscription_type_id: number | null;
    status: string;
    assigned_to: number | null;
    assignment_mode: string | null;
    converted_member_id: number | null;
    invitation_id: number | null;
    staff_invitation_id?: number | null;
    invited_by_employee_id?: number | null;
    notes: string | null;
    last_contacted_at: Date | null;
    next_follow_up_at: Date | null;
    next_call_at?: Date | null;
    branch_id: number | null;
    created_by: number | null;
    created_at: Date;
    updated_at: Date;
    follow_ups?: Array<{
      id: number;
      note: string;
      status: string | null;
      activity_type: string;
      answered: boolean | null;
      interests: string | null;
      next_follow_up_at: Date | null;
    next_call_at?: Date | null;
      created_by: number | null;
      created_at: Date;
    }>;
  }, names: Map<number, string>, packageNames = new Map<number, string>()) {
    const packageName = row.subscription_type_id != null ? packageNames.get(row.subscription_type_id) : undefined;
    const cached = row.interested_program;
    const legacyLabel = cached && cached in PROGRAM_LABELS
      ? PROGRAM_LABELS[cached as keyof typeof PROGRAM_LABELS]
      : null;
    return {
      id: row.id,
      fullName: row.name,
      phone: row.phone,
      email: row.email ?? null,
      followUpAt: row.follow_up_at ?? null,
      source: row.source,
      sourceLabel: isLeadSource(row.source) ? LEAD_SOURCE_LABELS[row.source] : row.source,
      sourceId: row.source_id ?? null,
      facebookProfileUrl: row.facebook_profile_url,
      interestedProgram: row.interested_program,
      interestedProgramLabel: packageName ?? legacyLabel ?? cached,
      subscriptionTypeId: row.subscription_type_id,
      status: row.status,
      statusLabel: isLeadStatus(row.status) ? LEAD_STATUS_LABELS[row.status] : row.status,
      assignedToId: row.assigned_to,
      assignedToName: row.assigned_to ? names.get(row.assigned_to) ?? `#${row.assigned_to}` : null,
      assignedAt: row.assigned_at ?? null,
      /** Handed over and not yet opened by the new owner — the «محوّل إليك» badge. */
      handoverPending: row.assigned_at != null && row.assignment_seen_at == null,
      assignmentMode: row.assignment_mode,
      convertedMemberId: row.converted_member_id,
      invitationId: row.invitation_id,
      /** «دعوة بكود موظف»: the guest row and the employee whose code brought them. */
      staffInvitationId: row.staff_invitation_id ?? null,
      invitedByEmployeeId: row.invited_by_employee_id ?? null,
      invitedByName: row.invited_by_employee_id ? names.get(row.invited_by_employee_id) ?? `#${row.invited_by_employee_id}` : null,
      notes: row.notes,
      lastContactedAt: row.last_contacted_at,
      nextFollowUpAt: row.next_follow_up_at,
      nextCallAt: row.next_call_at ?? null,
      branchId: row.branch_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      followUps: (row.follow_ups ?? []).map((item) => ({
        id: item.id,
        note: item.note,
        status: item.status,
        activityType: item.activity_type,
        answered: item.answered,
        interests: item.interests,
        nextFollowUpAt: item.next_follow_up_at,
        nextCallAt: item.next_call_at ?? null,
        createdBy: item.created_by,
        createdByName: item.created_by ? names.get(item.created_by) ?? null : null,
        createdAt: item.created_at,
      })),
    };
  }

  private async namesFor(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is number => id != null))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.employees.findMany({
      where: { id: { in: unique } },
      select: { id: true, employee: true },
    });
    return new Map(rows.map((row) => [row.id, row.employee ?? `#${row.id}`]));
  }

  async listSalesReps() {
    return this.employees.salesReps();
  }

  /**
   * Specialists switched off in the sales settings.
   *
   * "Active" used to mean only "not terminated in HR", so someone on leave or moved to
   * another role kept collecting round-robin customers nobody worked. They keep their
   * history and their login; they just stop being handed new people.
   */
  private async deactivatedRepIds(): Promise<Set<number>> {
    const rows = await this.prisma.club_sales_rep_settings.findMany({
      where: { is_active: false },
      select: { employee_id: true },
    });
    return new Set(rows.map((row) => row.employee_id));
  }

  /** Specialists eligible to receive customers right now. */
  private async assignableReps() {
    const [reps, off] = await Promise.all([this.employees.salesReps(), this.deactivatedRepIds()]);
    return reps.filter((rep) => !off.has(rep.id));
  }

  async nextRoundRobinRep(preferredBranchId?: number) {
    const reps = await this.assignableReps();
    if (!reps.length) return null;
    const pool = this.repsForBranch(reps, preferredBranchId);
    if (!pool.length) return null;
    const stateId = preferredBranchId ?? 0;
    const state = await this.prisma.club_sales_round_robin_state.findUnique({ where: { id: stateId } });
    const lastId = state?.last_employee_id ?? null;
    const idx = pool.findIndex((rep) => rep.id === lastId);
    const next = pool[(idx + 1) % pool.length];
    await this.prisma.club_sales_round_robin_state.upsert({
      where: { id: stateId },
      create: { id: stateId, last_employee_id: next.id },
      update: { last_employee_id: next.id },
    });
    return next;
  }

  private async resolveAssignment(
    dto: { assignedToId?: number | null; assignmentMode?: 'manual' | 'automatic' },
    branchId: number,
  ) {
    if (dto.assignmentMode === 'automatic' && !dto.assignedToId) {
      const next = await this.nextRoundRobinRep(branchId);
      return { assignedToId: next?.id ?? null, assignmentMode: 'automatic' as const };
    }
    if (dto.assignedToId) {
      const reps = await this.assignableReps();
      const assignedRep = reps.find((rep) => rep.id === dto.assignedToId);
      const servesBranch = assignedRep
        ? (assignedRep.branchIds?.includes(branchId) ?? assignedRep.branchId === branchId)
        : false;
      if (!assignedRep || !servesBranch) {
        throw new BadRequestException('أخصائي المبيعات يجب أن يكون نشطًا ومعيّنًا للفرع');
      }
      return { assignedToId: dto.assignedToId, assignmentMode: 'manual' as const };
    }
    return { assignedToId: null, assignmentMode: null };
  }

  private async withActiveAssignee<T>(employeeId: number | null | undefined, work: (tx: Prisma.TransactionClient) => Promise<T>, existingTx?: Prisma.TransactionClient): Promise<T> {
    const execute = async (tx: Prisma.TransactionClient) => {
      if (employeeId != null) {
        await lockPayrollEmployee(tx, employeeId);
        const setting = await tx.club_sales_rep_settings.findUnique({ where: { employee_id: employeeId }, select: { is_active: true } });
        if (setting?.is_active === false) throw new BadRequestException('تم تعطيل الأخصائي؛ اختر أخصائيًا نشطًا وأعد المحاولة');
      }
      return work(tx);
    };
    return existingTx ? execute(existingTx) : this.prisma.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private cacheProgramName(name: string | null | undefined) {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 80);
  }

  private async resolveInterestedPackage(dto: {
    subscriptionTypeId?: number | null;
    interestedProgram?: string | null;
  }) {
    const rawId = dto.subscriptionTypeId;
    const rawText = dto.interestedProgram?.trim() || '';
    const numericFromText = rawText && /^\d+$/.test(rawText) ? Number(rawText) : NaN;
    const id = rawId && Number.isFinite(rawId) ? rawId : Number.isFinite(numericFromText) ? numericFromText : null;
    if (id) {
      const row = await this.prisma.club_subscription_types.findUnique({
        where: { id },
        select: { id: true, name: true, is_active: true },
      });
      if (row) return { id: row.id, name: this.cacheProgramName(row.name) };
    }
    if (rawText && !(rawText in PROGRAM_LABELS)) {
      const row = await this.prisma.club_subscription_types.findFirst({
        where: { name: rawText, is_active: true },
        select: { id: true, name: true },
      });
      if (row) return { id: row.id, name: this.cacheProgramName(row.name) };
    }
    return { id: null, name: this.cacheProgramName(rawText) || null };
  }

  private async packageNamesFor(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is number => id != null))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.club_subscription_types.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async meta() {
    // Served here rather than from /club-customer-sources so a rep filling the form can read
    // the list without holding the admin permission that edits it.
    const knowledgeSources = await this.prisma.club_customer_sources.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return {
      sources: LEAD_SOURCES.map((value) => ({ value, label: LEAD_SOURCE_LABELS[value] })),
      statuses: LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABELS[value] })),
      knowledgeSources,
    };
  }

  /**
   * A status typed into the form. Reception qualifies and converts a lead when the customer
   * pays, so a rep may not set either by hand — the same rule the follow-up flow enforces.
   */
  private async assertSettableStatus(status: string, current: string, user: JwtUser) {
    if (status === current) return status;
    if (status === 'converted') throw new BadRequestException('يتم التحويل تلقائيًا عند تسجيل العميل كعضو');
    if (status === 'qualified' && await this.isPersonalSalesUser(user)) {
      throw new BadRequestException('يتم تأهيل العميل تلقائيًا عند تسجيله من الاستقبال');
    }
    return status;
  }

  /**
   * Per-status counts behind the potential-members state cards. Every state, including the
   * closed ones the list hides by default — otherwise nobody knows there is anything there.
   */
  async statistics(query: Pick<ListLeadsDto, 'branchId' | 'assignedToId' | 'sourceId' | 'scope'>, user: JwtUser) {
    const and: Prisma.club_leadsWhereInput[] = [this.branchWhere(user, query.branchId), { is_deleted: false }];
    if (await this.isPersonalSalesUser(user)) and.push({ assigned_to: user.emp_code! });
    else if (query.scope === 'unassigned') and.push({ assigned_to: null });
    else if (query.assignedToId) and.push({ assigned_to: query.assignedToId });
    if (query.sourceId) and.push({ source_id: query.sourceId });
    const rows = await this.prisma.club_leads.groupBy({ by: ['status'], where: { AND: and }, _count: { _all: true } });
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      // Legacy EMS spellings count under the FIT90 state that replaced them.
      const key = LEGACY_LEAD_STATUS[row.status as LeadStatus] ?? row.status;
      byStatus[key] = (byStatus[key] ?? 0) + row._count._all;
    }
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return { total, byStatus };
  }

  /** `undefined` leaves the lead's source alone; `null` clears it; an id must be a live entry. */
  private async resolveKnowledgeSource(sourceId: number | null | undefined) {
    if (sourceId == null) return sourceId;
    const row = await this.prisma.club_customer_sources.findFirst({
      where: { id: sourceId, is_active: true },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('مصدر المعرفة غير موجود أو غير مفعّل');
    return row.id;
  }

  async listInterestedPackages() {
    const rows = await this.prisma.club_subscription_types.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        is_linked_to_sessions: true,
        apply_to_all_branches: true,
        branch_id: true,
        branches: { select: { branch_id: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isLinkedToSessions: row.is_linked_to_sessions,
      applyToAllBranches: row.apply_to_all_branches,
      branchId: row.branch_id,
      branchIds: row.branches.map((item) => item.branch_id),
      isActive: true,
    }));
  }

  /** Packages a guest can ask about in the member app — every active one the branch sells. */
  async listGuestInterestedPrograms(branchId: number) {
    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId }, select: { branch_id: true } });
    if (!branch) throw new BadRequestException('الفرع غير متاح');
    return this.prisma.club_subscription_types.findMany({
      where: {
        is_active: true,
        OR: [
          { apply_to_all_branches: true },
          { branch_id: branchId },
          { branches: { some: { branch_id: branchId } } },
        ],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  /**
   * A guest browsing the app leaves a name and number against one package. It lands in the
   * potential-members list as a new, unassigned `app_browse` lead; asking twice from the same
   * number in the same branch does not create a second row.
   */
  async createGuestLead(dto: CreateGuestLeadDto): Promise<{ success: true }> {
    const fullName = dto.fullName?.trim();
    const phone = normalizePhone(dto.phone ?? '');
    if (!fullName || fullName.length < 2 || fullName.length > 200) {
      throw new BadRequestException('أدخل الاسم الكامل');
    }
    if (phone.replace(/\D/g, '').length < 6 || phone.length > 50) {
      throw new BadRequestException('أدخل رقم هاتف صحيح');
    }
    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: dto.branchId }, select: { branch_id: true },
    });
    if (!branch) throw new BadRequestException('الفرع غير متاح');
    const program = await this.prisma.club_subscription_types.findUnique({
      where: { id: dto.subscriptionTypeId },
      select: { id: true, name: true, is_active: true, apply_to_all_branches: true, branch_id: true, branches: { select: { branch_id: true } } },
    });
    if (!program?.is_active || !(
      program.apply_to_all_branches || program.branch_id === dto.branchId ||
      program.branches.some((row) => row.branch_id === dto.branchId)
    )) {
      throw new BadRequestException('اختر برنامجًا متاحًا لهذا الفرع');
    }
    const existing = await this.prisma.club_leads.findFirst({
      where: { branch_id: dto.branchId, phone, source: 'app_browse', is_deleted: false },
      select: { id: true },
    });
    if (existing) return { success: true };
    await this.prisma.club_leads.create({
      data: {
        name: fullName,
        phone,
        source: 'app_browse',
        interested_program: this.cacheProgramName(program.name),
        subscription_type_id: program.id,
        status: 'new',
        branch_id: dto.branchId,
        created_by: null,
      },
    });
    return { success: true };
  }

  /**
   * «إنشاء حساب» in the member app files a lead; staff activate the login later.
   * issue a one-time credential against a real membership — so this records a join request
   * for the sales team instead, and says so. A number that already belongs to a member is
   * pointed back to the login screen rather than filed as a lead.
   */
  async createAppSignupRequest(body: Record<string, unknown>): Promise<{ status: 200; message: string }> {
    const fullName = String(body.user_name ?? '').trim();
    const phone = normalizePhone(String(body.user_phone ?? ''));
    const branchId = Number(body.branch_id);
    if (fullName.length < 2 || fullName.length > 200) throw new BadRequestException('أدخل الاسم الكامل');
    if (phone.replace(/\D/g, '').length < 6 || phone.length > 50) throw new BadRequestException('أدخل رقم هاتف صحيح');
    if (!Number.isInteger(branchId) || branchId <= 0) throw new BadRequestException('اختر الفرع');
    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId }, select: { branch_id: true } });
    if (!branch) throw new BadRequestException('الفرع غير متاح');

    const member = await this.prisma.club_members.findFirst({
      where: { phone, is_deleted: false },
      select: { id: true },
    });
    if (member) {
      return {
        status: 200,
        message: 'رقمك مسجل عندنا كعضو بالفعل — سجل دخول برقم موبايلك وكلمة المرور اللي استلمتها من النادي',
      };
    }

    const existing = await this.prisma.club_leads.findFirst({
      where: { branch_id: branchId, phone, source: 'app_signup', is_deleted: false },
      select: { id: true },
    });
    if (!existing) {
      const gender = String(body.gender ?? '').trim().toLowerCase();
      await this.prisma.club_leads.create({
        data: {
          name: fullName,
          phone,
          gender: gender === 'male' || gender === 'female' ? gender : null,
          source: 'app_signup',
          status: 'new',
          branch_id: branchId,
          notes: 'طلب إنشاء حساب من تطبيق الموبايل',
          created_by: null,
        },
      });
    }
    return {
      status: 200,
      message: `تم استلام طلبك ✅ فريق Noamany Fitness Center هيتواصل معاك لتفعيل اشتراكك وحسابك على التطبيق`,
    };
  }

  async list(query: ListLeadsDto, user: JwtUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 200);
    const and: Prisma.club_leadsWhereInput[] = [this.branchWhere(user, query.branchId), { is_deleted: false }];
    const personalSales = await this.isPersonalSalesUser(user);
    if (query.status === 'following') and.push({ status: { notIn: ['converted', 'lost'] } });
    else if (query.status === 'open') and.push({ status: { notIn: CLOSED_LEAD_STATUSES } });
    else if (query.status && query.status !== 'all') and.push({ status: query.status });
    if (query.source && query.source !== 'all') and.push({ source: query.source });
    if (query.sourceId) and.push({ source_id: query.sourceId });
    if (personalSales) {
      and.push({ assigned_to: user.emp_code! });
    } else {
      if (query.assignedToId) and.push({ assigned_to: query.assignedToId });
      if (query.scope === 'mine' && user.emp_code) and.push({ assigned_to: user.emp_code });
      if (query.scope === 'unassigned') and.push({ assigned_to: null });
    }
    if (query.dateFrom) and.push({ created_at: { gte: new Date(`${query.dateFrom}T00:00:00`) } });
    if (query.dateTo) and.push({ created_at: { lte: new Date(`${query.dateTo}T23:59:59`) } });
    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { notes: { contains: q } },
        ],
      });
    }
    const where: Prisma.club_leadsWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.club_leads.count({ where }),
      this.prisma.club_leads.findMany({
        where,
        include: { follow_ups: { orderBy: { created_at: 'desc' }, take: 8 } },
        // Saving a follow-up must not move a numbered client underneath the next/previous cursor.
        orderBy: personalSales ? [{ created_at: 'desc' }, { id: 'desc' }] : [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const names = await this.namesFor([
      ...rows.map((row) => row.assigned_to),
      ...rows.map((row) => row.invited_by_employee_id),
      ...rows.flatMap((row) => row.follow_ups.map((item) => item.created_by)),
    ]);
    const packageNames = await this.packageNamesFor(rows.map((row) => row.subscription_type_id));
    const subscriptions = await leadSubscriptionContexts(this.prisma, rows);
    return {
      data: rows.map((row) => ({ ...this.map(row, names, packageNames), subscription: subscriptions.get(row.id) ?? null })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Records what happened after contacting a potential member (ported from FIT90).
   *
   * Each outcome *is* a status rather than a second field beside it, so a lead can never say
   * "not interested" while its status says "contacted". A closing outcome (not interested,
   * membership done) clears any pending call-back — nobody should be reminded to chase a lead
   * that said no, or one already waiting on reception. `membership_done` deliberately does not
   * convert: that creates a member and a receipt, which needs reception to take the money.
   */
  async recordFeedback(id: number, dto: { feedback: string; date?: string; note?: string }, user: JwtUser) {
    const option = feedbackOption(dto.feedback);
    if (!option) throw new BadRequestException('نتيجة التواصل غير معروفة');
    const lead = await this.prisma.club_leads.findFirst({ where: { id, is_deleted: false } });
    if (!lead) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, lead);
    if (lead.status === 'converted') throw new BadRequestException('العميل مشترك بالفعل');

    const date = dto.date?.trim().slice(0, 10) || '';
    if (option.requiresDate && !date) throw new BadRequestException('لازم تحدد التاريخ لهذه النتيجة');
    const followUp = option.closesLead
      ? { follow_up_at: null, next_follow_up_at: null }
      : date
        ? { follow_up_at: date, next_follow_up_at: nextFollowUpFromDate(date) ?? null }
        : {};

    const author = await this.prisma.users.findUnique({ where: { user_id: user.sub }, select: { name: true, username: true } });
    const row = await this.withActiveAssignee(null, async (tx) => {
      const updated = await tx.club_leads.update({
        where: { id },
        data: { status: option.status, last_contacted_at: new Date(), ...followUp },
      });
      await tx.club_lead_follow_ups.create({
        data: {
          lead_id: id,
          // The outcome is the record even when the rep typed nothing.
          note: dto.note?.trim() || option.labelAr,
          status: option.status,
          activity_type: 'feedback',
          next_follow_up_at: updated.next_follow_up_at,
          created_by: user.sub ?? null,
          author_name: author?.name?.trim() || author?.username || null,
        },
      });
      await syncLeadReminder(tx.club_reminders as never, updated);
      return tx.club_leads.findUniqueOrThrow({ where: { id }, include: { follow_ups: { orderBy: { created_at: 'desc' }, take: 8 } } });
    });
    const names = await this.namesFor([row.assigned_to, ...row.follow_ups.map((item) => item.created_by)]);
    return this.map(row, names);
  }

  /** Branch + ownership gate for screens that hang extra data (comments, history) off a lead. */
  async assertAccessible(id: number, user: JwtUser) {
    const row = await this.prisma.club_leads.findFirst({
      where: { id, is_deleted: false },
      select: { branch_id: true, assigned_to: true },
    });
    if (!row) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, row);
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.club_leads.findUnique({
      where: { id },
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    });
    if (!row) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, row);
    // The new owner opening the lead is what acknowledges a handover.
    if (row.assigned_at && !row.assignment_seen_at && row.assigned_to != null && row.assigned_to === user.emp_code) {
      row.assignment_seen_at = new Date();
      await this.prisma.club_leads.updateMany({
        where: { id, assignment_seen_at: null },
        data: { assignment_seen_at: row.assignment_seen_at },
      });
    }
    const names = await this.namesFor([row.assigned_to, row.invited_by_employee_id, ...row.follow_ups.map((item) => item.created_by)]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    const member = row.converted_member_id ? await this.prisma.club_members.findFirst({
      where: { id: row.converted_member_id, ...(row.branch_id != null ? { branch_id: row.branch_id } : {}), is_deleted: false },
      select: { profile_picture: true },
    }) : null;
    const subscriptions = await leadSubscriptionContexts(this.prisma, [row]);
    return { ...this.map(row, names, packageNames), profilePicture: member?.profile_picture ?? null, subscription: subscriptions.get(row.id) ?? null };
  }

  async create(
    dto: CreateLeadDto,
    user: JwtUser,
    extras?: { invitationId?: number; prisma?: Prisma.TransactionClient },
  ) {
    const knowledgeSourceId = await this.resolveKnowledgeSource(dto.sourceId);
    this.assertBranch(user, dto.branchId);
    const assignment = await this.isPersonalSalesUser(user)
      ? { assignedToId: user.emp_code!, assignmentMode: 'manual' as const }
      : await this.resolveAssignment(dto, dto.branchId);
    const pkg = await this.resolveInterestedPackage(dto);
    const followUpDate = dto.followUpAt ? String(dto.followUpAt).slice(0, 10) : null;
    const row = await this.withActiveAssignee(assignment.assignedToId, tx => tx.club_leads.create({
      data: {
        name: dto.fullName.trim(),
        phone: normalizePhone(dto.phone),
        email: dto.email?.trim() || null,
        source: dto.source ?? 'walk_in',
        source_id: knowledgeSourceId ?? null,
        facebook_profile_url: dto.source === 'facebook_campaign' ? dto.facebookProfileUrl?.trim() ?? null : null,
        interested_program: pkg.name,
        subscription_type_id: pkg.id,
        // Every lead enters the funnel as new — a status typed on the form applies from its
        // first edit, never at birth.
        status: 'new',
        assigned_to: assignment.assignedToId,
        assignment_mode: assignment.assignmentMode,
        ...(assignment.assignedToId
          ? { assigned_at: new Date(), assigned_by: user.emp_code ?? null }
          : {}),
        follow_up_at: followUpDate,
        next_follow_up_at: nextFollowUpFromDate(followUpDate) ?? null,
        notes: dto.notes?.trim() || null,
        invitation_id: extras?.invitationId ?? null,
        branch_id: dto.branchId,
        created_by: user.sub,
      },
      include: { follow_ups: true },
    }), extras?.prisma);
    const names = await this.namesFor([row.assigned_to]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    return this.map(row, names, packageNames);
  }

  /**
   * Who works a guest who came with an employee's invitation code: the inviter themselves when
   * they are an active sales specialist serving that branch («بنقفلهم عليه»), otherwise the
   * usual automatic round-robin. The inviter is recorded on the lead either way.
   */
  async staffInvitationAssignment(inviterEmployeeId: number, branchId: number) {
    const reps = await this.assignableReps();
    const inviter = reps.find((rep) => rep.id === inviterEmployeeId);
    if (inviter && this.repsForBranch([inviter], branchId).length) {
      return { assignedToId: inviter.id, assignmentMode: 'manual' as const, lockedToInviter: true };
    }
    const next = await this.nextRoundRobinRep(branchId);
    return { assignedToId: next?.id ?? null, assignmentMode: 'automatic' as const, lockedToInviter: false };
  }

  /**
   * The sales lead behind a «دعوة بكود موظف» guest, written inside the caller's transaction
   * (the one that consumed the allowance). Source `staff_invitation`; the guest's notes become
   * the first follow-up so they show in the sales history.
   */
  async createStaffInvitationLead(
    input: {
      guestName: string;
      phone: string;
      branchId: number;
      inviterEmployeeId: number;
      inviterName: string;
      code: string;
      staffInvitationId: number;
      notes?: string | null;
      assignment: { assignedToId: number | null; assignmentMode: 'manual' | 'automatic' };
    },
    user: JwtUser,
    tx: Prisma.TransactionClient,
  ) {
    const { assignedToId, assignmentMode } = input.assignment;
    return this.withActiveAssignee(assignedToId, async (client) => {
      const lead = await client.club_leads.create({
        data: {
          name: input.guestName.trim(),
          phone: normalizePhone(input.phone),
          source: 'staff_invitation',
          status: 'new',
          assigned_to: assignedToId,
          assignment_mode: assignedToId ? assignmentMode : null,
          ...(assignedToId ? { assigned_at: new Date(), assigned_by: user.emp_code ?? null } : {}),
          notes: `دعوة من ${input.inviterName} — كود ${input.code}`,
          staff_invitation_id: input.staffInvitationId,
          invited_by_employee_id: input.inviterEmployeeId,
          branch_id: input.branchId,
          created_by: user.sub,
        },
      });
      const note = input.notes?.trim();
      if (note) {
        await client.club_lead_follow_ups.create({
          data: { lead_id: lead.id, note, status: 'new', activity_type: 'note', created_by: user.emp_code ?? user.sub },
        });
      }
      return lead;
    }, tx);
  }

  /**
   * Turns a completed walk-in quick sale into a sales opportunity without duplicating a phone
   * already known in the same branch. This is an internal operational hook, so an existing lead
   * keeps its owner and pipeline status while the new sale is added to its history.
   */
  async recordQuickSaleCustomer(input: {
    fullName?: string;
    phone: string;
    serviceName: string;
    branchId: number;
    receiptNumber: string;
  }, user: JwtUser) {
    this.assertBranch(user, input.branchId);
    const phone = normalizePhone(input.phone);
    if (phone.replace(/\D/g, '').length < 6) {
      throw new BadRequestException('رقم الموبايل مطلوب ويجب أن يكون صحيحًا');
    }

    const counterName = `بيع سريع — ${input.serviceName.trim()}`.slice(0, 80);
    const note = `${counterName} — إيصال ${input.receiptNumber}`;
    const existing = await this.prisma.club_leads.findFirst({
      where: { branch_id: input.branchId, phone },
      orderBy: { id: 'desc' },
      select: { id: true, status: true, branch_id: true, assigned_to: true },
    });

    if (existing) {
      // Keep a deliberately assigned owner intact. A lead that was created by an
      // older automatic source without an owner is safe to place into the same
      // branch round-robin pool as a newly captured quick-sale lead.
      const assignment = existing.assigned_to == null
        ? await this.resolveAssignment({ assignmentMode: 'automatic' }, input.branchId)
        : null;
      await this.prisma.club_lead_follow_ups.create({
        data: {
          lead_id: existing.id,
          note,
          status: existing.status,
          created_by: user.emp_code ?? user.sub,
        },
      });
      await this.withActiveAssignee(assignment?.assignedToId, tx => tx.club_leads.update({
        where: { id: existing.id, assigned_to: existing.assigned_to },
        data: {
          interested_program: counterName,
          ...(assignment
            ? {
                assigned_to: assignment.assignedToId,
                assignment_mode: assignment.assignmentMode,
              }
            : {}),
        },
      }));
      return { id: existing.id, created: false };
    }

    const lead = await this.create({
      fullName: input.fullName?.trim() || counterName,
      phone,
      source: 'walk_in',
      interestedProgram: counterName,
      notes: note,
      branchId: input.branchId,
      assignmentMode: 'automatic',
    }, user);
    return { id: lead.id, created: true };
  }

  async update(id: number, dto: Partial<UpsertLeadDto>, user: JwtUser) {
    const knowledgeSourceId = await this.resolveKnowledgeSource(dto.sourceId);
    const existing = await this.prisma.club_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    if (dto.branchId) this.assertBranch(user, dto.branchId);
    const source = dto.source ?? existing.source;
    const personalSales = await this.isPersonalSalesUser(user);
    // A converted lead is a member now; its status belongs to the conversion flow.
    const nextStatus = dto.status !== undefined && existing.status !== 'converted'
      ? await this.assertSettableStatus(dto.status, existing.status, user)
      : undefined;
    let assigned = {
      assigned_to: existing.assigned_to,
      assignment_mode: existing.assignment_mode,
    };
    if (personalSales) {
      assigned = { assigned_to: user.emp_code!, assignment_mode: 'manual' };
    } else if (dto.assignmentMode || dto.assignedToId !== undefined) {
      const next = await this.resolveAssignment(
        { assignedToId: dto.assignedToId, assignmentMode: dto.assignmentMode },
        // Reassigning needs a branch to pick a rep that covers it; an unbranched lead
        // must be given one in the same edit.
        dto.branchId ?? existing.branch_id ?? (() => { throw new BadRequestException('حدد فرع العميل أولًا'); })(),
      );
      assigned = { assigned_to: next.assignedToId, assignment_mode: next.assignmentMode };
    }
    const pkg = dto.subscriptionTypeId !== undefined || dto.interestedProgram !== undefined
      ? await this.resolveInterestedPackage({
        subscriptionTypeId: dto.subscriptionTypeId,
        interestedProgram: dto.interestedProgram,
      })
      : null;
    const assignmentChanged = assigned.assigned_to !== existing.assigned_to || assigned.assignment_mode !== existing.assignment_mode;
    const row = await this.withActiveAssignee(assignmentChanged ? assigned.assigned_to : null, tx => tx.club_leads.update({
      where: { id, assigned_to: existing.assigned_to },
      data: {
        ...(dto.fullName != null ? { name: dto.fullName.trim() } : {}),
        ...(dto.phone != null ? { phone: normalizePhone(dto.phone) } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(dto.followUpAt !== undefined
          ? {
            follow_up_at: dto.followUpAt ? String(dto.followUpAt).slice(0, 10) : null,
            next_follow_up_at: nextFollowUpFromDate(dto.followUpAt ?? '') ?? null,
          }
          : {}),
        ...(dto.source != null ? { source: dto.source } : {}),
        ...(knowledgeSourceId !== undefined ? { source_id: knowledgeSourceId } : {}),
        facebook_profile_url:
          source === 'facebook_campaign'
            ? (dto.facebookProfileUrl ?? existing.facebook_profile_url)?.trim() ?? null
            : null,
        ...(pkg ? { interested_program: pkg.name, subscription_type_id: pkg.id } : {}),
        ...(assignmentChanged ? assigned : {}),
        // A new owner is a handover: stamp it so their workspace flags the lead as new.
        ...(assignmentChanged && assigned.assigned_to !== existing.assigned_to
          ? { assigned_at: assigned.assigned_to ? new Date() : null, assigned_by: user.emp_code ?? null, assignment_seen_at: null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
      },
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    }));
    const names = await this.namesFor([row.assigned_to, ...row.follow_ups.map((item) => item.created_by)]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    return this.map(row, names, packageNames);
  }

  async remove(id: number, user: JwtUser) {
    const existing = await this.prisma.club_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    await this.prisma.club_leads.delete({ where: { id } });
    return { ok: true };
  }

  async followUp(id: number, dto: FollowUpLeadDto, user: JwtUser) {
    const existing = await this.prisma.club_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    const status = existing.status === 'converted' ? 'converted' : dto.status ?? (existing.status === 'new' ? 'contacted' : existing.status);
    const personalSales = await this.isPersonalSalesUser(user);
    if (personalSales && ['qualified', 'converted'].includes(status) && status !== existing.status) {
      throw new BadRequestException('يتم تأهيل العميل تلقائيًا عند تسجيله من الاستقبال');
    }

    const activityType = LEAD_ACTIVITY_TYPES.includes(dto.activityType as never)
      ? dto.activityType!
      : 'note';
    const answered = activityType === 'call' ? dto.answered : undefined;
    let note = dto.note?.trim() ?? '';
    if (activityType === 'call' && answered == null) {
      throw new BadRequestException('حدد هل تم الرد على الاتصال أم لا');
    }
    if (activityType === 'call' && answered === false && !note) note = 'لم يتم الرد';
    if ((activityType !== 'call' || answered === true) && note.length < 2) {
      throw new BadRequestException('ملاحظات المتابعة مطلوبة');
    }

    // `undefined` when the rep left the date empty, so the lead's existing booking is left
    // untouched below. Coercing to null here is what silently erased a scheduled callback.
    const nextFollowUpAt = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined;
    if (dto.nextFollowUpAt && Number.isNaN(nextFollowUpAt!.getTime())) {
      throw new BadRequestException('موعد المتابعة القادمة غير صحيح');
    }
    const nextCallAt = dto.nextCallAt ? new Date(dto.nextCallAt) : undefined;
    if (nextCallAt && Number.isNaN(nextCallAt.getTime())) throw new BadRequestException('موعد الاتصال القادم غير صحيح');
    if ((FOLLOW_LATER_STATUSES as readonly string[]).includes(status) && !nextFollowUpAt) {
      throw new BadRequestException('موعد المتابعة القادمة مطلوب عند اختيار متابعة لاحقًا');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_lead_follow_ups.create({
        data: {
          lead_id: id,
          note,
          status,
          activity_type: activityType,
          answered: activityType === 'call' ? Boolean(answered) : null,
          interests: dto.interests?.trim() || null,
          // The activity record describes THIS contact, so "no date given" is genuinely null.
          next_follow_up_at: nextFollowUpAt ?? null,
          next_call_at: nextCallAt ?? null,
          created_by: user.emp_code ?? user.sub,
        },
      });
      return tx.club_leads.update({
        where: { id, status: existing.status, assigned_to: existing.assigned_to },
        data: {
          status,
          last_contacted_at: new Date(),
          // Only overwrite a scheduled callback when one was actually supplied. Writing
          // `undefined` leaves the column alone; writing `null` erased it — so a rep who
          // booked Thursday, then logged an unrelated note on Tuesday without re-entering
          // the date, silently lost Thursday.
          ...(nextFollowUpAt !== undefined ? { next_follow_up_at: nextFollowUpAt } : {}),
          ...(nextCallAt !== undefined ? { next_call_at: nextCallAt } : {}),
        },
        include: { follow_ups: { orderBy: { created_at: 'desc' } } },
      });
    });
    const names = await this.namesFor([row.assigned_to, ...row.follow_ups.map((item) => item.created_by)]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    return this.map(row, names, packageNames);
  }

  async ensureRenewalLead(memberId: number, user: JwtUser) {
    if (!user.emp_code || !(await this.isPersonalSalesUser(user))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }
    const member = await this.prisma.club_members.findFirst({
      where: {
        id: memberId,
        is_deleted: false,
        OR: [{ sales_id: user.emp_code }, { created_by: user.sub }],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        branch_id: true,
      },
    });
    if (!member) throw new NotFoundException('العضو غير موجود ضمن عملائك');
    this.assertBranch(user, member.branch_id);
    if (!member.phone?.trim()) {
      throw new BadRequestException('لا يوجد رقم موبايل مسجل لهذا العضو');
    }

    const phone = normalizePhone(member.phone);
    const existing = await this.prisma.club_leads.findFirst({
      where: {
        branch_id: member.branch_id,
        OR: [{ converted_member_id: member.id }, { phone }],
      },
      orderBy: [{ converted_member_id: 'desc' }, { id: 'desc' }],
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    });
    if (existing) {
      if (existing.assigned_to != null && existing.assigned_to !== user.emp_code) {
        throw new ForbiddenException('ملف هذا العضو مسند إلى أخصائي مبيعات آخر');
      }
      const row = await this.withActiveAssignee(['converted', 'lost'].includes(existing.status) ? null : user.emp_code, tx => tx.club_leads.update({
        where: { id: existing.id, assigned_to: existing.assigned_to },
        data: {
          assigned_to: user.emp_code,
          assignment_mode: 'manual',
          converted_member_id: existing.converted_member_id ?? member.id,
        },
        include: { follow_ups: { orderBy: { created_at: 'desc' } } },
      }));
      const names = await this.namesFor([row.assigned_to, ...row.follow_ups.map((item) => item.created_by)]);
      const packageNames = await this.packageNamesFor([row.subscription_type_id]);
      return this.map(row, names, packageNames);
    }

    const row = await this.prisma.club_leads.create({
      data: {
        name: member.name.trim(),
        phone,
        source: 'walk_in',
        interested_program: 'متابعة تجديد العضوية',
        status: 'converted',
        assigned_to: user.emp_code,
        assignment_mode: 'manual',
        converted_member_id: member.id,
        notes: 'ملف متابعة تجديد العضوية',
        branch_id: member.branch_id,
        created_by: user.sub,
      },
      include: { follow_ups: true },
    });
    const names = await this.namesFor([row.assigned_to]);
    return this.map(row, names);
  }

  async assign(id: number, dto: AssignLeadDto, user: JwtUser) {
    return this.update(id, dto, user);
  }

  async reminders(user: JwtUser, query: ListLeadsDto = {}) {
    if (!user.emp_code || !(await this.isPersonalSalesUser(user))) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    const rows = await this.prisma.club_leads.findMany({
      where: { AND: [this.branchWhere(user), { assigned_to: user.emp_code }, { status: { notIn: ['lost', 'qualified'] } }, { OR: [{ next_call_at: { not: null } }, { next_follow_up_at: { not: null } }] }] },
      select: { id: true, name: true, phone: true, status: true, branch_id: true, converted_member_id: true, next_call_at: true, next_follow_up_at: true },
    });
    const now = Date.now();
    const reminders = rows.flatMap(row => {
      const lead = { id: row.id, fullName: row.name, phone: row.phone, status: row.status, branchId: row.branch_id, convertedMemberId: row.converted_member_id, statusLabel: LEAD_STATUS_LABELS[row.status as LeadStatus] ?? row.status, sourceLabel: '' };
      return ([['call', row.next_call_at], ['follow_up', row.next_follow_up_at]] as const).flatMap(([kind, dueAt]) => dueAt ? [{ id: `${row.id}:${kind}`, kind, dueAt, lead }] : []);
    }).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.lead.id - b.lead.id || a.kind.localeCompare(b.kind));
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const total = reminders.length;
    const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, Math.ceil(total / pageSize)));
    return { data: reminders.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, overdue: reminders.filter(item => item.dueAt.getTime() < now).length };
  }

  async completeReminder(id: number, dto: CompleteLeadReminderDto, user: JwtUser) {
    if (!user.emp_code || !(await this.isPersonalSalesUser(user))) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    const field = dto.kind === 'call' ? 'next_call_at' : 'next_follow_up_at';
    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('موعد التنبيه غير صحيح');
    await this.prisma.$transaction(async tx => {
      const result = await tx.club_leads.updateMany({ where: { AND: [this.branchWhere(user), { id, assigned_to: user.emp_code, [field]: dueAt }] }, data: { [field]: null } });
      if (!result.count) throw new BadRequestException('تغير هذا الموعد أو لم يعد العميل مسندًا لك. حدّث التنبيهات.');
      await tx.club_lead_follow_ups.create({ data: { lead_id: id, activity_type: 'system', note: dto.kind === 'call' ? 'تم إنجاز تنبيه الاتصال' : 'تم إنجاز تنبيه المتابعة', created_by: user.emp_code ?? user.sub } });
    });
    return { completed: true };
  }

  async mine(user: JwtUser, query: ListLeadsDto = {}) {
    if (!user.emp_code) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    return this.list({ ...query, assignedToId: user.emp_code, scope: 'mine', page: query.page ?? 1, pageSize: query.pageSize ?? 50, status: query.status || 'following' }, user);
  }

  async downloadTemplate(res: Response) {
    const packages = await this.listInterestedPackages();
    const examplePackage = packages[0];
    await this.exporter.sendXlsx(res, 'leads-template.xlsx', [
      {
        name: 'العملاء المحتملون',
        columns: [
          { key: 'fullName', header: 'الاسم الكامل', width: 28 },
          { key: 'phone', header: 'الهاتف', width: 18 },
          { key: 'source', header: 'المصدر', width: 22 },
          { key: 'facebookProfileUrl', header: 'رابط فيسبوك', width: 32 },
          { key: 'interestedProgram', header: 'الباقة المهتم (رقم أو اسم)', width: 28 },
          { key: 'notes', header: 'ملاحظات', width: 30 },
          { key: 'branchId', header: 'رقم الفرع', width: 12 },
          { key: 'assignedToId', header: 'رقم أخصائي المبيعات (اختياري)', width: 28 },
        ],
        rows: [
          {
            fullName: 'مثال أحمد',
            phone: '01000000000',
            source: 'walk_in',
            facebookProfileUrl: '',
            interestedProgram: examplePackage ? examplePackage.id : '',
            notes: 'زار الفرع اليوم — إن تُرك أخصائي المبيعات فارغًا يوزَّع تلقائيًا',
            branchId: 1,
            assignedToId: '',
          },
        ],
      },
      {
        name: 'المصادر',
        columns: [
          { key: 'key', header: 'القيمة', width: 22 },
          { key: 'label', header: 'المعنى', width: 28 },
        ],
        rows: LEAD_SOURCES.filter((source) => !SYSTEM_LEAD_SOURCES.includes(source)).map((source) => ({
          key: source,
          label: LEAD_SOURCE_LABELS[source],
        })),
      },
      {
        name: 'الباقات',
        columns: [
          { key: 'id', header: 'رقم الباقة', width: 12 },
          { key: 'name', header: 'الاسم', width: 32 },
          { key: 'kind', header: 'النوع', width: 14 },
        ],
        rows: packages.map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          kind: pkg.isLinkedToSessions ? 'حصص' : 'اشتراك',
        })),
      },
    ]);
  }

  async exportExcel(query: ListLeadsDto, user: JwtUser, res: Response) {
    // list() clamps pageSize to 200, so asking for 5000 shipped a 200-row file that looked
    // complete. Page through instead of handing the manager a silently truncated export.
    const EXPORT_PAGE = 200;
    const rows: Awaited<ReturnType<typeof this.list>>['data'] = [];
    let total = Infinity;
    for (let page = 1; rows.length < total && page <= 100; page += 1) {
      const chunk = await this.list({ ...query, page, pageSize: EXPORT_PAGE }, user);
      total = chunk.total;
      if (!chunk.data.length) break;
      rows.push(...chunk.data);
    }
    const result = { data: rows, total };
    await this.exporter.sendXlsx(res, 'leads.xlsx', [
      {
        name: 'العملاء المحتملون',
        columns: [
          { key: 'fullName', header: 'الاسم', width: 24 },
          { key: 'phone', header: 'الهاتف', width: 16 },
          { key: 'sourceLabel', header: 'المصدر', width: 22 },
          { key: 'statusLabel', header: 'الحالة', width: 16 },
          { key: 'assignedToName', header: 'أخصائي المبيعات', width: 22 },
          { key: 'interestedProgramLabel', header: 'البرنامج', width: 16 },
          { key: 'notes', header: 'ملاحظات', width: 28 },
        ],
        rows: result.data,
      },
    ]);
  }

  /**
   * Lapsed and soon-to-lapse members as a CRM hand-off sheet.
   *
   * It lives next to `downloadTemplate` and `importExcel` on purpose: the first eight
   * columns are the import template, in the same order, because the manager's workflow is
   * export the people who lapsed → hand the file to the team → upload it back as leads.
   * Keeping all three in one file means a change to the template cannot silently break the
   * export.
   *
   * The only file available before this carried neither a phone number nor what the member
   * had paid, so it could be used for neither calling nor pricing a renewal.
   *
   * Columns nine onwards are the renewal context that was missing. `importExcel` reads
   * cells 1-8 by position and ignores the rest, so the same file uploads unchanged.
   */
  /**
   * The lapsed / soon-to-lapse people behind the renewal screen.
   *
   * One row per person, keeping their most recent contract: the team calls the member, not
   * each historical subscription. Shared by the on-screen list, the Excel hand-off and the
   * one-click conversion so all three can never disagree about who is on the list.
   */
  private async renewalCandidates(
    query: { branch?: string; state?: string; days?: number; search?: string },
    user: JwtUser,
  ) {
    const state = query.state === 'due_soon' ? 'due_soon' : query.state === 'all' ? 'all' : 'expired';
    // Local date, not UTC: toISOString() returns yesterday in Cairo until ~02:00, so for
    // those hours a contract that lapsed yesterday would not count as expired.
    const today = localDateString();
    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + Math.min(Math.max(query.days ?? 30, 1), 365));
    const horizon = horizonDate.toISOString().slice(0, 10);

    const and: Prisma.club_subscriptionsWhereInput[] = [];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });

    // Deliberately NOT filtered by end date in SQL.
    //
    // Filtering first and grouping second was wrong: a member with a lapsed contract who
    // renewed yesterday had the renewal excluded by the WHERE clause, so the grouping saw
    // only the old expired row and kept listing them as expired forever. The sales team
    // chased people who had already paid.
    //
    // Whether someone counts as lapsed is a fact about their LATEST contract, so every
    // contract has to be in hand before that question can be asked.

    const rows = await this.prisma.club_subscriptions.findMany({
      where: and.length ? { AND: and } : {},
      select: {
        id: true,
        subscription_number: true,
        subscription_type: true,
        subscription_start_date: true,
        subscription_end_date: true,
        paid_amount: true,
        branch_id: true,
        member_id: true,
        customer_name: true,
        guardian_phone: true,
        member: { select: { name: true, phone: true, member_code: true } },
      },
      orderBy: { subscription_end_date: 'desc' },
    });

    // Rows arrive newest-expiry-first, so the first one seen for a person is their latest.
    const latestByPerson = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const phone = (row.member?.phone ?? row.guardian_phone ?? '').trim();
      const key = row.member?.member_code?.trim() || phone || `sub:${row.subscription_number}`;
      if (!latestByPerson.has(key)) latestByPerson.set(key, row);
    }

    // Now that each person is represented by their newest contract, the state question is
    // answerable — and a renewal drops them out of the lapsed list immediately.
    const matchesState = (endDate: string) => {
      if (state === 'expired') return endDate < today;
      if (state === 'due_soon') return endDate >= today && endDate <= horizon;
      return true;
    };

    let people = [...latestByPerson.values()].filter((row) => matchesState(row.subscription_end_date)).map((row) => ({
      subscriptionId: row.id,
      subscriptionNumber: row.subscription_number,
      memberId: row.member_id,
      fullName: row.member?.name ?? row.customer_name ?? '',
      phone: row.member?.phone ?? row.guardian_phone ?? '',
      memberCode: row.member?.member_code ?? '',
      subscriptionType: row.subscription_type ?? '',
      paidAmount: Number(row.paid_amount),
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
      branchId: row.branch_id,
      state: row.subscription_end_date < today ? ('expired' as const) : ('due_soon' as const),
    }));

    const search = query.search?.trim();
    if (search) {
      people = people.filter((row) =>
        row.fullName.includes(search)
        || row.phone.includes(search)
        || row.memberCode.includes(search)
        || row.subscriptionType.includes(search));
    }
    return { state, today, people };
  }

  /**
   * Which of these people already sit in an open lead. Matched per branch — the same phone in
   * another branch is that branch's client — but a legacy lead with no branch counts for every
   * branch, and a person with no branch matches any branch, so neither gets a duplicate lead.
   */
  private async openLeadMatcher(people: Array<{ phone: string; branchId: number | null }>) {
    const phones = [...new Set(people.map((row) => row.phone).filter(Boolean))];
    const branches = [...new Set(people.map((row) => row.branchId).filter((id): id is number => id != null))];
    const anyBranchPerson = people.some((row) => row.branchId == null);
    const rows = phones.length
      ? await this.prisma.club_leads.findMany({
          where: {
            phone: { in: phones },
            status: { notIn: ['converted', 'lost'] },
            ...(branches.length && !anyBranchPerson ? { OR: [{ branch_id: { in: branches } }, { branch_id: null }] } : {}),
          },
          select: { phone: true, branch_id: true },
        })
      : [];
    const keys = new Set(rows.map((row) => `${row.branch_id ?? 'any'}:${row.phone}`));
    const anyPhone = new Set(rows.map((row) => row.phone));
    return (row: { phone: string; branchId: number | null }) =>
      row.branchId == null
        ? anyPhone.has(row.phone)
        : keys.has(`${row.branchId}:${row.phone}`) || keys.has(`any:${row.phone}`);
  }

  /** The renewal list as the screen shows it, paginated. */
  async listRenewalCandidates(
    query: { branch?: string; state?: string; days?: number; search?: string; page?: number; pageSize?: number },
    user: JwtUser,
  ) {
    const { people } = await this.renewalCandidates(query, user);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 200);
    const page = Math.max(query.page ?? 1, 1);
    // A person already sitting in their branch's pipeline should not be offered again.
    const hasOpenLead = await this.openLeadMatcher(people);
    const data = people.map((row) => ({ ...row, hasOpenLead: hasOpenLead(row) }));
    return {
      data: data.slice((page - 1) * pageSize, page * pageSize),
      total: data.length,
      page,
      pageSize,
      summary: {
        total: data.length,
        alreadyInPipeline: data.filter((row) => row.hasOpenLead).length,
        convertible: data.filter((row) => !row.hasOpenLead && row.phone).length,
        missingPhone: data.filter((row) => !row.phone).length,
      },
    };
  }

  /**
   * Turn the renewal list into leads in one step, distributed across the team.
   *
   * The manager's alternative was download-a-file-then-upload-the-same-file into the same
   * system. Anyone already in an open pipeline is skipped, so pressing the button twice
   * does not duplicate the queue.
   */
  async convertRenewalCandidates(
    query: { branch?: string; state?: string; days?: number; search?: string },
    user: JwtUser,
  ) {
    const { people } = await this.renewalCandidates(query, user);
    const withPhone = people.filter((row) => row.phone);
    const hasOpenLead = await this.openLeadMatcher(withPhone);

    // A real club has thousands of lapsed contracts — the first run against live-sized data
    // created 4,610 leads in one request. Converting in bounded batches keeps the request
    // from hanging or timing out half-finished; the caller presses again for the rest, and
    // the already-in-pipeline skip makes that safe to repeat.
    const BATCH_LIMIT = 500;
    let created = 0;
    let skipped = people.length - withPhone.length;
    let remaining = 0;
    const errors: string[] = [];
    for (const row of withPhone) {
      if (hasOpenLead(row)) { skipped += 1; continue; }
      if (created >= BATCH_LIMIT) { remaining += 1; continue; }
      try {
        await this.create({
          fullName: row.fullName || `عضو ${row.memberCode || row.phone}`,
          phone: row.phone,
          source: 'renewal',
          interestedProgram: row.subscriptionType || undefined,
          notes: `اشتراك سابق ${row.subscriptionNumber} — ينتهي ${row.endDate}`,
          branchId: row.branchId,
          // Blank assignee is what the round-robin distributor keys off.
          assignmentMode: 'automatic',
        }, user);
        created += 1;
      } catch (error) {
        errors.push(`${row.fullName || row.phone}: ${error instanceof Error ? error.message : 'تعذر التحويل'}`);
      }
    }
    return {
      created,
      skipped,
      remaining,
      batchLimit: BATCH_LIMIT,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
    };
  }

  async exportRenewalHandoff(
    query: { branch?: string; state?: string; days?: number; search?: string },
    user: JwtUser,
    res: Response,
  ) {
    const { state, today, people } = await this.renewalCandidates(query, user);

    const data = people.map((row) => ({
      fullName: row.fullName,
      phone: row.phone,
      // A lapsed member coming back is a renewal, not a walk-in.
      source: 'renewal',
      facebookProfileUrl: '',
      interestedProgram: row.subscriptionType,
      notes: `اشتراك سابق ${row.subscriptionNumber} — ينتهي ${row.endDate}`,
      branchId: row.branchId,
      assignedToId: '',
      subscriptionType: row.subscriptionType,
      paidAmount: row.paidAmount,
      startDate: row.startDate,
      endDate: row.endDate,
      memberCode: row.memberCode,
    }));

    const label = state === 'expired' ? 'منتهية' : state === 'due_soon' ? 'قريبة الانتهاء' : 'الكل';
    await this.exporter.sendXlsx(res, `crm-renewals-${state}-${today}.xlsx`, [
      {
        name: 'العملاء المحتملون',
        columns: [
          // 1-8 — the import template, unchanged and in order.
          { key: 'fullName', header: 'الاسم الكامل', width: 28 },
          { key: 'phone', header: 'الهاتف', width: 18 },
          { key: 'source', header: 'المصدر', width: 22 },
          { key: 'facebookProfileUrl', header: 'رابط فيسبوك', width: 32 },
          { key: 'interestedProgram', header: 'الباقة المهتم (رقم أو اسم)', width: 28 },
          { key: 'notes', header: 'ملاحظات', width: 42 },
          { key: 'branchId', header: 'رقم الفرع', width: 12 },
          { key: 'assignedToId', header: 'رقم أخصائي المبيعات (اختياري)', width: 28 },
          // 9+ — renewal context; the importer ignores these.
          { key: 'subscriptionType', header: 'نوع الاشتراك', width: 24 },
          { key: 'paidAmount', header: 'المدفوع', width: 14 },
          { key: 'startDate', header: 'تاريخ البداية', width: 16 },
          { key: 'endDate', header: 'تاريخ النهاية', width: 16 },
          { key: 'memberCode', header: 'كود العضو', width: 14 },
        ],
        rows: data,
      },
      {
        name: 'تعليمات',
        columns: [
          { key: 'k', header: 'البند', width: 26 },
          { key: 'v', header: 'التفاصيل', width: 86 },
        ],
        rows: [
          { k: 'المحتوى', v: `اشتراكات ${label} — ${data.length} عميل` },
          { k: 'تاريخ التصدير', v: today },
          { k: 'الرفع على الـCRM', v: 'الملف بيترفع زي ما هو من شاشة العملاء المحتملين ← استيراد. الأعمدة من ٩ لآخر الملف بيتجاهلها الاستيراد.' },
          { k: 'الأعمدة الإضافية', v: 'نوع الاشتراك، المدفوع، تاريخ البداية، تاريخ النهاية، كود العضو — للمتابعة والتسعير.' },
          { k: 'التكرار', v: 'كل عميل مرة واحدة بأحدث اشتراك له، مش كل اشتراك على حدة.' },
        ],
      },
    ]);
  }

  async importExcel(file: Express.Multer.File, user: JwtUser, defaultBranchId?: number) {
    if (!file?.buffer?.length) throw new BadRequestException('ملف الإكسل مطلوب');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('الملف لا يحتوي على ورقة بيانات');
    const created: number[] = [];
    const errors: string[] = [];
    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const row = sheet.getRow(i);
      const fullName = String(row.getCell(1).value ?? '').trim();
      const phone = String(row.getCell(2).value ?? '').trim();
      if (!fullName && !phone) continue;
      const rawSource = String(row.getCell(3).value ?? 'walk_in').trim();
      const source = (Object.entries(LEAD_SOURCE_LABELS).find(([, label]) => label === rawSource)?.[0]
        ?? rawSource) as LeadSource;
      if (!fullName || !phone) {
        errors.push(`صف ${i}: الاسم والهاتف مطلوبان`);
        continue;
      }
      if (!isLeadSource(source) || SYSTEM_LEAD_SOURCES.includes(source)) {
        errors.push(`صف ${i}: مصدر غير صالح`);
        continue;
      }
      try {
        const branchId = Number(row.getCell(7).value) || defaultBranchId || user.branch || 0;
        if (!branchId) throw new BadRequestException('حدد الفرع');
        const assignedRaw = String(row.getCell(8).value ?? '').trim();
        const assignedToId = assignedRaw ? Number(assignedRaw) : undefined;
        const hasAssignee = assignedToId != null && Number.isFinite(assignedToId) && assignedToId > 0;
        const interestedRaw = String(row.getCell(5).value ?? '').trim();
        await this.create({
          fullName,
          phone,
          source,
          facebookProfileUrl: String(row.getCell(4).value ?? '').trim() || undefined,
          interestedProgram: interestedRaw || undefined,
          subscriptionTypeId: /^\d+$/.test(interestedRaw) ? Number(interestedRaw) : undefined,
          notes: String(row.getCell(6).value ?? '').trim() || undefined,
          assignedToId: hasAssignee ? assignedToId : undefined,
          assignmentMode: hasAssignee ? 'manual' : 'automatic',
          branchId,
        }, user);
        created.push(i);
      } catch (error) {
        errors.push(`صف ${i}: ${error instanceof Error ? error.message : 'تعذر الاستيراد'}`);
      }
    }
    return { imported: created.length, errors };
  }

  private async transferContext(fromEmployeeId: number, user: JwtUser) {
    if (await this.isPersonalSalesUser(user)) throw new ForbiddenException('إدارة حالة الفريق متاحة لمدير المبيعات فقط');
    const reps = await this.employees.salesReps();
    const source = reps.find(rep => rep.id === fromEmployeeId);
    if (!source) throw new NotFoundException('أخصائي المبيعات غير موجود');
    for (const branchId of source.branchIds?.length ? source.branchIds : source.branchId ? [source.branchId] : []) this.assertBranch(user, branchId);
    return reps;
  }

  async transferPreview(fromEmployeeId: number, user: JwtUser) {
    const reps = await this.transferContext(fromEmployeeId, user);
    const [open, settings] = await Promise.all([
      this.prisma.club_leads.findMany({ where: { assigned_to: fromEmployeeId, status: { notIn: ['converted', 'lost'] } }, select: { id: true, branch_id: true } }),
      this.prisma.club_sales_rep_settings.findMany({ select: { employee_id: true, is_active: true } }),
    ]);
    open.forEach(lead => this.assertBranch(user, lead.branch_id));
    const inactive = new Set(settings.filter(row => !row.is_active).map(row => row.employee_id));
    const pool = reps.filter(rep => rep.id !== fromEmployeeId && !inactive.has(rep.id));
    const branches = [...new Set(open.map(lead => lead.branch_id).filter((id): id is number => id != null))];
    return { isActive: !inactive.has(fromEmployeeId), count: open.length,
      candidates: pool.filter(rep => branches.every(branch => servesSalesBranch(rep, branch))).map(rep => ({ id: rep.id, name: rep.name })),
      autoAvailable: branches.every(branch => pool.some(rep => servesSalesBranch(rep, branch))),
      blockedBranches: branches.filter(branch => !pool.some(rep => servesSalesBranch(rep, branch))),
    };
  }

  async setRepActivation(fromEmployeeId: number, body: { isActive: boolean; mode?: 'auto' | 'manual'; targetEmployeeId?: number }, user: JwtUser) {
    return this.performTransfer(fromEmployeeId, body, user, body.isActive);
  }

  async transferLeads(fromEmployeeId: number, body: { mode?: 'auto' | 'manual'; targetEmployeeId?: number }, user: JwtUser) {
    return this.performTransfer(fromEmployeeId, body, user);
  }

  private async performTransfer(fromEmployeeId: number, body: { mode?: 'auto' | 'manual'; targetEmployeeId?: number }, user: JwtUser, activate?: boolean) {
    const reps = await this.transferContext(fromEmployeeId, user);
    return this.prisma.$transaction(async tx => {
      // Share employee locks with payroll; every activation operation locks in the same order.
      for (const id of reps.map(rep => rep.id).sort((a, b) => a - b)) await lockPayrollEmployee(tx, id);
      const open = activate === true ? [] : await tx.club_leads.findMany({
        where: { assigned_to: fromEmployeeId, status: { notIn: ['converted', 'lost'] } },
        select: { id: true, branch_id: true }, orderBy: { id: 'asc' },
      });
      open.forEach(lead => this.assertBranch(user, lead.branch_id));
      const inactive = new Set((await tx.club_sales_rep_settings.findMany({ where: { is_active: false }, select: { employee_id: true } })).map(row => row.employee_id));
      const pool = reps.filter(rep => rep.id !== fromEmployeeId && !inactive.has(rep.id));
      const mode = body.mode === 'manual' ? 'manual' : 'auto';
      const plan = open.length ? planLeadTransfer(open, pool, mode, body.targetEmployeeId) : [];
      if (activate !== undefined) await tx.club_sales_rep_settings.upsert({
        where: { employee_id: fromEmployeeId }, create: { employee_id: fromEmployeeId, is_active: activate, use_default_settings: true }, update: { is_active: activate },
      });
      for (const item of plan) {
        const result = await tx.club_leads.updateMany({
          where: { id: item.leadId, assigned_to: fromEmployeeId, status: { notIn: ['converted', 'lost'] } },
          data: { assigned_to: item.targetId, assignment_mode: mode === 'manual' ? 'manual' : 'automatic' },
        });
        if (result.count !== 1) throw new BadRequestException('تغيرت قائمة العملاء أثناء النقل؛ أعد المحاولة');
      }
      return { moved: plan.length, skipped: 0, targets: [...new Set(plan.map(item => item.targetId))], isActive: activate };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 });
  }

  /**
   * Hands every open, unowned lead to a sales rep who covers its branch.
   *
   * `round_robin` walks the reps in turn (the original behaviour); `random` draws a rep per lead,
   * which is what the potential-members screen's button asks for. Either way only open leads
   * move — a converted, lost or deleted lead has nothing left for a rep to do — and each handover
   * is stamped so the receiving rep sees it flagged as new in the sales workspace.
   */
  async distributeUnassigned(
    user: JwtUser,
    branchId?: number,
    mode: 'round_robin' | 'random' = 'round_robin',
    pick: (size: number) => number = (size) => Math.floor(Math.random() * size),
  ) {
    const reps = await this.assignableReps();
    if (!reps.length) throw new BadRequestException('لا يوجد أخصائيو مبيعات نشطون للتوزيع');
    const leads = await this.prisma.club_leads.findMany({
      where: {
        AND: [
          this.branchWhere(user, branchId),
          { assigned_to: null, is_deleted: false, status: { notIn: ['converted', 'lost'] } },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true, branch_id: true },
    });
    if (!leads.length) return { distributed: 0, skipped: 0, byRep: [] as Array<{ id: number; name: string; count: number }> };

    const byRep = new Map<number, { id: number; name: string; count: number }>();
    let distributed = 0;
    for (const lead of leads) {
      let next: { id: number; name: string | null } | null;
      if (mode === 'random') {
        const pool = this.repsForBranch(reps, lead.branch_id ?? undefined);
        next = pool.length ? pool[pick(pool.length)] ?? null : null;
      } else {
        next = await this.nextRoundRobinRep(lead.branch_id ?? undefined);
      }
      if (!next) continue;
      const repId = next.id;
      const updated = await this.withActiveAssignee(repId, tx => tx.club_leads.updateMany({
        where: { id: lead.id, assigned_to: null },
        data: {
          assigned_to: repId,
          assignment_mode: 'automatic',
          assigned_at: new Date(),
          assigned_by: user.emp_code ?? null,
          assignment_seen_at: null,
        },
      }));
      // Someone else claimed it between the read and the write — not ours to count.
      if (!updated.count) continue;
      distributed += 1;
      const tally = byRep.get(repId) ?? { id: repId, name: next.name ?? `#${repId}`, count: 0 };
      tally.count += 1;
      byRep.set(repId, tally);
    }
    return {
      distributed,
      skipped: leads.length - distributed,
      byRep: [...byRep.values()].sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Reps who serve `branchId` — their home branch plus any extra branches assigned to them.
   * `salesReps()` always returns `branchIds` as an array, so a rep with no branch serves none.
   */
  private repsForBranch<T extends { branchId?: number | null; branchIds?: number[] }>(reps: T[], branchId?: number) {
    if (!branchId) return reps;
    return reps.filter((rep) => rep.branchIds?.includes(branchId) ?? (rep.branchId === branchId || rep.branchId == null));
  }

}
