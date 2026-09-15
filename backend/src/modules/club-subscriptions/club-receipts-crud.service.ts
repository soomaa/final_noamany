import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { paginated } from '../../common/dto/list-result';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertMemberExists, localDateString } from '../club-members/club-member.utils';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import {
  netValue,
  primaryClubPaymentMethod,
  resolveClubPayments,
  roundMoney,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';
import {
  CreateClubReceiptDto,
  ListClubReceiptsDto,
  UpdateClubReceiptDto,
} from './dto/club-receipts.dto';
import { receiptBusinessBranchWhere, receiptMemberAudienceWhere } from './receipt-business-scope';
import { assertClubAccountingDayOpen } from './daily-close-lock.util';

type ReceiptSubscriptionWithMember = Prisma.club_subscriptionsGetPayload<{
  include: { member: { select: { gender: true; is_deleted: true } } };
}>;

@Injectable()
export class ClubReceiptsCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private receiptScopeWhere(user?: JwtUser): Prisma.club_receiptsWhereInput {
    const allowed = this.branchScope.allowedBranchIds(user);
    const gender = this.branchScope.memberGenderFilter?.(user) ?? null;
    return { AND: [receiptBusinessBranchWhere(allowed), receiptMemberAudienceWhere(gender)] };
  }

  private assertReceiptAccess(
    user: JwtUser | undefined,
    receipt: {
      branch_id?: number | null;
      subscription?: { branch_id: number } | null;
      locker_subscription?: { main_branch_id: number } | null;
      member?: { branch_id: number } | null;
    },
  ) {
    const branchId =
      receipt.subscription?.branch_id ??
      receipt.locker_subscription?.main_branch_id ??
      receipt.member?.branch_id ??
      receipt.branch_id;
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private assertReceiptAudience(
    user: JwtUser | undefined,
    receipt: {
      subscription?: { member?: { gender: string | null; is_deleted: boolean } | null } | null;
      locker_subscription?: { member?: { gender: string | null; is_deleted: boolean } | null } | null;
      member?: { gender: string | null; is_deleted: boolean } | null;
    },
  ) {
    const audience = this.branchScope.memberGenderFilter?.(user) ?? null;
    if (!audience) return;
    // The relation itself establishes authority. Never fall back to a direct member when a
    // linked subscription/locker exists but its canonical member is missing or deleted.
    const member = receipt.subscription != null
      ? receipt.subscription.member
      : receipt.locker_subscription != null
        ? receipt.locker_subscription.member
        : receipt.member;
    if (!member || member.is_deleted || member.gender !== audience) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا القسم');
    }
  }

  private mapReceipt(r: {
    id: number;
    receipt_number: string;
    subscription_id: number | null;
    locker_subscription_id?: number | null;
    member_id: number | null;
    member_name: string;
    amount: unknown;
    type: string | null;
    payment_method: string | null;
    receipt_date: string;
    status: string;
    description: string | null;
    created_by?: number | null;
    payments?: { method: string; amount: unknown }[];
  }) {
    // Field names are consumed by the frontend — do NOT rename.
    return {
      id: r.id,
      receiptNumber: r.receipt_number,
      subscriptionId: r.subscription_id,
      lockerSubscriptionId: r.locker_subscription_id ?? null,
      memberId: r.member_id,
      memberName: r.member_name,
      amount: toNum(r.amount),
      type: r.type,
      paymentMethod: r.payment_method,
      // Full tender breakdown; a single-method receipt has exactly one entry. Pre-split receipts
      // created before this table existed fall back to the header method.
      payments:
        r.payments && r.payments.length > 0
          ? r.payments.map((p) => ({ method: p.method, amount: toNum(p.amount) }))
          : r.payment_method
            ? [{ method: r.payment_method, amount: toNum(r.amount) }]
            : [],
      receiptDate: r.receipt_date,
      status: r.status,
      description: r.description,
      createdByUserId: r.created_by ?? null,
    };
  }

  async list(q: ListClubReceiptsDto, user?: JwtUser) {
    const and: Prisma.club_receiptsWhereInput[] = [this.receiptScopeWhere(user)];
    const where: Prisma.club_receiptsWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.subscriptionId != null) where.subscription_id = q.subscriptionId;
    if (q.memberId != null) where.member_id = q.memberId;
    // A receipt can inherit its business branch from the subscription/member;
    // filtering only the nullable receipt header would omit valid historical rows.
    if (q.branchId != null) {
      Object.assign(where, receiptBusinessBranchWhere([q.branchId]));
    }
    if (q.startDate && q.endDate && q.endDate < q.startDate) {
      throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    }
    if (q.startDate || q.endDate) {
      where.receipt_date = {
        ...(q.startDate ? { gte: q.startDate } : {}),
        ...(q.endDate ? { lte: q.endDate } : {}),
      };
    }
    and.push(where);
    const scopedWhere: Prisma.club_receiptsWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where: scopedWhere,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
        include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
      }),
      this.prisma.club_receipts.count({ where: scopedWhere }),
    ]);

    return paginated(rows.map((r) => this.mapReceipt(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const r = await this.prisma.club_receipts.findUnique({
      where: { id },
      include: {
        subscription: {
          select: {
            branch_id: true,
            member: { select: { gender: true, is_deleted: true } },
          },
        },
        locker_subscription: {
          select: {
            main_branch_id: true,
            member: { select: { gender: true, is_deleted: true } },
          },
        },
        member: { select: { branch_id: true, gender: true, is_deleted: true } },
        payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('الإيصال غير موجود');
    this.assertReceiptAccess(user, r);
    this.assertReceiptAudience(user, r);
    const {
      subscription: _subscription,
      locker_subscription: _lockerSubscription,
      member: _member,
      ...receipt
    } = r;
    return receipt;
  }

  async create(body: CreateClubReceiptDto, user?: JwtUser) {
    let directMember: { branch_id: number; gender: string | null; is_deleted: boolean } | null = null;
    if (body.memberId) {
      await assertMemberExists(this.prisma, body.memberId).catch((e) => {
        throw new BadRequestException(e instanceof Error ? e.message : 'العضو غير موجود');
      });
      const member = await this.prisma.club_members.findUnique({
        where: { id: body.memberId },
        select: { branch_id: true, gender: true, is_deleted: true },
      });
      if (!member || !this.branchScope.isBranchAllowed(user, member.branch_id)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      }
      const requiredGender = this.branchScope.memberGenderFilter?.(user) ?? null;
      if (requiredGender && (member.is_deleted || member.gender !== requiredGender)) throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا القسم');
      directMember = member;
    }

    // A receipt affects a subscription's paid/remaining ONLY when subscriptionId is explicitly
    // provided — no auto-attach to the member's latest subscription.
    const subscriptionId = body.subscriptionId;
    let sub: ReceiptSubscriptionWithMember | null = null;
    if (subscriptionId != null) {
      sub = await this.prisma.club_subscriptions.findUnique({
        where: { id: subscriptionId },
        include: { member: { select: { gender: true, is_deleted: true } } },
      });
      if (!sub) throw new NotFoundException('الاشتراك غير موجود');
      if (!this.branchScope.isBranchAllowed(user, sub.branch_id)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      }
      this.assertReceiptAudience(user, { subscription: sub });
    }
    if ((this.branchScope.memberGenderFilter?.(user) ?? null) && subscriptionId == null && !body.memberId) {
      throw new ForbiddenException('لا يمكن إنشاء إيصال غير مرتبط بعضو داخل قسم محدد');
    }

    // Derive a branch for the GL posting: subscription's branch, else the member's branch, else
    // the branch the caller collected at (walk-in receipts have neither).
    let branchId = sub?.branch_id;
    if (branchId == null && body.memberId) {
      branchId = directMember?.branch_id;
    }
    if (branchId == null && body.branchId != null) {
      if (!this.branchScope.isBranchAllowed(user, body.branchId)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      }
      branchId = body.branchId;
    }

    const splits = resolveClubPayments(body.amount, body.paymentMethod, body.payments);

    const receipt = await retryOnUniqueViolation(async () => {
      return this.prisma.$transaction(async (tx) => {
        let lockedSub = sub;
        let lockedDirectMember = directMember;
        if (subscriptionId == null && body.memberId != null) {
          const locked = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM club_members
            WHERE id = ${body.memberId}
            FOR UPDATE
          `;
          if (!locked.length) throw new NotFoundException('العضو غير موجود');
          lockedDirectMember = await tx.club_members.findUnique({
            where: { id: body.memberId },
            select: { branch_id: true, gender: true, is_deleted: true },
          });
          if (
            !lockedDirectMember ||
            lockedDirectMember.is_deleted ||
            !this.branchScope.isBranchAllowed(user, lockedDirectMember.branch_id)
          ) {
            throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
          }
          const requiredGender = this.branchScope.memberGenderFilter?.(user) ?? null;
          if (requiredGender && lockedDirectMember.gender !== requiredGender) {
            throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا القسم');
          }
          branchId = lockedDirectMember.branch_id;
        }
        if (subscriptionId != null) {
          // Serialize manual receipts with every other write to this subscription. The cap is
          // recomputed from the receipt ledger after the row lock, never from a stale DTO/read.
          const locked = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM club_subscriptions
            WHERE id = ${subscriptionId}
            FOR UPDATE
          `;
          if (!locked.length) throw new NotFoundException('الاشتراك غير موجود');
          lockedSub = await tx.club_subscriptions.findUnique({
            where: { id: subscriptionId },
            include: { member: { select: { gender: true, is_deleted: true } } },
          });
          if (!lockedSub) throw new NotFoundException('الاشتراك غير موجود');
          if (!this.branchScope.isBranchAllowed(user, lockedSub.branch_id)) {
            throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
          }
          this.assertReceiptAudience(user, { subscription: lockedSub });

          const collected = await tx.club_receipts.aggregate({
            where: { subscription_id: subscriptionId },
            _sum: { amount: true },
          });
          const receivable = roundMoney(Math.max(
            0,
            netValue(
              toNum(lockedSub.subscription_value),
              lockedSub.discount_enabled,
              toNum(lockedSub.discount_value),
            ) -
              toNum(lockedSub.waived_amount) -
              toNum(lockedSub.transferred_credit_amount) -
              toNum(collected._sum.amount),
          ));
          if (roundMoney(body.amount) > receivable) {
            throw new BadRequestException('مبلغ الإيصال يتجاوز المبلغ المتبقي');
          }
          branchId = lockedSub.branch_id;
        }

        if (branchId != null) {
          await assertClubAccountingDayOpen(tx, {
            date: body.receiptDate ?? localDateString(),
            branchId,
            gender: lockedSub?.member?.gender ?? lockedDirectMember?.gender ?? null,
          });
        }

        const receiptNumber = await this.receipts.nextReceiptNumber(tx);
        const created = await tx.club_receipts.create({
          data: {
            receipt_number: receiptNumber,
            subscription_id: subscriptionId ?? null,
            member_id: body.memberId ?? null,
            member_name: body.memberName,
            branch_id: branchId ?? null,
            amount: body.amount,
            type: body.type ?? null,
            payment_method:
              primaryClubPaymentMethod(splits) ?? toClubPaymentMethod(body.paymentMethod),
            receipt_date: body.receiptDate ?? localDateString(),
            status: 'مدفوعة',
            description: body.description ?? null,
            created_by: user?.sub ?? null,
            payments: { create: splits.map((p) => ({ method: p.method, amount: p.amount })) },
          },
          include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
        });

        if (subscriptionId != null) {
          await this.receipts.recalculateSubscriptionPayments(subscriptionId, tx);
        }

        // Keep the receipt, subscription balance and GL posting in one atomic transaction.
        if (branchId != null) {
          await this.accounting.postJournal({
            subscriptionNumber: lockedSub?.subscription_number ?? created.receipt_number,
            sourceDocId: created.receipt_number,
            paidAmount: body.amount,
            subscriptionValue: 0,
            discountValue: 0,
            discountEnabled: false,
            paymentMethod: body.paymentMethod,
            payments: splits,
            branchId,
            createdBy: user?.sub,
            kind: 'payment',
          }, tx);
        }

        return created;
      });
    });

    return this.mapReceipt(receipt);
  }

  async update(id: number, body: UpdateClubReceiptDto, user?: JwtUser) {
    const existing = await this.findOne(id, user);
    // Only description/type/payment_method are mutable. Amount/date/subscription are immutable —
    // changing money on a posted receipt would desync the GL; cancel and re-issue instead.
    const method =
      body.paymentMethod !== undefined ? toClubPaymentMethod(body.paymentMethod) : undefined;
    const receipt = await this.prisma.club_receipts.update({
      where: { id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        // Correcting the method collapses any split onto it, so SUM(payments) still equals the
        // receipt amount. Re-splitting a posted receipt is not supported — re-issue it instead.
        ...(method !== undefined
          ? {
              payment_method: method,
              payments: {
                deleteMany: {},
                create: method
                  ? [{ method, amount: toNum(existing.amount) }]
                  : [],
              },
            }
          : {}),
      },
      include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
    });
    return this.mapReceipt(receipt);
  }

  async remove(id: number, user?: JwtUser) {
    void id;
    void user;
    throw new ForbiddenException('لا يمكن حذف الإيصالات. استخدم الاسترداد أو قيدًا تصحيحيًا معتمدًا.');
  }

  async deletePreview(id: number, user: JwtUser) {
    void id;
    void user;
    throw new ForbiddenException('لا يمكن حذف الإيصالات أو معاينة حذفها.');
  }

  async statistics(user?: JwtUser) {
    const monthStart = localDateString().slice(0, 8) + '01';
    const rows = await this.prisma.club_receipts.findMany({
      where: { AND: [this.receiptScopeWhere(user), { receipt_date: { gte: monthStart } }] },
    });
    return {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'مدفوعة' || r.status === 'paid').length,
      pending: rows.filter((r) => r.status === 'معلقة' || r.status === 'pending').length,
      totalAmount: rows.reduce((s, r) => s + toNum(r.amount), 0),
    };
  }
}
