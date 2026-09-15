import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ListPaymentTermsDto,
  ListSupplierCategoriesDto,
  ListSupplyRegionsDto,
  UpsertPaymentTermDto,
  UpsertSupplierCategoryDto,
  UpsertSupplyRegionDto,
} from './dto/procurement-ext.dto';
import { toNumber } from './procurement.utils';

@Injectable()
export class SupplierSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Supplier Categories ---

  async listCategories(q: ListSupplierCategoriesDto) {
    const and: Prisma.prc_supplier_categoriesWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { description: { contains: s } }] });
    }
    if (q.active === 'true') and.push({ active: true });
    if (q.active === 'false') and.push({ active: false });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.prc_supplier_categories.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supplier_categories.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapCategory(r)), total, q.page, q.pageSize);
  }

  async listActiveCategories() {
    const rows = await this.prisma.prc_supplier_categories.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.mapCategory(r));
  }

  async findCategory(id: number) {
    const row = await this.prisma.prc_supplier_categories.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('تصنيف المورد غير موجود');
    return this.mapCategory(row);
  }

  async createCategory(dto: UpsertSupplierCategoryDto) {
    const row = await this.prisma.prc_supplier_categories.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        color: dto.color ?? null,
        active: dto.active ?? true,
      },
    });
    return this.mapCategory(row);
  }

  async updateCategory(id: number, dto: Partial<UpsertSupplierCategoryDto>) {
    await this.findCategory(id);
    const row = await this.prisma.prc_supplier_categories.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.color !== undefined ? { color: dto.color ?? null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.mapCategory(row);
  }

  async removeCategory(id: number) {
    await this.findCategory(id);
    await this.prisma.prc_supplier_categories.delete({ where: { id } });
    return { success: true };
  }

  private mapCategory(row: Prisma.prc_supplier_categoriesGetPayload<object>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- Supply Regions ---

  async listRegions(q: ListSupplyRegionsDto) {
    const and: Prisma.prc_supply_regionsWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { city: { contains: s } }] });
    }
    if (q.active === 'true') and.push({ active: true });
    if (q.active === 'false') and.push({ active: false });
    if (q.country?.trim()) and.push({ country: q.country.trim() });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.prc_supply_regions.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supply_regions.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapRegion(r)), total, q.page, q.pageSize);
  }

  async listActiveRegions() {
    const rows = await this.prisma.prc_supply_regions.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.mapRegion(r));
  }

  async findRegion(id: number) {
    const row = await this.prisma.prc_supply_regions.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('منطقة التوريد غير موجودة');
    return this.mapRegion(row);
  }

  async createRegion(dto: UpsertSupplyRegionDto) {
    const row = await this.prisma.prc_supply_regions.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        branches: dto.branches ?? undefined,
        country: dto.country ?? 'مصر',
        city: dto.city ?? null,
        active: dto.active ?? true,
      },
    });
    return this.mapRegion(row);
  }

  async updateRegion(id: number, dto: Partial<UpsertSupplyRegionDto>) {
    await this.findRegion(id);
    const row = await this.prisma.prc_supply_regions.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.branches !== undefined ? { branches: dto.branches ?? Prisma.JsonNull } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.mapRegion(row);
  }

  async removeRegion(id: number) {
    await this.findRegion(id);
    await this.prisma.prc_supply_regions.delete({ where: { id } });
    return { success: true };
  }

  private mapRegion(row: Prisma.prc_supply_regionsGetPayload<object>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      branches: row.branches,
      country: row.country,
      city: row.city,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- Payment Terms ---

  async listPaymentTerms(q: ListPaymentTermsDto) {
    const and: Prisma.prc_payment_termsWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { description: { contains: s } }] });
    }
    if (q.active === 'true') and.push({ active: true });
    if (q.active === 'false') and.push({ active: false });
    if (q.type?.trim()) and.push({ type: q.type.trim() });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.prc_payment_terms.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_payment_terms.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapPaymentTerm(r)), total, q.page, q.pageSize);
  }

  async listActivePaymentTerms() {
    const rows = await this.prisma.prc_payment_terms.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.mapPaymentTerm(r));
  }

  async findPaymentTerm(id: number) {
    const row = await this.prisma.prc_payment_terms.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('شروط الدفع غير موجودة');
    return this.mapPaymentTerm(row);
  }

  async createPaymentTerm(dto: UpsertPaymentTermDto) {
    const row = await this.prisma.prc_payment_terms.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        days: dto.days ?? 0,
        type: dto.type ?? 'immediate',
        discount_percentage: dto.discountPercentage ?? 0,
        active: dto.active ?? true,
      },
    });
    return this.mapPaymentTerm(row);
  }

  async updatePaymentTerm(id: number, dto: Partial<UpsertPaymentTermDto>) {
    await this.findPaymentTerm(id);
    const row = await this.prisma.prc_payment_terms.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.days !== undefined ? { days: dto.days } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.discountPercentage !== undefined ? { discount_percentage: dto.discountPercentage } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.mapPaymentTerm(row);
  }

  async removePaymentTerm(id: number) {
    await this.findPaymentTerm(id);
    await this.prisma.prc_payment_terms.delete({ where: { id } });
    return { success: true };
  }

  private mapPaymentTerm(row: Prisma.prc_payment_termsGetPayload<object>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      days: row.days,
      type: row.type,
      discountPercentage: toNumber(row.discount_percentage),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
