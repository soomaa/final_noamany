import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { InventoryLocationService } from './inventory-location.service';
import { toNumber } from './inventory.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import { cairoDayRange } from '../../common/utils/cairo-day-range.util';
import { isReceptionEmployee } from '../../common/utils/reception-user.util';
import { ListStockTakingDto, UpsertCountItemDto, UpsertCountSessionDto } from './dto/inventory.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

@Injectable()
export class StockTakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private mapSession(row: Prisma.inv_count_sessionsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      sessionNumber: row.session_number,
      warehouseId: row.warehouse_id,
      branchId: row.branch_id,
      categoryId: row.category_id,
      status: row.status,
      notes: row.notes,
      createdBy: row.created_by,
      items: row.items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        itemCode: i.item_code,
        itemName: i.item_name,
        category: i.category,
        systemQuantity: toNumber(i.system_quantity),
        countedQuantity: toNumber(i.counted_quantity),
        variance: toNumber(i.variance),
        notes: i.variance_reason,
        status: i.status,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listSessions(q: ListStockTakingDto, user?: JwtUser) {
    const and: Prisma.inv_count_sessionsWhereInput[] = [];
    if (user) { const branches=new BranchScopeService().resolveListFilter(user); if(branches) and.push({branch_id:{in:branches}}); }
    // Reception employees only see today's count reports.
    if (isReceptionEmployee(user)) and.push({ created_at: cairoDayRange() });
    if (q.search?.trim()) and.push({ session_number: { contains: q.search.trim() } });
    if (q.warehouseId && q.warehouseId !== 'all') and.push({ warehouse_id: Number(q.warehouseId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    const cairoDay = (day: string) => cairoDayRange(new Date(`${day}T12:00:00Z`));
    if (q.dateFrom) and.push({ created_at: { gte: cairoDay(q.dateFrom).gte } });
    if (q.dateTo) and.push({ created_at: { lt: cairoDay(q.dateTo).lt } });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.inv_count_sessions.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.inv_count_sessions.count({ where }),
    ]);
    return paginated(await this.withNames(rows), total, q.page, q.pageSize);
  }

  /** Adds warehouse, category and employee names for display. */
  private async withNames(rows: Prisma.inv_count_sessionsGetPayload<{ include: { items: true } }>[]) {
    const warehouseIds = [...new Set(rows.map((r) => r.warehouse_id))];
    const categoryIds = [...new Set(rows.map((r) => r.category_id).filter((v): v is number => v != null))];
    const userIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is number => v != null))];
    const [warehouses, categories, users] = await Promise.all([
      this.prisma.inv_warehouses.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name_ar: true } }),
      this.prisma.inv_categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name_ar: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }),
    ]);
    const warehouseNames = new Map(warehouses.map((w) => [w.id, w.name_ar]));
    const categoryNames = new Map(categories.map((c) => [c.id, c.name_ar]));
    const userNames = new Map(users.map((u) => [u.user_id, u.name || u.username]));
    return rows.map((r) => ({
      ...this.mapSession(r),
      warehouseName: warehouseNames.get(r.warehouse_id) ?? null,
      categoryName: r.category_id ? categoryNames.get(r.category_id) ?? null : null,
      createdByName: r.created_by ? userNames.get(r.created_by) ?? null : null,
    }));
  }

  /** Every active product of the category stocked in the warehouse, with its current (available) quantity. */
  async countSheet(warehouseId: number, categoryId: number | undefined, user: JwtUser) {
    const selected = await this.location.resolveSelection(user, warehouseId);
    const balances = await this.prisma.inv_stock_balances.findMany({
      where: {
        warehouse_id: selected.warehouseId,
        product: { is_deleted: false, status: 'active', ...(categoryId ? { category_id: categoryId } : {}) },
      },
      select: { product_id: true, current_stock: true, product: { select: { name_ar: true, product_code: true, unit_of_measure: true } } },
      orderBy: { product: { name_ar: 'asc' } },
    });
    return balances.map((b) => ({
      productId: b.product_id,
      productCode: b.product.product_code,
      productName: b.product.name_ar,
      unit: b.product.unit_of_measure,
      availableQuantity: toNumber(b.current_stock),
    }));
  }

  /** Replaces the session's items with the submitted sheet, snapshotting the current system quantity. */
  private async writeSheet(tx: Prisma.TransactionClient, sessionId: number, warehouseId: number, lines: NonNullable<UpsertCountSessionDto['items']>) {
    if (!lines.length) throw new BadRequestException('يجب إضافة صنف واحد على الأقل للجرد');
    const productIds = [...new Set(lines.map((l) => l.productId))];
    if (productIds.length !== lines.length) throw new BadRequestException('صنف مكرر في محضر الجرد');
    const [products, balances] = await Promise.all([
      tx.inv_products.findMany({ where: { id: { in: productIds }, is_deleted: false }, select: { id: true, name_ar: true, product_code: true } }),
      tx.inv_stock_balances.findMany({ where: { warehouse_id: warehouseId, product_id: { in: productIds } }, select: { product_id: true, current_stock: true } }),
    ]);
    if (products.length !== productIds.length) throw new BadRequestException('صنف غير موجود في محضر الجرد');
    const productById = new Map(products.map((p) => [p.id, p]));
    const stockById = new Map(balances.map((b) => [b.product_id, toNumber(b.current_stock)]));
    await tx.inv_count_items.deleteMany({ where: { session_id: sessionId } });
    await tx.inv_count_items.createMany({
      data: lines.map((l) => {
        const systemQty = stockById.get(l.productId) ?? 0;
        const product = productById.get(l.productId)!;
        return {
          session_id: sessionId,
          product_id: l.productId,
          item_code: product.product_code,
          item_name: product.name_ar,
          system_quantity: systemQty,
          counted_quantity: l.countedQuantity,
          variance: l.countedQuantity - systemQty,
          variance_reason: l.notes?.trim() || null,
        };
      }),
    });
  }

  async findSession(id: number, user?: JwtUser) {
    const row = await this.prisma.inv_count_sessions.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('جلسة الجرد غير موجودة');
    if (user && !new BranchScopeService().isBranchAllowed(user,row.branch_id ?? 0)) throw new ForbiddenException('جلسة الجرد خارج صلاحيات المستخدم');
    if (isReceptionEmployee(user)) {
      const today = cairoDayRange();
      if (row.created_at < today.gte || row.created_at >= today.lt) throw new NotFoundException('جلسة الجرد غير موجودة');
    }
    const adjustment = await this.prisma.inv_adjustments.findFirst({
      where: { session_id: id },
      select: { id: true, status: true },
    });
    return {
      ...(await this.withNames([row]))[0],
      adjustmentId: adjustment?.id ?? null,
      adjustmentStatus: adjustment?.status ?? null,
    };
  }

  private async generateSessionNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | bigint | null }[]>`
      SELECT MAX(CAST(SUBSTRING(session_number, 4) AS UNSIGNED)) AS maxNum
      FROM inv_count_sessions WHERE session_number LIKE 'CNT%'
    `;
    return `CNT${String(Number(rows[0]?.maxNum ?? 0) + 1).padStart(6, '0')}`;
  }

  async createSession(dto: UpsertCountSessionDto, user: JwtUser) {
    const selected = dto.warehouseId ? await this.location.resolveSelection(user, dto.warehouseId, dto.branchId) : null;
    const branchId = selected?.branchId ?? this.location.requireUserBranch(user);
    const warehouseId = selected?.warehouseId ?? await this.location.resolveBranchStockLocation(branchId);
    const sessionNumber = dto.sessionNumber?.trim() || (await this.generateSessionNumber());
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inv_count_sessions.create({
        data: {
          session_number: sessionNumber,
          warehouse_id: warehouseId,
          branch_id: branchId,
          category_id: dto.categoryId ?? null,
          notes: dto.notes ?? null,
          created_by: user.sub,
        },
      });
      if (dto.items) await this.writeSheet(tx, created.id, warehouseId, dto.items);
      return created.id;
    });
    return this.findSession(id);
  }

  async updateSession(id: number, dto: Partial<UpsertCountSessionDto>) {
    const session = await this.findSession(id);
    if (session.status !== 'draft') throw new BadRequestException('لا يمكن تعديل جلسة بعد إرسالها للاعتماد');
    await this.prisma.$transaction(async (tx) => {
      await tx.inv_count_sessions.update({
        where: { id },
        data: {
          ...(dto.warehouseId != null ? { warehouse_id: dto.warehouseId } : {}),
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        },
      });
      if (dto.items) await this.writeSheet(tx, id, dto.warehouseId ?? session.warehouseId, dto.items);
    });
    return this.findSession(id);
  }

  async removeSession(id: number) {
    const session = await this.findSession(id);
    if (session.status !== 'draft') throw new BadRequestException('لا يمكن حذف جلسة بعد إرسالها للاعتماد');
    await this.prisma.inv_count_sessions.delete({ where: { id } });
    return { success: true };
  }

  async addCountItem(sessionId: number, dto: UpsertCountItemDto) {
    const session = await this.findSession(sessionId);
    if (session.status !== 'draft') throw new BadRequestException('لا يمكن إضافة أصناف بعد إرسال الجرد للاعتماد');
    if (!dto.productId || dto.countedQuantity < 0) throw new BadRequestException('اختر صنفًا وكمية معدودة غير سالبة');
    const existingItem = session.items.find((i) => i.productId === dto.productId);
    let systemQty = 0;
    if (dto.productId) {
      const balance = await this.prisma.inv_stock_balances.findUnique({
        where: {
          product_id_warehouse_id: { product_id: dto.productId, warehouse_id: session.warehouseId },
        },
      });
      if (balance) systemQty = toNumber(balance.current_stock);
    }
    const variance = dto.countedQuantity - systemQty;
    const data = {
        session_id: sessionId,
        product_id: dto.productId ?? null,
        item_code: dto.itemCode ?? null,
        item_name: dto.itemName,
        category: dto.category ?? null,
        system_quantity: systemQty,
        counted_quantity: dto.countedQuantity,
        variance,
        status: dto.status ?? null,
    };
    const row = existingItem
      ? await this.prisma.inv_count_items.update({where:{id:existingItem.id},data})
      : await this.prisma.inv_count_items.create({data});
    return {
      id: row.id,
      productId: row.product_id,
      systemQuantity: toNumber(row.system_quantity),
      countedQuantity: toNumber(row.counted_quantity),
      variance: toNumber(row.variance),
    };
  }

  async finalizeSession(sessionId: number, userId: number) {
    const session = await this.prisma.inv_count_sessions.findUnique({
      where: { id: sessionId },
      include: { items: true },
    });
    if (!session) throw new NotFoundException('جلسة الجرد غير موجودة');
    if (session.status !== 'draft') throw new BadRequestException('جلسة الجرد مرسلة بالفعل');
    if (!session.items.length) throw new BadRequestException('يجب إضافة صنف واحد على الأقل للجرد');
    if (session.items.some((item) => !item.product_id)) {
      throw new BadRequestException('كل بنود الجرد يجب أن تكون مرتبطة بصنف مخزون');
    }
    const existing = await this.prisma.inv_adjustments.findFirst({
      where: { session_id: sessionId },
    });
    if (existing) return { success: true, adjustmentId: existing.id };
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.inv_count_sessions.updateMany({
        where: { id: sessionId, status: 'draft' },
        data: { status: 'awaiting_approval' },
      });
      if (claimed.count !== 1) throw new BadRequestException('جلسة الجرد مرسلة بالفعل');
      const adjustment = await tx.inv_adjustments.create({
        data: {
          adjustment_number: `ADJ-${session.session_number}`,
          session_id: session.id,
          warehouse_id: session.warehouse_id,
          status: 'pending',
          notes: `تسوية تلقائية من جلسة الجرد ${session.session_number} — مرسل بواسطة ${userId}`,
        },
      });
      return adjustment.id;
    });
    return { success: true, adjustmentId: result };
  }

  async reopenSession(id: number, user: JwtUser) {
    await this.findSession(id,user);
    return this.prisma.$transaction(async(tx)=>{
      const claimed=await tx.inv_count_sessions.updateMany({where:{id,status:'awaiting_approval'},data:{status:'draft'}});
      if(claimed.count!==1) throw new BadRequestException('يمكن إعادة فتح الجرد الذي ينتظر الاعتماد فقط');
      const adjustment=await tx.inv_adjustments.findFirst({where:{session_id:id}});
      if(adjustment?.status==='approved') throw new BadRequestException('لا يمكن إعادة فتح جرد معتمد');
      await tx.inv_adjustments.deleteMany({where:{session_id:id,status:'pending'}});
      return {success:true};
    });
  }

  async approveAdjustment(adjustmentId: number, userId: number, dryRun = false, user?: JwtUser) {
    const adjustment = await this.prisma.inv_adjustments.findUnique({
      where: { id: adjustmentId },
      include: { session: { include: { items: true } } },
    });
    if (!adjustment) throw new NotFoundException('التسوية غير موجودة');
    if (adjustment.status === 'approved') throw new BadRequestException('التسوية معتمدة بالفعل');

    const session = adjustment.session;
    if (!session) throw new BadRequestException('جلسة الجرد غير مرتبطة');
    if (user && !new BranchScopeService().isBranchAllowed(user,session.branch_id ?? 0)) throw new ForbiddenException('التسوية خارج صلاحيات المستخدم');

    const previewRows: PreviewRow[] = session.items
      .filter((i) => i.product_id)
      .map((i) => ({
        label: i.item_name ?? i.item_code ?? `#${i.product_id}`,
        before: String(toNumber(i.system_quantity)),
        after: String(toNumber(i.counted_quantity)),
      }));

    if (isDryRun(dryRun)) {
      return previewResponse(
        { adjustmentId, itemCount: previewRows.length },
        { rows: previewRows, warning: 'سيتم استبدال أرصدة المخزون بالكميات المعدودة' },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Guarded claim: flip the status conditionally inside the tx so two concurrent approves
      // can't both apply the stock movements — the loser sees count === 0.
      const claimed = await tx.inv_adjustments.updateMany({
        where: { id: adjustmentId, status: { not: 'approved' } },
        data: { status: 'approved', approved_at: new Date(), approved_by: String(userId) },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('التسوية معتمدة بالفعل');
      }
      const productIds = session.items.flatMap((item) => (item.product_id ? [item.product_id] : []));
      const products = await tx.inv_products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, cost_price: true },
      });
      const costByProduct = new Map(products.map((product) => [product.id, toNumber(product.cost_price)]));
      let gainAmount = 0;
      let lossAmount = 0;
      for (const item of session.items) {
        if (!item.product_id) continue;
        await tx.$queryRaw`SELECT id FROM inv_stock_balances WHERE product_id = ${item.product_id} AND warehouse_id = ${session.warehouse_id} FOR UPDATE`;
        const current=await tx.inv_stock_balances.findUnique({where:{product_id_warehouse_id:{product_id:item.product_id,warehouse_id:session.warehouse_id}}});
        if (Math.abs(toNumber(current?.current_stock)-toNumber(item.system_quantity))>0.000001) throw new BadRequestException('حدثت حركة مخزنية بعد العد؛ أعد الجرد قبل اعتماد التسوية');
        const value = Math.abs(toNumber(item.variance)) * (costByProduct.get(item.product_id) ?? 0);
        if (toNumber(item.variance) > 0) gainAmount += value;
        if (toNumber(item.variance) < 0) lossAmount += value;
        await this.stock.applyMovement(
          {
            productId: item.product_id,
            warehouseId: session.warehouse_id,
            direction: MovementDirection.in,
            quantity: toNumber(item.counted_quantity),
            operation: 'set',
            txnType: InventoryTxnType.count,
            docType: 'stock_taking',
            docRef: adjustment.adjustment_number,
            branchId: session.branch_id ?? undefined,
            createdBy: userId,
          },
          tx,
        );
      }
      await this.moduleLedger.postInventoryCountAdjustment(
        {
          adjustmentNumber: adjustment.adjustment_number,
          branchId: session.branch_id ?? undefined,
          date: new Date().toISOString().slice(0, 10),
          gainAmount,
          lossAmount,
          createdBy: userId,
        },
        tx,
      );
      await tx.inv_count_sessions.update({
        where: { id: session.id },
        data: { status: 'completed' },
      });
    });

    return { success: true, adjustmentId };
  }
}
