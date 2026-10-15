import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupplierDashboardQueryDto } from './dto/procurement-ext.dto';
import { notDeletedFilter, toNumber } from './procurement.utils';

@Injectable()
export class SupplierDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private poFilter(branchId?: string): Prisma.prc_purchase_ordersWhereInput {
    const and: Prisma.prc_purchase_ordersWhereInput[] = [notDeletedFilter()];
    if (branchId && branchId !== 'all') and.push({ branch_id: Number(branchId) });
    return { AND: and };
  }

  async stats(q: SupplierDashboardQueryDto) {
    const poWhere = this.poFilter(q.branchId);
    const [
      totalSuppliers,
      activeContracts,
      poCount,
      poTotal,
      invoiceCount,
      invoiceTotal,
      pendingPayments,
      overdueInvoices,
    ] = await Promise.all([
      this.prisma.inv_suppliers.count({ where: { is_deleted: false, is_active: true } }),
      this.prisma.prc_supplier_contracts.count({
        where: { AND: [notDeletedFilter(), { status: 'active' }] },
      }),
      this.prisma.prc_purchase_orders.count({ where: poWhere }),
      this.prisma.prc_purchase_orders.aggregate({ where: poWhere, _sum: { total_amount: true } }),
      this.prisma.prc_purchase_invoices.count({ where: { AND: [notDeletedFilter()] } }),
      this.prisma.prc_purchase_invoices.aggregate({
        where: { AND: [notDeletedFilter()] },
        _sum: { invoice_amount: true },
      }),
      this.prisma.prc_supplier_payments.count({
        where: { AND: [notDeletedFilter(), { status: { in: ['مسودة', 'معلق'] } }] },
      }),
      this.prisma.prc_supplier_invoices.count({
        where: {
          AND: [
            notDeletedFilter(),
            { remaining_amount: { gt: 0 } },
            { status: { not: 'مدفوعة' } },
          ],
        },
      }),
    ]);

    return {
      totalSuppliers,
      activeContracts,
      totalPurchaseOrders: poCount,
      totalPurchaseValue: toNumber(poTotal._sum.total_amount),
      totalInvoices: invoiceCount,
      totalInvoiceValue: toNumber(invoiceTotal._sum.invoice_amount),
      pendingPayments,
      overdueInvoices,
    };
  }

  async top(q: SupplierDashboardQueryDto) {
    const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 50) : 10;
    const grouped = await this.prisma.prc_purchase_orders.groupBy({
      by: ['supplier_id'],
      where: this.poFilter(q.branchId),
      _count: true,
      _sum: { total_amount: true },
      orderBy: { _sum: { total_amount: 'desc' } },
      take: limit,
    });

    const supplierIds = grouped.map((g) => g.supplier_id);
    const suppliers = await this.prisma.inv_suppliers.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name_ar: true, name_en: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    return grouped.map((g) => ({
      supplierId: g.supplier_id,
      supplierNameAr: supplierMap.get(g.supplier_id)?.name_ar ?? null,
      supplierNameEn: supplierMap.get(g.supplier_id)?.name_en ?? null,
      orderCount: g._count,
      totalValue: toNumber(g._sum.total_amount),
    }));
  }

  async activity(q: SupplierDashboardQueryDto) {
    const days = q.days && q.days > 0 ? q.days : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const poAnd: Prisma.prc_purchase_ordersWhereInput[] = [
      this.poFilter(q.branchId),
      { created_at: { gte: since } },
    ];
    if (q.supplierId && q.supplierId !== 'all') {
      poAnd.push({ supplier_id: Number(q.supplierId) });
    }
    const poWhere: Prisma.prc_purchase_ordersWhereInput = { AND: poAnd };

    const [orders, receipts, invoices, payments] = await Promise.all([
      this.prisma.prc_purchase_orders.findMany({
        where: poWhere,
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          po_number: true,
          supplier_id: true,
          total_amount: true,
          status: true,
          created_at: true,
        },
      }),
      this.prisma.prc_goods_receipts.findMany({
        where: { AND: [notDeletedFilter(), { created_at: { gte: since } }] },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: { id: true, grn_number: true, status: true, created_at: true },
      }),
      this.prisma.prc_purchase_invoices.findMany({
        where: { AND: [notDeletedFilter(), { created_at: { gte: since } }] },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          invoice_number: true,
          supplier_id: true,
          invoice_amount: true,
          status: true,
          created_at: true,
        },
      }),
      this.prisma.prc_supplier_payments.findMany({
        where: { AND: [notDeletedFilter(), { created_at: { gte: since } }] },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          payment_number: true,
          supplier_id: true,
          payment_amount: true,
          status: true,
          created_at: true,
        },
      }),
    ]);

    return {
      purchaseOrders: orders.map((o) => ({
        id: o.id,
        number: o.po_number,
        supplierId: o.supplier_id,
        amount: toNumber(o.total_amount),
        status: o.status,
        at: o.created_at,
      })),
      goodsReceipts: receipts.map((r) => ({
        id: r.id,
        number: r.grn_number,
        status: r.status,
        at: r.created_at,
      })),
      purchaseInvoices: invoices.map((i) => ({
        id: i.id,
        number: i.invoice_number,
        supplierId: i.supplier_id,
        amount: toNumber(i.invoice_amount),
        status: i.status,
        at: i.created_at,
      })),
      supplierPayments: payments.map((p) => ({
        id: p.id,
        number: p.payment_number,
        supplierId: p.supplier_id,
        amount: toNumber(p.payment_amount),
        status: p.status,
        at: p.created_at,
      })),
    };
  }

  async performance(q: SupplierDashboardQueryDto) {
    const period = q.period ?? 'month';
    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else if (period === 'month') since.setMonth(since.getMonth() - 1);
    else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
    else since.setFullYear(since.getFullYear() - 1);

    const poWhere: Prisma.prc_purchase_ordersWhereInput = {
      AND: [this.poFilter(q.branchId), { created_at: { gte: since } }],
    };
    const completedWhere: Prisma.prc_purchase_ordersWhereInput = {
      AND: [this.poFilter(q.branchId), { created_at: { gte: since } }, { status: 'completed' }],
    };

    const [totalOrders, completedOrders, totalValue, returnsCount] = await Promise.all([
      this.prisma.prc_purchase_orders.count({ where: poWhere }),
      this.prisma.prc_purchase_orders.count({ where: completedWhere }),
      this.prisma.prc_purchase_orders.aggregate({ where: poWhere, _sum: { total_amount: true } }),
      this.prisma.prc_purchase_returns.count({
        where: { AND: [notDeletedFilter(), { created_at: { gte: since } }] },
      }),
    ]);

    const onTimeDeliveryRate =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 10000) / 100 : 0;

    return {
      period,
      totalOrders,
      completedOrders,
      totalValue: toNumber(totalValue._sum.total_amount),
      returnsCount,
      onTimeDeliveryRate,
      returnRate: totalOrders > 0 ? Math.round((returnsCount / totalOrders) * 10000) / 100 : 0,
    };
  }

  async alerts(q: SupplierDashboardQueryDto) {
    const today = new Date().toISOString().slice(0, 10);
    const [expiringContracts, overdueInvoices, pendingApprovals, unmatchedInvoices] =
      await Promise.all([
        this.prisma.prc_supplier_contracts.findMany({
          where: {
            AND: [notDeletedFilter(), { status: 'active' }, { end_date: { lte: today } }],
          },
          take: 20,
          select: {
            id: true,
            contract_number: true,
            supplier_id: true,
            end_date: true,
          },
        }),
        this.prisma.prc_supplier_invoices.findMany({
          where: {
            AND: [
              notDeletedFilter(),
              { remaining_amount: { gt: 0 } },
              { due_date: { lt: today } },
            ],
          },
          take: 20,
          select: {
            id: true,
            invoice_number: true,
            supplier_id: true,
            due_date: true,
            remaining_amount: true,
          },
        }),
        this.prisma.prc_requisitions.count({
          where: { AND: [notDeletedFilter(), { status: 'pending' }] },
        }),
        this.prisma.prc_purchase_invoices.count({
          where: {
            AND: [notDeletedFilter(), { matching_status: 'غير مطابق' }],
          },
        }),
      ]);

    return {
      expiringContracts: expiringContracts.map((c) => ({
        id: c.id,
        contractNumber: c.contract_number,
        supplierId: c.supplier_id,
        endDate: c.end_date,
      })),
      overdueInvoices: overdueInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        supplierId: i.supplier_id,
        dueDate: i.due_date,
        remainingAmount: toNumber(i.remaining_amount),
      })),
      pendingApprovals,
      unmatchedInvoices,
    };
  }
}
