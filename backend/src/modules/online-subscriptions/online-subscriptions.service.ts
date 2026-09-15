import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { calculateNutrition, NutritionInput } from './nutrition-calculator';
import { ClubReceiptsService } from '../club-subscriptions/club-receipts.service';
import { ClubSubscriptionAccountingService } from '../club-subscriptions/club-subscription-accounting.service';
import {
  getPhoneValidationError,
  localDateString,
  normalizeName,
  normalizePhoneForStorage,
} from '../club-members/club-member.utils';
import { resolveSubscriptionEndDate } from '../club-subscriptions/club-subscription.utils';

type Row = Record<string, any>;
const number = (value: unknown) => Number(value ?? 0);
const REVIEW_STATUSES = new Set(['submitted', 'approved', 'rejected']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class OnlineSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
  ) {}

  nutrition(input: NutritionInput) { return calculateNutrition(input); }

  private async packageRows(id?: number) {
    return this.prisma.$queryRawUnsafe<Row[]>(`
      SELECT id,name,price,days,branch_id,apply_to_all_branches,is_special_offer,is_for_students,
             invitations_count,inbody_count,includes_spa,spa_count,sessions_count,freeze_days,wallet_points,offer_validity,
             is_linked_to_sessions,allow_multiple_daily_entries
      FROM club_subscription_types WHERE is_active=1 AND show_in_app=1 ${id ? 'AND id=?' : ''} ORDER BY name ASC`, ...(id ? [id] : []));
  }

  private async applicable(row: Row, branchId: number) {
    if (Number(row.apply_to_all_branches) === 1 || Number(row.branch_id) === branchId) return true;
    const linked = await this.prisma.$queryRawUnsafe<Row[]>('SELECT branch_id FROM club_subscription_type_branches WHERE subscription_type_id=? AND branch_id=? LIMIT 1', number(row.id), branchId);
    return linked.length > 0;
  }

  private async mapPackage(row: Row, branchId: number) {
    const override = await this.prisma.$queryRawUnsafe<Row[]>('SELECT price FROM club_subscription_type_branch_prices WHERE subscription_type_id=? AND branch_id=? LIMIT 1', number(row.id), branchId);
    return {
      id: number(row.id), name: String(row.name), description: null, price: override.length ? number(override[0].price) : number(row.price),
      days: number(row.days), branchId, isSpecialOffer: Boolean(row.is_special_offer), isForStudents: Boolean(row.is_for_students),
      invitationsCount: row.invitations_count == null ? null : number(row.invitations_count), inbodyCount: row.inbody_count == null ? null : number(row.inbody_count),
      includesSpa: Boolean(row.includes_spa), spaCount: row.spa_count == null ? null : number(row.spa_count), sessionsCount: row.sessions_count == null ? null : number(row.sessions_count),
      freezeDays: row.freeze_days == null ? null : number(row.freeze_days), walletPoints: row.wallet_points == null ? null : number(row.wallet_points), offerValidity: row.offer_validity ?? null,
      isLinkedToSessions: Boolean(row.is_linked_to_sessions), allowMultipleDailyEntries: Boolean(row.allow_multiple_daily_entries),
    };
  }

  async publicPackages(branchId: number) {
    if (!Number.isInteger(branchId) || branchId < 1) throw new BadRequestException('اختر فرعًا صحيحًا');
    const rows = await this.packageRows();
    const packages: Array<Awaited<ReturnType<OnlineSubscriptionsService['mapPackage']>>> = [];
    for (const row of rows) if (await this.applicable(row, branchId)) packages.push(await this.mapPackage(row, branchId));
    return packages;
  }

  async publicPackage(id: number, branchId: number) {
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('اختر باقة صحيحة');
    if (!Number.isInteger(branchId) || branchId < 1) throw new BadRequestException('اختر فرعًا صحيحًا');
    const row = (await this.packageRows(id))[0];
    if (!row || !(await this.applicable(row, branchId))) throw new NotFoundException('الباقة غير متاحة في هذا الفرع');
    return this.mapPackage(row, branchId);
  }

  async paymentMethods(branchId?: number) {
    if (branchId != null && (!Number.isInteger(branchId) || branchId < 1)) throw new BadRequestException('اختر فرعًا صحيحًا');
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`
      SELECT id,name,method_type,destination_name,account_display,branch_id,display_order
      FROM online_payment_methods WHERE is_active=1 ${branchId ? 'AND (branch_id IS NULL OR branch_id=?)' : 'AND branch_id IS NULL'}
      ORDER BY display_order ASC,id ASC`, ...(branchId ? [branchId] : []));
    return rows.map((row) => ({ id: number(row.id), name: row.name, type: row.method_type, destination: row.destination_name,
      account: row.account_display, branchId: row.branch_id == null ? null : number(row.branch_id),
    }));
  }

  async adminPaymentMethods(user: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed?.length === 0) return [];
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT id,name,method_type,destination_name,account_display,account_secret,branch_id,is_active,display_order FROM online_payment_methods ${allowed ? `WHERE branch_id IS NULL OR branch_id IN (${allowed.map(() => '?').join(',')})` : ''} ORDER BY display_order,id`, ...(allowed ?? []));
    return rows.map((row) => ({ id:number(row.id), name:row.name, type:row.method_type, destination:row.destination_name, account:row.account_display, hasSecret:Boolean(row.account_secret), branchId:row.branch_id == null ? null : number(row.branch_id), isActive:Boolean(row.is_active), displayOrder:number(row.display_order) }));
  }

  async adminBranchOptions(user: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed?.length === 0) return { branches: [], canManageGlobal: false };
    const rows = await this.prisma.tbl_branches.findMany({
      where: allowed ? { branch_id: { in: allowed } } : undefined,
      orderBy: { branch_id: 'asc' },
      select: { branch_id: true, branch_name: true },
    });
    return {
      branches: rows.map((row) => ({ id: row.branch_id, name: row.branch_name })),
      canManageGlobal: allowed === null,
    };
  }

  async savePaymentMethod(user: JwtUser, body: Record<string, unknown>, id?: number) {
    const branchId = body.branchId == null || body.branchId === '' ? null : Number(body.branchId);
    if (branchId != null && (!Number.isInteger(branchId) || branchId < 1)) throw new BadRequestException('اختر فرعًا صحيحًا أو اجعل الطريقة عامة');
    const allowed = this.branchScope.allowedBranchIds(user);
    if (branchId == null && allowed !== null) throw new ForbiddenException('طرق الدفع المتاحة لكل الفروع يديرها مدير النظام فقط');
    if (branchId != null) this.assertAdminBranch(user, branchId);
    const name = String(body.name ?? '').trim(); const type = String(body.type ?? '').trim();
    if (name.length < 2 || type.length < 2) throw new BadRequestException('اسم ونوع طريقة الدفع مطلوبان');
    const active = body.isActive === false || body.isActive === 'false' ? 0 : 1;
    const displayOrder = Number(body.displayOrder ?? 1);
    if (!Number.isInteger(displayOrder) || displayOrder < 1) throw new BadRequestException('ترتيب العرض يجب أن يكون رقمًا صحيحًا موجبًا');
    if (id == null) {
      const row = await this.prisma.online_payment_methods.create({ data: {
        name, method_type: type, destination_name: String(body.destination ?? '').trim() || null,
        account_display: String(body.account ?? '').trim() || null, account_secret: String(body.accountSecret ?? '').trim() || null,
        branch_id: branchId, is_active: Boolean(active), display_order: displayOrder, created_by: user.sub,
      }, select: { id: true } });
      return { id:row.id, message:'تمت إضافة طريقة الدفع' };
    }
    const existing = await this.prisma.online_payment_methods.findUnique({ where: { id }, select: { branch_id: true, account_secret: true } });
    if (!existing) throw new NotFoundException('طريقة الدفع غير موجودة');
    if (existing.branch_id == null && allowed !== null) throw new ForbiddenException('طرق الدفع المتاحة لكل الفروع يديرها مدير النظام فقط');
    if (existing.branch_id != null) this.assertAdminBranch(user, number(existing.branch_id));
    const suppliedSecret = String(body.accountSecret ?? '').trim();
    await this.prisma.online_payment_methods.update({ where: { id }, data: {
      name, method_type: type, destination_name: String(body.destination ?? '').trim() || null,
      account_display: String(body.account ?? '').trim() || null,
      account_secret: body.clearSecret === true ? null : suppliedSecret || existing.account_secret,
      branch_id: branchId, is_active: Boolean(active), display_order: displayOrder,
    } });
    return { id, message:'تم حفظ طريقة الدفع' };
  }

  async createRequest(input: { packageId: number; branchId: number; paymentMethodId: number; fullName: string; phone: string; email?: string | null; gender: string; proofPath: string; proofMime: string; proofSize: number }) {
    if (!input.proofPath || !input.proofMime || input.proofSize <= 0) throw new BadRequestException('إثبات التحويل مطلوب قبل إرسال الطلب');
    const fullName = normalizeName(input.fullName ?? '');
    if (fullName.length < 3) throw new BadRequestException('الاسم بالكامل مطلوب');
    const phoneError = getPhoneValidationError(input.phone);
    if (phoneError) throw new BadRequestException(phoneError);
    const email = input.email?.trim() || null;
    if (email && !EMAIL.test(email)) throw new BadRequestException('البريد الإلكتروني غير صحيح');
    if (input.gender !== 'male' && input.gender !== 'female') throw new BadRequestException('اختر القسم رجال أو سيدات');
    const [pkg, methods] = await Promise.all([this.publicPackage(Number(input.packageId), Number(input.branchId)), this.paymentMethods(Number(input.branchId))]);
    const method = methods.find((item) => item.id === Number(input.paymentMethodId));
    if (!method) throw new BadRequestException('طريقة الدفع غير متاحة لهذا الفرع');
    if (!Number.isFinite(pkg.price) || pkg.price <= 0) throw new BadRequestException('سعر الباقة غير صالح');
    const created = await this.prisma.online_subscription_requests.create({ data: {
      status: 'submitted', package_id: pkg.id, package_name_snapshot: pkg.name, package_days_snapshot: pkg.days,
      branch_id: pkg.branchId, price_snapshot: pkg.price, payment_method_id: method.id,
      payment_name_snapshot: method.name, payment_destination_snapshot: method.destination,
      payment_account_snapshot: method.account, is_linked_to_sessions_snapshot: pkg.isLinkedToSessions,
      sessions_count_snapshot: pkg.sessionsCount, allow_multiple_daily_entries_snapshot: pkg.allowMultipleDailyEntries,
      applicant_name: fullName, applicant_phone: normalizePhoneForStorage(input.phone), applicant_email: email, applicant_gender: input.gender,
      proof_path: input.proofPath, proof_mime: input.proofMime, proof_size: input.proofSize, submitted_at: new Date(),
    }, select: { id: true } });
    return { id: created.id, status: 'submitted', message: 'تم استلام طلبك وسيتم مراجعته قريبًا' };
  }

  private assertAdminBranch(user: JwtUser, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
  }

  private assertAdminAudience(user: JwtUser, gender: unknown) {
    if (!this.branchScope.isMemberGenderAllowed(user, gender == null ? null : String(gender))) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لطلبات هذا القسم');
    }
  }

  async adminList(user: JwtUser, status?: string, requestedBranch?: number) {
    if (status && !REVIEW_STATUSES.has(status)) throw new BadRequestException('حالة الطلب غير صحيحة');
    if (requestedBranch != null) {
      if (!Number.isInteger(requestedBranch) || requestedBranch < 1) throw new BadRequestException('اختر فرعًا صحيحًا');
      this.assertAdminBranch(user, requestedBranch);
    }
    const allowed = this.branchScope.resolveListFilter(user, requestedBranch);
    if (allowed?.length === 0) return [];
    const audience = this.branchScope.memberGenderFilter(user);
    const where = [status ? 'r.status=?' : '', allowed ? `r.branch_id IN (${allowed.map(() => '?').join(',')})` : '', audience ? 'r.applicant_gender=?' : ''].filter(Boolean).join(' AND ') || '1=1';
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT r.* FROM online_subscription_requests r WHERE ${where} ORDER BY r.created_at DESC`, ...(status ? [status] : []), ...(allowed ?? []), ...(audience ? [audience] : []));
    return rows.map((row) => this.safeAdminRequest(row));
  }

  async adminDetail(user: JwtUser, id: number) {
    const row = (await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM online_subscription_requests WHERE id=? LIMIT 1', id))[0];
    if (!row) throw new NotFoundException('طلب الاشتراك غير موجود');
    this.assertAdminBranch(user, number(row.branch_id));
    this.assertAdminAudience(user, row.applicant_gender);
    return this.safeAdminRequest(row);
  }

  async adminProof(user: JwtUser, id: number) {
    const row = (await this.prisma.$queryRawUnsafe<Row[]>('SELECT id,branch_id,applicant_gender,proof_path,proof_mime FROM online_subscription_requests WHERE id=? LIMIT 1', id))[0];
    if (!row) throw new NotFoundException('طلب الاشتراك غير موجود');
    this.assertAdminBranch(user, number(row.branch_id));
    this.assertAdminAudience(user, row.applicant_gender);
    if (!row.proof_path) throw new NotFoundException('إثبات التحويل غير موجود');
    return { path: String(row.proof_path), mime: String(row.proof_mime || 'application/octet-stream') };
  }

  private safeAdminRequest(row: Row) {
    const fields = [
      'id','status','package_id','package_name_snapshot','package_days_snapshot','branch_id','price_snapshot',
      'payment_method_id','payment_name_snapshot','payment_destination_snapshot','payment_account_snapshot',
      'is_linked_to_sessions_snapshot','sessions_count_snapshot','allow_multiple_daily_entries_snapshot',
      'applicant_name','applicant_phone','applicant_email','applicant_gender','proof_size','rejection_reason','reviewed_by','reviewed_at',
      'promoted_subscription_id','submitted_at','created_at','updated_at',
    ];
    const safe: Row = {};
    for (const field of fields) safe[field] = row[field];
    safe.proofUrl = row.proof_path ? `/api/online-subscriptions/${row.id}/proof` : null;
    return safe;
  }

  async reject(user: JwtUser, id: number, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('سبب الرفض مطلوب');
    return this.prisma.$transaction(async (tx: any) => {
      const row = (await tx.$queryRawUnsafe('SELECT id,status,branch_id,applicant_gender FROM online_subscription_requests WHERE id=? FOR UPDATE', id) as Row[])[0];
      if (!row) throw new NotFoundException('طلب الاشتراك غير موجود');
      this.assertAdminBranch(user, number(row.branch_id));
      this.assertAdminAudience(user, row.applicant_gender);
      if (row.status !== 'submitted') throw new ConflictException('لا يمكن تغيير حالة طلب تمت مراجعته');
      const affected = await tx.$executeRawUnsafe("UPDATE online_subscription_requests SET status='rejected',rejection_reason=?,reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=? AND status='submitted'", reason.trim(), user.sub, id);
      if (Number(affected) !== 1) throw new ConflictException('تمت مراجعة الطلب بواسطة مستخدم آخر');
      return { id, status: 'rejected' };
    });
  }

  /**
   * Atomic compare-and-promote. The conditional UPDATE owns the state transition; only the
   * winning transaction creates the normal subscription and receipt, and an error rolls all back.
   */
  async approveAndPromote(user: JwtUser, id: number) {
    return this.prisma.$transaction(async (tx: any) => {
      const rows = await tx.$queryRawUnsafe('SELECT * FROM online_subscription_requests WHERE id=? FOR UPDATE', id) as Row[];
      const request = rows[0];
      if (!request) throw new NotFoundException('طلب الاشتراك غير موجود');
      this.assertAdminBranch(user, number(request.branch_id));
      this.assertAdminAudience(user, request.applicant_gender);
      if (request.promoted_subscription_id) return { id, status: request.status, promotedSubscriptionId: number(request.promoted_subscription_id), idempotent: true };
      if (request.status !== 'submitted') throw new ConflictException('لا يمكن اعتماد هذا الطلب في حالته الحالية');
      if (!request.proof_path) throw new BadRequestException('لا يمكن اعتماد طلب بدون إثبات تحويل');
      let member = (await tx.$queryRawUnsafe('SELECT id,name,gender FROM club_members WHERE phone=? AND branch_id=? AND is_deleted=0 ORDER BY id DESC LIMIT 1', request.applicant_phone, request.branch_id) as Row[])[0];
      if (member && request.applicant_gender !== member.gender) {
        throw new BadRequestException('قسم العضو المسجل لا يطابق قسم طلب الاشتراك');
      }
      if (!member) {
        if (request.applicant_gender !== 'male' && request.applicant_gender !== 'female') throw new BadRequestException('الطلبات القديمة بدون قسم تحتاج استكمال بيانات العضو قبل الاعتماد');
        // Mirrors the canonical member-code lock: a concurrent approval cannot
        // receive the same code even though the request itself is already locked.
        const lock = (await tx.$queryRawUnsafe("SELECT GET_LOCK('club_member_code', 10) AS acquired") as Row[])[0];
        if (number(lock?.acquired) !== 1) throw new ConflictException('تعذر حجز كود العضو، أعد المحاولة');
        try {
          // Another request for the same phone may have completed while this
          // transaction waited for the code lock. Reuse that canonical member.
          member = (await tx.$queryRawUnsafe('SELECT id,name,gender FROM club_members WHERE phone=? AND branch_id=? AND is_deleted=0 ORDER BY id DESC LIMIT 1', request.applicant_phone, request.branch_id) as Row[])[0];
          if (member && request.applicant_gender !== member.gender) {
            throw new BadRequestException('قسم العضو المسجل لا يطابق قسم طلب الاشتراك');
          }
          if (!member) {
            const max = (await tx.$queryRawUnsafe("SELECT MAX(CAST(SUBSTRING(member_code, 2) AS UNSIGNED)) AS maxNum FROM club_members WHERE member_code REGEXP '^B[0-9]+$' FOR UPDATE") as Row[])[0];
            const memberCode = `B${String(number(max?.maxNum) + 1).padStart(6, '0')}`;
            member = await tx.club_members.create({ data: { member_code: memberCode, name: String(request.applicant_name), phone: String(request.applicant_phone), email: request.applicant_email ? String(request.applicant_email) : null, gender: request.applicant_gender, branch_id: number(request.branch_id), membership_type_id: null, created_by: user.sub } });
          }
        } finally {
          await tx.$queryRawUnsafe("SELECT RELEASE_LOCK('club_member_code')");
        }
      }
      // The request id is a durable idempotency key, so its subscription number cannot race
      // with another approved online request and never needs a MAX()+1 sequence.
      const subNumber = `ONL${String(id).padStart(8, '0')}`;
      const startDate = localDateString();
      const linkedToSessions = Boolean(request.is_linked_to_sessions_snapshot);
      const endDate = resolveSubscriptionEndDate(startDate, number(request.package_days_snapshot), linkedToSessions);
      const sub = await tx.club_subscriptions.create({ data: {
        subscription_number: subNumber, registration_date: startDate, branch_id: number(request.branch_id),
        member_id: number(member.id), customer_name: member.name ?? request.applicant_name,
        subscription_type_id: number(request.package_id), subscription_type: request.package_name_snapshot,
        subscription_start_date: startDate, subscription_end_date: endDate,
        subscription_value: number(request.price_snapshot), paid_amount: number(request.price_snapshot), remaining_amount: 0,
        gender: member.gender ?? null, payment_method: 'online', status: 'active',
        is_linked_to_sessions: linkedToSessions,
        sessions_count: linkedToSessions && request.sessions_count_snapshot != null ? number(request.sessions_count_snapshot) : null,
        sessions_used: 0, allow_multiple_daily_entries: Boolean(request.allow_multiple_daily_entries_snapshot), created_by: user.sub,
      } });
      const receipt = await this.receipts.createForSubscription(number(sub.id), number(request.price_snapshot), {
        memberName: member.name ?? request.applicant_name, memberId: number(member.id), paymentMethod: 'online', createdBy: user.sub,
        description: `إيصال اعتماد اشتراك أونلاين - ${request.package_name_snapshot}`,
      }, tx);
      if (!receipt) throw new ConflictException('تعذر إنشاء إيصال الاشتراك');
      await this.accounting.postJournal({
        subscriptionNumber: subNumber, sourceDocId: receipt?.receipt_number ?? subNumber,
        paidAmount: number(request.price_snapshot), subscriptionValue: number(request.price_snapshot), discountValue: 0, discountEnabled: false,
        paymentMethod: 'online', branchId: number(request.branch_id), createdBy: user.sub, registrationDate: startDate, kind: 'subscription',
      }, tx);
      const affected = await tx.$executeRawUnsafe("UPDATE online_subscription_requests SET status='approved',promoted_subscription_id=?,reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=? AND status='submitted' AND promoted_subscription_id IS NULL", number(sub.id), user.sub, id);
      if (Number(affected) !== 1) throw new ConflictException('تمت مراجعة الطلب بواسطة مستخدم آخر');
      return { id, status: 'approved', promotedSubscriptionId: number(sub.id), idempotent: false };
    }, { maxWait: 10_000, timeout: 15_000 });
  }
}
