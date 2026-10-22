import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnStatus, InventoryTxnType, Prisma } from '@prisma/client';
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

  private async validateLocations(user: JwtUser, kind: string, branchId: number, source?: number | null, target?: number | null) {
    if (kind === 'transfer' && (!source || !target || source === target)) throw new BadRequestException('اختر مخزن مصدر ووجهة مختلفين للتحويل');
    if (source) await this.location.resolveSelection(user, source, branchId);
    if (target) await this.location.resolveSelection(user, target, kind === 'transfer' ? undefined : branchId);
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
      totalAmount: toNumber(row.total_amount),
      notes: row.notes,
      reason: row.reason,
      recipientName: row.recipient_name,
      cafeCategoryId: row.cafe_category_id,
      gender: row.gender,
      businessClassification: row.business_classification,
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
    if (q.businessClassification) and.push({ business_classification: q.businessClassification });
    if (q.cafeCategoryId) and.push({ cafe_category_id: Number(q.cafeCategoryId) });
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) and.push({ branch_id: { in: scopedBranches } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ reference: { contains: s } }, { notes: { contains: s } }, {recipient_name:{contains:s}}, {reason:{contains:s}}] });
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

  async create(dto: UpsertInventoryTransactionDto, user: JwtUser, transaction?: Prisma.TransactionClient) {
    if (!dto.items?.length) throw new BadRequestException('يجب إضافة بند واحد على الأقل');
    if (!this.supportedTypes.includes(dto.txnType as InventoryTxnType)) {
      throw new BadRequestException('استخدم شاشة المشتريات أو المرتجعات أو الجرد لهذه الحركة');
    }

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

    await this.validateLocations(user, dto.txnType, branchId, sourceWarehouseId, targetWarehouseId);
    if (dto.items.some((i) => !i.productId || !Number.isFinite(i.quantity) || i.quantity <= 0)) throw new BadRequestException('اختر أصنافًا مخزنية وكميات موجبة لكل البنود');
    if (dto.businessClassification === 'management_withdrawal') {
      if (dto.txnType !== 'issue' || !dto.recipientName?.trim() || !dto.reason?.trim() || !dto.cafeCategoryId || !dto.gender) throw new BadRequestException('المسحوبات تتطلب المستفيد والسبب والفئة والجنس');
      const products = await this.prisma.inv_products.findMany({ where: { id: { in: dto.items.map((i) => i.productId!) }, category_id: dto.cafeCategoryId, is_deleted: false, status: 'active' } });
      if (new Set(products.map((p) => p.id)).size !== new Set(dto.items.map((i) => i.productId)).size) throw new BadRequestException('كل أصناف المسحوبات يجب أن تكون نشطة ومن الفئة المختارة');
    }

    const totalAmount = dto.items.reduce(
      (s, i) => s + (i.total ?? (i.price ?? 0) * i.quantity),
      0,
    );

    const persist = async (tx: Prisma.TransactionClient) => {
      const txn = await tx.inv_transactions.create({
        data: {
          reference: dto.reference,
          txn_type: dto.txnType as InventoryTxnType,
          status: InventoryTxnStatus.draft,
          txn_date: new Date(dto.txnDate),
          source_warehouse_id: sourceWarehouseId ?? null,
          target_warehouse_id: targetWarehouseId ?? null,
          branch_id: branchId,
          total_amount: totalAmount,
          notes: dto.notes ?? null,
          reason: dto.reason ?? null,
          business_classification: dto.businessClassification ?? null,
          recipient_name: dto.recipientName?.trim() || null,
          cafe_category_id: dto.cafeCategoryId ?? null,
          gender: dto.gender ?? null,
          created_by: user.sub,
          items: {
            create: dto.items.map((i) => ({
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
    };
    const row = transaction ? await persist(transaction) : await this.prisma.$transaction(persist);

    return this.map(row);
  }

  async createDrawing(dto: UpsertInventoryTransactionDto, user: JwtUser) {
    await this.moduleLedger.ensureChart();
    return this.prisma.$transaction(async (tx) => {
      const draft = await this.create({...dto,txnType:'issue',businessClassification:'management_withdrawal',targetWarehouseId:undefined},user,tx);
      return this.approve(draft.id,user,false,tx);
    });
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

    await this.validateLocations(user, dto.txnType ?? existing.txn_type, dto.branchId ?? existing.branch_id,
      dto.sourceWarehouseId ?? existing.source_warehouse_id, dto.targetWarehouseId ?? existing.target_warehouse_id);

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.inv_transaction_items.deleteMany({ where: { transaction_id: id } });
      }
      return tx.inv_transactions.update({
        where: { id },
        data: {
          ...(dto.reference != null ? { reference: dto.reference } : {}),
          ...(dto.txnType != null ? { txn_type: dto.txnType as InventoryTxnType } : {}),
          ...(dto.txnDate != null ? { txn_date: new Date(dto.txnDate) } : {}),
          ...(dto.sourceWarehouseId !== undefined ? { source_warehouse_id: dto.sourceWarehouseId ?? null } : {}),
          ...(dto.targetWarehouseId !== undefined ? { target_warehouse_id: dto.targetWarehouseId ?? null } : {}),
          ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          ...(dto.reason !== undefined ? { reason: dto.reason ?? null } : {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
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
                total_amount: dto.items.reduce(
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

  async approve(id: number, user: JwtUser, dryRun = false, transaction?: Prisma.TransactionClient) {
    const db = transaction ?? this.prisma;
    const txn = await db.inv_transactions.findFirst({
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
    await this.validateLocations(user, txn.txn_type, txn.branch_id, txn.source_warehouse_id, txn.target_warehouse_id);

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

    const persist = async (tx: Prisma.TransactionClient) => {
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
      const valuedItems = txn.items.map((item) => {
        const suppliedPrice = toNumber(item.price);
        const unitCost = (txn.txn_type === InventoryTxnType.transfer || txn.business_classification === 'management_withdrawal') && item.product_id != null
          ? productCosts.get(item.product_id) ?? 0
          : suppliedPrice > 0
          ? suppliedPrice
          : item.product_id != null
            ? productCosts.get(item.product_id) ?? 0
            : 0;
        return { item, unitCost, total: Math.round(toNumber(item.quantity) * unitCost * 100) / 100 };
      });
      const financialAmount = Math.round(valuedItems.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
      if (financiallyConsumed && financialAmount <= 0) {
        throw new BadRequestException('لا يمكن اعتماد صرف المخزون قبل إدخال تكلفة المنتجات');
      }
      if (financiallyConsumed || txn.txn_type === InventoryTxnType.transfer) {
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
    };
    if (transaction) await persist(transaction); else await this.prisma.$transaction(persist);
    if (transaction) return this.map(await transaction.inv_transactions.findFirstOrThrow({where:{id},include:{items:true}}));
    return this.findOne(id, user);
  }

  /**
   * Approved transfers between warehouses, presented as "issue orders to branches": the receiving
   * branch is the target warehouse's branch. Visible when either side is inside the user's scope.
   */
  async branchIssues(
    q: { targetBranchId?: string; dateFrom?: string; dateTo?: string; search?: string; page?: number; pageSize?: number },
    user: JwtUser,
  ) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 10));
    const and: Prisma.inv_transactionsWhereInput[] = [
      notDeletedFilter(),
      { txn_type: InventoryTxnType.transfer, status: InventoryTxnStatus.approved },
    ];
    const scoped = this.branchScope.resolveListFilter(user, null);
    if (scoped) {
      const scopedWarehouses = await this.prisma.inv_warehouses.findMany({ where: { branch_id: { in: scoped } }, select: { id: true } });
      and.push({ OR: [{ branch_id: { in: scoped } }, { target_warehouse_id: { in: scopedWarehouses.map((w) => w.id) } }] });
    }
    if (q.targetBranchId) {
      const targets = await this.prisma.inv_warehouses.findMany({ where: { branch_id: Number(q.targetBranchId) }, select: { id: true } });
      and.push({ target_warehouse_id: { in: targets.map((w) => w.id) } });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        txn_date: {
          ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00Z`) } : {}),
          ...(q.dateTo ? { lte: new Date(`${q.dateTo}T23:59:59Z`) } : {}),
        },
      });
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      const numeric = Number(s);
      and.push({ OR: [
        { reference: { contains: s } },
        { items: { some: { item_name: { contains: s } } } },
        ...(Number.isInteger(numeric) && numeric > 0 ? [{ id: numeric }] : []),
      ] });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_transactions.findMany({ where, include: { items: true }, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.inv_transactions.count({ where }),
    ]);
    const warehouseIds = [...new Set(rows.flatMap((r) => [r.source_warehouse_id, r.target_warehouse_id]).filter((id): id is number => id != null))];
    const userIds = [...new Set(rows.flatMap((r) => [r.created_by, r.approved_by]).filter((id): id is number => id != null))];
    const [warehouses, users] = await Promise.all([
      this.prisma.inv_warehouses.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name_ar: true, branch_id: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }),
    ]);
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const userName = new Map(users.map((u) => [u.user_id, u.name || u.username || null]));
    return paginated(rows.map((r) => {
      const source = r.source_warehouse_id != null ? warehouseById.get(r.source_warehouse_id) : undefined;
      const target = r.target_warehouse_id != null ? warehouseById.get(r.target_warehouse_id) : undefined;
      const base = this.map(r);
      return {
        ...base,
        sourceWarehouseName: source?.name_ar ?? null,
        sourceBranchId: source?.branch_id ?? null,
        targetWarehouseName: target?.name_ar ?? null,
        targetBranchId: target?.branch_id ?? null,
        totalQuantity: base.items.reduce((sum, item) => sum + item.quantity, 0),
        createdByName: r.created_by != null ? userName.get(r.created_by) ?? null : null,
        approvedByName: r.approved_by != null ? userName.get(r.approved_by) ?? null : null,
      };
    }), total, page, pageSize);
  }

  private async loadApprovedTransfer(tx: Prisma.TransactionClient, id: number, user: JwtUser) {
    const txn = await tx.inv_transactions.findFirst({ where: { id, ...notDeletedFilter() }, include: { items: true } });
    if (!txn) throw new NotFoundException('أمر الصرف غير موجود');
    this.assertBranchAccess(user, txn.branch_id);
    if (txn.txn_type !== InventoryTxnType.transfer || txn.status !== InventoryTxnStatus.approved) {
      throw new BadRequestException('هذا الإجراء متاح لأوامر الصرف المعتمدة فقط');
    }
    if (!txn.source_warehouse_id || !txn.target_warehouse_id) throw new BadRequestException('أمر الصرف بدون مخزن مصدر أو وجهة');
    return txn;
  }

  /** Returns `quantity` of a product from the receiving warehouse back to the source warehouse. */
  private async reverseTransferQuantity(
    tx: Prisma.TransactionClient,
    txn: { id: number; reference: string; branch_id: number; source_warehouse_id: number | null; target_warehouse_id: number | null },
    productId: number,
    quantity: number,
    unitCost: number,
    userId: number,
  ) {
    await this.stock.applyTransaction({
      transactionId: txn.id,
      txnType: InventoryTxnType.transfer,
      branchId: txn.branch_id,
      // Swapped direction: out of the branch that received it, back into the issuing warehouse.
      sourceWarehouseId: txn.target_warehouse_id,
      targetWarehouseId: txn.source_warehouse_id,
      docRef: `${txn.reference}-REV`,
      createdBy: userId,
      lines: [{ productId, quantity, unitCost }],
    }, tx);
  }

  /** Quantity-only edit of an approved issue order; quantities may only go down. */
  async reduceTransferQuantities(id: number, items: { itemId: number; quantity: number }[], user: JwtUser) {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('لا توجد تعديلات');
    await this.prisma.$transaction(async (tx) => {
      const txn = await this.loadApprovedTransfer(tx, id, user);
      for (const change of items) {
        const item = txn.items.find((i) => i.id === Number(change.itemId));
        if (!item) throw new BadRequestException('بند غير موجود في أمر الصرف');
        const current = toNumber(item.quantity);
        const next = Number(change.quantity);
        if (!Number.isFinite(next) || next < 0) throw new BadRequestException(`كمية غير صحيحة للصنف ${item.item_name}`);
        if (next > current) throw new BadRequestException(`لا يمكن زيادة كمية ${item.item_name}؛ التعديل بالنقص فقط`);
        if (next === current) continue;
        if (item.product_id != null) {
          await this.reverseTransferQuantity(tx, txn, item.product_id, current - next, toNumber(item.price), user.sub);
        }
        if (next === 0) {
          await tx.inv_transaction_items.delete({ where: { id: item.id } });
        } else {
          await tx.inv_transaction_items.update({
            where: { id: item.id },
            data: { quantity: next, total: Math.round(next * toNumber(item.price) * 100) / 100 },
          });
        }
      }
      const remaining = await tx.inv_transaction_items.findMany({ where: { transaction_id: id } });
      const total = Math.round(remaining.reduce((sum, i) => sum + toNumber(i.total), 0) * 100) / 100;
      await tx.inv_transactions.update({
        where: { id },
        data: { total_amount: total, ...(remaining.length ? {} : { is_deleted: true }) },
      });
    });
    return { success: true };
  }

  /** Deletes an approved issue order and returns every item to the source warehouse. */
  async removeApprovedTransfer(id: number, user: JwtUser) {
    await this.prisma.$transaction(async (tx) => {
      const txn = await this.loadApprovedTransfer(tx, id, user);
      for (const item of txn.items) {
        const qty = toNumber(item.quantity);
        if (item.product_id != null && qty > 0) {
          await this.reverseTransferQuantity(tx, txn, item.product_id, qty, toNumber(item.price), user.sub);
        }
      }
      await tx.inv_transactions.update({ where: { id }, data: { is_deleted: true } });
    });
    return { success: true };
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
