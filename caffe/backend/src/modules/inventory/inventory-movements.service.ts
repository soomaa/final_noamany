import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNumber } from './inventory.utils';
import { ListInventoryMovementsDto } from './dto/inventory.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private map(
    row: Prisma.inv_movementsGetPayload<{ include: { product: true; warehouse: true } }>,
    actorName?: string | null,
  ) {
    return {
      id: row.id,
      movementDate: row.movement_date,
      txnType: row.txn_type,
      direction: row.direction,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      quantity: toNumber(row.quantity),
      uom: row.uom,
      unitCost: toNumber(row.unit_cost),
      balanceAfter: toNumber(row.balance_after),
      docType: row.doc_type,
      docRef: row.doc_ref,
      transactionId: row.transaction_id,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date,
      branchId: row.branch_id,
      notes: row.notes,
      createdBy: row.created_by,
      actorName: actorName ?? null,
      createdAt: row.created_at,
      product: row.product ? {
        id: row.product.id,
        productCode: row.product.product_code,
        nameAr: row.product.name_ar,
        nameEn: row.product.name_en,
        size: row.product.size,
        unitOfMeasure: row.product.unit_of_measure,
      } : null,
      warehouse: row.warehouse ? {
        id: row.warehouse.id,
        warehouseCode: row.warehouse.warehouse_code,
        nameAr: row.warehouse.name_ar,
        nameEn: row.warehouse.name_en,
      } : null,
    };
  }

  async list(q: ListInventoryMovementsDto, user?: JwtUser) {
    const and: Prisma.inv_movementsWhereInput[] = [];
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) and.push({ OR: [{ branch_id: { in: scopedBranches } }, { warehouse: { branch_id: { in: scopedBranches } } }] });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ doc_ref: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.productId && q.productId !== 'all') and.push({ product_id: Number(q.productId) });
    if (q.warehouseId && q.warehouseId !== 'all') and.push({ warehouse_id: Number(q.warehouseId) });
    if (q.txnType && q.txnType !== 'all') and.push({ txn_type: q.txnType as InventoryTxnType });
    if (q.dateFrom || q.dateTo) {
      const dateToExclusive = q.dateTo ? new Date(q.dateTo) : undefined;
      if (dateToExclusive) dateToExclusive.setDate(dateToExclusive.getDate() + 1);
      and.push({
        movement_date: {
          ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
          ...(dateToExclusive ? { lt: dateToExclusive } : {}),
        },
      });
    }
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.inv_movements.findMany({
        where,
        include: { product: true, warehouse: true },
        orderBy: { movement_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_movements.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((row) => row.created_by).filter((id): id is number => id != null))];
    const actors = actorIds.length ? await this.prisma.users.findMany({
      where: { user_id: { in: actorIds } },
      select: { user_id: true, name: true, username: true },
    }) : [];
    const actorMap = new Map(actors.map((actor) => [actor.user_id, actor.name || actor.username || `#${actor.user_id}`]));
    return paginated(rows.map((row) => this.map(row, row.created_by ? actorMap.get(row.created_by) : null)), total, q.page, q.pageSize);
  }

  async stats(branchId?: string, user?: JwtUser) {
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const where: Prisma.inv_movementsWhereInput = scopedBranches
      ? { OR: [{ branch_id: { in: scopedBranches } }, { warehouse: { branch_id: { in: scopedBranches } } }] }
      : {};
    const [total, byType] = await Promise.all([
      this.prisma.inv_movements.count({ where }),
      this.prisma.inv_movements.groupBy({ by: ['txn_type'], where, _count: true }),
    ]);
    return {
      totalMovements: total,
      movementsByType: Object.fromEntries(byType.map((r) => [r.txn_type, r._count])),
    };
  }

  async exportList(q: ListInventoryMovementsDto, user?: JwtUser) {
    const result = await this.list({ ...q, page: 1, pageSize: 10000 } as ListInventoryMovementsDto, user);
    return result.data;
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.inv_movements.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });
    if (!row) throw new NotFoundException('حركة المخزون غير موجودة');
    const scopedBranches = this.branchScope.resolveListFilter(user);
    if (scopedBranches && !scopedBranches.includes(row.branch_id ?? row.warehouse?.branch_id ?? -1)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى حركة المخزون هذه');
    }
    const actor = row.created_by ? await this.prisma.users.findUnique({
      where: { user_id: row.created_by },
      select: { name: true, username: true },
    }) : null;
    return this.map(row, actor?.name || actor?.username);
  }
}
