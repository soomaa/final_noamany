import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ListSparePartsDto, UpsertSparePartDto } from './dto/inventory.dto';

@Injectable()
export class SparePartsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_spare_partsGetPayload<{ include: { main_category: true; sub_category: true } }>) {
    return {
      id: row.id,
      partCode: row.part_code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      mainCategoryId: row.main_category_id,
      subCategoryId: row.sub_category_id,
      warehouseId: row.warehouse_id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      brand: row.brand,
      partCondition: row.part_condition,
      costPrice: toNumber(row.cost_price),
      sellingPrice: row.selling_price != null ? toNumber(row.selling_price) : null,
      currentStock: toNumber(row.current_stock),
      minStock: row.min_stock,
      warrantyPeriod: row.warranty_period,
      status: row.status,
      mainCategory: row.main_category,
      subCategory: row.sub_category,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSparePartsDto) {
    const and: Prisma.inv_spare_partsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { part_code: { contains: s } }] });
    }
    if (q.mainCategoryId && q.mainCategoryId !== 'all') and.push({ main_category_id: Number(q.mainCategoryId) });
    if (q.subCategoryId && q.subCategoryId !== 'all') and.push({ sub_category_id: Number(q.subCategoryId) });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    let rows = await this.prisma.inv_spare_parts.findMany({
      where,
      include: { main_category: true, sub_category: true },
      orderBy: { id: 'desc' },
      skip: q.skip,
      take: q.take,
    });
    if (q.lowStock) rows = rows.filter((r) => toNumber(r.current_stock) <= r.min_stock);
    const total = await this.prisma.inv_spare_parts.count({ where });
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async byCode(code: string) {
    const row = await this.prisma.inv_spare_parts.findFirst({
      where: { part_code: code, ...notDeletedFilter() },
      include: { main_category: true, sub_category: true },
    });
    if (!row) throw new NotFoundException('قطعة الغيار غير موجودة');
    return this.map(row);
  }

  async lowStock() {
    const rows = await this.prisma.inv_spare_parts.findMany({
      where: notDeletedFilter(),
      include: { main_category: true, sub_category: true },
    });
    return rows.filter((r) => toNumber(r.current_stock) <= r.min_stock).map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_spare_parts.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { main_category: true, sub_category: true },
    });
    if (!row) throw new NotFoundException('قطعة الغيار غير موجودة');
    return this.map(row);
  }

  private async generatePartCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(part_code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_spare_parts WHERE part_code LIKE 'SPR%'
    `;
    return `SPR${String((rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  async create(dto: UpsertSparePartDto) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم قطعة الغيار مطلوب');
    const row = await this.prisma.inv_spare_parts.create({
      data: {
        part_code: dto.partCode?.trim() || (await this.generatePartCode()),
        name_ar: dto.nameAr.trim(),
        name_en: dto.nameEn.trim(),
        main_category_id: dto.mainCategoryId,
        sub_category_id: dto.subCategoryId,
        warehouse_id: dto.warehouseId ?? null,
        supplier_id: dto.supplierId ?? null,
        branch_id: dto.branchId ?? null,
        brand: dto.brand ?? null,
        part_condition: dto.partCondition ?? 'new',
        cost_price: dto.costPrice ?? 0,
        selling_price: dto.sellingPrice ?? null,
        current_stock: dto.currentStock ?? 0,
        min_stock: dto.minStock ?? 0,
        warranty_period: dto.warrantyPeriod ?? null,
        status: dto.status ?? 'active',
      },
      include: { main_category: true, sub_category: true },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSparePartDto>) {
    const existing = await this.prisma.inv_spare_parts.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('قطعة الغيار غير موجودة');
    const row = await this.prisma.inv_spare_parts.update({
      where: { id },
      data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
        ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() } : {}),
        ...(dto.mainCategoryId != null ? { main_category_id: dto.mainCategoryId } : {}),
        ...(dto.subCategoryId != null ? { sub_category_id: dto.subCategoryId } : {}),
        ...(dto.costPrice !== undefined ? { cost_price: dto.costPrice } : {}),
        ...(dto.sellingPrice !== undefined ? { selling_price: dto.sellingPrice ?? null } : {}),
        ...(dto.currentStock !== undefined ? { current_stock: dto.currentStock } : {}),
        ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { main_category: true, sub_category: true },
    });
    return this.map(row);
  }

  async updateStock(id: number, currentStock: number) {
    await this.findOne(id);
    const row = await this.prisma.inv_spare_parts.update({
      where: { id },
      data: { current_stock: currentStock },
      include: { main_category: true, sub_category: true },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_spare_parts.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('قطعة الغيار غير موجودة');
    await this.prisma.inv_spare_parts.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
