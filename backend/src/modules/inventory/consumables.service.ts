import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ListConsumablesDto, SetConsumableStockDto, UpsertConsumableDto } from './dto/inventory.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import type { JwtUser } from '../../common/types/jwt-user';
import { InventoryLocationService } from './inventory-location.service';

@Injectable()
export class ConsumablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly location: InventoryLocationService,
  ) {}

  /** Consumables without a branch are shared; a branch-owned row is limited to that branch's scope. */
  private assertRowAccess(user: JwtUser, branchId: number | null) {
    if (branchId != null) this.branchScope.assertBranchAllowed(user, branchId);
  }

  private map(row: Prisma.inv_consumablesGetPayload<object>) {
    return {
      id: row.id,
      code: row.code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      categoryId: row.category_id,
      warehouseId: row.warehouse_id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      brandId: row.brand_id,
      unitTemplateId: row.unit_template_id,
      consumptionRate: toNumber(row.consumption_rate),
      unitCost: toNumber(row.unit_cost),
      currentStock: toNumber(row.current_stock),
      minStock: row.min_stock,
      maxStock: row.max_stock,
      shelfLocation: row.shelf_location,
      imageUrl: row.image_url,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListConsumablesDto, user: JwtUser) {
    const and: Prisma.inv_consumablesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { code: { contains: s } }] });
    }
    const branches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const explicitBranch = q.branchId != null && q.branchId !== 'all' && q.branchId !== '';
    if (branches) and.push(explicitBranch ? { branch_id: { in: branches } } : { OR: [{ branch_id: { in: branches } }, { branch_id: null }] });
    const where = { AND: and };
    let rows = await this.prisma.inv_consumables.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: q.skip,
      take: q.take,
    });
    if (q.lowStock) rows = rows.filter((r) => toNumber(r.current_stock) <= r.min_stock);
    const total = await this.prisma.inv_consumables.count({ where });
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.inv_consumables.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('المستهلكات غير موجودة');
    this.assertRowAccess(user, row.branch_id);
    return this.map(row);
  }

  private async generateCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_consumables WHERE code LIKE 'CSM%'
    `;
    return `CSM${String((rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  async create(dto: UpsertConsumableDto, user: JwtUser) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم المستهلك مطلوب');
    let branchId = dto.branchId ?? null;
    if (branchId != null) this.branchScope.assertBranchAllowed(user, branchId);
    else if (!isSystemAdmin(user)) branchId = this.location.requireUserBranch(user);
    if (dto.warehouseId) branchId = (await this.location.resolveSelection(user, dto.warehouseId, branchId ?? undefined)).branchId;
    const row = await this.prisma.inv_consumables.create({
      data: {
        code: dto.code?.trim() || (await this.generateCode()),
        name_ar: dto.nameAr.trim(),
        name_en: dto.nameEn.trim(),
        category_id: dto.categoryId ?? null,
        warehouse_id: dto.warehouseId ?? null,
        supplier_id: dto.supplierId ?? null,
        branch_id: branchId,
        brand_id: dto.brandId ?? null,
        unit_template_id: dto.unitTemplateId ?? null,
        consumption_rate: dto.consumptionRate,
        unit_cost: dto.unitCost,
        current_stock: dto.currentStock ?? 0,
        min_stock: dto.minStock ?? 0,
        max_stock: dto.maxStock ?? 0,
        shelf_location: dto.shelfLocation ?? null,
        image_url: dto.imageUrl ?? null,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertConsumableDto>, user: JwtUser) {
    const existing = await this.prisma.inv_consumables.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المستهلكات غير موجودة');
    this.assertRowAccess(user, existing.branch_id);
    const row = await this.prisma.inv_consumables.update({
      where: { id },
      data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
        ...(dto.nameEn != null ? { name_en: dto.nameEn.trim() } : {}),
        ...(dto.consumptionRate !== undefined ? { consumption_rate: dto.consumptionRate } : {}),
        ...(dto.unitCost !== undefined ? { unit_cost: dto.unitCost } : {}),
        ...(dto.currentStock !== undefined ? { current_stock: dto.currentStock } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async setStock(id: number, dto: SetConsumableStockDto, user: JwtUser) {
    await this.findOne(id, user);
    const row = await this.prisma.inv_consumables.update({
      where: { id },
      data: { current_stock: dto.currentStock },
    });
    return this.map(row);
  }

  async remove(id: number, user: JwtUser) {
    const existing = await this.prisma.inv_consumables.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المستهلكات غير موجودة');
    this.assertRowAccess(user, existing.branch_id);
    await this.prisma.inv_consumables.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
