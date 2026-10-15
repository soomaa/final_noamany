import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListCategoriesDto, UpsertCategoryDto } from './dto/inventory.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_categoriesGetPayload<{ include: { parent: true } }>) {
    return {
      id: row.id,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      emoji: row.emoji,
      description: row.description,
      parentCategoryId: row.parent_category_id,
      sortOrder: row.sort_order,
      isActive: row.is_active && !row.is_deleted,
      parent: row.parent ? { id: row.parent.id, nameAr: row.parent.name_ar, nameEn: row.parent.name_en } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListCategoriesDto) {
    const and: Prisma.inv_categoriesWhereInput[] = [];
    if (q.status === 'active') {
      and.push({ ...notDeletedFilter(), is_active: true });
    } else if (q.status === 'inactive') {
      // Include categories archived by the former soft-delete action so they can
      // be restored instead of remaining hidden forever.
      and.push({
        OR: [
          { is_deleted: true },
          { ...notDeletedFilter(), is_active: false },
        ],
      });
    } else {
      and.push(notDeletedFilter());
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { name_en: { contains: s } }] });
    }
    if (q.parentId === 'null') and.push({ parent_category_id: null });
    else if (q.parentId && q.parentId !== 'all') and.push({ parent_category_id: Number(q.parentId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_categories.findMany({
        where,
        include: { parent: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_categories.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async root() {
    const rows = await this.prisma.inv_categories.findMany({
      where: { parent_category_id: null, ...notDeletedFilter() },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.map({ ...r, parent: null }));
  }

  async children(id: number) {
    const rows = await this.prisma.inv_categories.findMany({
      where: { parent_category_id: id, ...notDeletedFilter() },
      include: { parent: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_categories.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { parent: true },
    });
    if (!row) throw new NotFoundException('التصنيف غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertCategoryDto) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم التصنيف مطلوب');
    const lastCategory = await this.prisma.inv_categories.findFirst({
      where: { ...notDeletedFilter() },
      orderBy: [{ sort_order: 'desc' }, { id: 'desc' }],
      select: { sort_order: true },
    });
    const row = await this.prisma.inv_categories.create({
      data: {
        name_ar: dto.nameAr.trim(),
        name_en: dto.nameEn.trim(),
        emoji: dto.emoji?.trim() || 'icon:utensils',
        description: dto.description ?? null,
        parent_category_id: dto.parentCategoryId ?? null,
        sort_order: (lastCategory?.sort_order ?? -1) + 1,
        is_active: dto.isActive ?? true,
      },
      include: { parent: true },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertCategoryDto>) {
    const existing = await this.prisma.inv_categories.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('التصنيف غير موجود');
    const row = await this.prisma.inv_categories.update({
      where: { id },
      data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
        ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() } : {}),
        ...(dto.emoji !== undefined ? { emoji: dto.emoji.trim() || 'icon:utensils' } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.parentCategoryId !== undefined ? { parent_category_id: dto.parentCategoryId ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
      include: { parent: true },
    });
    return this.map(row);
  }

  async updateStatus(id: number, isActive: boolean) {
    const existing = await this.prisma.inv_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التصنيف غير موجود');
    const row = await this.prisma.inv_categories.update({
      where: { id },
      data: {
        is_active: isActive,
        // Activating also restores categories archived by the previous delete behavior.
        is_deleted: false,
      },
      include: { parent: true },
    });
    return this.map(row);
  }

  async updateOrder(categoryIds: number[]) {
    const ids = [...new Set(categoryIds)];
    if (ids.length !== categoryIds.length) throw new BadRequestException('تكرار غير صالح في ترتيب الفئات');
    if (!ids.length) return { success: true };

    const categories = await this.prisma.inv_categories.findMany({
      where: { id: { in: ids }, ...notDeletedFilter() },
      select: { id: true },
    });
    if (categories.length !== ids.length) throw new BadRequestException('تتضمن القائمة فئة غير متاحة للترتيب');

    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.inv_categories.update({
        where: { id },
        data: { sort_order: sortOrder },
      })),
    );
    return { success: true };
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_categories.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
            products: true,
            cafe_products: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('التصنيف غير موجود');
    if (existing.is_active && !existing.is_deleted) {
      throw new BadRequestException('عطّل الفئة وانقلها إلى الأرشيف قبل الحذف النهائي');
    }
    if (existing._count.children || existing._count.products || existing._count.cafe_products) {
      throw new BadRequestException('لا يمكن حذف الفئة نهائيًا لأنها مستخدمة. اتركها في الأرشيف.');
    }
    await this.prisma.inv_categories.delete({ where: { id } });
    return { success: true };
  }
}
