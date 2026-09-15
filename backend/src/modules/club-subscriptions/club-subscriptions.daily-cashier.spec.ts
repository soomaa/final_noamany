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
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([3]),
    memberGenderFilter: jest.fn().mockReturnValue('male'),
  };
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

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registration_date: today,
          transferred_credit_amount: 0,
          created_by: 7,
          branch_id: { in: [3] },
          member: { is: { is_deleted: false, gender: 'male' } },
        }),
      }),
    );
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          receipt_date: today,
          created_by: 7,
          subscription: {
            is: expect.objectContaining({
              member: { is: { is_deleted: false, gender: 'male' } },
            }),
          },
        }),
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
    branchScope.memberGenderFilter.mockReturnValue(null);

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
    branchScope.memberGenderFilter.mockReturnValue(null);

    const result = await service.dailyCashierReport({ ...user, level: 1 });
    const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;

    expect(where).toEqual({ registration_date: today, transferred_credit_amount: 0 });
    expect(result.selectedUserId).toBeNull();
    expect(result.selectedUserName).toBe('كل المستخدمين');
  });
});
