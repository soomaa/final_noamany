import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListManufacturersDto, UpsertManufacturerDto } from './dto/inventory.dto';

@Injectable()
export class ManufacturersService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_manufacturersGetPayload<object>) {
    return {
      id: row.id,
      nameAr: row.name_ar, nameEn: row.name_en, contactPerson: row.contact_person, email: row.email, phone: row.phone, address: row.address, website: row.website, isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListManufacturersDto) {
    const and: Prisma.inv_manufacturersWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { name_en: { contains: s } }] });
    }
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where: Prisma.inv_manufacturersWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_manufacturers.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_manufacturers.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_manufacturers.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('الشركة المصنعة غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertManufacturerDto) {
    const row = await this.prisma.inv_manufacturers.create({ data: { name_ar: dto.nameAr, name_en: dto.nameEn, contact_person: dto.contactPerson ?? null, email: dto.email ?? null, phone: dto.phone ?? null, address: dto.address ?? null, website: dto.website ?? null, is_active: dto.isActive ?? true } });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertManufacturerDto>) {
    const existing = await this.prisma.inv_manufacturers.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('الشركة المصنعة غير موجود');
    const row = await this.prisma.inv_manufacturers.update({ where: { id }, data: { ...(dto.nameAr != null ? { name_ar: dto.nameAr } : {}), ...(dto.nameEn != null ? { name_en: dto.nameEn } : {}), ...(dto.contactPerson !== undefined ? { contact_person: dto.contactPerson ?? null } : {}), ...(dto.email !== undefined ? { email: dto.email ?? null } : {}), ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}), ...(dto.address !== undefined ? { address: dto.address ?? null } : {}), ...(dto.website !== undefined ? { website: dto.website ?? null } : {}), ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}) } });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_manufacturers.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('الشركة المصنعة غير موجود');
    await this.prisma.inv_manufacturers.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
