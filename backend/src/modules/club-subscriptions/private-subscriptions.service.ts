import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubGender, ClubPrivatePackageKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSessionAwareStatus, toNum } from './club-subscription.utils';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import {
  CreatePrivateEnrollmentDto,
  ListPrivateEnrollmentsDto,
  UpsertPrivatePackageDto,
} from './dto/private-subscriptions.dto';

@Injectable()
export class PrivateSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: ClubSubscriptionsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertPackageWriteAccess(
    user: JwtUser,
    branches: Array<{ branch_id: number }>,
  ) {
    if (!branches.every((branch) => this.branchScope.isBranchAllowed(user, branch.branch_id))) {
      throw new ForbiddenException('لا تملك صلاحية تعديل باقة مرتبطة بفرع خارج نطاقك');
    }
  }

  private mapPackage(row: Prisma.club_private_packagesGetPayload<{ include: { branches: true } }>) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      price: toNum(row.price),
      durationDays: row.duration_days,
      sessionsCount: row.sessions_count,
      branchIds: row.branches.map((branch) => branch.branch_id),
      isActive: row.is_active,
      legacySubscriptionTypeId: row.legacy_subscription_type_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private validatePackage(body: UpsertPrivatePackageDto) {
    const name = body.name.trim();
    if (!name) throw new BadRequestException('اسم اشتراك البرايفت مطلوب');
    if (body.kind === 'sessions' && !body.sessionsCount) {
      throw new BadRequestException('عدد الحصص مطلوب لباقة الحصص');
    }
    return {
      kind: body.kind as ClubPrivatePackageKind,
      name,
      price: body.price,
      duration_days: body.durationDays,
      sessions_count: body.kind === 'sessions' ? body.sessionsCount! : null,
      branchIds: [...new Set(body.branchIds.map(Number))],
    };
  }

  private assertValidDate(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || addDays(value, 0) !== value) {
      throw new BadRequestException(`${label} غير صحيح`);
    }
  }

  private privateEnrollmentWhere(): Prisma.club_subscriptionsWhereInput {
    // `private_package_id` is authoritative for new/backfilled rows. The name fallback keeps any
    // irregular legacy row visible even if its original type definition was missing.
    return {
      OR: [
        { private_package_id: { not: null } },
        { subscription_type: { contains: 'برايفت' } },
        { subscription_type: { contains: 'private' } },
      ],
    };
  }

  async listPackages(user: JwtUser, branchId?: string, includeInactive?: string) {
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const rows = await this.prisma.club_private_packages.findMany({
      where: {
        ...(includeInactive === 'true' || includeInactive === '1' ? {} : { is_active: true }),
        ...(scopedBranches ? { branches: { some: { branch_id: { in: scopedBranches } } } } : {}),
      },
      include: { branches: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.mapPackage(row));
  }

  async createPackage(body: UpsertPrivatePackageDto, user: JwtUser) {
    const data = this.validatePackage(body);
    for (const branchId of data.branchIds) {
      if (!this.branchScope.isBranchAllowed(user, branchId)) {
        throw new ForbiddenException('لا تملك صلاحية إضافة باقة لهذا الفرع');
      }
    }
    const existingBranches = await this.prisma.tbl_branches.count({
      where: { branch_id: { in: data.branchIds } },
    });
    if (existingBranches !== data.branchIds.length) {
      throw new BadRequestException('أحد الفروع المختارة غير موجود');
    }
    const row = await this.prisma.club_private_packages.create({
      data: {
        kind: data.kind,
        name: data.name,
        price: data.price,
        duration_days: data.duration_days,
        sessions_count: data.sessions_count,
        created_by: user.sub,
        branches: { create: data.branchIds.map((id) => ({ branch_id: id })) },
      },
      include: { branches: true },
    });
    return this.mapPackage(row);
  }

  async updatePackage(id: number, body: UpsertPrivatePackageDto, user: JwtUser) {
    const existing = await this.prisma.club_private_packages.findUnique({
      where: { id },
      include: { branches: { select: { branch_id: true } } },
    });
    if (!existing) throw new NotFoundException('باقة البرايفت غير موجودة');
    this.assertPackageWriteAccess(user, existing.branches);
    const data = this.validatePackage(body);
    for (const branchId of data.branchIds) {
      if (!this.branchScope.isBranchAllowed(user, branchId)) {
        throw new ForbiddenException('لا تملك صلاحية تعديل باقة لهذا الفرع');
      }
    }
    const existingBranches = await this.prisma.tbl_branches.count({
      where: { branch_id: { in: data.branchIds } },
    });
    if (existingBranches !== data.branchIds.length) {
      throw new BadRequestException('أحد الفروع المختارة غير موجود');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_private_package_branches.deleteMany({ where: { package_id: id } });
      return tx.club_private_packages.update({
        where: { id },
        data: {
          kind: data.kind,
          name: data.name,
          price: data.price,
          duration_days: data.duration_days,
          sessions_count: data.sessions_count,
          branches: { create: data.branchIds.map((branch_id) => ({ branch_id })) },
        },
        include: { branches: true },
      });
    });
    return this.mapPackage(row);
  }

  async deactivatePackage(id: number, user: JwtUser) {
    const exists = await this.prisma.club_private_packages.findUnique({
      where: { id },
      include: { branches: { select: { branch_id: true } } },
    });
    if (!exists) throw new NotFoundException('باقة البرايفت غير موجودة');
    this.assertPackageWriteAccess(user, exists.branches);
    await this.prisma.club_private_packages.update({ where: { id }, data: { is_active: false } });
    return { success: true };
  }

  async createEnrollment(body: CreatePrivateEnrollmentDto, user: JwtUser) {
    const [member, packageRow, trainer] = await Promise.all([
      this.prisma.club_members.findFirst({
        where: { id: body.memberId, is_deleted: false },
      }),
      this.prisma.club_private_packages.findFirst({
        where: { id: body.packageId, is_active: true },
        include: { branches: true },
      }),
      this.prisma.club_trainers.findFirst({
        where: { id: body.trainerId, is_active: true, is_deleted: false },
      }),
    ]);
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!packageRow) throw new NotFoundException('باقة البرايفت غير موجودة أو غير مفعلة');
    if (!trainer) throw new NotFoundException('المدرب غير موجود أو غير مفعل');

    const branchId = body.branchId ?? member.branch_id;
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية التسجيل في هذا الفرع');
    }
    if (!packageRow.branches.some((branch) => branch.branch_id === branchId)) {
      throw new BadRequestException('الباقة غير متاحة في الفرع المختار');
    }
    const startDate = body.startDate || localDateString();
    this.assertValidDate(startDate, 'تاريخ بداية الاشتراك');
    if (body.registrationDate) {
      this.assertValidDate(body.registrationDate, 'تاريخ التسجيل');
    }
    const endDate = addDays(startDate, packageRow.duration_days);
    const discountValue = body.discountValue ?? 0;

    const created = await this.subscriptions.create({
      branchId,
      memberId: member.id,
      customerName: member.name,
      privatePackageId: packageRow.id,
      privateTrainerId: trainer.id,
      privateDiscountType: body.discountType,
      subscriptionType: packageRow.name,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      registrationDate: body.registrationDate,
      subscriptionValue: toNum(packageRow.price),
      discountEnabled: discountValue > 0,
      discountValue,
      paidAmount: body.paidAmount,
      gender: body.gender ?? (member.gender as ClubGender),
      paymentMethod: body.paymentMethod,
      payments: body.payments,
      isSpecial: true,
      isLinkedToSessions: packageRow.kind === 'sessions',
      sessionsCount: packageRow.sessions_count ?? undefined,
      allowMultipleDailyEntries: true,
    }, user.sub, { privateEnrollment: true });
    return this.findEnrollment(Number(created.id), user);
  }

  async findEnrollment(id: number, user: JwtUser) {
    const row = await this.prisma.club_subscriptions.findFirst({
      where: { id, ...this.privateEnrollmentWhere() },
      include: {
        member: { select: { member_code: true, name: true, gender: true } },
        private_package: true,
        private_trainer: { select: { id: true, name: true } },
        receipts: {
          orderBy: { id: 'asc' },
          select: {
            receipt_number: true,
            payments: { orderBy: { id: 'asc' }, select: { method: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('اشتراك البرايفت غير موجود');
    if (!this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لهذا الفرع');
    }
    const users = row.created_by
      ? await this.prisma.users.findUnique({ where: { user_id: row.created_by }, select: { name: true } })
      : null;
    return this.mapEnrollment(row, users?.name ?? null);
  }

  async listEnrollments(query: ListPrivateEnrollmentsDto, user: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [this.privateEnrollmentWhere()];
    const branches = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    if (branches) and.push({ branch_id: { in: branches } });
    if (query.trainerId) and.push({ private_trainer_id: query.trainerId });
    if (query.search?.trim()) {
      const search = query.search.trim();
      and.push({ OR: [
        { customer_name: { contains: search } },
        { subscription_number: { contains: search } },
        { member: { member_code: { contains: search } } },
        { private_trainer: { name: { contains: search } } },
        { private_package: { name: { contains: search } } },
      ] });
    }
    if (query.status && query.status !== 'all') {
      const today = localDateString();
      if (query.status === 'frozen') and.push({ status: 'frozen' });
      else if (query.status === 'upcoming') and.push({ subscription_start_date: { gt: today }, status: { not: 'frozen' } });
      else if (query.status === 'expired') and.push({ subscription_end_date: { lt: today }, status: { not: 'frozen' } });
      else and.push({ subscription_start_date: { lte: today }, subscription_end_date: { gte: today }, status: { not: 'frozen' } });
    }
    const where: Prisma.club_subscriptionsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        include: {
          member: { select: { member_code: true, name: true, gender: true } },
          private_package: true,
          private_trainer: { select: { id: true, name: true } },
          receipts: {
            orderBy: { id: 'asc' },
            select: {
              receipt_number: true,
              payments: { orderBy: { id: 'asc' }, select: { method: true } },
            },
          },
        },
        orderBy: { id: query.order }, skip: query.skip, take: query.take,
      }),
      this.prisma.club_subscriptions.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((row) => row.created_by).filter((id): id is number => id != null))];
    const users = userIds.length ? await this.prisma.users.findMany({
      where: { user_id: { in: userIds } }, select: { user_id: true, name: true },
    }) : [];
    const userNames = new Map(users.map((item) => [item.user_id, item.name]));
    return paginated(
      rows.map((row) => this.mapEnrollment(row, row.created_by ? userNames.get(row.created_by) ?? null : null)),
      total, query.page, query.pageSize,
    );
  }

  private mapEnrollment(row: Prisma.club_subscriptionsGetPayload<{
    include: {
      member: { select: { member_code: true; name: true; gender: true } };
      private_package: true;
      private_trainer: { select: { id: true; name: true } };
      receipts: {
        select: {
          receipt_number: true;
          payments: { select: { method: true } };
        };
      };
    };
  }>, createdByName: string | null) {
    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      memberId: row.member_id,
      memberCode: row.member?.member_code ?? null,
      memberName: row.member?.name ?? row.customer_name,
      trainerId: row.private_trainer?.id ?? null,
      trainerName: row.private_trainer?.name ?? null,
      packageId: row.private_package_id,
      packageKind: row.is_linked_to_sessions ? 'sessions' : 'subscription',
      // The subscription row is the immutable commercial snapshot. Renaming a catalog package
      // must not rewrite the historical package name shown on old enrollments.
      subscriptionType: row.subscription_type ?? row.private_package?.name ?? null,
      registrationDate: row.registration_date,
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      sessionsRemaining: row.sessions_count == null ? null : Math.max(0, row.sessions_count - row.sessions_used),
      subscriptionValue: toNum(row.subscription_value),
      discountType: row.private_discount_type,
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      remainingAmount: toNum(row.remaining_amount),
      receiptNumber: row.receipt_number ?? row.receipts[0]?.receipt_number ?? null,
      // Most legacy private rows did not snapshot gender; use the linked member's real gender
      // instead of letting the UI invent a male value for NULL.
      gender: row.gender ?? row.member?.gender ?? null,
      paymentMethod: row.payment_method,
      paymentMethods: row.receipts[0]?.payments.map((payment) => payment.method) ?? [],
      branchId: row.branch_id,
      createdByUserId: row.created_by,
      createdByName,
      status: row.status === 'frozen' ? 'frozen' : deriveSessionAwareStatus({
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
        isLinkedToSessions: row.is_linked_to_sessions,
        sessionsCount: row.sessions_count,
        sessionsUsed: row.sessions_used,
      }),
      createdAt: row.created_at,
    };
  }
}
