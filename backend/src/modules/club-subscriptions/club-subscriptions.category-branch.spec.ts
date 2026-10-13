import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';

const subscription = {
  id: 17,
  subscription_number: 'SUB-17',
  registration_date: '2026-09-21',
  branch_id: 3,
  member_id: 12,
  customer_name: 'عضوة قديمة',
  subscription_type_id: 2,
  special_class_type_id: null,
  private_package_id: null,
  private_trainer_id: null,
  private_discount_type: null,
  subscription_type: 'اشتراك شهري',
  subscription_start_date: '2026-09-01',
  subscription_end_date: '2026-09-30',
  subscription_value: 500,
  discount_enabled: false,
  discount_code_id: null,
  discount_percentage: null,
  discount_value: 0,
  paid_amount: 500,
  waived_amount: 0,
  transferred_credit_amount: 0,
  remaining_amount: 0,
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
  inbody_used: 0,
  spa_used: 0,
  allow_multiple_daily_entries: false,
  is_time_based: false,
  time_from: null,
  time_to: null,
  created_by: null,
  created_at: new Date('2026-09-21T08:00:00.000Z'),
  updated_at: new Date('2026-09-21T08:00:00.000Z'),
  freezes: [],
  member: { gender: 'female', member_code: 'M-12', phone: '01012345678' },
};

describe('ClubSubscriptionsService category and branch scope', () => {
  const prisma = {
    club_subscriptions: {
      fields: { sessions_count: 'sessions_count' },
      findMany: jest.fn(),
      count: jest.fn(),
    },
    tbl_branches: {
      findMany: jest.fn(),
    },
    users: {
      findMany: jest.fn(),
    },
  };
  const branchScope = {
    allowedBranchIds: jest.fn(),
    resolveListFilter: jest.fn(),
    memberGenderFilter: jest.fn(),
  };
  const groups = { sharesGroup: jest.fn().mockResolvedValue(false), siblingBranchIds: jest.fn().mockResolvedValue([3]) };
  const service = new ClubSubscriptionsService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    {} as BusinessAuditService,
    {} as AutomationEngineService,
    branchScope as unknown as BranchScopeService,
    {} as PermissionEngineService,
    {} as ClubDiscountCodesService,
    {} as never,
    groups,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscriptions.findMany.mockResolvedValue([subscription]);
    prisma.club_subscriptions.count.mockResolvedValue(1);
    prisma.tbl_branches.findMany.mockResolvedValue([{ branch_id: 3, branch_name: 'الجلاء' }]);
    prisma.users.findMany.mockResolvedValue([]);
    branchScope.resolveListFilter.mockReturnValue([3]);
    branchScope.allowedBranchIds.mockReturnValue([3]);
    groups.siblingBranchIds.mockResolvedValue([3]);
    branchScope.memberGenderFilter.mockReturnValue('female');
  });

  it('labels a legacy subscription with its member category and branch', async () => {
    const result = await service.list({ page: '1', pageSize: '20' } as never, {
      level: 2,
      branch: 3,
      man_women_type: 1,
    } as never);

    expect(result.data).toEqual([
      expect.objectContaining({ branchName: 'الجلاء', gender: 'female' }),
    ]);
  });

  it('expands refund and transfer sources to the active group while ordinary subscription lists stay branch scoped', async () => {
    groups.siblingBranchIds.mockResolvedValue([3, 7]);
    await service.listTransferSources({ page: 1, pageSize: 200 } as never, { branch: 3 } as never);
    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toContainEqual({ branch_id: { in: [3, 7] } });
    await service.listRefundSources({ page: 1, pageSize: 200 } as never, { branch: 3 } as never);
    expect(prisma.club_subscriptions.findMany.mock.calls[1][0].where.AND).toContainEqual({ branch_id: { in: [3, 7] } });
    await service.list({ page: 1, pageSize: 200 } as never, { branch: 3 } as never);
    expect(prisma.club_subscriptions.findMany.mock.calls[2][0].where.AND).toContainEqual({ branch_id: { in: [3] } });
  });

  it('forces a women-section employee to their branch and category despite forged filters', async () => {
    await service.list({ page: '1', pageSize: '20', branch: '99', gender: 'male' } as never, {
      level: 2,
      branch: 3,
      man_women_type: 1,
    } as never);

    const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
    ]));
  });

  it('applies the employee section to expired-subscription reports', async () => {
    await service.expiredReport({ page: '1', pageSize: '20' }, {
      level: 2,
      branch: 3,
      man_women_type: 1,
    } as never);

    const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
    ]));
  });

  it.each(['M-12', '01012345678', 'عضوة قديمة'])('searches member identity before pagination for %s', async (search) => {
    const result = await service.listTransferSources({ search, page: 1, pageSize: 200 } as never, { branch: 3 } as never);
    const args = prisma.club_subscriptions.findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      expect.objectContaining({ member_id: { not: null }, private_package_id: null, remaining_amount: { lte: 0.009 } }),
      expect.objectContaining({ subscription_start_date: expect.anything(), subscription_end_date: expect.anything(), status: { not: 'frozen' } }),
      { OR: expect.arrayContaining([{ member: { is: { OR: [
        { member_code: { contains: search } }, { phone: { contains: search } }, { name: { contains: search } },
      ] } } }]) },
    ]));
    expect(args.skip).toBe(0);
    expect(args.take).toBe(200);
    expect(result.data[0]).toEqual(expect.objectContaining({ memberCode: 'M-12', memberPhone: '01012345678' }));
  });
});
