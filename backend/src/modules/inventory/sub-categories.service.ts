import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListSubCategoriesDto, UpsertSubCategoryDto } from './dto/inventory.dto';

@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_sub_categoriesGetPayload<{ include: { main_category: true } }>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      mainCategoryId: row.main_category_id,
      image: row.image,
      isActive: row.is_active,
      mainCategory: row.main_category ? { id: row.main_category.id, name: row.main_category.name } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSubCategoriesDto) {
    const and: Prisma.inv_sub_categoriesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) and.push({ name: { contains: q.search.trim() } });
    if (q.mainCategoryId && q.mainCategoryId !== 'all') and.push({ main_category_id: Number(q.mainCategoryId) });
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_sub_categories.findMany({
        where,
        include: { main_category: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_sub_categories.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async byMain(mainId: number) {
    const rows = await this.prisma.inv_sub_categories.findMany({
      where: { main_category_id: mainId, ...notDeletedFilter() },
      include: { main_category: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_sub_categories.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { main_category: true },
    });
    if (!row) throw new NotFoundException('التصنيف الفرعي غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertSubCategoryDto) {
    if (!dto.name?.trim()) throw new BadRequestException('اسم التصنيف مطلوب');
    const main = await this.prisma.inv_main_categories.findFirst({
      where: { id: dto.mainCategoryId, ...notDeletedFilter() },
    });
    if (!main) throw new BadRequestException('التصنيف الرئيسي غير موجود');
    const row = await this.prisma.inv_sub_categories.create({
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        main_category_id: dto.mainCategoryId,
        image: dto.image ?? null,
        is_active: dto.isActive ?? true,
      },
      include: { main_category: true },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSubCategoryDto>) {
    const existing = await this.prisma.inv_sub_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('التصنيف الفرعي غير موجود');
    const row = await this.prisma.inv_sub_categories.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.mainCategoryId != null ? { main_category_id: dto.mainCategoryId } : {}),
        ...(dto.image !== undefined ? { image: dto.image ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
      include: { main_category: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_sub_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('التصنيف الفرعي غير موجود');
    await this.prisma.inv_sub_categories.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
