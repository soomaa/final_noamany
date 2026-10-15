import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListMainCategoriesDto, UpsertMainCategoryDto } from './dto/inventory.dto';

@Injectable()
export class MainCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_main_categoriesGetPayload<object>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      image: row.image,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListMainCategoriesDto) {
    const and: Prisma.inv_main_categoriesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) and.push({ name: { contains: q.search.trim() } });
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_main_categories.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_main_categories.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_main_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('التصنيف الرئيسي غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertMainCategoryDto) {
    if (!dto.name?.trim()) throw new BadRequestException('اسم التصنيف مطلوب');
    const row = await this.prisma.inv_main_categories.create({
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        image: dto.image ?? null,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertMainCategoryDto>) {
    const existing = await this.prisma.inv_main_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('التصنيف الرئيسي غير موجود');
    const row = await this.prisma.inv_main_categories.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.image !== undefined ? { image: dto.image ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_main_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('التصنيف الرئيسي غير موجود');
    await this.prisma.inv_main_categories.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
