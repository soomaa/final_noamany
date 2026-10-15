import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertCustomerSourceDto } from './dto/upsert-customer-source.dto';

interface ListCustomerSourcesQuery {
  includeInactive?: boolean;
}

@Injectable()
export class ClubCustomerSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListCustomerSourcesQuery = {}) {
    const rows = await this.prisma.club_customer_sources.findMany({
      where: q.includeInactive ? {} : { is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async create(dto: UpsertCustomerSourceDto) {
    const row = await this.prisma.club_customer_sources.create({
      data: {
        name: dto.name.trim(),
        is_active: dto.isActive ?? true,
      },
    });
    return {
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async update(id: number, dto: UpsertCustomerSourceDto) {
    const existing = await this.prisma.club_customer_sources.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('مصدر العميل غير موجود');
    const row = await this.prisma.club_customer_sources.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return {
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.club_customer_sources.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('مصدر العميل غير موجود');
    await this.prisma.club_customer_sources.delete({ where: { id } });
    return { success: true };
  }
}
