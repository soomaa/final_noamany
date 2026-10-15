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
    created_at: Date;
    updated_at: Date;
    _count?: { subscriptions: number; locker_subscriptions: number };
  }) {
    return {
      id: row.id,
      code: row.code,
      percentage: toNum(row.percentage),
      isActive: row.is_active,
      usageCount:
        (row._count?.subscriptions ?? 0) + (row._count?.locker_subscriptions ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(includeInactive = false) {
    const rows = await this.prisma.club_discount_codes.findMany({
      where: includeInactive ? {} : { is_active: true },
      include: { _count: { select: { subscriptions: true, locker_subscriptions: true } } },
      orderBy: [{ is_active: 'desc' }, { code: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(dto: CreateClubDiscountCodeDto, createdBy?: number) {
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('اسم كود الخصم مطلوب');
    const duplicate = await this.prisma.club_discount_codes.findUnique({ where: { code } });
    if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    const row = await this.prisma.club_discount_codes.create({
      data: {
        code,
        percentage: dto.percentage,
        is_active: dto.isActive ?? true,
        created_by: createdBy ?? null,
      },
      include: { _count: { select: { subscriptions: true, locker_subscriptions: true } } },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpdateClubDiscountCodeDto) {
    const existing = await this.prisma.club_discount_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== existing.code) {
      const duplicate = await this.prisma.club_discount_codes.findUnique({ where: { code } });
      if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    }
    const row = await this.prisma.club_discount_codes.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        ...(dto.percentage !== undefined ? { percentage: dto.percentage } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
      include: { _count: { select: { subscriptions: true, locker_subscriptions: true } } },
    });
    return this.map(row);
  }

  async deactivate(id: number) {
    const existing = await this.prisma.club_discount_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const row = await this.prisma.club_discount_codes.update({
      where: { id },
      data: { is_active: false },
      include: { _count: { select: { subscriptions: true, locker_subscriptions: true } } },
    });
    return this.map(row);
  }

  async resolveDiscount(
    input: {
      subscriptionValue: number;
      discountCodeId?: number | null;
      discountEnabled?: boolean;
      discountValue?: number | null;
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
      });
      if (!code || !code.is_active) throw new BadRequestException('كود الخصم غير موجود أو غير فعال');
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
}

