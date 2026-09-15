import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { InventoryLocationService } from './inventory-location.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListOpeningStocksDto, UpsertOpeningStockDto } from './dto/inventory.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

@Injectable()
export class OpeningStocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private map(row: Prisma.inv_opening_stocksGetPayload<object>) {
    return {
      id: row.id,
      openingStockDate: row.opening_stock_date,
      itemCode: row.item_code,
      quantity: toNumber(row.quantity),
      unitCost: toNumber(row.unit_cost),
      totalCost: toNumber(row.total_cost),
      notes: row.notes,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      productId: row.product_id,
      sparePartId: row.spare_part_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListOpeningStocksDto) {
    const and: Prisma.inv_opening_stocksWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) and.push({ item_code: { contains: q.search.trim() } });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.warehouseId && q.warehouseId !== 'all') and.push({ warehouse_id: Number(q.warehouseId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_opening_stocks.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.inv_opening_stocks.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async byBranch(branchId: number) {
    const rows = await this.prisma.inv_opening_stocks.findMany({
      where: { branch_id: branchId, ...notDeletedFilter() },
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async byWarehouse(warehouseId: number) {
    const rows = await this.prisma.inv_opening_stocks.findMany({
      where: { warehouse_id: warehouseId, ...notDeletedFilter() },
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.inv_opening_stocks.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!row) throw new NotFoundException('رصيد الافتتاح غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertOpeningStockDto, user: JwtUser, dryRun = false) {
    const branchId = this.location.requireUserBranch(user);
    const warehouseId = await this.location.resolveBranchStockLocation(branchId);
    let productId = dto.productId ?? null;
    if (!productId && dto.itemCode?.trim()) {
      const product = await this.prisma.inv_products.findFirst({
        where: { product_code: dto.itemCode.trim(), ...notDeletedFilter() },
      });
      if (!product) {
        throw new BadRequestException('كود المنتج غير مرتبط بمنتج — لا يمكن تحديث المخزون');
      }
      productId = product.id;
    }
    if (!productId) {
      throw new BadRequestException('يجب ربط رصيد الافتتاح بمنتج (productId أو كود منتج صالح)');
    }

    const balance = await this.prisma.inv_stock_balances.findUnique({
      where: {
        product_id_warehouse_id: { product_id: productId, warehouse_id: warehouseId },
      },
    });
    const currentStock = balance ? toNumber(balance.current_stock) : 0;
    const willAdd = currentStock > 0;
    const newStock = willAdd ? currentStock + dto.quantity : dto.quantity;

    const previewRows: PreviewRow[] = [
      { label: 'الرصيد الحالي', before: String(currentStock), after: String(newStock) },
      { label: 'الكمية المضافة', after: String(dto.quantity) },
      { label: 'العملية', after: willAdd ? 'إضافة للرصيد' : 'تعيين رصيد افتتاحي' },
    ];

    if (isDryRun(dryRun)) {
      return previewResponse({ productId, currentStock, newStock, quantity: dto.quantity }, {
        rows: previewRows,
        warning: willAdd ? 'سيتم إضافة الكمية للرصيد الحالي (وليس استبداله)' : undefined,
      });
    }

    const totalCost = dto.totalCost ?? dto.quantity * dto.unitCost;
    if (totalCost <= 0) {
      throw new BadRequestException('تكلفة رصيد أول المدة يجب أن تكون أكبر من صفر');
    }
    await this.moduleLedger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      const opening = await tx.inv_opening_stocks.create({
        data: {
        opening_stock_date: dto.openingStockDate ? new Date(dto.openingStockDate) : new Date(),
        item_code: dto.itemCode,
        quantity: dto.quantity,
        unit_cost: dto.unitCost,
        total_cost: totalCost,
        notes: dto.notes ?? null,
        branch_id: branchId,
        warehouse_id: warehouseId,
        product_id: productId,
        spare_part_id: dto.sparePartId ?? null,
        },
      });

      await this.stock.applyMovement({
        productId,
        warehouseId,
        direction: MovementDirection.in,
        quantity: dto.quantity,
        operation: willAdd ? 'add' : 'set',
        txnType: InventoryTxnType.adjustment,
        unitCost: dto.unitCost,
        docType: 'opening_stock',
        docRef: String(opening.id),
        branchId,
        createdBy: user.sub,
      }, tx);
      await this.moduleLedger.postOpeningStock({
        openingStockId: opening.id,
        branchId,
        date: (opening.opening_stock_date ?? new Date()).toISOString().slice(0, 10),
        amount: totalCost,
        itemName: dto.itemCode,
        createdBy: user.sub,
      }, tx);
      return opening;
    });

    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertOpeningStockDto>) {
    const existing = await this.prisma.inv_opening_stocks.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('رصيد الافتتاح غير موجود');
    const financialChange = [
      dto.openingStockDate, dto.itemCode, dto.quantity, dto.unitCost, dto.totalCost,
      dto.branchId, dto.warehouseId, dto.productId, dto.sparePartId,
    ].some((value) => value !== undefined);
    if (financialChange) {
      throw new BadRequestException('لا يمكن تعديل بيانات رصيد أول مدة مُرحّل؛ استخدم تسوية مخزون');
    }
    const row = await this.prisma.inv_opening_stocks.update({
      where: { id },
      data: {
        ...(dto.openingStockDate !== undefined ? { opening_stock_date: dto.openingStockDate ? new Date(dto.openingStockDate) : null } : {}),
        ...(dto.itemCode != null ? { item_code: dto.itemCode } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unitCost !== undefined ? { unit_cost: dto.unitCost } : {}),
        ...(dto.totalCost !== undefined ? { total_cost: dto.totalCost } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.warehouseId != null ? { warehouse_id: dto.warehouseId } : {}),
        ...(dto.productId !== undefined ? { product_id: dto.productId ?? null } : {}),
        ...(dto.sparePartId !== undefined ? { spare_part_id: dto.sparePartId ?? null } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.inv_opening_stocks.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!existing) throw new NotFoundException('رصيد الافتتاح غير موجود');
    throw new BadRequestException('لا يمكن حذف رصيد أول مدة مُرحّل؛ استخدم تسوية مخزون');
  }
}
