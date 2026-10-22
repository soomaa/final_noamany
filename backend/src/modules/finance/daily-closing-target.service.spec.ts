import { DailyClosingTargetService } from './daily-closing-target.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const dec = (value: string) => ({ toString: () => value });
/** Answers the separate refunded-sales query with no rows so `completedSales` sees only the revenue queries. */
const withRefundedSales = (completedSales: jest.Mock) =>
  jest.fn((args: { where: { status: string } }) => (args.where.status === 'refunded' ? Promise.resolve([]) : completedSales(args)));

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
  it('splits petty cash by payment method and reports refunded sales without deducting them again', async () => {
    const sales = jest.fn().mockImplementation(({ where }) => Promise.resolve(where.status === 'refunded'
      ? [{ collected_amount: dec('15'), payment_method: 'card' }]
      : [{ collected_amount: dec('40'), payment_method: 'cash', cafe_category: { daily_closing_classification: 'NORMAL' } }]));
    const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const prisma = { club_subscriptions: empty(), club_locker_subscriptions: empty(), sales_quick_sales: { findMany: sales },
      prc_purchase_returns: empty(), prc_purchase_invoices: empty(), prc_supplier_payments: empty(), club_subscription_refunds: empty(),
      fin_expenses: { findMany: jest.fn().mockResolvedValue([
        { total_amount: dec('400'), payment_method: 'نقدي', category: 'نثريات' },
        { total_amount: dec('55'), payment_method: 'تحويل بنكي', category: 'نثريات' },
        { total_amount: dec('5'), payment_method: null, category: 'نثريات' },
      ]) } };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);

    const result = await service.dailyClosing({ fromDate: '2026-10-20', toDate: '2026-10-20' }, { sub: 1, level: 1, branch: 0 } as never);

    expect(result.expenses).toEqual({ total: '460.00', cash: '405.00', knet: '55.00' });
    expect(result.salesReturns).toEqual({ total: '15.00', cash: '0.00', knet: '15.00' });
    expect(result).toMatchObject({ totalRevenue: '40.00', totalOutflows: '460.00', netProfit: '-420.00' });
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
      prc_purchase_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      // 1st query: cash paid at purchase time (المشتريات); 2nd: later supplier-debt payments (حساب موردين).
      prc_supplier_payments: { findMany: jest.fn()
        .mockResolvedValueOnce([{ payment_amount: dec('50') }])
        .mockResolvedValueOnce([{ payment_amount: dec('20') }]) },
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
      purchases: { total: '50.00' },
      supplierPayments: { total: '20.00' },
      purchaseReturns: { total: '10.00' },
      totalOutflows: '68.00',
      netProfit: '102.00',
    });
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'completed', branch_id: { in: [3, 8, 9] } }),
    }));
  });

  it('classifies unclassified categories by name, excludes others, and splits mixed payments', async () => {
    const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const prisma = {
      club_subscriptions: empty(), club_locker_subscriptions: empty(),
      sales_quick_sales: { findMany: withRefundedSales(jest.fn().mockResolvedValue([
        { collected_amount: dec('30'), payment_method: 'cash', cafe_category: { daily_closing_classification: null, name_ar: 'بار' } },
        { collected_amount: dec('180'), payment_method: 'cash', cafe_category: { daily_closing_classification: null, name_ar: 'بروتين' } },
        { collected_amount: dec('50'), payment_method: 'mixed', payments: [{ method: 'cash', amount: dec('20') }, { method: 'card', amount: dec('30') }], cafe_category: { daily_closing_classification: null, name_ar: 'بار' } },
        { collected_amount: dec('25'), payment_method: 'card', cafe_category: { daily_closing_classification: null, name_ar: 'بروتين' } },
        { collected_amount: dec('99'), payment_method: 'cash', cafe_category: { daily_closing_classification: null, name_ar: 'مستهلكات' } },
        // The name wins over a stale saved classification.
        { collected_amount: dec('11'), payment_method: 'cash', cafe_category: { daily_closing_classification: 'NORMAL', name_ar: 'مستهلكات' } },
      ])) },
      prc_purchase_returns: empty(), prc_purchase_invoices: empty(), prc_supplier_payments: empty(),
      fin_expenses: empty(), club_subscription_refunds: empty(),
    };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);

    const result = await service.dailyClosing({ fromDate: '2026-10-20', toDate: '2026-10-20' }, { sub: 1, level: 1, branch: 0 } as never);

    expect(result.normalSales).toEqual({ total: '80.00', cash: '50.00', knet: '30.00' });
    expect(result.proteinSales).toEqual({ total: '205.00', cash: '180.00', knet: '25.00' });
    expect(result.totalRevenue).toBe('285.00');
  });

  it('returns the daily closing when a pre-migration database lacks the classification column', async () => {
    const completedSales = jest.fn()
      .mockRejectedValueOnce({ code: 'P2022', message: 'The column `inv_categories.daily_closing_classification` does not exist.' })
      .mockResolvedValueOnce([{ collected_amount: dec('70'), payment_method: 'cash' }]);
    const sales = withRefundedSales(completedSales);
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
    expect(completedSales).toHaveBeenCalledTimes(2);
  });

  it('falls back to the complete sales total when the older database lacks the cafe category relation', async () => {
    const completedSales = jest.fn()
      .mockRejectedValueOnce({ code: 'P2022', message: 'The column `sales_quick_sales.cafe_category_id` does not exist.' })
      .mockResolvedValueOnce([{ collected_amount: dec('70'), payment_method: 'cash' }]);
    const sales = withRefundedSales(completedSales);
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
    expect(completedSales).toHaveBeenCalledTimes(2);
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

  it('labels target rows by subscription name or sale category and orders them by date', async () => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 41 }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([
        { registration_date: '2026-10-03', subscription_value: dec('830'), discount_value: dec('330'), paid_amount: dec('500'), type: { name: 'اشتراك شهري', is_part_of_target: true } },
      ]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sales: { findMany: jest.fn().mockResolvedValue([
        { sale_date: '2026-09-29', subtotal: dec('25'), discount_amount: dec('0'), collected_amount: dec('25'), sale_type: 'customer', cafe_category: { name_ar: 'بروتين' } },
        { sale_date: '2026-10-05', subtotal: dec('10'), discount_amount: dec('0'), collected_amount: dec('10'), sale_type: 'customer', cafe_category: null },
      ]) },
    };
    const service = new DailyClosingTargetService(prisma as never, { resolveListFilter: jest.fn().mockReturnValue(null) } as never);

    const result = await service.targetReport({ targetEmployeeId: 41 }, { sub: 1, level: 1, branch: 0 } as never);

    expect(result.rows.map((row) => [row.date, row.kind, row.type])).toEqual([
      ['2026-09-29', 'sale', 'بروتين'],
      ['2026-10-03', 'subscription', 'اشتراك شهري'],
      ['2026-10-05', 'sale', 'مبيعات كافيه'],
    ]);
    expect(result).toMatchObject({ subscriptionTotal: '500.00', salesTotal: '35.00', grandTotal: '535.00' });
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { cafe_category: { select: { name_ar: true } } },
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
