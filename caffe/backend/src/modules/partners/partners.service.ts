import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListPartnersDto, PartnerPhoneDto, UpsertPartnerDto } from './dto/partners.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePhones(phones: PartnerPhoneDto[]) {
    const unique = [...new Map(
      phones
        .filter((item) => item.phone?.trim())
        .map((item) => [item.phone.trim(), { ...item, phone: item.phone.trim() }]),
    ).values()];
    const selectedPrimary = unique.findIndex((item) => item.isPrimary);
    const primaryIndex = selectedPrimary >= 0 ? selectedPrimary : 0;
    return unique.map((item, index) => ({
      phone: item.phone,
      label: item.label?.trim() || null,
      is_primary: index === primaryIndex,
    }));
  }

  private map(row: Prisma.cafe_partnersGetPayload<{ include: { phones: true } }>) {
    const phones = [...row.phones]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id)
      .map((item) => ({ id: item.id, phone: item.phone, label: item.label, isPrimary: item.is_primary }));
    return {
      id: row.id,
      partnerCode: row.partner_code ?? `PRT-${String(row.id).padStart(5, '0')}`,
      name: row.name,
      nationalId: row.national_id,
      email: row.email,
      address: row.address,
      notes: row.notes,
      isActive: row.is_active,
      phones,
      primaryPhone: phones.find((item) => item.isPrimary)?.phone ?? row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private where(q: Pick<ListPartnersDto, 'search' | 'status'>): Prisma.cafe_partnersWhereInput {
    const where: Prisma.cafe_partnersWhereInput = {};
    if (q.status === 'active') where.is_active = true;
    if (q.status === 'inactive') where.is_active = false;
    const search = q.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { partner_code: { contains: search } },
        { national_id: { contains: search } },
        { phone: { contains: search } },
        { phones: { some: { phone: { contains: search } } } },
      ];
    }
    return where;
  }

  async list(q: ListPartnersDto) {
    const where = this.where(q);
    const [rows, total] = await Promise.all([
      this.prisma.cafe_partners.findMany({
        where,
        include: { phones: true },
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.cafe_partners.count({ where }),
    ]);
    return paginated(rows.map((row) => this.map(row)), total, q.page, q.pageSize);
  }

  async options(search?: string) {
    const rows = await this.prisma.cafe_partners.findMany({
      where: this.where({ search, status: 'active' }),
      include: { phones: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((row) => this.map(row));
  }

  async findOne(id: number) {
    const row = await this.prisma.cafe_partners.findUnique({ where: { id }, include: { phones: true } });
    if (!row) throw new NotFoundException('الشريك غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertPartnerDto, userId: number) {
    const phones = this.normalizePhones(dto.phones ?? []);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cafe_partners.create({
          data: {
            partner_code: dto.partnerCode?.trim() || null,
            name: dto.name.trim(),
            phone: phones.find((item) => item.is_primary)?.phone ?? phones[0]?.phone ?? null,
            national_id: dto.nationalId?.trim() || null,
            email: dto.email?.trim().toLowerCase() || null,
            address: dto.address?.trim() || null,
            notes: dto.notes?.trim() || null,
            is_active: dto.isActive ?? true,
            created_by: userId,
            phones: { create: phones },
          },
          include: { phones: true },
        });
        if (created.partner_code) return created;
        return tx.cafe_partners.update({
          where: { id: created.id },
          data: { partner_code: `PRT-${String(created.id).padStart(5, '0')}` },
          include: { phones: true },
        });
      });
      return this.map(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('كود الشريك أو رقم الهاتف مستخدم بالفعل');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpsertPartnerDto) {
    const existing = await this.prisma.cafe_partners.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الشريك غير موجود');
    const phones = this.normalizePhones(dto.phones ?? []);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.cafe_partner_phones.deleteMany({ where: { partner_id: id } });
        return tx.cafe_partners.update({
          where: { id },
          data: {
            partner_code: dto.partnerCode?.trim() || existing.partner_code || `PRT-${String(id).padStart(5, '0')}`,
            name: dto.name.trim(),
            phone: phones.find((item) => item.is_primary)?.phone ?? phones[0]?.phone ?? null,
            national_id: dto.nationalId?.trim() || null,
            email: dto.email?.trim().toLowerCase() || null,
            address: dto.address?.trim() || null,
            notes: dto.notes?.trim() || null,
            is_active: dto.isActive ?? existing.is_active,
            phones: { create: phones },
          },
          include: { phones: true },
        });
      });
      return this.map(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('كود الشريك أو رقم الهاتف مستخدم بالفعل');
      }
      throw error;
    }
  }

  async deactivate(id: number) {
    const existing = await this.prisma.cafe_partners.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الشريك غير موجود');
    const row = await this.prisma.cafe_partners.update({
      where: { id },
      data: { is_active: false },
      include: { phones: true },
    });
    return this.map(row);
  }
}
