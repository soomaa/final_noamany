import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { assertDateOrder } from '../../common/validators';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { buildDuplicateMessage, findMemberDuplicates } from './club-member-duplicates';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { isMarketingRepJobTitle } from '../employees/marketing-rep.util';
import {
  computeSubscriptionStatus,
  formatBranchMemberCode,
  getEmailValidationError,
  getNationalIdFormatError,
  getPhoneValidationError,
  localDateString,
  normalizeName,
  normalizeNationalIdForStorage,
  normalizePhoneForStorage,
  nextSeqFromMax,
} from './club-member.utils';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { UpsertClubMemberDto } from './dto/upsert-club-member.dto';
import { ClubSubscriptionRefundsService, RefundPreview } from '../club-subscriptions/club-subscription-refunds.service';
import { toNum } from '../club-subscriptions/club-subscription.utils';
import { normalizeMembershipDocumentType } from './membership-document.utils';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { MemberDocumentStorageService } from './member-document-storage.service';

/** True when a P2002 unique violation came from a constraint/index whose name contains `needle`. */
function isUniqueTarget(e: Prisma.PrismaClientKnownRequestError, needle: string): boolean {
  const target = (e.meta as { target?: string | string[] } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.toLowerCase().includes(needle.toLowerCase());
}

@Injectable()
export class ClubMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
    private readonly subscriptionRefunds: ClubSubscriptionRefundsService,
    private readonly memberDocumentStorage: MemberDocumentStorageService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private assertMemberAccess(user: JwtUser | undefined, member: { branch_id: number; gender: string | null }) {
    this.assertBranchAccess(user, member.branch_id);
    if (!this.branchScope.isMemberGenderAllowed(user, member.gender)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا القسم');
    }
  }

  async getMembershipDocument(id: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id },
      select: { branch_id: true, gender: true, membership_document_path: true, membership_document_uploaded_at: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    return {
      available: Boolean(member.membership_document_path),
      uploadedAt: member.membership_document_uploaded_at,
      downloadUrl: member.membership_document_path ? `/club-members/${id}/membership-document/file` : null,
    };
  }

  async readLegacyMembershipDocument(id: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id },
      select: { branch_id: true, gender: true, membership_document_path: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    if (!member.membership_document_path) throw new NotFoundException('مستند العضو غير موجود');
    return this.memberDocumentStorage.readLegacy(member.membership_document_path);
  }

  async removeMembershipDocument(id: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id },
      select: { branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    await this.prisma.club_members.update({
      where: { id },
      data: {
        membership_document_path: null,
        membership_document_uploaded_at: null,
        membership_document_uploaded_by: null,
      },
    });
    return { success: true };
  }

  async listMembershipDocuments(id: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id }, select: { id: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    const documents = await this.prisma.club_member_documents.findMany({
      where: { member_id: id }, orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }],
    });
    return documents.map((document) => this.mapMembershipDocument(document));
  }

  private mapMembershipDocument(document: {
    id: number;
    member_id: number;
    document_type: string;
    label: string | null;
    original_filename: string;
    mime_type: string;
    byte_size: number;
    uploaded_by: number | null;
    uploaded_at: Date;
  }) {
    return {
      id: document.id,
      type: document.document_type,
      label: document.label,
      originalFilename: document.original_filename,
      mimeType: document.mime_type,
      byteSize: document.byte_size,
      uploadedAt: document.uploaded_at,
      uploadedBy: document.uploaded_by,
      downloadUrl: `/club-members/${document.member_id}/membership-documents/${document.id}/file`,
    };
  }

  async uploadMembershipDocument(
    id: number,
    type: string,
    label: string | null | undefined,
    file: Express.Multer.File,
    user?: JwtUser,
  ) {
    const member = await this.prisma.club_members.findUnique({
      where: { id }, select: { id: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    const documentType = normalizeMembershipDocumentType(type);
    const stored = this.memberDocumentStorage.store(file);
    try {
      const document = await this.prisma.club_member_documents.create({
        data: {
          member_id: id,
          document_type: documentType,
          label: label?.trim().slice(0, 160) || null,
          storage_path: stored.storageKey,
          original_filename: stored.originalFilename,
          mime_type: stored.mimeType,
          byte_size: stored.byteSize,
          sha256: stored.sha256,
          uploaded_by: user?.sub ?? null,
        },
      });
      return this.mapMembershipDocument(document);
    } catch (error) {
      this.memberDocumentStorage.remove(stored.storageKey);
      throw error;
    }
  }

  async readMembershipDocument(id: number, documentId: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id }, select: { id: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    const document = await this.prisma.club_member_documents.findFirst({
      where: { id: documentId, member_id: id },
    });
    if (!document) throw new NotFoundException('المستند غير موجود');
    const stored = this.memberDocumentStorage.read(document.storage_path);
    return {
      buffer: stored.buffer,
      mimeType: document.mime_type,
      originalFilename: document.original_filename,
    };
  }

  async removeMembershipDocumentItem(id: number, documentId: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id }, select: { id: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    const document = await this.prisma.club_member_documents.findFirst({
      where: { id: documentId, member_id: id },
    });
    if (!document) throw new NotFoundException('المستند غير موجود');
    await this.prisma.club_member_documents.delete({ where: { id: documentId } });
    try {
      this.memberDocumentStorage.remove(document.storage_path);
    } catch {
      // The database authorization record is already gone. Never follow an invalid
      // historical path just to clean up a file; private orphan cleanup is offline.
    }
    return { success: true };
  }

  /** Reception scanner payload: compact, authoritative and audience-scoped. */
  async barcodePreview(memberCode: string, user?: JwtUser) {
    const member = await this.prisma.club_members.findFirst({
      where: { member_code: memberCode.trim(), is_deleted: false },
      select: { id: true, member_code: true, name: true, branch_id: true, gender: true, is_blocked: true, block_reason: true, profile_picture: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    const [receipts, lockers, subscriptions] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where: { member_id: member.id }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: 10,
        select: { id: true, receipt_number: true, amount: true, receipt_date: true, payment_method: true, created_at: true },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: { member_id: member.id }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: 10,
        select: { id: true, subscription_number: true, subscription_start_date: true, subscription_end_date: true, status: true, locker: { select: { locker_number: true } }, type: { select: { name: true } } },
      }),
      this.prisma.club_subscriptions.findMany({
        where: { member_id: member.id }, orderBy: [{ registration_date: 'desc' }, { id: 'desc' }], take: 10,
        select: {
          id: true,
          subscription_number: true,
          subscription_type: true,
          registration_date: true,
          subscription_start_date: true,
          subscription_end_date: true,
          status: true,
          subscription_value: true,
          paid_amount: true,
          remaining_amount: true,
        },
      }),
    ]);
    const freezeRows = subscriptions.length ? await this.prisma.club_subscription_freezes.findMany({
      where: { subscription_id: { in: subscriptions.map((subscription) => subscription.id) } },
      orderBy: { freeze_start_date: 'desc' },
      select: { subscription_id: true, freeze_start_date: true, freeze_end_date: true, actual_days: true, is_active: true },
    }) : [];
    const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
    const freezes = freezeRows.map((freeze) => {
      const subscription = subscriptionById.get(freeze.subscription_id);
      return ({
      subscriptionId: freeze.subscription_id,
      subscriptionNumber: subscription?.subscription_number ?? null,
      subscriptionType: subscription?.subscription_type ?? null,
      startDate: freeze.freeze_start_date,
      endDate: freeze.freeze_end_date,
      days: freeze.actual_days ?? null,
      isActive: freeze.is_active,
      });
    });
    return {
      member: { id: member.id, memberCode: member.member_code, name: member.name, branchId: member.branch_id, gender: member.gender, isBlocked: member.is_blocked, blockReason: member.block_reason, profilePicture: member.profile_picture },
      latestSubscriptions: subscriptions.map((row) => ({
        id: row.id,
        subscriptionNumber: row.subscription_number,
        subscriptionType: row.subscription_type,
        registrationDate: row.registration_date,
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
        status: row.status,
        subscriptionValue: toNum(row.subscription_value),
        paidAmount: toNum(row.paid_amount),
        remainingAmount: toNum(row.remaining_amount),
      })),
      transactions: receipts.map((row) => ({ id: row.id, receiptNumber: row.receipt_number, amount: toNum(row.amount), date: row.receipt_date, paymentMethod: row.payment_method, createdAt: row.created_at })),
      lockerSubscriptions: lockers.map((row) => ({ id: row.id, subscriptionNumber: row.subscription_number, lockerNumber: row.locker?.locker_number ?? null, type: row.type?.name ?? null, startDate: row.subscription_start_date, endDate: row.subscription_end_date, status: row.status })),
      freezes,
    };
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
      const s = q.search.trim();
      and.push({
        OR: [
          { name: { contains: s } },
          { member_code: { contains: s } },
          { phone: { contains: s } },
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
    const audience = this.branchScope.memberGenderFilter(user);
    if (audience) and.push({ gender: audience });
    else if (q.gender && q.gender !== 'all') and.push({ gender: q.gender as 'male' | 'female' });
    // Sales reps only see their own registrations on the members list — not in pickers.
    if (!q.forSelect && user && (await this.isSalesEmployee(user.emp_code))) {
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

    return paginated(rows.map((r) => this.mapMember(r)), total, q.page, q.pageSize);
  }

  /** Members for a physical barcode print run.  Codes are compared exactly as stored. */
  async barcodeRange(codeFrom: string, codeTo: string, user?: JwtUser) {
    const from = codeFrom?.trim();
    const to = codeTo?.trim();
    if (!from || !to) throw new BadRequestException('أدخل كود البداية وكود النهاية');
    if (from.localeCompare(to, 'en') > 0) {
      throw new BadRequestException('كود البداية يجب أن يسبق أو يساوي كود النهاية');
    }
    const scope = this.branchScope.resolveListFilter(user, null);
    const audience = this.branchScope.memberGenderFilter(user);
    const rows = await this.prisma.club_members.findMany({
      where: {
        is_deleted: false,
        member_code: { gte: from, lte: to },
        ...(scope === null ? {} : { branch_id: { in: scope } }),
        ...(audience ? { gender: audience } : {}),
      },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
      orderBy: { member_code: 'asc' },
      take: 500,
    });
    return { data: rows.map((row) => this.mapMember(row)), total: rows.length, capped: rows.length === 500 };
  }

  async statistics(user?: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, null);
    const branchWhere: Prisma.club_membersWhereInput =
      scope === null ? {} : { branch_id: { in: scope } };
    const audience = this.branchScope.memberGenderFilter(user);
    const memberWhere: Prisma.club_membersWhereInput = {
      is_deleted: false,
      ...branchWhere,
      ...(audience ? { gender: audience } : {}),
    };
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

  /** Personal salesperson summary. Ownership and branch scope are both server-derived. */
  async salesPortal(user: JwtUser) {
    if (!user.emp_code || !(await this.isSalesEmployee(user.emp_code))) {
      throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    }
    const scope = this.branchScope.resolveListFilter(user, null);
    const audience = this.branchScope.memberGenderFilter(user);
    const ownerWhere: Prisma.club_membersWhereInput = {
      is_deleted: false,
      ...(scope === null ? {} : { branch_id: { in: scope } }),
      ...(audience ? { gender: audience } : {}),
      OR: [{ sales_id: user.emp_code }, { created_by: user.sub }],
    };
    const today = localDateString();
    const monthStart = `${today.slice(0, 7)}-01`;
    const startOfToday = new Date(`${today}T00:00:00`);
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
    const leadsWhere = { assigned_to_id: user.emp_code, ...(scope === null ? {} : { branch_id: { in: scope } }) };
    const subscriptionWhere = {
      sales_id: user.emp_code,
      registration_date: { gte: monthStart, lte: today },
      ...(scope === null ? {} : { branch_id: { in: scope } }),
      ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}),
    };
    const [totalAssigned, activeMembers, registeredToday, registeredThisMonth, recentMembers, leads, subscriptions] = await Promise.all([
      this.prisma.club_members.count({ where: ownerWhere }),
      this.prisma.club_members.count({ where: { ...ownerWhere, is_active: true } }),
      this.prisma.club_members.count({ where: { ...ownerWhere, created_at: { gte: startOfToday, lt: startOfTomorrow } } }),
      this.prisma.club_members.count({ where: { ...ownerWhere, created_at: { gte: new Date(`${monthStart}T00:00:00`), lt: startOfTomorrow } } }),
      this.prisma.club_members.findMany({
        where: ownerWhere,
        select: { id: true, member_code: true, name: true, phone: true, is_active: true, created_at: true },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      this.prisma.club_leads.findMany({ where: leadsWhere, select: { status: true, created_at: true, last_contacted_at: true } }),
      this.prisma.club_subscriptions.findMany({ where: subscriptionWhere, select: { id: true, subscription_number: true, customer_name: true, paid_amount: true, registration_date: true, subscription_type: true }, orderBy: [{ registration_date: 'desc' }, { id: 'desc' }] }),
    ]);
    const convertedLeads = leads.filter((row) => row.status === 'converted').length;
    const overdueBefore = new Date(Date.now() - 86_400_000);
    const overdueLeads = leads.filter((row) => ['new', 'in_progress'].includes(row.status) && (row.last_contacted_at ?? row.created_at) <= overdueBefore).length;
    const responseHours = leads.filter((row) => row.last_contacted_at).map((row) => (row.last_contacted_at!.getTime() - row.created_at.getTime()) / 3_600_000);
    const actualRevenue = subscriptions.reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);
    return {
      specialist: { employeeId: user.emp_code, name: user.name ?? null, branchId: user.branch },
      statistics: { totalAssigned, registeredToday, registeredThisMonth, activeMembers },
      performance: {
        periodStart: monthStart,
        periodEnd: today,
        target: 0,
        actualRevenue,
        achievementPct: 0,
        commissionPercent: 0,
        commissionDue: 0,
        assignedLeads: leads.length,
        overdueLeads,
        convertedLeads,
        conversionRate: leads.length ? Math.round((convertedLeads / leads.length) * 10_000) / 100 : 0,
        averageResponseHours: responseHours.length ? Math.round((responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length) * 100) / 100 : null,
        closedDeals: subscriptions.length,
      },
      pipeline: {
        new: leads.filter((row) => row.status === 'new').length,
        inProgress: leads.filter((row) => row.status === 'in_progress').length,
        followLater: leads.filter((row) => row.status === 'follow_later').length,
        qualified: leads.filter((row) => row.status === 'qualified').length,
        converted: convertedLeads,
        lost: leads.filter((row) => row.status === 'lost').length,
      },
      leaderboard: [{ employeeId: user.emp_code, name: user.name ?? `#${user.emp_code}`, achievementPct: 0, rank: 1, isCurrent: true }],
      closedDeals: subscriptions.slice(0, 10).map((row) => ({ id: row.id, subscriptionNumber: row.subscription_number, customerName: row.customer_name, paidAmount: Number(row.paid_amount ?? 0), registrationDate: row.registration_date, subscriptionType: row.subscription_type })),
      recentMembers: recentMembers.map((row) => ({ id: row.id, memberCode: row.member_code, name: row.name, phone: row.phone, isActive: row.is_active, createdAt: row.created_at })),
    };
  }

  /** Renewal queue is deliberately owner- and branch-scoped before member details load. */
  async salesRenewals(user: JwtUser, query: { page?: number; pageSize?: number; window?: string; search?: string }) {
    if (!user.emp_code || !(await this.isSalesEmployee(user.emp_code))) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    const branches = this.branchScope.resolveListFilter(user, null);
    const audience = this.branchScope.memberGenderFilter(user);
    const soldRows = await this.prisma.club_subscriptions.findMany({ where: { sales_id: user.emp_code, member_id: { not: null }, ...(branches === null ? {} : { branch_id: { in: branches } }), ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}) }, select: { member_id: true }, distinct: ['member_id'] });
    const soldMemberIds = soldRows.map((row) => row.member_id).filter((id): id is number => id != null);
    const members = await this.prisma.club_members.findMany({ where: { is_deleted: false, ...(branches === null ? {} : { branch_id: { in: branches } }), ...(audience ? { gender: audience } : {}), OR: [{ sales_id: user.emp_code }, { created_by: user.sub }, ...(soldMemberIds.length ? [{ id: { in: soldMemberIds } }] : [])] }, select: { id: true, member_code: true, name: true, phone: true, branch_id: true } });
    const page = Number.isInteger(query.page) && query.page! > 0 ? query.page! : 1;
    const pageSize = Number.isInteger(query.pageSize) ? Math.min(100, Math.max(1, query.pageSize!)) : 25;
    if (!members.length) return { data: [], total: 0, page: 1, pageSize, summary: { expired: 0, dueSoon: 0, total: 0 } };
    const memberIds = members.map((member) => member.id);
    const subscriptions = await this.prisma.club_subscriptions.findMany({ where: { member_id: { in: memberIds }, ...(branches === null ? {} : { branch_id: { in: branches } }), ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}) }, select: { id: true, member_id: true, subscription_type: true, paid_amount: true, subscription_start_date: true, subscription_end_date: true, status: true, type: { select: { name: true } } }, orderBy: [{ member_id: 'asc' }, { subscription_end_date: 'desc' }, { id: 'desc' }] });
    const latestByMember = new Map<number, (typeof subscriptions)[number]>();
    const subscriptionCounts = new Map<number, number>();
    for (const subscription of subscriptions) if (subscription.member_id != null) {
      subscriptionCounts.set(subscription.member_id, (subscriptionCounts.get(subscription.member_id) ?? 0) + 1);
      if (!latestByMember.has(subscription.member_id)) latestByMember.set(subscription.member_id, subscription);
    }
    const phones = members.map((member) => member.phone ? normalizePhoneForStorage(member.phone) : '').filter(Boolean);
    const leads = await this.prisma.club_leads.findMany({ where: { assigned_to_id: user.emp_code, ...(branches === null ? {} : { branch_id: { in: branches } }), OR: [{ converted_member_id: { in: memberIds } }, ...(phones.length ? [{ phone: { in: phones } }] : [])] }, select: { id: true, phone: true, converted_member_id: true, last_contacted_at: true }, orderBy: [{ last_contacted_at: 'desc' }, { id: 'desc' }] });
    const leadByMember = new Map<number, (typeof leads)[number]>();
    const leadByPhone = new Map<string, (typeof leads)[number]>();
    for (const lead of leads) {
      if (lead.converted_member_id != null && !leadByMember.has(lead.converted_member_id)) leadByMember.set(lead.converted_member_id, lead);
      const phone = normalizePhoneForStorage(lead.phone);
      if (phone && !leadByPhone.has(phone)) leadByPhone.set(phone, lead);
    }
    const todayMs = Date.parse(`${localDateString()}T00:00:00Z`);
    const rows = members.flatMap((member) => {
      const subscription = latestByMember.get(member.id);
      if (!subscription) return [];
      const endMs = Date.parse(`${subscription.subscription_end_date}T00:00:00Z`);
      if (!Number.isFinite(endMs)) return [];
      const daysRemaining = Math.round((endMs - todayMs) / 86_400_000);
      const phone = normalizePhoneForStorage(member.phone ?? '');
      const lead = leadByMember.get(member.id) ?? (phone ? leadByPhone.get(phone) : undefined);
      return [{ memberId: member.id, memberCode: member.member_code, memberName: member.name, phone: member.phone, subscriptionId: subscription.id, paidAmount: Number(subscription.paid_amount), subscriptionType: subscription.type?.name ?? subscription.subscription_type ?? 'اشتراك', startDate: subscription.subscription_start_date, endDate: subscription.subscription_end_date, daysRemaining, isRenewed: (subscriptionCounts.get(member.id) ?? 0) > 1, leadId: lead?.id ?? null, lastContactedAt: lead?.last_contacted_at ?? null }];
    });
    const summary = { expired: rows.filter((row) => row.daysRemaining < 0).length, dueSoon: rows.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length, total: rows.filter((row) => row.daysRemaining <= 14).length };
    const renewalWindow = ['expired', '5', '7', '14', 'all', 'renewed'].includes(query.window ?? '') ? query.window! : 'all';
    const search = query.search?.trim().toLocaleLowerCase('ar') ?? '';
    const filtered = rows.filter((row) => {
      if (renewalWindow === 'renewed' && !row.isRenewed) return false;
      if (renewalWindow === 'all' && row.daysRemaining > 14) return false;
      if (renewalWindow === 'expired' && row.daysRemaining >= 0) return false;
      if (!['all', 'expired', 'renewed'].includes(renewalWindow)) { const days = Number(renewalWindow); if (row.daysRemaining < 0 || row.daysRemaining > days) return false; }
      return !search || [row.memberName, row.memberCode, row.phone ?? '', row.subscriptionType].some((value) => value.toLocaleLowerCase('ar').includes(search));
    });
    filtered.sort((a, b) => { const ae = a.daysRemaining < 0; const be = b.daysRemaining < 0; if (ae !== be) return ae ? -1 : 1; return ae ? b.daysRemaining - a.daysRemaining : a.daysRemaining - b.daysRemaining; });
    return { data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, summary };
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
    const branch = await tx.tbl_branches.findUnique({
      where: { branch_id: branchId },
      select: { br_code: true },
    });
    if (!branch) throw new BadRequestException('الفرع المحدد غير موجود');
    if (!branch.br_code) throw new BadRequestException('كود الفرع غير مضبوط');
    const prefix = branch.br_code;
    const pattern = `^${prefix}[0-9]+$`;
    const startPos = prefix.length + 1;
    await tx.$queryRaw`SELECT GET_LOCK('club_member_code', 10)`;
    try {
      const rows = await tx.$queryRaw<{ maxNum: unknown }[]>`
        SELECT MAX(CAST(SUBSTRING(member_code, ${startPos}) AS UNSIGNED)) AS maxNum
        FROM club_members
        WHERE member_code REGEXP ${pattern}
      `;
      return formatBranchMemberCode(prefix, nextSeqFromMax(rows[0]?.maxNum));
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK('club_member_code')`;
    }
  }

  /** Unique temporary password for a new member; returned once in generatedCredentials. */
  private defaultAppPassword(): string {
    return randomBytes(9).toString('base64url');
  }

  /** Mobile app login for gym members — stored in api_users, not HR users. */
  private async provisionAppUser(
    tx: Prisma.TransactionClient,
    dto: UpsertClubMemberDto,
  ): Promise<{ username: string; plaintextPassword: string; appUserId: number } | null> {
    const phone = normalizePhoneForStorage(dto.phone ?? '');
    if (!phone) return null;

    const plaintextPassword = this.defaultAppPassword();
    const existing = await tx.api_users.findFirst({ where: { user_phone: phone } });
    if (existing) {
      const otherMember = await tx.club_members.findFirst({
        where: { app_user_id: existing.user_id, is_deleted: false },
      });
      if (otherMember) {
        // A phone may now represent separate branch memberships. Keep the existing mobile-app
        // identity attached to its original membership; creating the second branch membership
        // must not fail or create a second ambiguous login for the same phone.
        return null;
      }
      // Never attach an orphan login whose password belongs to an unknown previous owner.
      throw new ConflictException('رقم الجوال مرتبط بحساب تطبيق موجود ويحتاج مراجعة الإدارة');
    }

    const appUser = await tx.api_users.create({
      data: {
        user_name: normalizeName(dto.name),
        user_phone: phone,
        user_email: dto.email?.trim() || null,
        user_pass: await bcrypt.hash(plaintextPassword, 12),
        status: 1,
      },
      select: { user_id: true },
    });

    return { username: phone, plaintextPassword, appUserId: appUser.user_id };
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
    });
    if (!row) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, row);
    return this.mapMember(row);
  }

  /** Historical and new point movements are append-only; the balance is derived, never edited. */
  async pointHistory(id: number, user?: JwtUser) {
    await this.assertPointMemberAccess(id, user);
    const rows = await this.prisma.club_member_point_transactions.findMany({
      where: { is_deleted: false, OR: [{ member_id: id }, { source_member_id: id }] },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
    const transactions = rows.map((row) => ({
      id: row.id,
      points: row.points,
      type: row.transaction_type,
      action: row.action_name ?? null,
      occurredAt: row.occurred_at,
      expiryDate: row.expiry_date ?? null,
      expiryLabel: row.expiry_label ?? null,
      createdBy: row.created_by ?? null,
    }));
    return { memberId: id, balance: transactions.reduce((sum, row) => sum + row.points, 0), transactions };
  }

  async adjustPoints(id: number, input: { points: number; reason: string }, user: JwtUser) {
    assertSystemAdmin(user);
    const member = await this.assertPointMemberAccess(id, user);
    const points = Number(input.points);
    const reason = input.reason?.trim();
    if (!Number.isInteger(points) || points === 0) {
      throw new BadRequestException('قيمة التعديل يجب أن تكون عددًا صحيحًا غير صفري');
    }
    if (!reason) throw new BadRequestException('سبب التعديل مطلوب');
    const row = await this.prisma.club_member_point_transactions.create({
      data: {
        member_id: id,
        source_member_id: id,
        member_code: member.member_code,
        transaction_type: 'manual_adjustment',
        action_name: reason,
        points,
        occurred_at: new Date(),
        created_by: user.sub,
      },
    });
    return { id: row.id, points: row.points, type: row.transaction_type, action: row.action_name, occurredAt: row.occurred_at };
  }

  private async assertPointMemberAccess(id: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, branch_id: true, gender: true, member_code: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);
    return member;
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
    if (!this.branchScope.isMemberGenderAllowed(user, dto.gender)) {
      throw new ForbiddenException('لا تملك صلاحية إنشاء عضو في هذا القسم');
    }

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
        select: { id: true },
      });
      if (!salesRep) throw new BadRequestException('أخصائي المبيعات المحدد غير موجود');
    }

    const registeringEmployeeId = user.emp_code && user.emp_code > 0 ? user.emp_code : null;

    const isChild = dto.cardNumber?.toUpperCase().includes('-C');
    const shouldCreateUser = dto.autoCreateUser !== false && !isChild && normalizePhoneForStorage(dto.phone ?? '').length > 0;

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

      let credentials: { username: string; plaintextPassword: string; appUserId: number } | null = null;
      if (shouldCreateUser) {
        credentials = await this.provisionAppUser(tx, dto);
        if (credentials) {
          const updatedRow = await tx.club_members.update({
            where: { id: row.id },
            data: { app_user_id: credentials.appUserId },
            include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
          });
          return { row: updatedRow, credentials };
        }
      }

      return { row, credentials };
    }, { maxWait: 10000, timeout: 15000 });

    await this.audit.log({
      entityType: 'club_member',
      entityId: result.row.id,
      action: 'create',
      actorUserId: userId,
      actorName: user.name ?? undefined,
      branchId: result.row.branch_id,
      after: { memberCode: result.row.member_code, name: result.row.name, phone: result.row.phone },
    });

    const member = this.mapMember(result.row);
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
    this.assertMemberAccess(user, existing);
    if (dto.gender && !this.branchScope.isMemberGenderAllowed(user, dto.gender)) {
      throw new ForbiddenException('لا تملك صلاحية نقل العضو إلى هذا القسم');
    }

    const cardNumber = dto.cardNumber ?? existing.card_number ?? undefined;
    await this.validateMemberInput(
      {
        branchId: dto.branchId ?? existing.branch_id,
        name: dto.name ?? existing.name,
        phone: dto.phone ?? existing.phone ?? '',
        gender: (dto.gender ?? existing.gender) as 'male' | 'female',
        cardNumber: cardNumber ?? '',
        startDate: dto.startDate ?? existing.start_date ?? undefined,
        endDate: dto.endDate ?? existing.end_date ?? undefined,
      },
      existing.card_number,
    );

    const duplicates = await findMemberDuplicates(this.prisma, {
      branchId: dto.branchId ?? existing.branch_id,
      phone: dto.phone ?? existing.phone ?? undefined,
      cardNumber: cardNumber,
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
      row = await this.prisma.club_members.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: normalizeName(dto.name) } : {}),
        ...(dto.phone != null ? { phone: normalizePhoneForStorage(dto.phone) } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.gender != null ? { gender: dto.gender } : {}),
        ...(cardNumber != null ? { card_number: normalizeNationalIdForStorage(cardNumber) } : {}),
        ...(dto.dateOfBirth !== undefined ? { date_of_birth: dto.dateOfBirth || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.maritalStatus !== undefined ? { marital_status: dto.maritalStatus || null } : {}),
        ...(dto.jobTitle !== undefined ? { job_title: dto.jobTitle || null } : {}),
        ...(dto.profilePicture !== undefined ? { profile_picture: dto.profilePicture || null } : {}),
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
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && isUniqueTarget(e, 'phone')) {
        throw new ConflictException({
          message: 'الرقم مسجل من قبل',
          duplicates: [{ field: 'phone', fieldLabel: 'رقم الهاتف' }],
        });
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
      },
      after: {
        name: row.name,
        phone: row.phone,
        branchId: row.branch_id,
        isActive: row.is_active,
      },
    });

    return this.mapMember(row);
  }

  async block(id: number, reason: string, user: JwtUser) {
    const existing = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, existing);

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
    this.assertMemberAccess(user, existing);

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
      select: { id: true, member_code: true, name: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertMemberAccess(user, member);

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
    this.assertMemberAccess(user, existing);

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
      const trainerRatings = await tx.club_trainer_ratings.findMany({
        where: { member_id: id },
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
      await tx.club_trainer_ratings.deleteMany({ where: { member_id: id } });
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

  /** Resolve member by id or code for attendance check-in. */
  async resolveByIdOrCode(memberId?: number, memberCode?: string) {
    if (memberId) {
      const m = await this.prisma.club_members.findFirst({ where: { id: memberId, is_deleted: false } });
      if (!m) throw new NotFoundException('العضو غير موجود');
      return m;
    }
    if (memberCode?.trim()) {
      const m = await this.prisma.club_members.findFirst({
        where: { member_code: memberCode.trim(), is_deleted: false },
      });
      if (!m) throw new NotFoundException('العضو غير موجود');
      return m;
    }
    throw new BadRequestException('كود العضو مطلوب');
  }

  private async isSalesEmployee(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const emp = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: { mosma_wazefy_code: true, mosma_wazefy_n: true },
    });
    if (!emp) return false;
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
