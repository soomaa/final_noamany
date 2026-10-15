import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
} from './club-sales.constants';
import {
  AssignLeadDto,
  CompleteLeadReminderDto,
  CreateLeadDto,
  FollowUpLeadDto,
  ListLeadsDto,
  UpsertLeadDto,
} from './dto/leads.dto';
import { leadSubscriptionContexts } from './lead-subscription-context';
import { canAssignSalesRepToBranch } from './lead-transfer-plan';

@Injectable()
export class ClubLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly employees: EmployeesService,
    private readonly exporter: ExportService,
  ) {}

  private assertBranch(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private async isPersonalSalesUser(user: JwtUser) {
    return Boolean(user.emp_code && await this.employees.isSalesEmployee(user.emp_code));
  }

  private async assertLeadAccess(
    user: JwtUser,
    lead: { branch_id: number; assigned_to_id: number | null },
  ) {
    this.assertBranch(user, lead.branch_id);
    if (await this.isPersonalSalesUser(user)) {
      if (!user.emp_code || lead.assigned_to_id !== user.emp_code) {
        throw new ForbiddenException('هذا العميل المحتمل غير مسند إلى حسابك');
      }
    }
  }

  private branchWhere(user?: JwtUser, branchId?: number): Prisma.club_sales_crm_leadsWhereInput {
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    return scope === null ? {} : { branch_id: { in: scope } };
  }

  private map(row: {
    id: number;
    full_name: string;
    phone: string;
    source: string;
    facebook_profile_url: string | null;
    interested_program: string | null;
    subscription_type_id: number | null;
    status: string;
    assigned_to_id: number | null;
    assignment_mode: string | null;
    converted_member_id: number | null;
    invitation_id: number | null;
    notes: string | null;
    last_contacted_at: Date | null;
    next_follow_up_at: Date | null;
    next_call_at?: Date | null;
    branch_id: number;
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
      fullName: row.full_name,
      phone: row.phone,
      source: row.source,
      sourceLabel: isLeadSource(row.source) ? LEAD_SOURCE_LABELS[row.source] : row.source,
      facebookProfileUrl: row.facebook_profile_url,
      interestedProgram: row.interested_program,
      interestedProgramLabel: packageName ?? legacyLabel ?? cached,
      subscriptionTypeId: row.subscription_type_id,
      status: row.status,
      statusLabel: isLeadStatus(row.status) ? LEAD_STATUS_LABELS[row.status] : row.status,
      assignedToId: row.assigned_to_id,
      assignedToName: row.assigned_to_id ? names.get(row.assigned_to_id) ?? `#${row.assigned_to_id}` : null,
      assignmentMode: row.assignment_mode,
      convertedMemberId: row.converted_member_id,
      invitationId: row.invitation_id,
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

  async nextRoundRobinRep(preferredBranchId?: number) {
    const reps = await this.employees.salesReps();
    if (!reps.length) return null;
    const pool = preferredBranchId
      ? reps.filter((rep) => canAssignSalesRepToBranch(rep, preferredBranchId))
      : reps;
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
      const reps = await this.employees.salesReps();
      const assignedRep = reps.find((rep) => rep.id === dto.assignedToId);
      if (!assignedRep || !canAssignSalesRepToBranch(assignedRep, branchId)) {
        throw new BadRequestException('أخصائي المبيعات يجب أن يكون نشطًا ومن نفس الفرع');
      }
      return { assignedToId: dto.assignedToId, assignmentMode: 'manual' as const };
    }
    return { assignedToId: null, assignmentMode: null };
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

  meta() {
    return {
      sources: LEAD_SOURCES.map((value) => ({ value, label: LEAD_SOURCE_LABELS[value] })),
      statuses: LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABELS[value] })),
    };
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

  async list(query: ListLeadsDto, user: JwtUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 200);
    const and: Prisma.club_sales_crm_leadsWhereInput[] = [this.branchWhere(user, query.branchId)];
    const personalSales = await this.isPersonalSalesUser(user);
    if (query.status === 'following') and.push({ status: { notIn: ['converted', 'lost'] } });
    else if (query.status && query.status !== 'all') and.push({ status: query.status });
    if (query.source && query.source !== 'all') and.push({ source: query.source });
    if (personalSales) {
      and.push({ assigned_to_id: user.emp_code! });
    } else {
      if (query.assignedToId) and.push({ assigned_to_id: query.assignedToId });
      if (query.scope === 'mine' && user.emp_code) and.push({ assigned_to_id: user.emp_code });
      if (query.scope === 'unassigned') and.push({ assigned_to_id: null });
    }
    if (query.dateFrom) and.push({ created_at: { gte: new Date(`${query.dateFrom}T00:00:00`) } });
    if (query.dateTo) and.push({ created_at: { lte: new Date(`${query.dateTo}T23:59:59`) } });
    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({
        OR: [
          { full_name: { contains: q } },
          { phone: { contains: q } },
          { notes: { contains: q } },
        ],
      });
    }
    const where: Prisma.club_sales_crm_leadsWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.club_sales_crm_leads.count({ where }),
      this.prisma.club_sales_crm_leads.findMany({
        where,
        include: { follow_ups: { orderBy: { created_at: 'desc' }, take: 8 } },
        orderBy: personalSales
          ? [{ created_at: 'desc' }, { id: 'desc' }]
          : [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const names = await this.namesFor([
      ...rows.map((row) => row.assigned_to_id),
      ...rows.flatMap((row) => row.follow_ups.map((item) => item.created_by)),
    ]);
    const packageNames = await this.packageNamesFor(rows.map((row) => row.subscription_type_id));
    const subscriptions = await leadSubscriptionContexts(this.prisma, rows);
    return {
      data: rows.map((row) => ({
        ...this.map(row, names, packageNames),
        subscription: subscriptions.get(row.id) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.club_sales_crm_leads.findUnique({
      where: { id },
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    });
    if (!row) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, row);
    const names = await this.namesFor([row.assigned_to_id, ...row.follow_ups.map((item) => item.created_by)]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    const member = row.converted_member_id
      ? await this.prisma.club_members.findFirst({
          where: { id: row.converted_member_id, branch_id: row.branch_id, is_deleted: false },
          select: { profile_picture: true },
        })
      : null;
    const subscriptions = await leadSubscriptionContexts(this.prisma, [row]);
    return {
      ...this.map(row, names, packageNames),
      profilePicture: member?.profile_picture ?? null,
      subscription: subscriptions.get(row.id) ?? null,
    };
  }

  /**
   * `user` is undefined only for system-generated leads that no staff member triggered —
   * today that is a guest invitation sent from the member app. Such a lead has no creator
   * and always goes through the branch round-robin instead of a personal-sales shortcut.
   */
  async create(
    dto: CreateLeadDto,
    user: JwtUser | undefined,
    extras?: { invitationId?: number; prisma?: Prisma.TransactionClient },
  ) {
    this.assertBranch(user, dto.branchId);
    if (dto.source === 'facebook_campaign' && !dto.facebookProfileUrl?.trim()) {
      throw new BadRequestException('رابط بروفايل فيسبوك مطلوب عند اختيار حملة فيسبوك');
    }
    const assignment = user && await this.isPersonalSalesUser(user)
      ? { assignedToId: user.emp_code!, assignmentMode: 'manual' as const }
      : await this.resolveAssignment(dto, dto.branchId);
    const pkg = await this.resolveInterestedPackage(dto);
    const client = extras?.prisma ?? this.prisma;
    const row = await client.club_sales_crm_leads.create({
      data: {
        full_name: dto.fullName.trim(),
        phone: normalizePhone(dto.phone),
        source: dto.source,
        facebook_profile_url: dto.source === 'facebook_campaign' ? dto.facebookProfileUrl?.trim() ?? null : null,
        interested_program: pkg.name,
        subscription_type_id: pkg.id,
        status: 'new',
        assigned_to_id: assignment.assignedToId,
        assignment_mode: assignment.assignmentMode,
        notes: dto.notes?.trim() || null,
        invitation_id: extras?.invitationId ?? null,
        branch_id: dto.branchId,
        created_by: user?.sub ?? null,
      },
      include: { follow_ups: true },
    });
    const names = await this.namesFor([row.assigned_to_id]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    return this.map(row, names, packageNames);
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
    const existing = await this.prisma.club_sales_crm_leads.findFirst({
      where: { branch_id: input.branchId, phone },
      orderBy: { id: 'desc' },
      select: { id: true, status: true, branch_id: true, assigned_to_id: true },
    });

    if (existing) {
      await this.prisma.club_sales_crm_lead_follow_ups.create({
        data: {
          lead_id: existing.id,
          note,
          status: existing.status,
          created_by: user.emp_code ?? user.sub,
        },
      });
      await this.prisma.club_sales_crm_leads.update({
        where: { id: existing.id },
        data: { interested_program: counterName },
      });
      return { id: existing.id, created: false };
    }

    const lead = await this.create({
      fullName: input.fullName?.trim() || counterName,
      phone,
      source: 'walk_in',
      interestedProgram: counterName,
      notes: note,
      branchId: input.branchId,
    }, user);
    return { id: lead.id, created: true };
  }

  async update(id: number, dto: Partial<UpsertLeadDto>, user: JwtUser) {
    const existing = await this.prisma.club_sales_crm_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    if (dto.branchId) this.assertBranch(user, dto.branchId);
    const source = dto.source ?? existing.source;
    if (source === 'facebook_campaign' && !(dto.facebookProfileUrl ?? existing.facebook_profile_url)?.trim()) {
      throw new BadRequestException('رابط بروفايل فيسبوك مطلوب عند اختيار حملة فيسبوك');
    }
    const personalSales = await this.isPersonalSalesUser(user);
    let assigned = {
      assigned_to_id: existing.assigned_to_id,
      assignment_mode: existing.assignment_mode,
    };
    if (personalSales) {
      assigned = { assigned_to_id: user.emp_code!, assignment_mode: 'manual' };
    } else if (dto.assignmentMode || dto.assignedToId !== undefined) {
      const next = await this.resolveAssignment(
        { assignedToId: dto.assignedToId, assignmentMode: dto.assignmentMode },
        dto.branchId ?? existing.branch_id,
      );
      assigned = { assigned_to_id: next.assignedToId, assignment_mode: next.assignmentMode };
    }
    const pkg = dto.subscriptionTypeId !== undefined || dto.interestedProgram !== undefined
      ? await this.resolveInterestedPackage({
        subscriptionTypeId: dto.subscriptionTypeId,
        interestedProgram: dto.interestedProgram,
      })
      : null;
    const row = await this.prisma.club_sales_crm_leads.update({
      where: { id },
      data: {
        ...(dto.fullName != null ? { full_name: dto.fullName.trim() } : {}),
        ...(dto.phone != null ? { phone: normalizePhone(dto.phone) } : {}),
        ...(dto.source != null ? { source: dto.source } : {}),
        facebook_profile_url:
          source === 'facebook_campaign'
            ? (dto.facebookProfileUrl ?? existing.facebook_profile_url)?.trim() ?? null
            : null,
        ...(pkg ? { interested_program: pkg.name, subscription_type_id: pkg.id } : {}),
        ...assigned,
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
      },
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    });
    const names = await this.namesFor([row.assigned_to_id, ...row.follow_ups.map((item) => item.created_by)]);
    const packageNames = await this.packageNamesFor([row.subscription_type_id]);
    return this.map(row, names, packageNames);
  }

  async remove(id: number, user: JwtUser) {
    const existing = await this.prisma.club_sales_crm_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    await this.prisma.club_sales_crm_leads.delete({ where: { id } });
    return { ok: true };
  }

  async followUp(id: number, dto: FollowUpLeadDto, user: JwtUser) {
    const existing = await this.prisma.club_sales_crm_leads.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.assertLeadAccess(user, existing);
    const status = existing.status === 'converted'
      ? 'converted'
      : dto.status ?? (existing.status === 'new' ? 'in_progress' : existing.status);
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

    const nextFollowUpAt = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined;
    if (dto.nextFollowUpAt && Number.isNaN(nextFollowUpAt!.getTime())) {
      throw new BadRequestException('موعد المتابعة القادمة غير صحيح');
    }
    const nextCallAt = dto.nextCallAt ? new Date(dto.nextCallAt) : undefined;
    if (nextCallAt && Number.isNaN(nextCallAt.getTime())) {
      throw new BadRequestException('موعد الاتصال القادم غير صحيح');
    }
    if (status === 'follow_later' && !nextFollowUpAt) {
      throw new BadRequestException('موعد المتابعة القادمة مطلوب عند اختيار متابعة لاحقًا');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_sales_crm_lead_follow_ups.create({
        data: {
          lead_id: id,
          note,
          status,
          activity_type: activityType,
          answered: activityType === 'call' ? Boolean(answered) : null,
          interests: dto.interests?.trim() || null,
          next_follow_up_at: nextFollowUpAt ?? null,
          next_call_at: nextCallAt ?? null,
          created_by: user.emp_code ?? user.sub,
        },
      });
      return tx.club_sales_crm_leads.update({
        where: { id },
        data: {
          status,
          last_contacted_at: new Date(),
          ...(nextFollowUpAt !== undefined ? { next_follow_up_at: nextFollowUpAt } : {}),
          ...(nextCallAt !== undefined ? { next_call_at: nextCallAt } : {}),
        },
        include: { follow_ups: { orderBy: { created_at: 'desc' } } },
      });
    });
    const names = await this.namesFor([row.assigned_to_id, ...row.follow_ups.map((item) => item.created_by)]);
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
      select: { id: true, name: true, phone: true, branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود ضمن عملائك');
    this.assertBranch(user, member.branch_id);
    if (!member.phone?.trim()) throw new BadRequestException('لا يوجد رقم موبايل مسجل لهذا العضو');

    const phone = normalizePhone(member.phone);
    const existing = await this.prisma.club_sales_crm_leads.findFirst({
      where: {
        branch_id: member.branch_id,
        OR: [{ converted_member_id: member.id }, { phone }],
      },
      orderBy: [{ converted_member_id: 'desc' }, { id: 'desc' }],
      include: { follow_ups: { orderBy: { created_at: 'desc' } } },
    });
    if (existing) {
      if (existing.assigned_to_id != null && existing.assigned_to_id !== user.emp_code) {
        throw new ForbiddenException('ملف هذا العضو مسند إلى أخصائي مبيعات آخر');
      }
      const row = await this.prisma.club_sales_crm_leads.update({
        where: { id: existing.id, assigned_to_id: existing.assigned_to_id },
        data: {
          assigned_to_id: user.emp_code,
          assignment_mode: 'manual',
          converted_member_id: existing.converted_member_id ?? member.id,
        },
        include: { follow_ups: { orderBy: { created_at: 'desc' } } },
      });
      const names = await this.namesFor([
        row.assigned_to_id,
        ...row.follow_ups.map((item) => item.created_by),
      ]);
      const packageNames = await this.packageNamesFor([row.subscription_type_id]);
      return this.map(row, names, packageNames);
    }

    const row = await this.prisma.club_sales_crm_leads.create({
      data: {
        full_name: member.name.trim(),
        phone,
        source: 'renewal',
        interested_program: 'متابعة تجديد العضوية',
        status: 'converted',
        assigned_to_id: user.emp_code,
        assignment_mode: 'manual',
        converted_member_id: member.id,
        notes: 'ملف متابعة تجديد العضوية',
        branch_id: member.branch_id,
        created_by: user.sub,
      },
      include: { follow_ups: true },
    });
    const names = await this.namesFor([row.assigned_to_id]);
    return this.map(row, names);
  }

  async assign(id: number, dto: AssignLeadDto, user: JwtUser) {
    return this.update(id, dto, user);
  }

  async reminders(user: JwtUser, query: ListLeadsDto = {}) {
    if (!user.emp_code || !(await this.isPersonalSalesUser(user))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }
    const rows = await this.prisma.club_sales_crm_leads.findMany({
      where: {
        AND: [
          this.branchWhere(user),
          { assigned_to_id: user.emp_code },
          { status: { notIn: ['lost', 'qualified'] } },
          { OR: [{ next_call_at: { not: null } }, { next_follow_up_at: { not: null } }] },
        ],
      },
      select: {
        id: true,
        full_name: true,
        phone: true,
        status: true,
        branch_id: true,
        converted_member_id: true,
        next_call_at: true,
        next_follow_up_at: true,
      },
    });
    const now = Date.now();
    const reminders = rows
      .flatMap((row) => {
        const lead = {
          id: row.id,
          fullName: row.full_name,
          phone: row.phone,
          status: row.status,
          branchId: row.branch_id,
          convertedMemberId: row.converted_member_id,
          statusLabel: LEAD_STATUS_LABELS[row.status as LeadStatus] ?? row.status,
          sourceLabel: '',
        };
        return ([['call', row.next_call_at], ['follow_up', row.next_follow_up_at]] as const).flatMap(
          ([kind, dueAt]) => (dueAt ? [{ id: `${row.id}:${kind}`, kind, dueAt, lead }] : []),
        );
      })
      .sort(
        (a, b) =>
          a.dueAt.getTime() - b.dueAt.getTime() ||
          a.lead.id - b.lead.id ||
          a.kind.localeCompare(b.kind),
      );
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const total = reminders.length;
    const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, Math.ceil(total / pageSize)));
    return {
      data: reminders.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
      overdue: reminders.filter((item) => item.dueAt.getTime() < now).length,
    };
  }

  async completeReminder(id: number, dto: CompleteLeadReminderDto, user: JwtUser) {
    if (!user.emp_code || !(await this.isPersonalSalesUser(user))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }
    const field = dto.kind === 'call' ? 'next_call_at' : 'next_follow_up_at';
    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('موعد التنبيه غير صحيح');
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.club_sales_crm_leads.updateMany({
        where: {
          AND: [
            this.branchWhere(user),
            { id, assigned_to_id: user.emp_code, [field]: dueAt },
          ],
        },
        data: { [field]: null },
      });
      if (!result.count) {
        throw new BadRequestException('تغير هذا الموعد أو لم يعد العميل مسندًا لك. حدّث التنبيهات.');
      }
      await tx.club_sales_crm_lead_follow_ups.create({
        data: {
          lead_id: id,
          activity_type: 'system',
          note: dto.kind === 'call' ? 'تم إنجاز تنبيه الاتصال' : 'تم إنجاز تنبيه المتابعة',
          created_by: user.emp_code ?? user.sub,
        },
      });
    });
    return { completed: true };
  }

  async mine(user: JwtUser, query: ListLeadsDto = {}) {
    if (!user.emp_code) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    return this.list({
      ...query,
      assignedToId: user.emp_code,
      scope: 'mine',
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
      status: query.status || 'following',
    }, user);
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
        rows: LEAD_SOURCES.filter((source) => source !== 'member_invitation').map((source) => ({
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
    const rows: Awaited<ReturnType<typeof this.list>>['data'] = [];
    let total = Infinity;
    for (let page = 1; rows.length < total && page <= 100; page += 1) {
      const chunk = await this.list({ ...query, page, pageSize: 200 }, user);
      total = chunk.total;
      if (!chunk.data.length) break;
      rows.push(...chunk.data);
    }
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
        rows,
      },
    ]);
  }

  private async renewalCandidates(
    query: { branch?: string; state?: string; days?: number; search?: string },
    user: JwtUser,
  ) {
    const state = query.state === 'due_soon'
      ? 'due_soon'
      : query.state === 'all'
        ? 'all'
        : 'expired';
    const today = localDateString();
    const horizonDate = new Date(`${today}T12:00:00`);
    horizonDate.setDate(horizonDate.getDate() + Math.min(Math.max(query.days ?? 30, 1), 365));
    const horizon = localDateString(horizonDate);
    const and: Prisma.club_subscriptionsWhereInput[] = [];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });

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
    const latestByPerson = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const phone = (row.member?.phone ?? row.guardian_phone ?? '').trim();
      const key = row.member?.member_code?.trim() || phone || `sub:${row.subscription_number}`;
      if (!latestByPerson.has(key)) latestByPerson.set(key, row);
    }
    const matchesState = (endDate: string) => {
      if (state === 'expired') return endDate < today;
      if (state === 'due_soon') return endDate >= today && endDate <= horizon;
      return true;
    };
    let people = [...latestByPerson.values()]
      .filter((row) => matchesState(row.subscription_end_date))
      .map((row) => ({
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
      people = people.filter(
        (row) =>
          row.fullName.includes(search) ||
          row.phone.includes(search) ||
          row.memberCode.includes(search) ||
          row.subscriptionType.includes(search),
      );
    }
    return { state, today, people };
  }

  async listRenewalCandidates(
    query: {
      branch?: string;
      state?: string;
      days?: number;
      search?: string;
      page?: number;
      pageSize?: number;
    },
    user: JwtUser,
  ) {
    const { people } = await this.renewalCandidates(query, user);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 200);
    const page = Math.max(query.page ?? 1, 1);
    const phones = people.map((row) => row.phone).filter(Boolean);
    const existing = phones.length
      ? await this.prisma.club_sales_crm_leads.findMany({
          where: { phone: { in: phones }, status: { notIn: ['converted', 'lost'] } },
          select: { phone: true },
        })
      : [];
    const openLeadPhones = new Set(existing.map((row) => row.phone));
    const data = people.map((row) => ({ ...row, hasOpenLead: openLeadPhones.has(row.phone) }));
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

  async convertRenewalCandidates(
    query: { branch?: string; state?: string; days?: number; search?: string },
    user: JwtUser,
  ) {
    const { people } = await this.renewalCandidates(query, user);
    const withPhone = people.filter((row) => row.phone);
    const phones = withPhone.map((row) => row.phone);
    const existing = phones.length
      ? await this.prisma.club_sales_crm_leads.findMany({
          where: { phone: { in: phones }, status: { notIn: ['converted', 'lost'] } },
          select: { phone: true },
        })
      : [];
    const openLeadPhones = new Set(existing.map((row) => row.phone));
    const batchLimit = 500;
    let created = 0;
    let skipped = people.length - withPhone.length;
    let remaining = 0;
    const errors: string[] = [];
    for (const row of withPhone) {
      if (openLeadPhones.has(row.phone)) {
        skipped += 1;
        continue;
      }
      if (created >= batchLimit) {
        remaining += 1;
        continue;
      }
      try {
        await this.create({
          fullName: row.fullName || `عضو ${row.memberCode || row.phone}`,
          phone: row.phone,
          source: 'renewal',
          interestedProgram: row.subscriptionType || undefined,
          notes: `اشتراك سابق ${row.subscriptionNumber} — ينتهي ${row.endDate}`,
          branchId: row.branchId,
          assignmentMode: 'automatic',
        }, user);
        created += 1;
      } catch (error) {
        errors.push(
          `${row.fullName || row.phone}: ${error instanceof Error ? error.message : 'تعذر التحويل'}`,
        );
      }
    }
    return {
      created,
      skipped,
      remaining,
      batchLimit,
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
          { key: 'fullName', header: 'الاسم الكامل', width: 28 },
          { key: 'phone', header: 'الهاتف', width: 18 },
          { key: 'source', header: 'المصدر', width: 22 },
          { key: 'facebookProfileUrl', header: 'رابط فيسبوك', width: 32 },
          { key: 'interestedProgram', header: 'الباقة المهتم (رقم أو اسم)', width: 28 },
          { key: 'notes', header: 'ملاحظات', width: 42 },
          { key: 'branchId', header: 'رقم الفرع', width: 12 },
          { key: 'assignedToId', header: 'رقم أخصائي المبيعات (اختياري)', width: 28 },
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
          { k: 'الرفع على الـCRM', v: 'يمكن رفع الملف كما هو؛ الاستيراد يقرأ أول ثمانية أعمدة فقط.' },
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
      if (!isLeadSource(source) || source === 'member_invitation') {
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

  async distributeUnassigned(user: JwtUser, branchId?: number) {
    const reps = await this.employees.salesReps();
    if (!reps.length) throw new BadRequestException('لا يوجد أخصائيو مبيعات نشطون للتوزيع');
    const leads = await this.prisma.club_sales_crm_leads.findMany({
      where: { AND: [this.branchWhere(user, branchId), { assigned_to_id: null }] },
      orderBy: { id: 'asc' },
      select: { id: true, branch_id: true },
    });
    if (!leads.length) return { distributed: 0, skipped: 0 };
    let distributed = 0;
    for (const lead of leads) {
      const next = await this.nextRoundRobinRep(lead.branch_id);
      if (!next) continue;
      await this.prisma.club_sales_crm_leads.update({
        where: { id: lead.id },
        data: { assigned_to_id: next.id, assignment_mode: 'automatic' },
      });
      distributed += 1;
    }
    return { distributed, skipped: leads.length - distributed };
  }
}
