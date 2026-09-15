import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter } from './inventory.utils';
import { ListUnitTemplatesDto, UpsertUnitTemplateDto } from './dto/inventory.dto';

@Injectable()
export class UnitTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_unit_templatesGetPayload<{ include: { conversions: true } }>) {
    return {
      id: row.id,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      code: row.code,
      description: row.description,
      baseUnit: row.base_unit,
      category: row.category,
      usageCount: row.usage_count,
      isActive: row.is_active,
      conversions: row.conversions.map((c) => ({
        id: c.id,
        fromUnit: c.from_unit,
        toUnit: c.to_unit,
        factor: Number(c.factor),
        formula: c.formula,
        sortOrder: c.sort_order,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListUnitTemplatesDto) {
    const and: Prisma.inv_unit_templatesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { code: { contains: s } }] });
    }
    if (q.category && q.category !== 'all') and.push({ category: q.category });
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_unit_templates.findMany({
        where,
        include: { conversions: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_unit_templates.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async active() {
    const rows = await this.prisma.inv_unit_templates.findMany({
      where: { is_active: true, ...notDeletedFilter() },
      include: { conversions: true },
      orderBy: { name_ar: 'asc' },
    });
    return rows.map((r) => this.map(r));
  }

  async byCategory(category: string) {
    const rows = await this.prisma.inv_unit_templates.findMany({
      where: { category, ...notDeletedFilter() },
      include: { conversions: true },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_unit_templates.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { conversions: true },
    });
    if (!row) throw new NotFoundException('قالب الوحدة غير موجود');
    return this.map(row);
  }

  private async generateCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_unit_templates WHERE code LIKE 'UNT%'
    `;
    return `UNT${String((rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  async create(dto: UpsertUnitTemplateDto) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم القالب مطلوب');
    const row = await this.prisma.$transaction(async (tx) => {
      return tx.inv_unit_templates.create({
        data: {
          name_ar: dto.nameAr.trim(),
          name_en: dto.nameEn.trim(),
          code: dto.code?.trim() || (await this.generateCode()),
          description: dto.description ?? null,
          base_unit: dto.baseUnit ?? null,
          category: dto.category ?? 'general',
          is_active: dto.isActive ?? true,
          conversions: dto.conversions?.length
            ? {
                create: dto.conversions.map((c, idx) => ({
                  from_unit: c.fromUnit,
                  to_unit: c.toUnit,
                  factor: c.factor,
                  formula: c.formula ?? null,
                  sort_order: c.sortOrder ?? idx,
                })),
              }
            : undefined,
        },
        include: { conversions: true },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertUnitTemplateDto>) {
    const existing = await this.prisma.inv_unit_templates.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('قالب الوحدة غير موجود');

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.conversions) {
        await tx.inv_unit_conversions.deleteMany({ where: { template_id: id } });
      }
      return tx.inv_unit_templates.update({
        where: { id },
        data: {
          ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
          ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
          ...(dto.baseUnit !== undefined ? { base_unit: dto.baseUnit ?? null } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          ...(dto.conversions
            ? {
                conversions: {
                  create: dto.conversions.map((c, idx) => ({
                    from_unit: c.fromUnit,
                    to_unit: c.toUnit,
                    factor: c.factor,
                    formula: c.formula ?? null,
                    sort_order: c.sortOrder ?? idx,
                  })),
                },
              }
            : {}),
        },
        include: { conversions: true },
      });
    });
    return this.map(row);
  }

  async incrementUsage(id: number) {
    await this.findOne(id);
    const row = await this.prisma.inv_unit_templates.update({
      where: { id },
      data: { usage_count: { increment: 1 } },
      include: { conversions: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_unit_templates.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('قالب الوحدة غير موجود');
    await this.prisma.inv_unit_templates.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
