import { DailyClosingTargetService } from './daily-closing-target.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const dec = (value: string) => ({ toString: () => value });

describe('DailyClosingTargetService daily closing', () => {
  it('counts a refund in its paying branch once, excluding its already booked expense from general expenses', async () => {
    const expenses = [
      { branch_id: 3, category: 'مردودات اشتراكات الجيم', invoice_number: 'REF-LOCAL', total_amount: dec('150') },
      { branch_id: 3, category: 'مصروف آخر', invoice_number: null, total_amount: dec('20') },
      { branch_id: 3, category: 'مردودات اشتراكات الجيم', invoice_number: 'MANUAL-EXPENSE', total_amount: dec('40') },
    ];
    const refunds = [{ branch_id: 3, invoice_number: 'REF-LOCAL', refund_amount: dec('150') }, { branch_id: 7, invoice_number: 'REF-OTHER', refund_amount: dec('100') }];
    const expenseQuery = jest.fn().mockImplementation(({ where }) => Promise.resolve(expenses.filter(r =>
      where.branch_id.in.includes(r.branch_id))));
    const refundQuery = jest.fn().mockImplementation(({ where }) => Promise.resolve(refunds.filter(r => where.branch_id.in.includes(r.branch_id))));
    const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const prisma = { club_subscriptions: empty(), club_locker_subscriptions: empty(), sales_quick_sales: empty(),
      prc_purchase_returns: empty(), prc_purchase_invoices: empty(), prc_supplier_payments: empty(),
      fin_expenses: { findMany: expenseQuery }, club_subscription_refunds: { findMany: refundQuery } };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);
    const result = await service.dailyClosing({ branchId: '3', fromDate: '2026-10-12', toDate: '2026-10-12' }, { sub: 1, level: 1, branch: 0 } as never);
    expect(result).toMatchObject({ expenses: { total: '60.00' }, subscriptionRefunds: { total: '150.00' }, totalOutflows: '210.00', netProfit: '-210.00' });
    const other = await service.dailyClosing({ branchId: '7', fromDate: '2026-10-12', toDate: '2026-10-12' }, { sub: 1, level: 1, branch: 0 } as never);
    expect(other.subscriptionRefunds.total).toBe('100.00');
  });
  it('injects PrismaService instead of an unresolvable Object dependency', () => {
    const [prismaDependency] = Reflect.getMetadata('design:paramtypes', DailyClosingTargetService);

    expect(prismaDependency).toBe(PrismaService);
  });

  it('uses the saved cafe header classification and classifies every non-cash receipt as KNET', async () => {
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{ private_package_id: null, paid_amount: dec('100'), payment_method: 'cash' }]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sales: { findMany: jest.fn().mockResolvedValue([
        { collected_amount: dec('40'), payment_method: 'cash', cafe_category: { daily_closing_classification: 'NORMAL' } },
        { collected_amount: dec('30'), payment_method: 'wallet', cafe_category: { daily_closing_classification: 'PROTEIN' } },
      ]) },
      prc_purchase_returns: { findMany: jest.fn().mockResolvedValue([{ total_amount: dec('10') }]) },
      prc_purchase_invoices: { findMany: jest.fn().mockResolvedValue([{ invoice_amount: dec('50') }]) },
      prc_supplier_payments: { findMany: jest.fn().mockResolvedValue([{ payment_amount: dec('20') }]) },
      fin_expenses: { findMany: jest.fn().mockResolvedValue([{ total_amount: dec('5') }]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([{ refund_amount: dec('3') }]) },
    };
    const service = new DailyClosingTargetService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.dailyClosing(
      { branchId: '3', fromDate: '2026-09-01', toDate: '2026-09-01' },
      { sub: 1, level: 1, branch: 0 } as never,
    );

    expect(result).toMatchObject({
      regularSubscriptions: { total: '100.00', cash: '100.00', knet: '0.00' },
      normalSales: { total: '40.00', cash: '40.00', knet: '0.00' },
      proteinSales: { total: '30.00', cash: '0.00', knet: '30.00' },
      totalRevenue: '170.00',
      totalOutflows: '68.00',
      netProfit: '102.00',
    });
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'completed', branch_id: { in: [3, 8, 9] } }),
    }));
  });

  it('returns the daily closing when a pre-migration database lacks the classification column', async () => {
    const sales = jest.fn()
      .mockRejectedValueOnce({ code: 'P2022', message: 'The column `inv_categories.daily_closing_classification` does not exist.' })
      .mockResolvedValueOnce([{ collected_amount: dec('70'), payment_method: 'cash' }]);
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sales: { findMany: sales },
      prc_purchase_returns: { findMany: jest.fn().mockResolvedValue([]) },
      prc_purchase_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      prc_supplier_payments: { findMany: jest.fn().mockResolvedValue([]) },
      fin_expenses: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);

    const result = await service.dailyClosing(
      { fromDate: '2026-09-30', toDate: '2026-09-30' },
      { sub: 1, level: 1, branch: 0 } as never,
    );

    expect(result).toMatchObject({
      normalSales: { total: '70.00', cash: '70.00' },
      proteinSales: { total: '0.00' },
      salesClassificationAvailable: false,
    });
    expect(sales).toHaveBeenCalledTimes(2);
  });

  it('falls back to the complete sales total when the older database lacks the cafe category relation', async () => {
    const sales = jest.fn()
      .mockRejectedValueOnce({ code: 'P2022', message: 'The column `sales_quick_sales.cafe_category_id` does not exist.' })
      .mockResolvedValueOnce([{ collected_amount: dec('70'), payment_method: 'cash' }]);
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sales: { findMany: sales },
      prc_purchase_returns: { findMany: jest.fn().mockResolvedValue([]) },
      prc_purchase_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      prc_supplier_payments: { findMany: jest.fn().mockResolvedValue([]) },
      fin_expenses: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);

    const result = await service.dailyClosing(
      { fromDate: '2026-09-30', toDate: '2026-09-30' },
      { sub: 1, level: 1, branch: 0 } as never,
    );

    expect(result).toMatchObject({
      normalSales: { total: '70.00', cash: '70.00' },
      proteinSales: { total: '0.00' },
      salesClassificationAvailable: false,
    });
    expect(sales).toHaveBeenCalledTimes(2);
  });

  it('uses the saved target employee and only includes target-eligible club subscriptions', async () => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 41 }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([
        { registration_date: '2026-09-01', subscription_value: dec('100'), discount_value: dec('10'), paid_amount: dec('90'), type: { name: 'شهري', is_part_of_target: true } },
        { registration_date: '2026-09-01', subscription_value: dec('200'), discount_value: dec('0'), paid_amount: dec('200'), type: { name: 'غير تارجت', is_part_of_target: false } },
      ]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([
        { subscription_start_date: '2026-09-01', subscription_value: dec('50'), discount_value: dec('20'), paid_amount: dec('50'), type: { name: 'خزانة' } },
      ]) },
      sales_quick_sales: { findMany: jest.fn().mockResolvedValue([
        { sale_date: '2026-09-02', subtotal: dec('40'), discount_amount: dec('5'), collected_amount: dec('35'), sale_type: 'customer' },
      ]) },
    };
    const service = new DailyClosingTargetService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.targetReport(
      { branchId: '3', targetEmployeeId: 41 },
      { sub: 1, level: 1, branch: 0 } as never,
    );

    expect(result.totals).toEqual({
      beforeDiscount: '190.00', discount: '15.00', afterDiscount: '175.00', paid: '175.00',
    });
    expect(result).toMatchObject({ lockerTotal: '50.00', grandTotal: '175.00' });
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'completed', target_employee_id: 41, branch_id: { in: [3, 8, 9] } }),
    }));
  });

  it('locks a Level 2 target report to the employee in the authenticated account', async () => {
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn() } as never);

    const result = await service.targetReport(
      { operationType: 'sales' },
      { sub: 1, level: 2, branch: 2, emp_code: 77 } as never,
    );

    expect(result.employeeId).toBe(77);
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ target_employee_id: 77, branch_id: { in: [2] }, status: 'completed' }),
    }));
  });
});
