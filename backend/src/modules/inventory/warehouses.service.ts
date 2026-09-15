import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { ListWarehousesDto, UpdateWarehouseBalanceDto, UpsertWarehouseDto } from './dto/inventory.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Prisma.inv_warehousesGetPayload<object>) {
    return {
      id: row.id,
      warehouseCode: row.warehouse_code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      type: row.type,
      storageCapacity: row.storage_capacity,
      branchId: row.branch_id,
      managerName: row.manager_name,
      phone: row.phone,
      address: row.address,
      country: row.country,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListWarehousesDto) {
    const and: Prisma.inv_warehousesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { warehouse_code: { contains: s } }] });
    }
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.status === 'active') and.push({ status: 'active' });
    if (q.status === 'inactive') and.push({ status: 'inactive' });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_warehouses.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_warehouses.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_warehouses.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('المستودع غير موجود');
    return this.map(row);
  }

  private async generateWarehouseCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(warehouse_code, 4) AS UNSIGNED)) AS maxNum
      FROM inv_warehouses WHERE warehouse_code LIKE 'WH%'
    `;
    return `WH${String((rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  async create(dto: UpsertWarehouseDto) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم المستودع مطلوب');
    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: dto.branchId } });
    if (!branch) throw new BadRequestException('الفرع غير موجود');
    const row = await this.prisma.inv_warehouses.create({
      data: {
        warehouse_code: dto.warehouseCode?.trim() || (await this.generateWarehouseCode()),
        name_ar: dto.nameAr.trim(),
        name_en: dto.nameEn ?? null,
        type: dto.type ?? 'main',
        storage_capacity: dto.storageCapacity ?? 1,
        branch_id: dto.branchId,
        manager_name: dto.managerName ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        country: dto.country ?? null,
        status: dto.status ?? 'active',
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertWarehouseDto>) {
    const existing = await this.prisma.inv_warehouses.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المستودع غير موجود');
    const row = await this.prisma.inv_warehouses.update({
      where: { id },
      data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { name_en: dto.nameEn ?? null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.storageCapacity !== undefined ? { storage_capacity: dto.storageCapacity } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.managerName !== undefined ? { manager_name: dto.managerName ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
        ...(dto.address !== undefined ? { address: dto.address ?? null } : {}),
        ...(dto.country !== undefined ? { country: dto.country ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_warehouses.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('المستودع غير موجود');
    await this.prisma.inv_warehouses.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  async warehouseInventory(id: number) {
    await this.findOne(id);
    const balances = await this.prisma.inv_stock_balances.findMany({
      where: { warehouse_id: id },
      include: { product: true },
    });
    return balances.map((b) => ({
      id: b.id,
      productId: b.product_id,
      product: b.product,
      currentStock: toNumber(b.current_stock),
      minStock: toNumber(b.min_stock),
      maxStock: toNumber(b.max_stock),
      reorderPoint: toNumber(b.reorder_point),
      shelfLocation: b.shelf_location,
    }));
  }

  async updateBalance(balanceId: number, dto: UpdateWarehouseBalanceDto) {
    const balance = await this.prisma.inv_stock_balances.findUnique({ where: { id: balanceId } });
    if (!balance) throw new NotFoundException('رصيد المخزون غير موجود');
    const updated = await this.prisma.inv_stock_balances.update({
      where: { id: balanceId },
      data: {
        ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
        ...(dto.maxStock !== undefined ? { max_stock: dto.maxStock } : {}),
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
        ...(dto.shelfLocation !== undefined ? { shelf_location: dto.shelfLocation ?? null } : {}),
      },
      include: { product: true },
    });
    return {
      id: updated.id,
      productId: updated.product_id,
      currentStock: toNumber(updated.current_stock),
      minStock: toNumber(updated.min_stock),
      maxStock: toNumber(updated.max_stock),
      reorderPoint: toNumber(updated.reorder_point),
      shelfLocation: updated.shelf_location,
    };
  }
}
