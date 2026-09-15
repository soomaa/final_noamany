import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertExpenseCategoryDto } from './dto/finance.dto';

/** CRUD for the flexible expense types (أنواع المصروفات) that drive the expense picker. */
@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(activeOnly?: boolean) {
    const rows = await this.prisma.fin_expense_categories.findMany({
      where: activeOnly ? { is_active: true } : undefined,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async create(dto: UpsertExpenseCategoryDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('اسم نوع المصروف مطلوب');
    const dup = await this.prisma.fin_expense_categories.findUnique({ where: { name } });
    if (dup) throw new BadRequestException('نوع المصروف موجود مسبقًا');
    const row = await this.prisma.fin_expense_categories.create({
      data: { name, is_active: dto.isActive ?? true, sort_order: dto.sortOrder ?? 0 },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpsertExpenseCategoryDto) {
    const existing = await this.prisma.fin_expense_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نوع المصروف غير موجود');
    const name = dto.name?.trim() || existing.name;
    if (name !== existing.name) {
      const dup = await this.prisma.fin_expense_categories.findFirst({
        where: { name, id: { not: id } },
      });
      if (dup) throw new BadRequestException('نوع المصروف موجود مسبقًا');
    }
    const row = await this.prisma.fin_expense_categories.update({
      where: { id },
      data: {
        name,
        is_active: dto.isActive ?? existing.is_active,
        sort_order: dto.sortOrder ?? existing.sort_order,
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.fin_expense_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نوع المصروف غير موجود');
    if (existing.is_system) {
      throw new BadRequestException('لا يمكن حذف نوع مُدار بواسطة النظام');
    }
    await this.prisma.fin_expense_categories.delete({ where: { id } });
    return { ok: true };
  }

  private map(r: {
    id: number;
    name: string;
    is_active: boolean;
    sort_order: number;
    is_system: boolean;
    created_at: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      sortOrder: r.sort_order,
      isSystem: r.is_system,
      createdAt: r.created_at,
    };
  }
}
