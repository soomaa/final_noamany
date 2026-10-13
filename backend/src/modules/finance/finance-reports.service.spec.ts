import { FinanceReportsService } from './finance-reports.service';
import { plainToInstance } from 'class-transformer';
import { FinanceAnalysisQueryDto } from './dto/finance.dto';

describe('FinanceReportsService monthly analysis', () => {
  it('uses the invoice category snapshot and the latest purchase-item price for COGS', async () => {
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{ paid_amount: 100 }]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([{ paid_amount: 20 }]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([{ refund_amount: 10 }]) },
      fin_expenses: { findMany: jest.fn().mockResolvedValue([{ total_amount: 7 }]) },
      sales_quick_sales: {
        findMany: jest.fn().mockResolvedValue([
          {
            discount_amount: 5,
            items: [{ inventory_product_id: 101, quantity: 3, line_total: 30 }],
          },
        ]),
      },
      prc_purchase_invoice_items: {
        findMany: jest.fn().mockResolvedValue([
          { id: 99, product_id: 101, price: 4 },
          { id: 55, product_id: 101, price: 2 },
        ]),
      },
    };
    const branchScope = { resolveListFilter: jest.fn().mockReturnValue(null) };
    const service = new FinanceReportsService(prisma as never, branchScope as never, {} as never);

    const result = await service.monthlyAnalysis(
      plainToInstance(FinanceAnalysisQueryDto, { dateFrom: '2026-09-01', dateTo: '2026-09-30', branchId: '3', cafeCategoryId: '7', gender: 'male' }),
      { sub: 1 } as never,
    );

    expect(result).toMatchObject({
      subscriptions: 100,
      lockers: 20,
      cafeSales: 25,
      subscriptionRefunds: 10,
      cogs: 12,
      expenses: 7,
      totalRevenue: 145,
      totalExpenses: 29,
      netProfit: 116,
    });
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cafe_category_id: 7,
          gender: 'male',
          branch_id: { in: [8, 9] },
          collected_amount: { not: 0 },
          customer_member_id: { not: 0 },
        }),
      }),
    );
    expect(prisma.prc_purchase_invoice_items.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'desc' } }),
    );
  });
});
