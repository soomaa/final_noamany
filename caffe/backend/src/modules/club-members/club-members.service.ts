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
  branchCodePrefix,
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
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
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
    if (q.gender && q.gender !== 'all') and.push({ gender: q.gender as 'male' | 'female' });
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

  async checkDuplicates(query: {
    phone?: string;
    cardNumber?: string;
    excludeMemberId?: number;
  }) {
    const duplicates = await findMemberDuplicates(this.prisma, {
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

  async nextCode(branchId?: number): Promise<{ memberCode: string }> {
    const code = await this.generateMemberCode(branchId ?? 1);
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
        throw new ConflictException('رقم الجوال مُستخدم لحساب تطبيق عضو آخر');
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
    this.assertBranchAccess(user, row.branch_id);
    return this.mapMember(row);
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

    const duplicates = await findMemberDuplicates(this.prisma, {
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
    this.assertBranchAccess(user, existing.branch_id);

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
          message: 'رقم الهاتف مستخدم بالفعل من قبل عضو آخر',
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
