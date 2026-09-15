import { Injectable } from '@nestjs/common';
import { QuickSaleStatus } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

const n = (value: unknown) => Number(value ?? 0);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

@Injectable()
export class CafeDashboardService {
  constructor(private readonly prisma: PrismaService, private readonly branches: BranchScopeService) {}

  async summary(query: { startDate?: string; endDate?: string; branchId?: string }, user: JwtUser) {
    const today = dateOnly(new Date());
    const startDate = query.startDate ?? `${today.slice(0, 7)}-01`;
    const endDate = query.endDate ?? today;
    const scoped = this.branches.resolveListFilter(user, query.branchId ?? null);
    const branchFilter = scoped === null ? {} : { branch_id: { in: scoped } };
    const days = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1);
    const previousEndDate = dateOnly(new Date(Date.parse(startDate) - 86_400_000));
    const previousStartDate = dateOnly(new Date(Date.parse(previousEndDate) - (days - 1) * 86_400_000));
    const saleWhere = { status: QuickSaleStatus.completed, sale_date: { gte: startDate, lte: endDate }, ...branchFilter };
    const previousWhere = { status: QuickSaleStatus.completed, sale_date: { gte: previousStartDate, lte: previousEndDate }, ...branchFilter };
    const wasteDate = { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T23:59:59.999Z`) };
    const [sales, previousSales, items, waste, sessions, balances] = await Promise.all([
      this.prisma.sales_quick_sales.findMany({ where: saleWhere, select: { total_amount: true, cost_total: true, sale_date: true, payment_method: true } }),
      this.prisma.sales_quick_sales.findMany({ where: previousWhere, select: { total_amount: true } }),
      this.prisma.sales_quick_sale_items.findMany({ where: { sale: { is: saleWhere } }, select: { name: true, quantity: true, line_total: true, line_cost: true } }),
      this.prisma.cafe_waste_records.findMany({ where: { status: 'active', created_at: wasteDate, ...branchFilter }, select: { source_name: true, quantity: true, total_cost: true, reason_name: true } }),
      this.prisma.sales_shift_sessions.findMany({ where: { session_date: { gte: startDate, lte: endDate }, ...branchFilter }, select: { id: true, status: true, cash_difference: true, expected_closing_balance: true, closing_balance: true, session_date: true }, orderBy: { id: 'desc' } }),
      this.prisma.inv_stock_balances.findMany({ where: scoped === null ? {} : { warehouse: { branch_id: { in: scoped } } }, include: { product: { select: { id: true, name_ar: true, reorder_point: true } } }, take: 500 }),
    ]);
    const netSales = sales.reduce((sum, row) => sum + n(row.total_amount), 0);
    const cost = sales.reduce((sum, row) => sum + n(row.cost_total), 0);
    const previousSalesTotal = previousSales.reduce((sum, row) => sum + n(row.total_amount), 0);
    const trendMap = new Map<string, { sales: number; orders: number }>();
    for (const row of sales) {
      const point = trendMap.get(row.sale_date) ?? { sales: 0, orders: 0 };
      point.sales += n(row.total_amount); point.orders += 1; trendMap.set(row.sale_date, point);
    }
    const topMap = new Map<string, { quantity: number; revenue: number; cost: number }>();
    for (const row of items) {
      const item = topMap.get(row.name) ?? { quantity: 0, revenue: 0, cost: 0 };
      item.quantity += n(row.quantity); item.revenue += n(row.line_total); item.cost += n(row.line_cost); topMap.set(row.name, item);
    }
    const paymentMap = new Map<string, number>();
    for (const row of sales) paymentMap.set(row.payment_method, (paymentMap.get(row.payment_method) ?? 0) + n(row.total_amount));
    const lowStock = balances.filter((row) => n(row.current_stock) <= n(row.reorder_point)).map((row) => ({ id: row.product.id, name: row.product.name_ar, quantity: n(row.current_stock), reorderPoint: n(row.reorder_point) })).sort((a, b) => a.quantity - b.quantity);
    const wasteCost = waste.reduce((sum, row) => sum + n(row.total_cost), 0);
    const wasteQuantity = waste.reduce((sum, row) => sum + n(row.quantity), 0);
    const openShift = sessions.find((row) => row.status === 'open') ?? null;
    const latestClosed = sessions.find((row) => row.status !== 'open' && row.cash_difference != null) ?? null;
    const grossProfit = netSales - cost - wasteCost;
    return {
      period: { startDate, endDate, previousStartDate, previousEndDate },
      updatedAt: new Date().toISOString(),
      outcomes: {
        netSales,
        orders: sales.length,
        averageTicket: sales.length ? netSales / sales.length : 0,
        grossProfit,
        grossMargin: netSales ? (grossProfit / netSales) * 100 : 0,
        salesChange: previousSalesTotal ? ((netSales - previousSalesTotal) / previousSalesTotal) * 100 : null,
      },
      operations: {
        openShift: openShift ? { id: openShift.id, sessionDate: openShift.session_date } : null,
        cashVariance: n(latestClosed?.cash_difference),
        expectedCash: n(latestClosed?.expected_closing_balance),
        actualCash: n(latestClosed?.closing_balance),
        wasteCost,
        wasteQuantity,
        lowStockCount: lowStock.length,
      },
      trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
      topProducts: [...topMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      paymentMix: [...paymentMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
      attention: {
        lowStock: lowStock.slice(0, 8),
        highWaste: waste.map((row) => ({ name: row.source_name, quantity: n(row.quantity), cost: n(row.total_cost), reason: row.reason_name })).sort((a, b) => b.cost - a.cost).slice(0, 6),
        shiftVariance: sessions.filter((row) => Math.abs(n(row.cash_difference)) > 0.01).slice(0, 6).map((row) => ({ id: row.id, date: row.session_date, variance: n(row.cash_difference) })),
      },
    };
  }
}

