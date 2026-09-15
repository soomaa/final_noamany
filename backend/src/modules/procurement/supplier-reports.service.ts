import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupplierReportsQueryDto } from './dto/procurement-ext.dto';
import { notDeletedFilter, toNumber } from './procurement.utils';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class SupplierReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private dateFilter(q: SupplierReportsQueryDto): Prisma.DateTimeFilter | undefined {
    if (!q.dateFrom && !q.dateTo) return undefined;
    return {
      ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
      ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
    };
  }

  async reports(q: SupplierReportsQueryDto) {
    const createdAt = this.dateFilter(q);
    const and: Prisma.inv_suppliersWhereInput[] = [{ is_deleted: false }];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name_ar: { contains: s } }, { name_en: { contains: s } }] });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.inv_suppliers.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
        select: {
          id: true,
          name_ar: true,
          name_en: true,
          email: true,
          phones: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
          is_active: true,
        },
      }),
      this.prisma.inv_suppliers.count({ where }),
    ]);

    const supplierIds = rows.map((r) => r.id);
    const poStats = await this.prisma.prc_purchase_orders.groupBy({
      by: ['supplier_id'],
      where: {
        AND: [
          notDeletedFilter(),
          { supplier_id: { in: supplierIds } },
          ...(createdAt ? [{ created_at: createdAt }] : []),
        ],
      },
      _count: true,
      _sum: { total_amount: true },
    });
    const poMap = new Map(poStats.map((p) => [p.supplier_id, p]));

    const data = rows.map((s) => ({
      supplierId: s.id,
      nameAr: s.name_ar,
      nameEn: s.name_en,
      email: s.email,
      phone: s.phones[0]?.phone ?? null,
      isActive: s.is_active,
      orderCount: poMap.get(s.id)?._count ?? 0,
      totalOrderValue: toNumber(poMap.get(s.id)?._sum.total_amount),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async stats(q: SupplierReportsQueryDto) {
    const createdAt = this.dateFilter(q);
    const poWhere: Prisma.prc_purchase_ordersWhereInput = {
      AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])],
    };
    const [suppliers, orders, orderValue, invoices, payments, returns] = await Promise.all([
      this.prisma.inv_suppliers.count({ where: { is_deleted: false } }),
      this.prisma.prc_purchase_orders.count({ where: poWhere }),
      this.prisma.prc_purchase_orders.aggregate({ where: poWhere, _sum: { total_amount: true } }),
      this.prisma.prc_purchase_invoices.aggregate({
        where: { AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])] },
        _count: true,
        _sum: { invoice_amount: true },
      }),
      this.prisma.prc_supplier_payments.aggregate({
        where: { AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])] },
        _count: true,
        _sum: { payment_amount: true },
      }),
      this.prisma.prc_purchase_returns.count({
        where: { AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])] },
      }),
    ]);

    return {
      totalSuppliers: suppliers,
      totalOrders: orders,
      totalOrderValue: toNumber(orderValue._sum.total_amount),
      totalInvoices: invoices._count,
      totalInvoiceValue: toNumber(invoices._sum.invoice_amount),
      totalPayments: payments._count,
      totalPaymentValue: toNumber(payments._sum.payment_amount),
      totalReturns: returns,
    };
  }

  async performance(q: SupplierReportsQueryDto) {
    const createdAt = this.dateFilter(q);
    const grouped = await this.prisma.prc_purchase_orders.groupBy({
      by: ['supplier_id', 'status'],
      where: {
        AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])],
      },
      _count: true,
      _sum: { total_amount: true },
    });

    const bySupplier = new Map<
      number,
      { totalOrders: number; totalValue: number; completed: number }
    >();
    for (const row of grouped) {
      const cur = bySupplier.get(row.supplier_id) ?? {
        totalOrders: 0,
        totalValue: 0,
        completed: 0,
      };
      cur.totalOrders += row._count;
      cur.totalValue += toNumber(row._sum.total_amount);
      if (row.status === 'completed') cur.completed += row._count;
      bySupplier.set(row.supplier_id, cur);
    }

    const supplierIds = [...bySupplier.keys()];
    const suppliers = await this.prisma.inv_suppliers.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name_ar: true },
    });
    const nameMap = new Map(suppliers.map((s) => [s.id, s.name_ar]));

    return [...bySupplier.entries()].map(([supplierId, stats]) => ({
      supplierId,
      supplierName: nameMap.get(supplierId) ?? null,
      totalOrders: stats.totalOrders,
      totalValue: stats.totalValue,
      completedOrders: stats.completed,
      completionRate:
        stats.totalOrders > 0
          ? Math.round((stats.completed / stats.totalOrders) * 10000) / 100
          : 0,
    }));
  }

  async payments(q: SupplierReportsQueryDto) {
    const createdAt = this.dateFilter(q);
    const grouped = await this.prisma.prc_supplier_payments.groupBy({
      by: ['supplier_id', 'status'],
      where: {
        AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])],
      },
      _count: true,
      _sum: { payment_amount: true },
    });

    return grouped.map((g) => ({
      supplierId: g.supplier_id,
      status: g.status,
      count: g._count,
      totalAmount: toNumber(g._sum.payment_amount),
    }));
  }

  async debts(q: SupplierReportsQueryDto, user?: JwtUser) {
    const createdAt = this.dateFilter(q);
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const invoices = await this.prisma.prc_supplier_invoices.groupBy({
      by: ['supplier_id'],
      where: { AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : []), ...(scopedBranches ? [{ branch_id: { in: scopedBranches } }] : [])] },
      _sum: { total_amount: true, paid_amount: true, remaining_amount: true },
    });
    const supplierIds = invoices.map((row) => row.supplier_id);
    const [suppliers, payments] = await Promise.all([
      this.prisma.inv_suppliers.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name_ar: true },
      }),
      this.prisma.prc_supplier_payments.findMany({
        where: {
          supplier_id: { in: supplierIds },
          is_deleted: false,
          status: 'مدفوع',
          ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
        },
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const names = new Map(suppliers.map((supplier) => [supplier.id, supplier.name_ar]));
    const lastPayment = new Map<number, string | null>();
    for (const payment of payments) {
      if (!lastPayment.has(payment.supplier_id)) lastPayment.set(payment.supplier_id, payment.payment_date);
    }
    return invoices.map((row) => ({
      supplierId: row.supplier_id,
      supplierName: names.get(row.supplier_id) ?? '—',
      totalPurchases: toNumber(row._sum.total_amount),
      paid: toNumber(row._sum.paid_amount),
      remaining: toNumber(row._sum.remaining_amount),
      lastPaymentDate: lastPayment.get(row.supplier_id) ?? null,
    })).sort((a, b) => b.remaining - a.remaining);
  }

  async orders(q: SupplierReportsQueryDto) {
    const createdAt = this.dateFilter(q);
    const grouped = await this.prisma.prc_purchase_orders.groupBy({
      by: ['supplier_id', 'status'],
      where: {
        AND: [notDeletedFilter(), ...(createdAt ? [{ created_at: createdAt }] : [])],
      },
      _count: true,
      _sum: { total_amount: true },
    });

    return grouped.map((g) => ({
      supplierId: g.supplier_id,
      status: g.status,
      count: g._count,
      totalAmount: toNumber(g._sum.total_amount),
    }));
  }

  async complaints(_q: SupplierReportsQueryDto) {
    const returns = await this.prisma.prc_purchase_returns.groupBy({
      by: ['supplier_id'],
      where: { AND: [notDeletedFilter()] },
      _count: true,
      _sum: { total_amount: true },
    });

    return returns.map((r) => ({
      supplierId: r.supplier_id,
      returnCount: r._count,
      returnValue: toNumber(r._sum.total_amount),
    }));
  }

  async risks(q: SupplierReportsQueryDto) {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await this.prisma.prc_supplier_invoices.groupBy({
      by: ['supplier_id'],
      where: {
        AND: [
          notDeletedFilter(),
          { remaining_amount: { gt: 0 } },
          { due_date: { lt: today } },
        ],
      },
      _count: true,
      _sum: { remaining_amount: true },
    });

    const riskLevel = q.riskLevel ?? 'all';
    return overdue
      .map((o) => {
        const amount = toNumber(o._sum.remaining_amount);
        let level = 'low';
        if (amount > 100000) level = 'high';
        else if (amount > 10000) level = 'medium';
        return {
          supplierId: o.supplier_id,
          overdueInvoiceCount: o._count,
          overdueAmount: amount,
          riskLevel: level,
        };
      })
      .filter((r) => riskLevel === 'all' || r.riskLevel === riskLevel);
  }
}
