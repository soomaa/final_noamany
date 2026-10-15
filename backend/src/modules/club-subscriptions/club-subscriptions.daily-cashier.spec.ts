import { BadRequestException } from '@nestjs/common';
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
  const prisma = {
    fin_expenses: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([subscription]),
    },
    club_receipts: {
      findMany: jest.fn().mockResolvedValue([{ amount: 300 }]),
    },
    users: {
      findMany: jest.fn().mockResolvedValue([
        { user_id: 7, name: 'موظف الاستقبال', username: 'reception' },
        { user_id: 9, name: 'موظف آخر', username: 'other' },
      ]),
    },
  };
  const permissions = { isSuperAdmin: jest.fn() };
  const branchScope = { resolveListFilter: jest.fn().mockReturnValue([3]) };
  const service = new ClubSubscriptionsService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    {} as BusinessAuditService,
    {} as AutomationEngineService,
    branchScope as unknown as BranchScopeService,
    permissions as unknown as PermissionEngineService,
    { resolveDiscount: jest.fn() } as unknown as import('./club-discount-codes.service').ClubDiscountCodesService,
  );
  const user = {
    sub: 7,
    level: 2,
    branch: 3,
  } as JwtUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.fin_expenses.findMany.mockResolvedValue([]);
    prisma.club_subscriptions.findMany.mockResolvedValue([subscription]);
    prisma.club_receipts.findMany.mockResolvedValue([{ amount: 300 }]);
    prisma.users.findMany.mockResolvedValue([
      { user_id: 7, name: 'موظف الاستقبال', username: 'reception' },
      { user_id: 9, name: 'موظف آخر', username: 'other' },
    ]);
    branchScope.resolveListFilter.mockReturnValue([3]);
  });

  it('forces a regular user to their own activity even when another user id is requested', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);

    const result = await service.dailyCashierReport(user, '9');

    expect(prisma.fin_expenses.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ created_by: 7, branch_id: { in: [3] },
        is_deleted: false, approval_status: { not: 'مرفوض' },
        expense_date: { gte: today, lte: `${today}T23:59:59` },
      }),
    }));

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

  it('totals paid expenses, not the full amount or subscription collections', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    prisma.fin_expenses.findMany.mockResolvedValue([
      { id: 1, expense_number: 'EXP-1', category: 'صيانة', total_amount: 100, paid_amount: 40, payment_status: 'جزئي', payments: [{ method: 'cash', amount: 40 }], created_by: 7 },
      { id: 2, expense_number: 'EXP-2', category: 'مرافق', total_amount: 50, paid_amount: null, payment_status: 'مدفوع', created_by: 7 },
      { id: 3, expense_number: 'EXP-3', category: 'مرافق', total_amount: 80, paid_amount: 0, payment_status: 'معلق', created_by: 7 },
      { id: 4, expense_number: 'EXP-4', category: 'مرافق', total_amount: 60, paid_amount: null, payment_status: 'جزئي', created_by: 7 },
    ] as never);
    const result = await service.dailyCashierReport(user);
    expect(result.summary.expensesPaidAmount).toBe(90);
    expect(result.summary.expensesNeedingReview).toBe(1);
    expect(result.summary.collectedToday).toBe(300);
    expect(result.expenseRows[0]).toMatchObject({ paidAmount: 40, remainingAmount: 60 });
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

  it('keeps a receptionist on their own activity even if their legacy account is level 1', async () => {
    permissions.isSuperAdmin.mockResolvedValue(true);

    const result = await service.dailyCashierReport({
      ...user,
      level: 1,
      emp_code: 77,
      job_title: 'موظف استقبال',
    }, '9');

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ created_by: 7 }),
      }),
    );
    expect(result).toMatchObject({
      isSystemAdmin: false,
      lockedUser: true,
      selectedUserId: 7,
    });
  });

  it('rejects a date that is not ISO YYYY-MM-DD', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);

    await expect(
      (service.dailyCashierReport as (...args: unknown[]) => Promise<unknown>)(
        user,
        undefined,
        '29/08/2026',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads a past day instead of always using today', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);

    const result = await service.dailyCashierReport(user, undefined, '2026-08-22');

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ registration_date: '2026-08-22', created_by: 7 }),
      }),
    );
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receipt_date: '2026-08-22', created_by: 7 }),
      }),
    );
    expect(result.date).toBe('2026-08-22');
    expect('isToday' in result ? result.isToday : undefined).toBe(false);
  });

  it('returns every subscription receipt so an old installment cannot enter the total without detail', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    prisma.club_receipts.findMany.mockResolvedValue([
      {
        id: 79,
        receipt_number: 'R-2026-0000079',
        subscription_id: 901,
        member_name: 'عضو اشتراك قديم',
        amount: 250,
        type: 'installment',
        payment_method: 'cash',
        description: 'قسط اشتراك قديم',
        created_at: new Date('2026-08-29T09:30:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 250 }],
        subscription: {
          subscription_number: 'SUB000901',
          subscription_type: 'شهري',
        },
      },
    ]);

    const result = await service.dailyCashierReport(user);

    expect(result.summary).toMatchObject({
      collectedToday: 250,
      collectedNonQuickAmount: 250,
      receiptsCount: 1,
      subscriptionReceiptsCount: 1,
    });
    expect('receiptRows' in result ? result.receiptRows : undefined).toEqual([
      expect.objectContaining({
        receiptNumber: 'R-2026-0000079',
        subscriptionNumber: 'SUB000901',
        customerName: 'عضو اشتراك قديم',
        subscriptionType: 'شهري',
        amount: 250,
        payments: [{ method: 'cash', amount: 250 }],
      }),
    ]);
  });

  it('reconciles the documented 4500 day across contracts, receipts, and payment methods', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    const contractAmounts = [450, 450, 1100, 500, 500, 500, 450, 500];
    const collectedAmounts = [450, 450, 1100, 500, 500, 450, 450, 500];
    prisma.club_subscriptions.findMany.mockResolvedValue(
      contractAmounts.map((amount, index) => ({
        ...subscription,
        id: 100 + index,
        subscription_number: `SUB00010${index}`,
        customer_name: `عميل ${index + 1}`,
        subscription_value: amount,
        paid_amount: collectedAmounts[index],
        remaining_amount: amount - collectedAmounts[index],
        payment_method: index === 2 ? 'wallet' : 'cash',
      })),
    );
    prisma.club_receipts.findMany.mockResolvedValue([
      ...collectedAmounts.map((amount, index) => ({
        id: 200 + index,
        receipt_number: `R-2026-00002${index}`,
        subscription_id: 100 + index,
        member_name: `عميل ${index + 1}`,
        amount,
        type: 'subscription',
        payment_method: index === 2 ? 'wallet' : 'cash',
        description: null,
        created_at: new Date(`2026-08-29T${String(9 + index).padStart(2, '0')}:00:00`),
        created_by: 7,
        payments: [{ method: index === 2 ? 'wallet' : 'cash', amount }],
        subscription: {
          subscription_number: `SUB00010${index}`,
          subscription_type: 'شهري',
        },
      })),
      {
        id: 299,
        receipt_number: 'QS-299',
        subscription_id: null,
        member_name: 'هشام عاطف',
        amount: 100,
        type: 'quick_service',
        payment_method: 'cash',
        description: 'خدمة سريعة: كارنيه',
        created_at: new Date('2026-08-29T18:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 100 }],
        subscription: null,
      },
    ]);

    const result = await service.dailyCashierReport(user);

    expect(result.summary).toEqual(expect.objectContaining({
      subscriptionsCount: 8,
      totalValue: 4450,
      collectedToday: 4500,
      collectedNonQuickAmount: 4400,
      remainingAmount: 50,
      receiptsCount: 9,
      subscriptionReceiptsCount: 8,
      quickServicesCount: 1,
      quickServicesAmount: 100,
      collectedByMethod: { cash: 3400, wallet: 1100 },
      paymentsTotal: 4500,
      reconciliationDifference: 0,
      unreconciledReceiptsCount: 0,
      isReconciled: true,
    }));
    expect(result.receiptRows).toHaveLength(8);
    expect('quickServiceRows' in result ? result.quickServiceRows : undefined).toEqual([
      expect.objectContaining({
        customerName: 'هشام عاطف',
        serviceName: 'كارنيه',
        amount: 100,
        payments: [{ method: 'cash', amount: 100 }],
      }),
    ]);
  });

  it('flags individual receipt mismatches even when their differences cancel out globally', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    prisma.club_receipts.findMany.mockResolvedValue([
      {
        id: 301,
        receipt_number: 'R-301',
        subscription_id: 17,
        member_name: 'عميل أول',
        amount: 100,
        type: 'subscription',
        payment_method: 'cash',
        description: null,
        created_at: new Date('2026-08-29T09:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 90 }],
        subscription: { subscription_number: 'SUB000017', subscription_type: 'شهري' },
      },
      {
        id: 302,
        receipt_number: 'R-302',
        subscription_id: 18,
        member_name: 'عميل ثان',
        amount: 100,
        type: 'subscription',
        payment_method: 'cash',
        description: null,
        created_at: new Date('2026-08-29T10:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 110 }],
        subscription: { subscription_number: 'SUB000018', subscription_type: 'شهري' },
      },
    ]);

    const result = await service.dailyCashierReport(user, undefined, '2026-08-29');

    expect(result.summary).toEqual(expect.objectContaining({
      collectedToday: 200,
      paymentsTotal: 200,
      reconciliationDifference: 0,
      unreconciledReceiptsCount: 2,
      isReconciled: false,
    }));
    expect(result.receiptRows).toEqual([
      expect.objectContaining({ isReconciled: false, reconciliationDifference: 10 }),
      expect.objectContaining({ isReconciled: false, reconciliationDifference: -10 }),
    ]);
  });

  it('lists quick-service sales separately from subscriptions and still counts their cash', async () => {
    permissions.isSuperAdmin.mockResolvedValue(false);
    prisma.club_receipts.findMany.mockResolvedValue([
      {
        id: 80,
        receipt_number: 'QS-80',
        subscription_id: null,
        member_name: 'هشام عاطف',
        amount: 100,
        type: 'quick_service',
        payment_method: 'cash',
        description: 'خدمة سريعة: كارنيه',
        created_at: new Date('2026-08-29T10:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 100 }],
        subscription: null,
      },
      {
        id: 81,
        receipt_number: 'QS-81',
        subscription_id: null,
        member_name: 'عميل نقدي',
        amount: 50,
        type: 'quick_service',
        payment_method: 'cash',
        description: 'خدمة سريعة: رسوم إدارية',
        created_at: new Date('2026-08-29T11:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 50 }],
        subscription: null,
      },
      {
        id: 82,
        receipt_number: 'REC-17',
        subscription_id: 17,
        member_name: 'عميل اليوم',
        amount: 300,
        type: 'subscription',
        payment_method: 'cash',
        description: null,
        created_at: new Date('2026-08-29T09:00:00'),
        created_by: 7,
        payments: [{ method: 'cash', amount: 300 }],
        subscription: { subscription_number: 'SUB000017', subscription_type: 'شهري' },
      },
    ]);

    const result = await service.dailyCashierReport(user);

    expect(result.summary).toMatchObject({
      subscriptionsCount: 1,
      collectedToday: 450,
      collectedNonQuickAmount: 300,
      quickServicesCount: 2,
      quickServicesAmount: 150,
      collectedByMethod: { cash: 450 },
    });
    expect(result.quickServiceRows).toEqual([
      expect.objectContaining({ receiptNumber: 'QS-80', serviceName: 'كارنيه', amount: 100 }),
      expect.objectContaining({ receiptNumber: 'QS-81', serviceName: 'رسوم إدارية', amount: 50 }),
    ]);
    expect(result.rows).toHaveLength(1);
  });
});
