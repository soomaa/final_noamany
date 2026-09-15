import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ChangeDebitNoteStatusDto,
  ListDebitNotesDto,
  SendDebitNoteDto,
  UpsertDebitNoteDto,
} from './dto/procurement-ext.dto';
import { lineTotal, nextDocNumber, notDeletedFilter, toNumber } from './procurement.utils';

@Injectable()
export class DebitNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapItem(item: Prisma.prc_debit_note_itemsGetPayload<object>) {
    return {
      id: item.id,
      name: item.name,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      amount: toNumber(item.amount),
    };
  }

  private map(row: Prisma.prc_debit_notesGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      debitNumber: row.debit_number,
      debitDate: row.debit_date,
      supplierId: row.supplier_id,
      purchaseOrderId: row.purchase_order_id,
      invoiceId: row.invoice_id,
      reason: row.reason,
      debitAmount: toNumber(row.debit_amount),
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      sentDate: row.sent_date,
      notes: row.notes,
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async stats(branchId?: string) {
    const and: Prisma.prc_debit_notesWhereInput[] = [notDeletedFilter()];
    if (branchId && branchId !== 'all') and.push({ branch_id: Number(branchId) });
    const where = { AND: and };
    const [total, aggregate, byStatus] = await Promise.all([
      this.prisma.prc_debit_notes.count({ where }),
      this.prisma.prc_debit_notes.aggregate({ where, _sum: { debit_amount: true } }),
      this.prisma.prc_debit_notes.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { debit_amount: true },
      }),
    ]);
    return {
      total,
      totalAmount: toNumber(aggregate._sum.debit_amount),
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: r._count,
        totalAmount: toNumber(r._sum.debit_amount),
      })),
    };
  }

  async list(q: ListDebitNotesDto) {
    const and: Prisma.prc_debit_notesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ debit_number: { contains: s } }, { reason: { contains: s } }],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.dateFrom || q.dateTo) {
      and.push({
        created_at: {
          ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
          ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
        },
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_debit_notes.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_debit_notes.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_debit_notes.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('إشعار الخصم غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertDebitNoteDto, userId: number) {
    const items = dto.items ?? [];
    const debitAmount =
      items.length > 0
        ? items.reduce((sum, i) => sum + lineTotal(i.quantity, i.unitPrice), 0)
        : dto.debitAmount;

    const row = await this.prisma.$transaction(async (tx) => {
      const debitNumber =
        dto.debitNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_debit_notes', 'debit_number', 'DN'));
      return tx.prc_debit_notes.create({
        data: {
          debit_number: debitNumber,
          debit_date: dto.debitDate ?? null,
          supplier_id: dto.supplierId,
          purchase_order_id: dto.purchaseOrderId ?? null,
          invoice_id: dto.invoiceId ?? null,
          reason: dto.reason.trim(),
          debit_amount: debitAmount,
          status: dto.status ?? 'مسودة',
          notes: dto.notes?.trim() ?? null,
          branch_id: dto.branchId ?? null,
          created_by: userId,
          items: items.length
            ? {
                create: items.map((i) => ({
                  name: i.name.trim(),
                  quantity: i.quantity,
                  unit_price: i.unitPrice,
                  amount: lineTotal(i.quantity, i.unitPrice),
                })),
              }
            : undefined,
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertDebitNoteDto>) {
    const existing = await this.prisma.prc_debit_notes.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إشعار الخصم غير موجود');

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.prc_debit_note_items.deleteMany({ where: { debit_note_id: id } });
      }
      const debitAmount = dto.items
        ? dto.items.reduce((sum, i) => sum + lineTotal(i.quantity, i.unitPrice), 0)
        : dto.debitAmount ?? toNumber(existing.debit_amount);

      return tx.prc_debit_notes.update({
        where: { id },
        data: {
          ...(dto.debitDate !== undefined ? { debit_date: dto.debitDate ?? null } : {}),
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          ...(dto.purchaseOrderId !== undefined
            ? { purchase_order_id: dto.purchaseOrderId ?? null }
            : {}),
          ...(dto.invoiceId !== undefined ? { invoice_id: dto.invoiceId ?? null } : {}),
          ...(dto.reason != null ? { reason: dto.reason.trim() } : {}),
          debit_amount: debitAmount,
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
                    name: i.name.trim(),
                    quantity: i.quantity,
                    unit_price: i.unitPrice,
                    amount: lineTotal(i.quantity, i.unitPrice),
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_debit_notes.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إشعار الخصم غير موجود');
    await this.prisma.prc_debit_notes.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async changeStatus(id: number, dto: ChangeDebitNoteStatusDto, userId: number) {
    const existing = await this.prisma.prc_debit_notes.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إشعار الخصم غير موجود');

    const data: Prisma.prc_debit_notesUpdateInput = {
      status: dto.status,
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
    };
    if (dto.status === 'معتمد') {
      data.approved_by = userId;
      data.approved_at = new Date();
    }

    const row = await this.prisma.prc_debit_notes.update({
      where: { id },
      data,
      include: { items: true },
    });
    return this.map(row);
  }

  async send(id: number, _dto: SendDebitNoteDto) {
    const existing = await this.prisma.prc_debit_notes.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إشعار الخصم غير موجود');
    if (existing.status !== 'معتمد') {
      throw new BadRequestException('يجب اعتماد إشعار الخصم قبل الإرسال');
    }
    const row = await this.prisma.prc_debit_notes.update({
      where: { id },
      data: {
        status: 'مرسل للمورد',
        sent_date: new Date(),
      },
      include: { items: true },
    });
    return this.map(row);
  }
}
