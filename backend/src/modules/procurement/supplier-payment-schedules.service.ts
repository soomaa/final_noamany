import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { ProcurementScopeService } from './procurement-scope.service';
import {
  ListSupplierPaymentSchedulesDto,
  UpsertSupplierPaymentScheduleDto,
} from './dto/procurement-ext.dto';
import { toNumber } from './procurement.utils';

@Injectable()
export class SupplierPaymentSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ProcurementScopeService,
  ) {}

  /** Schedules have no branch of their own; they belong to their purchase invoice's branch. */
  private async assertInvoice(user: JwtUser, purchaseInvoiceId: number) {
    const invoice = await this.prisma.prc_purchase_invoices.findFirst({
      where: { id: purchaseInvoiceId, is_deleted: false },
      select: { branch_id: true, purchase_order_id: true },
    });
    if (!invoice) throw new NotFoundException('فاتورة الشراء غير موجودة');
    await this.scope.assertDocument(user, invoice);
  }

  private map(row: Prisma.prc_supplier_payment_schedulesGetPayload<object>) {
    return {
      id: row.id,
      purchaseInvoiceId: row.purchase_invoice_id,
      scheduledDate: row.scheduled_date,
      amount: toNumber(row.amount),
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSupplierPaymentSchedulesDto, user?: JwtUser) {
    const and: Prisma.prc_supplier_payment_schedulesWhereInput[] = [];
    const scoped = this.scope.listBranches(user);
    if (scoped) and.push({ invoice: { branch_id: { in: scoped } } });
    if (q.purchaseInvoiceId && q.purchaseInvoiceId !== 'all') {
      and.push({ purchase_invoice_id: Number(q.purchaseInvoiceId) });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.prc_supplier_payment_schedules.findMany({
        where,
        orderBy: { scheduled_date: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supplier_payment_schedules.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.prc_supplier_payment_schedules.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('جدول الدفع غير موجود');
    await this.assertInvoice(user, row.purchase_invoice_id);
    return this.map(row);
  }

  async create(dto: UpsertSupplierPaymentScheduleDto, user: JwtUser) {
    await this.assertInvoice(user, dto.purchaseInvoiceId);
    const row = await this.prisma.prc_supplier_payment_schedules.create({
      data: {
        purchase_invoice_id: dto.purchaseInvoiceId,
        scheduled_date: dto.scheduledDate ?? null,
        amount: dto.amount,
        payment_method: dto.paymentMethod ?? null,
        status: dto.status ?? 'مجدول',
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSupplierPaymentScheduleDto>, user: JwtUser) {
    await this.findOne(id, user);
    if (dto.purchaseInvoiceId != null) await this.assertInvoice(user, dto.purchaseInvoiceId);
    const row = await this.prisma.prc_supplier_payment_schedules.update({
      where: { id },
      data: {
        ...(dto.purchaseInvoiceId != null ? { purchase_invoice_id: dto.purchaseInvoiceId } : {}),
        ...(dto.scheduledDate !== undefined ? { scheduled_date: dto.scheduledDate ?? null } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.paymentMethod !== undefined ? { payment_method: dto.paymentMethod ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number, user: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.prc_supplier_payment_schedules.delete({ where: { id } });
    return { success: true };
  }
}
