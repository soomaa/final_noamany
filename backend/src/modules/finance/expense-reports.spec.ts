import { FinanceReportsService } from './finance-reports.service';

describe('expense reports by managed types', () => {
  it('uses business unit and branch scope, includes the full last day, and computes actual outstanding amounts', async () => {
    const prisma = {
      fin_expenses: { findMany: jest.fn().mockResolvedValue([
        { category: 'صيانة', total_amount: 100, paid_amount: 40, payment_status: 'جزئي', expense_date: '2026-10-01T23:45:00' },
        { category: 'صيانة', total_amount: 50, paid_amount: null, payment_status: 'مدفوع', expense_date: '2026-10-01' },
      ]) },
      fin_expense_categories: { findMany: jest.fn().mockResolvedValue([{ name: 'صيانة' }, { name: 'مرافق' }]) },
    };
    const service = new FinanceReportsService(prisma as never, { resolveListFilter: () => [1] } as never,
      {} as never, { isSuperAdmin: async () => false, scopeFor: async () => 'branch' } as never);
    const result = await service.expenseReports({ businessUnit: 'cafe', branchId: '1', dateFrom: '2026-10-01', dateTo: '2026-10-01' }, { sub: 9 } as never);
    expect(prisma.fin_expenses.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      business_unit: 'cafe', branch_id: { in: [1] }, approval_status: { not: 'مرفوض' },
      expense_date: { gte: '2026-10-01', lte: '2026-10-01T23:59:59' },
    }) }));
    expect(result).toMatchObject({ totalAmount: 150, paidAmount: 90, remainingAmount: 60 });
    expect(result.expensesByCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'صيانة', total: 150, count: 2, remainingAmount: 60 }),
      expect.objectContaining({ category: 'مرافق', total: 0, count: 0 }),
    ]));
  });
});
