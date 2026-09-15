import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { InventoryLocationService } from './inventory-location.service';
import { toNumber } from './inventory.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListStockTakingDto, UpsertCountItemDto, UpsertCountSessionDto } from './dto/inventory.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

@Injectable()
export class StockTakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService = new BranchScopeService(),
  ) {}

  private assertBranchAccess(user: JwtUser, branchId: number | null) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

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
    const session = await this.findSession(id);
    if (session.status !== 'draft') throw new BadRequestException('لا يمكن تعديل جلسة بعد إرسالها للاعتماد');
    const row = await this.prisma.inv_count_sessions.update({
      where: { id },
      data: {
        ...(dto.warehouseId != null ? { warehouse_id: dto.warehouseId } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      },
      include: { items: true },
    });
    return this.mapSession(row);
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
    if (dto.countedQuantity < 0) throw new BadRequestException('الكمية المعدودة لا يمكن أن تكون سالبة');
    if (dto.productId && session.items.some((item) => item.productId === dto.productId)) {
      throw new BadRequestException('تمت إضافة هذا الصنف بالفعل في جلسة الجرد');
    }
    let systemQty = dto.systemQuantity ?? 0;
    if (dto.productId) {
      const balance = await this.prisma.inv_stock_balances.findUnique({
        where: {
          product_id_warehouse_id: { product_id: dto.productId, warehouse_id: session.warehouseId },
        },
      });
      if (balance) systemQty = toNumber(balance.current_stock);
    }
    const variance = dto.countedQuantity - systemQty;
    const varianceReason = dto.varianceReason?.trim() || null;
    if (variance !== 0 && !varianceReason) {
      throw new BadRequestException('سبب فرق الجرد مطلوب عند وجود عجز أو زيادة');
    }
    const row = await this.prisma.inv_count_items.create({
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
        status: dto.status ?? null,
      },
    });
    return {
      id: row.id,
      productId: row.product_id,
      systemQuantity: toNumber(row.system_quantity),
      countedQuantity: toNumber(row.counted_quantity),
      variance: toNumber(row.variance),
    };
  }

  async updateCountItem(
    sessionId: number,
    itemId: number,
    dto: UpsertCountItemDto,
    user: JwtUser,
  ) {
    const session = await this.findSession(sessionId);
    this.assertBranchAccess(user, session.branchId);
    if (session.status !== 'draft') {
      throw new BadRequestException('لا يمكن تعديل أصناف بعد إرسال الجرد للاعتماد');
    }
    if (dto.countedQuantity < 0) {
      throw new BadRequestException('الكمية المعدودة لا يمكن أن تكون سالبة');
    }
    const item = session.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('بند الجرد غير موجود داخل هذه الجلسة');

    const variance = dto.countedQuantity - item.systemQuantity;
    const varianceReason = dto.varianceReason?.trim() || null;
    if (variance !== 0 && !varianceReason) {
      throw new BadRequestException('سبب فرق الجرد مطلوب عند وجود عجز أو زيادة');
    }
    const row = await this.prisma.inv_count_items.update({
      where: { id: itemId },
      data: {
        counted_quantity: dto.countedQuantity,
        variance,
        variance_reason: varianceReason,
      },
    });
    return {
      id: row.id,
      productId: row.product_id,
      systemQuantity: toNumber(row.system_quantity),
      countedQuantity: toNumber(row.counted_quantity),
      variance: toNumber(row.variance),
      varianceReason: row.variance_reason,
    };
  }

  async removeCountItem(sessionId: number, itemId: number, user: JwtUser) {
    const session = await this.findSession(sessionId);
    this.assertBranchAccess(user, session.branchId);
    if (session.status !== 'draft') {
      throw new BadRequestException('لا يمكن حذف أصناف بعد إرسال الجرد للاعتماد');
    }
    if (!session.items.some((entry) => entry.id === itemId)) {
      throw new NotFoundException('بند الجرد غير موجود داخل هذه الجلسة');
    }
    await this.prisma.inv_count_items.delete({ where: { id: itemId } });
    return { success: true };
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

  async approveAdjustment(adjustmentId: number, userId: number, dryRun = false) {
    const adjustment = await this.prisma.inv_adjustments.findUnique({
      where: { id: adjustmentId },
      include: { session: { include: { items: true } } },
    });
    if (!adjustment) throw new NotFoundException('التسوية غير موجودة');
    if (adjustment.status === 'approved') throw new BadRequestException('التسوية معتمدة بالفعل');

    const session = adjustment.session;
    if (!session) throw new BadRequestException('جلسة الجرد غير مرتبطة');

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
    });

    return { success: true, adjustmentId };
  }
}
