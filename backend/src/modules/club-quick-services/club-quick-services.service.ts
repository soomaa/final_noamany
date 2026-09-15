import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { toNum } from '../club-subscriptions/club-subscription.utils';
import { ClubReceiptsCrudService } from '../club-subscriptions/club-receipts-crud.service';
import {
  ListClubQuickServicesDto,
  SellClubQuickServiceDto,
  UpsertClubQuickServiceDto,
} from './dto/club-quick-services.dto';

@Injectable()
export class ClubQuickServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsCrudService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** A service with no branch belongs to every branch; a scoped one only to branches the user sees. */
  private branchWhere(
    user?: JwtUser,
    branchId?: number,
  ): Prisma.club_quick_servicesWhereInput | null {
    if (!user || user.level === 1) {
      return branchId != null ? { OR: [{ branch_id: null }, { branch_id: branchId }] } : null;
    }
    const ownBranch = Number(user.branch ?? 0);
    if (branchId != null && branchId !== ownBranch) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    return ownBranch
      ? { OR: [{ branch_id: null }, { branch_id: ownBranch }] }
      : { id: -1 };
  }

  private async assertNameAvailable(name: string, branchId: number | null, excludeId?: number) {
    const clash = await this.prisma.club_quick_services.findFirst({
      where: {
        name: name.trim(),
        branch_id: branchId,
        is_active: true,
        ...(excludeId != null ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('يوجد خدمة سريعة بنفس الاسم على نفس الفرع');
  }

  private mapRow(r: {
    id: number;
    name: string;
    description: string | null;
    price: unknown;
    branch_id: number | null;
    sort_order: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      price: toNum(r.price),
      branchId: r.branch_id,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async catalog(user?: JwtUser, branchId?: number) {
    const branchWhere = this.branchWhere(user, branchId);
    const where: Prisma.club_quick_servicesWhereInput = {
      is_active: true,
      ...(branchWhere ?? {}),
    };
    const rows = await this.prisma.club_quick_services.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.mapRow(r));
  }

  async list(q: ListClubQuickServicesDto, user?: JwtUser) {
    const branchWhere = this.branchWhere(user, q.branchId);
    const where: Prisma.club_quick_servicesWhereInput = { ...(branchWhere ?? {}) };
    if (q.activeOnly) where.is_active = true;
    if (q.search?.trim()) where.name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.club_quick_services.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_quick_services.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapRow(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.club_quick_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الخدمة السريعة غير موجودة');
    return this.mapRow(row);
  }

  async create(body: UpsertClubQuickServiceDto, user?: JwtUser) {
    const branchId = body.branchId ?? null;
    if (branchId != null && !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    await this.assertNameAvailable(body.name, branchId);
    const row = await this.prisma.club_quick_services.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        price: body.price,
        branch_id: branchId,
        sort_order: body.sortOrder ?? 0,
        is_active: body.isActive !== false,
      },
    });
    return this.mapRow(row);
  }

  async update(id: number, body: UpsertClubQuickServiceDto, user?: JwtUser) {
    await this.findOne(id);
    const branchId = body.branchId ?? null;
    if (branchId != null && !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    await this.assertNameAvailable(body.name, branchId, id);
    const row = await this.prisma.club_quick_services.update({
      where: { id },
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        price: body.price,
        branch_id: branchId,
        sort_order: body.sortOrder ?? 0,
        ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      },
    });
    return this.mapRow(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_quick_services.update({
      where: { id },
      data: { is_active: false },
    });
    return { ok: true };
  }

  async sell(body: SellClubQuickServiceDto, user?: JwtUser) {
    const service = await this.prisma.club_quick_services.findFirst({
      where: { id: body.serviceId, is_active: true },
    });
    if (!service) throw new NotFoundException('الخدمة السريعة غير موجودة أو غير نشطة');

    let memberName = body.memberName?.trim() || '';
    const memberId = body.memberId ?? null;
    let branchId = body.branchId ?? service.branch_id ?? undefined;

    if (memberId != null) {
      const member = await this.prisma.club_members.findFirst({
        where: { id: memberId, is_deleted: false },
        select: { id: true, name: true, branch_id: true },
      });
      if (!member) throw new BadRequestException('العضو غير موجود');
      memberName = member.name;
      branchId = member.branch_id;
    }

    // A walk-in has no member and the service may serve all branches — bill it to the desk the
    // cashier is signed in at, otherwise the sale would post without a branch (no GL, no report).
    if (branchId == null) branchId = user?.branch || undefined;
    if (branchId == null) {
      throw new BadRequestException('تعذر تحديد الفرع — حدد فرعًا للخدمة أو للمستخدم');
    }
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }

    if (!memberName) {
      memberName = 'عميل نقدي';
    }

    const amount = toNum(service.price);
    if (amount <= 0) throw new BadRequestException('سعر الخدمة غير صالح');

    const description = [
      `خدمة سريعة: ${service.name}`,
      body.notes?.trim() || null,
    ]
      .filter(Boolean)
      .join(' — ');

    const receipt = await this.receipts.create(
      {
        memberName,
        memberId: memberId ?? undefined,
        branchId,
        amount,
        type: 'quick_service',
        paymentMethod: body.paymentMethod,
        payments: body.payments,
        description,
      },
      user,
    );

    return {
      receipt,
      service: this.mapRow(service),
      branchId,
    };
  }
}
