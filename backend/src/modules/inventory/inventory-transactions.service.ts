import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CafeBusinessClassification, InventoryTxnStatus, InventoryTxnType, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { InventoryLocationService } from './inventory-location.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  ListInventoryTransactionsDto,
  RejectTransactionDto,
  UpsertInventoryTransactionDto,
} from './dto/inventory.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

export function resolveInventoryConsumptionUnitCost(
  suppliedPrice: number,
  productCost: number,
  authoritativeCostOnly: boolean,
) {
  if (authoritativeCostOnly) return productCost;
  return suppliedPrice > 0 ? suppliedPrice : productCost;
}

@Injectable()
export class InventoryTransactionsService {
  private readonly supportedTypes: InventoryTxnType[] = [
    InventoryTxnType.issue,
    InventoryTxnType.damage,
    InventoryTxnType.transfer,
  ];
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية تنفيذ حركة مخزون على هذا الفرع');
    }
  }

  private map(row: Prisma.inv_transactionsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      reference: row.reference,
      txnType: row.txn_type,
      status: row.status,
      txnDate: row.txn_date,
      sourceWarehouseId: row.source_warehouse_id,
      targetWarehouseId: row.target_warehouse_id,
      branchId: row.branch_id,
      businessClassification: row.business_classification,
      totalAmount: toNumber(row.total_amount),
      notes: row.notes,
      reason: row.reason,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectedBy: row.rejected_by,
      rejectedAt: row.rejected_at,
      rejectionReason: row.rejection_reason,
      items: row.items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        itemCode: i.item_code,
        itemName: i.item_name,
        quantity: toNumber(i.quantity),
        unit: i.unit,
        price: toNumber(i.price),
        total: toNumber(i.total),
        notes: i.notes,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListInventoryTransactionsDto, user?: JwtUser) {
    const and: Prisma.inv_transactionsWhereInput[] = [notDeletedFilter()];
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) and.push({ branch_id: { in: scopedBranches } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ reference: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.txnType && q.txnType !== 'all') and.push({ txn_type: q.txnType as InventoryTxnType });
    if (q.status && q.status !== 'all') and.push({ status: q.status as InventoryTxnStatus });
    if (q.warehouseId && q.warehouseId !== 'all') {
      const w = Number(q.warehouseId);
      and.push({ OR: [{ source_warehouse_id: w }, { target_warehouse_id: w }] });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        txn_date: {
          ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
          ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
        },
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_transactions.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_transactions.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async stats(branchId?: string, user?: JwtUser) {
    const scopedBranches = this.branchScope.resolveListFilter(user, branchId ?? null);
    const where: Prisma.inv_transactionsWhereInput = {
      ...notDeletedFilter(),
      ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
    };
    const [total, byType, byStatus] = await Promise.all([
      this.prisma.inv_transactions.count({ where }),
      this.prisma.inv_transactions.groupBy({ by: ['txn_type'], where, _count: true }),
      this.prisma.inv_transactions.groupBy({ by: ['status'], where, _count: true }),
    ]);
    return {
      totalTransactions: total,
      transactionsByType: Object.fromEntries(byType.map((r) => [r.txn_type, r._count])),
      transactionsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    };
  }

  types() {
    return this.supportedTypes;
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.inv_transactions.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('الحركة المخزنية غير موجودة');
    if (user && !this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى حركة المخزون هذه');
    }
    return this.map(row);
  }

  async create(
    dto: UpsertInventoryTransactionDto,
    user: JwtUser,
    businessClassification?: CafeBusinessClassification,
  ) {
    if (!dto.items?.length) throw new BadRequestException('يجب إضافة بند واحد على الأقل');
    if (!this.supportedTypes.includes(dto.txnType as InventoryTxnType)) {
      throw new BadRequestException('استخدم شاشة المشتريات أو المرتجعات أو الجرد لهذه الحركة');
    }
    const isManagementWithdrawal =
      businessClassification === CafeBusinessClassification.management_withdrawal;
    const items = isManagementWithdrawal
      ? dto.items.map((item) => ({ ...item, price: 0, total: 0 }))
      : dto.items;

    const branchId = Number(dto.branchId ?? user.branch ?? 0);
    if (!branchId) throw new BadRequestException('اختر الفرع قبل إنشاء حركة المخزون');
    this.assertBranchAccess(user, branchId);
    let sourceWarehouseId = dto.sourceWarehouseId;
    let targetWarehouseId = dto.targetWarehouseId;
    if (!sourceWarehouseId && !targetWarehouseId && dto.txnType !== InventoryTxnType.transfer) {
      const stockLocationId = await this.location.resolveBranchStockLocation(branchId);
      if (dto.txnType === InventoryTxnType.receipt || dto.txnType === InventoryTxnType.sales_return) {
        targetWarehouseId = stockLocationId;
      } else {
        sourceWarehouseId = stockLocationId;
      }
    }

    const totalAmount = items.reduce(
      (s, i) => s + (i.total ?? (i.price ?? 0) * i.quantity),
      0,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.inv_transactions.create({
        data: {
          reference: dto.reference,
          txn_type: dto.txnType as InventoryTxnType,
          status: InventoryTxnStatus.draft,
          txn_date: new Date(dto.txnDate),
          source_warehouse_id: sourceWarehouseId ?? null,
          target_warehouse_id: targetWarehouseId ?? null,
          branch_id: branchId,
          business_classification: businessClassification ?? null,
          total_amount: totalAmount,
          notes: dto.notes ?? null,
          reason: dto.reason ?? null,
          created_by: user.sub,
          items: {
            create: items.map((i) => ({
              product_id: i.productId ?? null,
              item_code: i.itemCode ?? null,
              item_name: i.itemName,
              quantity: i.quantity,
              unit: i.unit ?? null,
              price: i.price ?? 0,
              total: i.total ?? (i.price ?? 0) * i.quantity,
              notes: i.notes ?? null,
            })),
          },
        },
        include: { items: true },
      });
      return txn;
    });

    return this.map(row);
  }

  createManagementWithdrawal(dto: UpsertInventoryTransactionDto, user: JwtUser) {
    return this.create(
      { ...dto, txnType: InventoryTxnType.issue },
      user,
      CafeBusinessClassification.management_withdrawal,
    );
  }

  async update(id: number, dto: Partial<UpsertInventoryTransactionDto>, user: JwtUser) {
    const existing = await this.prisma.inv_transactions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('الحركة المخزنية غير موجودة');
    this.assertBranchAccess(user, existing.branch_id);
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);
    if (existing.status !== InventoryTxnStatus.draft) {
      throw new BadRequestException('لا يمكن تعديل الحركة إلا في حالة المسودة');
    }
    if (dto.txnType && !this.supportedTypes.includes(dto.txnType as InventoryTxnType)) {
      throw new BadRequestException('نوع الحركة غير مدعوم من شاشة الحركات اليدوية');
    }
    const isManagementWithdrawal =
      existing.business_classification === CafeBusinessClassification.management_withdrawal;
    const items = dto.items
      ? isManagementWithdrawal
        ? dto.items.map((item) => ({ ...item, price: 0, total: 0 }))
        : dto.items
      : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.inv_transaction_items.deleteMany({ where: { transaction_id: id } });
      }
      return tx.inv_transactions.update({
        where: { id },
        data: {
          ...(dto.reference != null ? { reference: dto.reference } : {}),
          ...(dto.txnType != null || isManagementWithdrawal
            ? {
                txn_type: isManagementWithdrawal
                  ? InventoryTxnType.issue
                  : dto.txnType as InventoryTxnType,
              }
            : {}),
          ...(dto.txnDate != null ? { txn_date: new Date(dto.txnDate) } : {}),
          ...(dto.sourceWarehouseId !== undefined ? { source_warehouse_id: dto.sourceWarehouseId ?? null } : {}),
          ...(dto.targetWarehouseId !== undefined ? { target_warehouse_id: dto.targetWarehouseId ?? null } : {}),
          ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          ...(dto.reason !== undefined ? { reason: dto.reason ?? null } : {}),
          ...(items
            ? {
                items: {
                  create: items.map((i) => ({
                    product_id: i.productId ?? null,
                    item_code: i.itemCode ?? null,
                    item_name: i.itemName,
                    quantity: i.quantity,
                    unit: i.unit ?? null,
                    price: i.price ?? 0,
                    total: i.total ?? (i.price ?? 0) * i.quantity,
                    notes: i.notes ?? null,
                  })),
                },
                total_amount: items.reduce(
                  (s, i) => s + (i.total ?? (i.price ?? 0) * i.quantity),
                  0,
                ),
              }
            : {}),
        },
        include: { items: true },
      });
    });

    return this.map(row);
  }

  async remove(id: number, user: JwtUser) {
    const existing = await this.prisma.inv_transactions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('الحركة المخزنية غير موجودة');
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status !== InventoryTxnStatus.draft) {
      throw new BadRequestException('لا يمكن حذف الحركة إلا في حالة المسودة');
    }
    await this.prisma.inv_transactions.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  async approve(id: number, user: JwtUser, dryRun = false) {
    const txn = await this.prisma.inv_transactions.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!txn) throw new NotFoundException('الحركة المخزنية غير موجودة');
    this.assertBranchAccess(user, txn.branch_id);
    if (txn.status === InventoryTxnStatus.approved) {
      throw new BadRequestException('الحركة معتمدة بالفعل');
    }
    if (txn.status === InventoryTxnStatus.rejected) {
      throw new BadRequestException('لا يمكن اعتماد حركة مرفوضة');
    }
    if (!this.supportedTypes.includes(txn.txn_type)) {
      throw new BadRequestException('نوع الحركة يجب تنفيذه من المستند التشغيلي المخصص له');
    }

    const previewRows: PreviewRow[] = txn.items
      .filter((i) => i.product_id != null)
      .map((i) => ({
        label: i.item_name ?? i.item_code ?? `#${i.product_id}`,
        before: '—',
        after: `${toNumber(i.quantity)} (${txn.txn_type})`,
      }));

    if (isDryRun(dryRun)) {
      return previewResponse(
        { transactionId: id, reference: txn.reference, itemCount: previewRows.length },
        { rows: previewRows, warning: 'سيتم تطبيق أرصدة المخزون فور الاعتماد' },
      );
    }

    const financiallyConsumed =
      txn.txn_type === InventoryTxnType.issue || txn.txn_type === InventoryTxnType.damage;
    if (financiallyConsumed) await this.moduleLedger.ensureChart();

    await this.prisma.$transaction(async (tx) => {
      // Guarded claim: only one concurrent approve can flip the status (conditional updateMany
      // inside the tx). The loser sees count === 0 and never applies the stock movements twice.
      const claimed = await tx.inv_transactions.updateMany({
        where: {
          id,
          ...notDeletedFilter(),
          status: { notIn: [InventoryTxnStatus.approved, InventoryTxnStatus.rejected] },
        },
        data: {
          status: InventoryTxnStatus.approved,
          approved_by: user.sub,
          approved_at: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('الحركة معتمدة أو مرفوضة بالفعل');
      }

      // Internal gym issues often arrive from the dedicated UI without a price. Resolve the
      // authoritative product cost server-side so the stock reduction cannot disappear financially.
      const products = await tx.inv_products.findMany({
        where: { id: { in: txn.items.flatMap((item) => item.product_id ? [item.product_id] : []) } },
        select: { id: true, cost_price: true },
      });
      const productCosts = new Map(products.map((product) => [product.id, toNumber(product.cost_price)]));
      const authoritativeCostOnly =
        txn.business_classification === CafeBusinessClassification.management_withdrawal;
      const valuedItems = txn.items.map((item) => {
        const suppliedPrice = toNumber(item.price);
        const productCost = item.product_id != null
          ? productCosts.get(item.product_id) ?? 0
          : 0;
        const unitCost = resolveInventoryConsumptionUnitCost(
          suppliedPrice,
          productCost,
          authoritativeCostOnly,
        );
        return { item, unitCost, total: Math.round(toNumber(item.quantity) * unitCost * 100) / 100 };
      });
      const financialAmount = Math.round(valuedItems.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
      if (financiallyConsumed && financialAmount <= 0) {
        throw new BadRequestException('لا يمكن اعتماد صرف المخزون قبل إدخال تكلفة المنتجات');
      }
      if (financiallyConsumed) {
        for (const row of valuedItems) {
          await tx.inv_transaction_items.update({
            where: { id: row.item.id },
            data: { price: row.unitCost, total: row.total },
          });
        }
        await tx.inv_transactions.update({ where: { id }, data: { total_amount: financialAmount } });
      }

      await this.stock.applyTransaction(
        {
          transactionId: id,
          txnType: txn.txn_type,
          branchId: txn.branch_id,
          sourceWarehouseId: txn.source_warehouse_id,
          targetWarehouseId: txn.target_warehouse_id,
          docRef: txn.reference,
          createdBy: user.sub,
          lines: txn.items
            .filter((i) => i.product_id != null)
            .map((i) => ({
              productId: i.product_id!,
              quantity: i.quantity,
              unitCost: valuedItems.find((row) => row.item.id === i.id)?.unitCost ?? i.price,
              itemName: i.item_name,
              itemCode: i.item_code ?? undefined,
              unit: i.unit ?? undefined,
              price: i.price,
              notes: i.notes ?? undefined,
            })),
        },
        tx,
      );
      if (financiallyConsumed) {
        const kind = txn.txn_type === InventoryTxnType.damage ? 'damage' : 'issue';
        await this.moduleLedger.postInventoryConsumption({
          transactionId: id,
          reference: txn.reference,
          branchId: txn.branch_id,
          date: txn.txn_date.toISOString().slice(0, 10),
          amount: financialAmount,
          kind,
          createdBy: user.sub,
        }, tx);
        await recordSystemExpense(tx, {
          invoiceNumber: `INV-${kind.toUpperCase()}-${id}`,
          date: txn.txn_date.toISOString().slice(0, 10),
          category: 'مخزون',
          subCategory: kind === 'damage' ? 'هالك' : 'صرف داخلي',
          amount: financialAmount,
          description: `${kind === 'damage' ? 'هالك مخزون' : 'صرف مخزون داخل الجيم'} — ${txn.reference}`,
          branchId: txn.branch_id,
          createdBy: user.sub,
          paymentMethod: 'تسوية مخزون',
        });
      }
    });

    return this.findOne(id, user);
  }

  async reject(id: number, dto: RejectTransactionDto, user: JwtUser) {
    const existing = await this.prisma.inv_transactions.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('الحركة المخزنية غير موجودة');
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.status === InventoryTxnStatus.approved) {
      throw new BadRequestException('لا يمكن رفض حركة معتمدة');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('سبب الرفض مطلوب');

    await this.prisma.inv_transactions.update({
      where: { id },
      data: {
        status: InventoryTxnStatus.rejected,
        rejected_by: user.sub,
        rejected_at: new Date(),
        rejection_reason: dto.reason.trim(),
      },
    });

    return this.findOne(id, user);
  }
}
