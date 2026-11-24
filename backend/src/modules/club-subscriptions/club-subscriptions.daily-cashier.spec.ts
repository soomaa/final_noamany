import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { localDateString } from '../club-members/club-member.utils';

describe('ClubSubscriptionsService.dailyCashierReport', () => {
  const today = localDateString();
  const subscription = {
    id: 17,
    subscription_number: 'SUB000017',
    registration_date: today,
    branch_id: 3,
    member_id: 12,
    customer_name: 'عميل اليوم',
    subscription_type_id: 2,
    special_class_type_id: null,
    subscription_type: 'شهري',
    subscription_start_date: today,
    subscription_end_date: '2099-12-31',
    subscription_value: 500,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 300,
    transferred_credit_amount: 0,
    waived_amount: 0,
    remaining_amount: 200,
    gender: null,
    employee_id: null,
    sales_id: null,
    payment_method: 'cash',
    receipt_number: 'REC-17',
    customer_source_id: null,
    guardian_name: null,
    guardian_phone: null,
    status: 'active',
    is_special: false,
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
    allow_multiple_daily_entries: false,
    is_time_based: false,
    time_from: null,
    time_to: null,
    created_by: 7,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const receipt = (amount: number, extra: Record<string, unknown> = {}) => ({
    id: 1,
    receipt_number: 'R-1',
    subscription_id: 17,
    locker_subscription_id: null,
    member_name: 'عميل اليوم',
    amount,
    type: 'شهري',
    payment_method: 'cash',
    receipt_date: today,
    description: null,
    created_at: new Date(),
    created_by: 7,
    subscription: { subscription_number: 'SUB000017', subscription_type: 'شهري', registration_date: today },
    payments: [{ method: 'cash', amount }],
    ...extra,
  });
  const prisma = {
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([subscription]),
    },
    club_receipts: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    users: {
      findMany: jest.fn().mockResolvedValue([
        { user_id: 7, name: 'موظف الاستقبال', username: 'reception' },
        { user_id: 9, name: 'موظف آخر', username: 'other' },
      ]),
    },
    club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    fin_expenses: { findMany: jest.fn().mockResolvedValue([]) },
    sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
    club_members: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const permissions = { isSuperAdmin: jest.fn() };
  const branchScope = { resolveListFilter: jest.fn().mockReturnValue([3]), resolveMemberGenderRequest: jest.fn().mockReturnValue(null) };
  const service = new ClubSubscriptionsService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    {} as BusinessAuditService,
    {} as AutomationEngineService,
    branchScope as unknown as BranchScopeService,
    permissions as unknown as PermissionEngineService,
    { resolveDiscount: jest.fn() } as unknown as import('./club-discount-codes.service').ClubDiscountCodesService,
    {} as never,
  );
  const user = {
    sub: 7,
    level: 2,
    branch: 3,
  } as JwtUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscriptions.findMany.mockResolvedValue([subscription]);
    prisma.club_receipts.findMany.mockResolvedValue([receipt(300)]);
    prisma.club_spa_invoices.findMany.mockResolvedValue([]);
    prisma.club_inbody_invoices.findMany.mockResolvedValue([]);
    prisma.fin_expenses.findMany.mockResolvedValue([]);
    prisma.sales_quick_sales.findMany.mockResolvedValue([]);
    prisma.users.findMany.mockResolvedValue([
      { user_id: 7, name: 'موظف الاستقبال', username: 'reception' },
      { user_id: 9, name: 'موظف آخر', username: 'other' },
    ]);
    branchScope.resolveListFilter.mockReturnValue([3]);
  });

  it('forces a regular user to their own activity even when another user id is requested', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);

    const result = await service.dailyCashierReport(user, '9');

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registration_date: today,
          transferred_credit_amount: 0,
          created_by: 7,
          branch_id: { in: [3] },
        }),
      }),
    );
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receipt_date: today, created_by: 7 }),
      }),
    );
    expect(result).toMatchObject({
      lockedUser: true,
      selectedUserId: 7,
      selectedUserName: 'موظف الاستقبال',
      summary: {
        subscriptionsCount: 1,
        totalValue: 500,
        collectedToday: 300,
        remainingAmount: 200,
      },
    });
  });

  it('lets a system administrator select a specific user without branch restriction', async () => {
    permissions.isSuperAdmin.mockResolvedValue(true);

    const result = await service.dailyCashierReport({ ...user, level: 1 }, '9');

    expect(branchScope.resolveListFilter).not.toHaveBeenCalled();
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registration_date: today,
          transferred_credit_amount: 0,
          created_by: 9,
        }),
      }),
    );
    expect(result.lockedUser).toBe(false);
    expect(result.selectedUserId).toBe(9);
    expect(result.selectedUserName).toBe('موظف آخر');
  });

  it('lets a system administrator view all users together', async () => {
    permissions.isSuperAdmin.mockResolvedValue(true);

    const result = await service.dailyCashierReport({ ...user, level: 1 });
    const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;

    expect(where).toEqual({ registration_date: today, transferred_credit_amount: 0 });
    expect(result.selectedUserId).toBeNull();
    expect(result.selectedUserName).toBe('كل المستخدمين');
  });

  it('filters a period and a branch, and closes the drawer from every reception source and the bar', async () => {
    permissions.isSuperAdmin.mockResolvedValue(true);
    prisma.club_receipts.findMany.mockResolvedValue([
      receipt(300),
      receipt(200, {
        id: 2,
        receipt_number: 'R-2',
        payments: [{ method: 'cash', amount: 50 }, { method: 'visa', amount: 150 }],
        subscription: { subscription_number: 'SUB000001', subscription_type: 'شهري', registration_date: '2020-01-01' },
      }),
      receipt(80, { id: 3, subscription_id: null, subscription: null, type: 'quick_service', description: 'خدمة سريعة: مشروب — بدون سكر', payments: [{ method: 'wallet', amount: 80 }] }),
    ]);
    prisma.club_spa_invoices.findMany.mockResolvedValue([
      { id: 5, invoice_number: 'SPA-5', member_id: null, total_amount: 120, payment_method: 'cash', invoice_date: '2026-01-02', created_at: new Date(), created_by: 7, service: { name: 'ساونا' } },
    ]);
    prisma.fin_expenses.findMany.mockResolvedValue([
      { id: 1, expense_number: 'EXP-1', expense_date: '2026-01-02', category: 'نثريات', sub_category: null, description: 'مياه', vendor: null, total_amount: 40, payment_method: 'نقدي', created_by: 7, created_at: new Date() },
      { id: 2, expense_number: 'EXP-2', expense_date: '2026-01-02', category: 'مردودات اشتراكات الجيم', sub_category: null, description: null, vendor: null, total_amount: 30, payment_method: 'نقدي', created_by: 7, created_at: new Date() },
    ]);
    prisma.sales_quick_sales.findMany.mockResolvedValue([
      { id: 9, sale_number: 'S-9', sale_date: '2026-01-02', sale_time: '10:00:00', customer_name: 'عميل نقدي', total_amount: 60, collected_amount: 60, payment_method: 'cash', cashier_id: 11, created_by: 11, payments: [] },
    ]);

    const result = await service.dailyCashierReport({ ...user, level: 1 }, undefined, undefined, {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-02',
      branchId: '4',
    });

    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where).toEqual({
      registration_date: { gte: '2026-01-01', lte: '2026-01-02' },
      transferred_credit_amount: 0,
      branch_id: { in: [4] },
    });
    expect(prisma.sales_quick_sales.findMany.mock.calls[0][0].where).toMatchObject({
      sale_date: { gte: '2026-01-01', lte: '2026-01-02' },
      status: 'completed',
      branch_id: { in: [4] },
    });
    expect(result.dateFrom).toBe('2026-01-01');
    expect(result.summary).toMatchObject({
      collectedTotal: 700,
      subscriptionsCollected: 500,
      servicesCollected: 200,
      isReconciled: true,
      collectedByMethod: { cash: 470, visa: 150, wallet: 80 },
      expensesTotal: 40,
      refundsTotal: 30,
    });
    expect(result.receiptRows.map((row) => row.source)).toEqual(['subscription', 'installment']);
    expect(result.serviceRows.map((row) => row.serviceName).sort()).toEqual(['ساونا', 'مشروب']);
    expect(result.drawer).toEqual({
      subscriptionsCash: 350,
      servicesCash: 120,
      otherReceiptsCash: 0,
      barCash: 60,
      collectedCash: 530,
      expensesCash: 40,
      refundsCash: 30,
      cashInDrawer: 460,
    });
    expect(result.bar).toMatchObject({ count: 1, salesTotal: 60, collected: 60, byMethod: { cash: 60 } });
    expect(result.bar.byCashier).toEqual([
      expect.objectContaining({ userId: 11, count: 1, collected: 60, cash: 60 }),
    ]);
    expect(result.byUser.find((row) => row.userId === 7)).toMatchObject({ cash: 470, card: 150, transfer: 80, cashInDrawer: 400 });
  });

  it('keeps a regular user on their own bar sales and expenses, and refuses a malformed date', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    await service.dailyCashierReport(user, '9', undefined, { dateFrom: '2026-01-01' });
    expect(prisma.sales_quick_sales.findMany.mock.calls[0][0].where.OR).toEqual([
      { cashier_id: 7 },
      { cashier_id: null, created_by: 7 },
    ]);
    expect(prisma.fin_expenses.findMany.mock.calls[0][0].where).toMatchObject({ created_by: 7, branch_id: { in: [3] } });
    await expect(service.dailyCashierReport(user, undefined, undefined, { dateFrom: 'yesterday' })).rejects.toThrow('تاريخ غير صالح');
  });
});
