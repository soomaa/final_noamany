import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { SubscriptionReportsService } from './subscription-reports.service';

describe('SubscriptionReportsService monthly analysis and daily close', () => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    business_audit_log: { findFirst: jest.fn(), create: jest.fn() },
    club_subscriptions: { aggregate: jest.fn() },
    club_receipts: { aggregate: jest.fn() },
  };
  const prisma = {
    club_members: { findMany: jest.fn().mockResolvedValue([{ id: 11 }]) },
    club_subscriptions: { aggregate: jest.fn() },
    club_locker_subscriptions: { aggregate: jest.fn() },
    sales_quick_sales: { aggregate: jest.fn() },
    club_subscription_refunds: { aggregate: jest.fn() },
    prc_purchase_orders: { aggregate: jest.fn() },
    fin_expenses: { aggregate: jest.fn() },
    business_audit_log: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new SubscriptionReportsService(prisma as never, new BranchScopeService());
  const menUser = { sub: 9, level: 3, branch: 5, man_women_type: 0 } as never;
  const admin = { sub: 1, level: 1, branch: 0, man_women_type: 2, name: 'مدير النظام' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findMany.mockResolvedValue([{ id: 11 }]);
    prisma.club_subscriptions.aggregate.mockResolvedValue({ _sum: { paid_amount: 1000 } });
    prisma.club_locker_subscriptions.aggregate.mockResolvedValue({ _sum: { paid_amount: 200 } });
    prisma.sales_quick_sales.aggregate.mockResolvedValue({ _sum: { collected_amount: 300 } });
    prisma.club_subscription_refunds.aggregate.mockResolvedValue({ _sum: { refund_amount: 50 } });
    prisma.prc_purchase_orders.aggregate.mockResolvedValue({ _sum: { total_amount: 400 } });
    prisma.fin_expenses.aggregate.mockResolvedValue({ _sum: { total_amount: 150 } });
    prisma.business_audit_log.findFirst.mockResolvedValue(null);
    prisma.business_audit_log.findMany.mockResolvedValue([]);
    tx.business_audit_log.findFirst.mockResolvedValue(null);
    tx.business_audit_log.create.mockResolvedValue({
      id: 8,
      created_at: new Date('2026-09-09T12:00:00Z'),
    });
    tx.club_subscriptions.aggregate.mockResolvedValue({
      _count: 2,
      _sum: { subscription_value: 1000, paid_amount: 800, remaining_amount: 200 },
    });
    tx.club_receipts.aggregate.mockResolvedValue({ _count: 2, _sum: { amount: 800 } });
  });

  it('reproduces the legacy monthly revenue/expense/net formula with server audience filters', async () => {
    const result = await service.monthlyAnalysis(
      { startDate: '2026-09-01', endDate: '2026-09-30', gender: 'female' },
      menUser,
    );

    expect(prisma.club_subscriptions.aggregate.mock.calls[0][0].where.AND).toContainEqual({
      member: { is: { is_deleted: false, gender: 'male' } },
    });
    expect(prisma.club_locker_subscriptions.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        main_branch_id: { in: [5] },
        member: { is: { is_deleted: false, gender: 'male' } },
      }),
    }));
    expect(prisma.sales_quick_sales.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [5] }, customer_member_id: { in: [11] } }),
    }));
    expect(result).toMatchObject({
      revenues: [
        { key: 'subscriptions', label: 'الاشتراكات', amount: 1000 },
        { key: 'lockers', label: 'اللوكر', amount: 200 },
        { key: 'sales', label: 'المبيعات', amount: 300 },
        { key: 'total_revenue', label: 'اجمالى الايراد', amount: 1500 },
      ],
      expenses: [
        { key: 'subscription_refunds', label: 'مرتجع الاشتراكات', amount: 50 },
        { key: 'purchases', label: 'المشتريات', amount: 400 },
        { key: 'expense_vouchers', label: 'سندات الصرف', amount: 150 },
        { key: 'total_expenses', label: 'اجمالى المصروفات', amount: 600 },
      ],
      netProfit: { label: 'صافى الربح', amount: 900 },
    });
  });

  it('records review as an append-only daily-close event with reconciliation snapshot', async () => {
    const result = await service.transitionDailyClose(
      'review',
      { date: '2026-09-09', branch: '5', gender: 'male' },
      { declaredAmount: 790, reason: 'مراجعة الوردية' },
      admin,
    );

    expect(tx.business_audit_log.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entity_type: 'club_subscription_daily_close',
        entity_id: '2026-09-09:5:male',
        action: 'daily_close_review',
        actor_user_id: 1,
        branch_id: 5,
        after_json: expect.objectContaining({ state: 'reviewed', expectedAmount: 800, declaredAmount: 790, variance: -10 }),
      }),
    }));
    expect(result).toMatchObject({ state: 'reviewed', branchId: 5, audience: 'male' });
  });

  it('requires review before close, a reason before reopen, and system-admin authority', async () => {
    await expect(service.transitionDailyClose(
      'close',
      { date: '2026-09-09', branch: '5' },
      { declaredAmount: 800 },
      admin,
    )).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.transitionDailyClose(
      'review',
      { date: '2026-09-09', branch: '5' },
      { declaredAmount: 800 },
      menUser,
    )).rejects.toBeInstanceOf(ForbiddenException);

    tx.business_audit_log.findFirst.mockResolvedValue({
      action: 'daily_close_close',
      after_json: { state: 'closed' },
    });
    await expect(service.transitionDailyClose(
      'reopen',
      { date: '2026-09-09', branch: '5' },
      {},
      admin,
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
