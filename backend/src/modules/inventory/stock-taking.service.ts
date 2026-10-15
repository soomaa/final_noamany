import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService, roundStock } from './inventory-stock.service';
import { InventoryLocationService } from './inventory-location.service';
import { toNumber } from './inventory.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListStockTakingDto, UpsertCountItemDto, UpsertCountSessionDto } from './dto/inventory.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

@Injectable()
export class StockTakingService {
  private readonly txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 };
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
        varianceReason: i.variance_reason,
        status: i.status,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listSessions(q: ListStockTakingDto) {
    const and: Prisma.inv_count_sessionsWhereInput[] = [];
    if (q.search?.trim()) and.push({ session_number: { contains: q.search.trim() } });
    if (q.warehouseId && q.warehouseId !== 'all') and.push({ warehouse_id: Number(q.warehouseId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
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
    return paginated(rows.map((r) => this.mapSession(r)), total, q.page, q.pageSize);
  }

  async findSession(id: number) {
    const row = await this.prisma.inv_count_sessions.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('جلسة الجرد غير موجودة');
    const adjustment = await this.prisma.inv_adjustments.findFirst({
      where: { session_id: id },
      select: { id: true, status: true },
    });
    return {
      ...this.mapSession(row),
      adjustmentId: adjustment?.id ?? null,
      adjustmentStatus: adjustment?.status ?? null,
    };
  }

  private async generateSessionNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ maxNum: number | bigint | null }[]>`
      SELECT MAX(CAST(SUBSTRING(session_number, 4) AS UNSIGNED)) AS maxNum
      FROM inv_count_sessions WHERE session_number LIKE 'CNT%'
    `;
    const nextNumber = BigInt(rows[0]?.maxNum ?? 0) + 1n;
    return `CNT${nextNumber.toString().padStart(6, '0')}`;
  }

  async createSession(dto: UpsertCountSessionDto, user: JwtUser) {
    const branchId = this.location.resolveStockTakingBranch(user, dto.branchId);
    const warehouseId = await this.location.resolveBranchStockLocation(branchId);
    const row = await this.prisma.inv_count_sessions.create({
      data: {
        session_number: dto.sessionNumber?.trim() || (await this.generateSessionNumber()),
        warehouse_id: warehouseId,
        branch_id: branchId,
        notes: dto.notes ?? null,
        created_by: user.sub,
      },
      include: { items: true },
    });
    return this.mapSession(row);
  }

  async updateSession(id: number, dto: Partial<UpsertCountSessionDto>) {
    const row = await this.prisma.$transaction(async tx => {
      const session = await this.lockDraftSession(tx, id, 'تعديل الجلسة');
      if ((dto.warehouseId != null && dto.warehouseId !== session.warehouse_id)
        || (dto.branchId !== undefined && dto.branchId !== session.branch_id)) {
        throw new BadRequestException('لا يمكن تغيير الفرع أو مخزن جلسة الجرد؛ أنشئ جلسة جديدة للموقع المطلوب');
      }
      return tx.inv_count_sessions.update({ where: { id },
        data: dto.notes !== undefined ? { notes: dto.notes ?? null } : {}, include: { items: true } });
    }, this.txOptions);
    return this.mapSession(row);
  }

  async removeSession(id: number) {
    await this.prisma.$transaction(async tx => {
      await this.lockDraftSession(tx, id, 'حذف الجلسة');
      const approved = await tx.inv_adjustments.findFirst({ where: { session_id: id, status: 'approved' } });
      if (approved) throw new BadRequestException('لا يمكن حذف جلسة لها تسوية معتمدة');
      await tx.inv_adjustments.deleteMany({ where: { session_id: id } });
      await tx.inv_count_sessions.delete({ where: { id } });
    }, this.txOptions);
    return { success: true };
  }

  /**
   * Lock the session row for the rest of the transaction and re-read it with its
   * items. Two devices adding or editing lines in the same session are serialized
   * here, so the duplicate-product check below cannot race (a duplicate line would
   * otherwise apply the same shortage twice at approval).
   */
  private async lockDraftSession(tx: Prisma.TransactionClient, sessionId: number, action: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM inv_count_sessions WHERE id = ${sessionId} FOR UPDATE`);
    const session = await tx.inv_count_sessions.findUnique({ where: { id: sessionId }, include: { items: true } });
    if (!session) throw new NotFoundException('جلسة الجرد غير موجودة');
    if (session.status !== 'draft') throw new BadRequestException(`لا يمكن ${action} بعد إرسال الجرد للاعتماد`);
    return session;
  }

  // Count writers share this lock even across different sessions. READ COMMITTED
  // makes the revision read after waiting see the previous approval's commit.
  private async lockCountProducts(tx: Prisma.TransactionClient, ids: number[]) {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    if (sorted.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM inv_products WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`);
  }

  private latestCountMovement(tx: Prisma.TransactionClient, productId: number, warehouseId: number) {
    return tx.inv_movements.findFirst({
      where: { product_id: productId, warehouse_id: warehouseId, doc_type: 'stock_taking' },
      orderBy: { id: 'desc' }, select: { id: true, created_at: true },
    });
  }

  private async assertCountBaselines(tx: Prisma.TransactionClient, session: Prisma.inv_count_sessionsGetPayload<{ include: { items: true } }>) {
    for (const item of session.items) {
      if (!item.product_id || toNumber(item.variance) === 0) continue;
      const latest = await this.latestCountMovement(tx, item.product_id, session.warehouse_id);
      const changed = item.baseline_count_movement_id != null
        ? (latest?.id ?? 0) !== item.baseline_count_movement_id
        : latest != null && latest.created_at >= item.created_at;
      if (changed) throw new BadRequestException(`تغير رصيد المقارنة بسبب جرد آخر للصنف «${item.item_name}». اختر إعادة عد الصنف قبل الاعتماد؛ إذا كانت الجلسة مرسلة فأعد فتحها أولاً`);
    }
  }

  /** Current warehouse balance of the product — the baseline a count is compared against. */
  private async currentSystemQuantity(
    tx: Prisma.TransactionClient,
    productId: number,
    warehouseId: number,
    fallback: number,
  ) {
    const balance = await tx.inv_stock_balances.findUnique({
      where: { product_id_warehouse_id: { product_id: productId, warehouse_id: warehouseId } },
    });
    return balance ? toNumber(balance.current_stock) : fallback;
  }

  private static duplicateProductLines(items: { product_id: number | null }[]) {
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const item of items) {
      if (item.product_id == null) continue;
      if (seen.has(item.product_id)) duplicates.add(item.product_id);
      seen.add(item.product_id);
    }
    return [...duplicates];
  }

  async addCountItem(sessionId: number, dto: UpsertCountItemDto) {
    if (dto.countedQuantity < 0) throw new BadRequestException('الكمية المعدودة لا يمكن أن تكون سالبة');
    const varianceReason = dto.varianceReason?.trim() || null;
    const row = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockDraftSession(tx, sessionId, 'إضافة أصناف');
      if (dto.productId && session.items.some((item) => item.product_id === dto.productId)) {
        throw new BadRequestException('تمت إضافة هذا الصنف بالفعل في جلسة الجرد');
      }
      await this.lockCountProducts(tx, dto.productId ? [dto.productId] : []);
      const systemQty = dto.productId
        ? await this.currentSystemQuantity(tx, dto.productId, session.warehouse_id, dto.systemQuantity ?? 0)
        : dto.systemQuantity ?? 0;
      const variance = roundStock(dto.countedQuantity - systemQty);
      const baseline = dto.productId ? await this.latestCountMovement(tx, dto.productId, session.warehouse_id) : null;
      if (variance !== 0 && !varianceReason) {
        throw new BadRequestException('سبب فرق الجرد مطلوب عند وجود عجز أو زيادة');
      }
      return tx.inv_count_items.create({
        data: {
          session_id: sessionId,
          product_id: dto.productId ?? null,
          item_code: dto.itemCode ?? null,
          item_name: dto.itemName,
          category: dto.category ?? null,
          system_quantity: systemQty,
          counted_quantity: dto.countedQuantity,
          variance,
          variance_reason: varianceReason,
          baseline_count_movement_id: baseline?.id ?? 0,
          status: dto.status ?? null,
        },
      });
    }, this.txOptions);
    return {
      id: row.id,
      productId: row.product_id,
      systemQuantity: toNumber(row.system_quantity),
      countedQuantity: toNumber(row.counted_quantity),
      variance: toNumber(row.variance),
    };
  }

  /**
   * Two different edits, chosen explicitly by the counter:
   *  - correction (default): the original count had a typo. The system balance captured when the
   *    line was first counted is kept, so sales rung up since then are not credited back.
   *  - recount (`dto.recount`): the item was physically counted again now. The baseline is re-read
   *    from the live balance, so sales since the first count are not deducted a second time.
   * Applying the wrong one leaves exactly the sales in between as a phantom surplus or shortage.
   */
  async updateCountItem(sessionId: number, itemId: number, dto: UpsertCountItemDto) {
    if (dto.countedQuantity < 0) {
      throw new BadRequestException('الكمية المعدودة لا يمكن أن تكون سالبة');
    }
    const varianceReason = dto.varianceReason?.trim() || null;
    const row = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockDraftSession(tx, sessionId, 'تعديل أصناف');
      const item = session.items.find((entry) => entry.id === itemId);
      if (!item) throw new NotFoundException('بند الجرد غير موجود داخل هذه الجلسة');
      if (dto.recount && item.product_id) await this.lockCountProducts(tx, [item.product_id]);
      const systemQty = dto.recount && item.product_id
        ? await this.currentSystemQuantity(tx, item.product_id, session.warehouse_id, toNumber(item.system_quantity))
        : toNumber(item.system_quantity);
      const variance = roundStock(dto.countedQuantity - systemQty);
      const baseline = dto.recount && item.product_id ? await this.latestCountMovement(tx, item.product_id, session.warehouse_id) : null;
      if (variance !== 0 && !varianceReason) {
        throw new BadRequestException('سبب فرق الجرد مطلوب عند وجود عجز أو زيادة');
      }
      return tx.inv_count_items.update({
        where: { id: itemId },
        data: {
          system_quantity: systemQty,
          counted_quantity: dto.countedQuantity,
          variance,
          variance_reason: varianceReason,
          ...(dto.recount ? { baseline_count_movement_id: baseline?.id ?? 0 } : {}),
        },
      });
    }, this.txOptions);
    return {
      id: row.id,
      productId: row.product_id,
      systemQuantity: toNumber(row.system_quantity),
      countedQuantity: toNumber(row.counted_quantity),
      variance: toNumber(row.variance),
      varianceReason: row.variance_reason,
    };
  }

  async removeCountItem(sessionId: number, itemId: number) {
    await this.prisma.$transaction(async tx => {
      const session = await this.lockDraftSession(tx, sessionId, 'حذف أصناف');
      if (!session.items.some(entry => entry.id === itemId)) throw new NotFoundException('بند الجرد غير موجود داخل هذه الجلسة');
      await tx.inv_count_items.delete({ where: { id: itemId } });
    }, this.txOptions);
    return { success: true };
  }

  async finalizeSession(sessionId: number, userId: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockDraftSession(tx, sessionId, 'إرسال الجرد');
      if (!session.items.length) throw new BadRequestException('يجب إضافة صنف واحد على الأقل للجرد');
      if (session.items.some((item) => !item.product_id)) {
        throw new BadRequestException('كل بنود الجرد يجب أن تكون مرتبطة بصنف مخزون');
      }
      if (StockTakingService.duplicateProductLines(session.items).length) {
        throw new BadRequestException('يوجد صنف مكرر في بنود الجرد؛ احذف البند المكرر قبل الإرسال');
      }
      await this.lockCountProducts(tx, session.items.flatMap(item => item.product_id ? [item.product_id] : []));
      await this.assertCountBaselines(tx, session);
      const existing = await tx.inv_adjustments.findFirst({
        where: { session_id: sessionId },
      });
      if (existing?.status === 'approved') throw new BadRequestException('تسوية الجرد معتمدة بالفعل');
      const claimed = await tx.inv_count_sessions.updateMany({
        where: { id: sessionId, status: 'draft' },
        data: { status: 'awaiting_approval' },
      });
      if (claimed.count !== 1) throw new BadRequestException('جلسة الجرد مرسلة بالفعل');
      if (existing) {
        await tx.inv_adjustments.update({ where: { id: existing.id }, data: { status: 'pending' } });
        return existing.id;
      }
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
    }, this.txOptions);
    return { success: true, adjustmentId: result };
  }

  async reopenSession(sessionId: number) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inv_count_sessions WHERE id = ${sessionId} FOR UPDATE`);
      const session = await tx.inv_count_sessions.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('جلسة الجرد غير موجودة');
      if (session.status !== 'awaiting_approval') throw new BadRequestException('إعادة الفتح متاحة للجرد الذي ينتظر الاعتماد فقط');
      const adjustment = await tx.inv_adjustments.findFirst({ where: { session_id: sessionId } });
      if (adjustment?.status === 'approved') throw new BadRequestException('لا يمكن إعادة فتح جرد معتمد');
      if (adjustment) await tx.inv_adjustments.update({ where: { id: adjustment.id }, data: { status: 'draft' } });
      await tx.inv_count_sessions.update({ where: { id: sessionId }, data: { status: 'draft' } });
    }, this.txOptions);
    return { success: true };
  }

  async approveAdjustment(adjustmentId: number, userId: number, dryRun = false) {
    const adjustment = await this.prisma.inv_adjustments.findUnique({
      where: { id: adjustmentId },
      include: { session: { include: { items: true } } },
    });
    if (!adjustment) throw new NotFoundException('التسوية غير موجودة');
    if (adjustment.status === 'approved') throw new BadRequestException('التسوية معتمدة بالفعل');

    const session = adjustment.session;
    if (!session) throw new BadRequestException('جلسة الجرد غير مرتبطة');
    // Defense in depth for sessions created before the serialized add: a duplicated
    // product line would apply its variance twice.
    if (StockTakingService.duplicateProductLines(session.items).length) {
      throw new BadRequestException('يوجد صنف مكرر في بنود الجرد؛ لا يمكن اعتماد التسوية قبل حذف البند المكرر');
    }

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
        { rows: previewRows, warning: 'سيتم تطبيق فروقات الجرد على الأرصدة الحالية مع الحفاظ على الحركات اللاحقة للعد' },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inv_count_sessions WHERE id = ${adjustment.session!.id} FOR UPDATE`);
      const current = await tx.inv_adjustments.findUnique({ where: { id: adjustmentId }, include: { session: { include: { items: true } } } });
      if (!current?.session || current.session.status !== 'awaiting_approval' || current.status !== 'pending') {
        throw new BadRequestException('تغيرت حالة الجرد؛ أعد فتح الصفحة قبل الاعتماد');
      }
      const session = current.session;
      if (!session.items.length || session.items.some(item => !item.product_id)
        || StockTakingService.duplicateProductLines(session.items).length
        || (current.warehouse_id != null && current.warehouse_id !== session.warehouse_id)) {
        throw new BadRequestException('بنود الجرد أو مخزنه غير متسقة؛ أعد فتح الجلسة لمراجعتها');
      }
      await this.lockCountProducts(tx, session.items.flatMap(item => item.product_id ? [item.product_id] : []));
      await this.assertCountBaselines(tx, session);
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
        const variance = toNumber(item.variance);
        const value = Math.abs(variance) * (costByProduct.get(item.product_id) ?? 0);
        if (variance > 0) gainAmount += value;
        if (variance < 0) lossAmount += value;
        if (variance === 0) continue;
        await this.stock.applyMovement(
          {
            productId: item.product_id,
            warehouseId: session.warehouse_id,
            direction: variance > 0 ? MovementDirection.in : MovementDirection.out,
            quantity: Math.abs(variance),
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
    }, this.txOptions);

    return { success: true, adjustmentId };
  }
}
