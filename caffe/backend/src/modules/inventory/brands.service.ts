import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListBrandsDto, UpsertBrandDto } from './dto/inventory.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_brandsGetPayload<object>) {
    return {
      id: row.id,
      nameAr: row.name_ar, nameEn: row.name_en, logoUrl: row.logo_url, description: row.description, website: row.website, isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListBrandsDto) {
    const and: Prisma.inv_brandsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { name_en: { contains: s } }] });
    }
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where: Prisma.inv_brandsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_brands.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_brands.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_brands.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('العلامة التجارية غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertBrandDto) {
    const row = await this.prisma.inv_brands.create({ data: { name_ar: dto.nameAr, name_en: dto.nameEn, logo_url: dto.logoUrl ?? null, description: dto.description ?? null, website: dto.website ?? null, is_active: dto.isActive ?? true } });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertBrandDto>) {
    const existing = await this.prisma.inv_brands.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('العلامة التجارية غير موجود');
    const row = await this.prisma.inv_brands.update({ where: { id }, data: { ...(dto.nameAr != null ? { name_ar: dto.nameAr } : {}), ...(dto.nameEn != null ? { name_en: dto.nameEn } : {}), ...(dto.logoUrl !== undefined ? { logo_url: dto.logoUrl ?? null } : {}), ...(dto.description !== undefined ? { description: dto.description ?? null } : {}), ...(dto.website !== undefined ? { website: dto.website ?? null } : {}), ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}) } });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_brands.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('العلامة التجارية غير موجود');
    await this.prisma.inv_brands.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
