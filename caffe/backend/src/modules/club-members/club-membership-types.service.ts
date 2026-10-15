import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertMembershipTypeDto } from './dto/upsert-membership-type.dto';

@Injectable()
export class ClubMembershipTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number;
    name: string;
    description: string | null;
    price: { toNumber?: () => number } | number;
    duration_days: number;
    is_active: boolean;
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      durationDays: row.duration_days,
      isActive: row.is_active,
    };
  }

  async listActive() {
    const rows = await this.prisma.club_membership_types.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.club_membership_types.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('نوع العضوية غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertMembershipTypeDto) {
    const row = await this.prisma.club_membership_types.create({
      data: {
        name: dto.name.trim(),
        description: dto.description || null,
        price: dto.price,
        duration_days: dto.durationDays,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertMembershipTypeDto>) {
    await this.findOne(id);
    const row = await this.prisma.club_membership_types.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.price != null ? { price: dto.price } : {}),
        ...(dto.durationDays != null ? { duration_days: dto.durationDays } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_membership_types.delete({ where: { id } });
    return { success: true };
  }
}
