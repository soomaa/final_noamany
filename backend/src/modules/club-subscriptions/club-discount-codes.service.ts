import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { roundMoney, toNum } from './club-subscription.utils';
import {
  CreateClubDiscountCodeDto,
  UpdateClubDiscountCodeDto,
} from './dto/club-discount-code.dto';

type DiscountClient = PrismaService | Prisma.TransactionClient;

export interface ResolvedClubDiscount {
  discountEnabled: boolean;
  discountCodeId: number | null;
  discountPercentage: number | null;
  discountValue: number;
}

@Injectable()
export class ClubDiscountCodesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number;
    code: string;
    percentage: unknown;
    is_active: boolean;
    max_uses?: number | null;
    valid_from?: string | null;
    valid_to?: string | null;
    audience?: string;
    created_at: Date;
    updated_at: Date;
    _count?: { subscriptions: number; locker_subscriptions: number };
    members?: Array<{ member_id: number }>;
  }) {
    return {
      id: row.id,
      code: row.code,
      percentage: toNum(row.percentage),
      isActive: row.is_active,
      maxUses: row.max_uses ?? null,
      validFrom: row.valid_from ?? null,
      validTo: row.valid_to ?? null,
      audience: row.audience ?? 'all_users',
      memberIds: row.members?.map((item) => item.member_id) ?? [],
      usageCount:
        (row._count?.subscriptions ?? 0) + (row._count?.locker_subscriptions ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(includeInactive = false) {
    const rows = await this.prisma.club_discount_codes.findMany({
      where: includeInactive ? {} : { is_active: true },
      include: {
        members: { select: { member_id: true } },
        _count: { select: { subscriptions: true, locker_subscriptions: true } },
      },
      orderBy: [{ is_active: 'desc' }, { code: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(dto: CreateClubDiscountCodeDto, createdBy?: number) {
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('اسم كود الخصم مطلوب');
    const duplicate = await this.prisma.club_discount_codes.findUnique({ where: { code } });
    if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    this.validateSettings(dto);
    const row = await this.prisma.club_discount_codes.create({
      data: {
        code,
        percentage: dto.percentage,
        is_active: dto.isActive ?? true,
        max_uses: dto.maxUses ?? null,
        valid_from: dto.validFrom ?? null,
        valid_to: dto.validTo ?? null,
        audience: dto.audience ?? 'all_users',
        members: dto.audience === 'specific_users' && dto.memberIds?.length
          ? { create: [...new Set(dto.memberIds)].map((member_id) => ({ member_id })) }
          : undefined,
        created_by: createdBy ?? null,
      },
      include: {
        members: { select: { member_id: true } },
        _count: { select: { subscriptions: true, locker_subscriptions: true } },
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpdateClubDiscountCodeDto) {
    const existing = await this.prisma.club_discount_codes.findUnique({
      where: { id },
      include: { members: { select: { member_id: true } } },
    });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== existing.code) {
      const duplicate = await this.prisma.club_discount_codes.findUnique({ where: { code } });
      if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    }
    const audience = dto.audience ?? existing.audience;
    const effectiveMemberIds = dto.memberIds ??
      (audience === 'specific_users' && existing.audience === 'specific_users'
        ? existing.members.map((item) => item.member_id)
        : []);
    this.validateSettings({
      validFrom: dto.validFrom === undefined ? existing.valid_from : dto.validFrom,
      validTo: dto.validTo === undefined ? existing.valid_to : dto.validTo,
      audience: audience as 'all_users' | 'specific_users',
      memberIds: effectiveMemberIds,
    });
    const row = await this.prisma.club_discount_codes.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        ...(dto.percentage !== undefined ? { percentage: dto.percentage } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        ...(dto.maxUses !== undefined ? { max_uses: dto.maxUses } : {}),
        ...(dto.validFrom !== undefined ? { valid_from: dto.validFrom } : {}),
        ...(dto.validTo !== undefined ? { valid_to: dto.validTo } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.memberIds !== undefined || dto.audience !== undefined ? {
          members: {
            deleteMany: {},
            ...(audience === 'specific_users' && dto.memberIds?.length
              ? { create: [...new Set(dto.memberIds)].map((member_id) => ({ member_id })) }
              : {}),
          },
        } : {}),
      },
      include: {
        members: { select: { member_id: true } },
        _count: { select: { subscriptions: true, locker_subscriptions: true } },
      },
    });
    return this.map(row);
  }

  async deactivate(id: number) {
    const existing = await this.prisma.club_discount_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const row = await this.prisma.club_discount_codes.update({
      where: { id },
      data: { is_active: false },
      include: {
        members: { select: { member_id: true } },
        _count: { select: { subscriptions: true, locker_subscriptions: true } },
      },
    });
    return this.map(row);
  }

  async resolveDiscount(
    input: {
      subscriptionValue: number;
      discountCodeId?: number | null;
      discountEnabled?: boolean;
      discountValue?: number | null;
      memberId?: number | null;
    },
    client: DiscountClient = this.prisma,
  ): Promise<ResolvedClubDiscount> {
    const subscriptionValue = roundMoney(input.subscriptionValue);
    if (!Number.isFinite(subscriptionValue) || subscriptionValue < 0) {
      throw new BadRequestException('قيمة الاشتراك غير صالحة');
    }

    if (input.discountCodeId != null) {
      const code = await client.club_discount_codes.findUnique({
        where: { id: input.discountCodeId },
        include: {
          members: { select: { member_id: true } },
          _count: { select: { subscriptions: true, locker_subscriptions: true } },
        },
      });
      if (!code || !code.is_active) throw new BadRequestException('كود الخصم غير موجود أو غير فعال');
      const today = new Date().toISOString().slice(0, 10);
      if ((code.valid_from && today < code.valid_from) || (code.valid_to && today > code.valid_to)) {
        throw new BadRequestException('كود الخصم غير ساري في التاريخ الحالي');
      }
      const usageCount = (code._count?.subscriptions ?? 0) + (code._count?.locker_subscriptions ?? 0);
      if (code.max_uses != null && usageCount >= code.max_uses) {
        throw new BadRequestException('تم استنفاد عدد استخدامات كود الخصم');
      }
      if (code.audience === 'specific_users' && (!input.memberId || !code.members?.some((item) => item.member_id === input.memberId))) {
        throw new BadRequestException('كود الخصم غير متاح لهذا العضو');
      }
      const percentage = toNum(code.percentage);
      const discountValue = roundMoney((subscriptionValue * percentage) / 100);
      return {
        discountEnabled: discountValue > 0,
        discountCodeId: code.id,
        discountPercentage: percentage,
        discountValue,
      };
    }

    if (!input.discountEnabled) {
      return {
        discountEnabled: false,
        discountCodeId: null,
        discountPercentage: null,
        discountValue: 0,
      };
    }

    const discountValue = roundMoney(Number(input.discountValue) || 0);
    if (discountValue < 0 || discountValue > subscriptionValue) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    return {
      discountEnabled: discountValue > 0,
      discountCodeId: null,
      discountPercentage: null,
      discountValue,
    };
  }

  private validateSettings(input: {
    validFrom?: string | null;
    validTo?: string | null;
    audience?: 'all_users' | 'specific_users';
    memberIds?: number[];
  }) {
    if (input.validFrom && input.validTo && input.validFrom > input.validTo) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
    if (input.audience === 'specific_users' && !input.memberIds?.length) {
      throw new BadRequestException('اختر عضوًا واحدًا على الأقل');
    }
  }
}
