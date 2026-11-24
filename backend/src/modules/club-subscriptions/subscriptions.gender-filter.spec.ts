import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { OnlineSubscriptionsService } from '../online-subscriptions/online-subscriptions.service';
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { PrivateSubscriptionsService } from './private-subscriptions.service';
import { SubscriptionReportsService } from './subscription-reports.service';

/**
 * رجالي/حريمي/الكل across the subscriptions area: the staff section is only the screen default
 * (client, 22 Nov). Nobody is locked to a section or refused the other one; an explicit pick
 * filters, and no pick / 'all' means both sections.
 */
const men = { sub: 7, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as JwtUser;
const women = { sub: 8, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as JwtUser;
const admin = { sub: 1, level: 1, branch: 0 } as JwtUser;

const subGender = (gender: 'male' | 'female') => ({
  OR: [{ gender }, { gender: null, member: { is: { gender } } }],
});
const receiptGender = (gender: 'male' | 'female') => ({
  OR: [
    { subscription: { is: subGender(gender) } },
    { subscription_id: null, member: { is: { gender } } },
  ],
});
const json = (value: unknown) => JSON.stringify(value);

function makePrisma() {
  return {
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    club_receipts: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    club_subscription_waivers: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
    },
    club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscription_transfers: { findMany: jest.fn().mockResolvedValue([]) },
    club_member_subscription_transfers: { findMany: jest.fn().mockResolvedValue([]) },
    club_members: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    // يومية الاستقبال also reads spa / InBody invoices, expenses and bar sales.
    club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    fin_expenses: { findMany: jest.fn().mockResolvedValue([]) },
    sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
    users: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_branches: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
}

describe('subscriptions رجالي/حريمي filter', () => {
  let prisma: ReturnType<typeof makePrisma>;
  const scope = new BranchScopeService();
  const groups = { sharesGroup: async () => false, siblingBranchIds: async (id: number) => [id] };
  const permissions = { isSuperAdmin: jest.fn(async (id: number) => id === 1) };
  let subscriptions: ClubSubscriptionsService;

  beforeEach(() => {
    prisma = makePrisma();
    subscriptions = new ClubSubscriptionsService(
      prisma as never, {} as never, {} as never, {} as never, {} as never,
      scope, permissions as never, {} as never, {} as never, groups,
    );
  });

  describe('waivers report', () => {
    const where = () => prisma.club_subscription_waivers.findMany.mock.calls[0][0].where;

    it('does not lock a men employee to male; male and female picks both filter', async () => {
      await subscriptions.waiverReport({}, men);
      expect(json(where())).not.toContain('gender');
      prisma.club_subscription_waivers.findMany.mockClear();
      await subscriptions.waiverReport({ gender: 'male' }, men);
      expect(where().AND).toContainEqual({ subscription: { is: subGender('male') } });
      prisma.club_subscription_waivers.findMany.mockClear();
      await expect(subscriptions.waiverReport({ gender: 'female' }, men)).resolves.toBeDefined();
      expect(where().AND).toContainEqual({ subscription: { is: subGender('female') } });
    });

    it('does not lock a women employee to female; the men section may be opened', async () => {
      await subscriptions.waiverReport({}, women);
      expect(json(where())).not.toContain('gender');
      prisma.club_subscription_waivers.findMany.mockClear();
      await expect(subscriptions.waiverReport({ gender: 'male' }, women)).resolves.toBeDefined();
      expect(where().AND).toContainEqual({ subscription: { is: subGender('male') } });
    });

    it('lets an admin pick a section and is unfiltered otherwise', async () => {
      await subscriptions.waiverReport({ gender: 'female' }, admin);
      expect(where().AND).toContainEqual({ subscription: { is: subGender('female') } });
      prisma.club_subscription_waivers.findMany.mockClear();
      await subscriptions.waiverReport({ gender: 'all' }, admin);
      expect(json(where())).not.toContain('gender');
    });
  });

  describe('daily cashier', () => {
    it('filters subscriptions and receipts by the picked section only, never by the employee section', async () => {
      await subscriptions.dailyCashierReport(men);
      expect(json(prisma.club_subscriptions.findMany.mock.calls[0][0].where)).not.toContain('gender');
      expect(json(prisma.club_receipts.findMany.mock.calls[0][0].where)).not.toContain('gender');
      await subscriptions.dailyCashierReport(men, undefined, 'male');
      expect(prisma.club_subscriptions.findMany.mock.calls[1][0].where.AND).toEqual([subGender('male')]);
      expect(prisma.club_receipts.findMany.mock.calls[1][0].where.AND).toEqual([receiptGender('male')]);
      await expect(subscriptions.dailyCashierReport(men, undefined, 'female')).resolves.toBeDefined();
      expect(prisma.club_subscriptions.findMany.mock.calls[2][0].where.AND).toEqual([subGender('female')]);
      await expect(subscriptions.dailyCashierReport(women, undefined, 'male')).resolves.toBeDefined();
      expect(prisma.club_receipts.findMany.mock.calls[3][0].where.AND).toEqual([receiptGender('male')]);
    });

    it('lets an admin pick female and is unfiltered by default', async () => {
      await subscriptions.dailyCashierReport(admin, undefined, 'female');
      expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subGender('female')]);
      await subscriptions.dailyCashierReport(admin);
      expect(json(prisma.club_subscriptions.findMany.mock.calls[1][0].where)).not.toContain('gender');
    });
  });

  describe('user analytics', () => {
    it('filters subscriptions and receipts by section', async () => {
      await subscriptions.userAnalytics({ gender: 'female' }, admin);
      expect(prisma.club_subscriptions.groupBy.mock.calls[0][0].where.AND).toEqual([subGender('female')]);
      expect(prisma.club_receipts.groupBy.mock.calls[0][0].where.subscription.is.AND).toEqual([subGender('female')]);
      await subscriptions.userAnalytics({}, women);
      expect(json(prisma.club_subscriptions.groupBy.mock.calls[1][0].where)).not.toContain('gender');
      await expect(subscriptions.userAnalytics({ gender: 'female' }, men)).resolves.toBeDefined();
      expect(prisma.club_subscriptions.groupBy.mock.calls[2][0].where.AND).toEqual([subGender('female')]);
      await subscriptions.userAnalytics({}, admin);
      expect(json(prisma.club_subscriptions.groupBy.mock.calls[3][0].where)).not.toContain('gender');
    });
  });

  describe('receipts list', () => {
    const service = () => new ClubReceiptsCrudService(prisma as never, {} as never, {} as never, scope);
    const where = (i = 0) => prisma.club_receipts.findMany.mock.calls[i][0].where;

    it('does not lock one-section staff, and lets them open the other section', async () => {
      await service().list({ page: 1, pageSize: 50 } as never, men);
      expect(json(where())).not.toContain('gender');
      await expect(service().list({ gender: 'female' } as never, men)).resolves.toBeDefined();
      expect(where(1).AND).toContainEqual(receiptGender('female'));
      await service().list({ page: 1, pageSize: 50, gender: 'female' } as never, women);
      expect(where(2).AND).toContainEqual(receiptGender('female'));
      await expect(service().list({ gender: 'male' } as never, women)).resolves.toBeDefined();
      expect(where(3).AND).toContainEqual(receiptGender('male'));
    });

    it('lets an admin pick female and is unfiltered by default', async () => {
      await service().list({ gender: 'female' } as never, admin);
      expect(where().AND).toContainEqual(receiptGender('female'));
      await service().list({} as never, admin);
      expect(json(where(1))).not.toContain('gender');
    });
  });

  describe('refunds', () => {
    const service = () => new ClubSubscriptionRefundsService(prisma as never, {} as never, {} as never, {} as never, scope, groups);
    const where = (i = 0) => prisma.club_subscription_refunds.findMany.mock.calls[i][0].where;

    it('filters by the picked refunded subscription section, any section for anyone', async () => {
      await service().list(men);
      expect(where()).not.toHaveProperty('subscription');
      await expect(service().list(men, 'female')).resolves.toBeDefined();
      expect(where(1).subscription).toEqual({ is: subGender('female') });
      await service().list(women, 'female');
      expect(where(2).subscription).toEqual({ is: subGender('female') });
      await expect(service().list(women, 'male')).resolves.toBeDefined();
      expect(where(3).subscription).toEqual({ is: subGender('male') });
      await service().list(admin, 'female');
      expect(where(4).subscription).toEqual({ is: subGender('female') });
      await service().list(admin);
      expect(where(5)).not.toHaveProperty('subscription');
    });
  });

  describe('transfers', () => {
    const service = () => new ClubSubscriptionTransfersService(prisma as never, {} as never, {} as never, {} as never, scope, groups);

    it('filters member transfers by the source subscription section', async () => {
      const where = (i: number) => prisma.club_member_subscription_transfers.findMany.mock.calls[i][0].where;
      await service().listMemberTransfers(men);
      expect(where(0)).not.toHaveProperty('source_subscription');
      await expect(service().listMemberTransfers(men, 'female')).resolves.toBeDefined();
      expect(where(1).source_subscription).toEqual({ is: subGender('female') });
      await expect(service().listMemberTransfers(women, 'male')).resolves.toBeDefined();
      expect(where(2).source_subscription).toEqual({ is: subGender('male') });
      await service().listMemberTransfers(admin, 'female');
      expect(where(3).source_subscription).toEqual({ is: subGender('female') });
      await service().listMemberTransfers(admin);
      expect(where(4)).not.toHaveProperty('source_subscription');
    });

    it('filters plan transfers by the subscription section', async () => {
      const where = (i: number) => prisma.club_subscription_transfers.findMany.mock.calls[i][0].where;
      await service().list(women);
      expect(where(0)).not.toHaveProperty('subscription');
      await expect(service().list(women, 'male')).resolves.toBeDefined();
      expect(where(1).subscription).toEqual({ is: subGender('male') });
      await expect(service().list(men, 'female')).resolves.toBeDefined();
      expect(where(2).subscription).toEqual({ is: subGender('female') });
      await service().list(admin, 'female');
      expect(where(3).subscription).toEqual({ is: subGender('female') });
      await service().list(admin);
      expect(where(4)).not.toHaveProperty('subscription');
    });
  });

  describe('private enrollments', () => {
    it('filters enrollments by section', async () => {
      const service = new PrivateSubscriptionsService(prisma as never, {} as never, scope);
      const and = (i: number) => prisma.club_subscriptions.findMany.mock.calls[i][0].where.AND;
      await service.listEnrollments({ page: 1, pageSize: 20 } as never, men);
      expect(json(and(0))).not.toContain('gender');
      await expect(service.listEnrollments({ gender: 'female' } as never, men)).resolves.toBeDefined();
      expect(and(1)).toContainEqual(subGender('female'));
      await expect(service.listEnrollments({ gender: 'male' } as never, women)).resolves.toBeDefined();
      expect(and(2)).toContainEqual(subGender('male'));
      await service.listEnrollments({ gender: 'female' } as never, admin);
      expect(and(3)).toContainEqual(subGender('female'));
      await service.listEnrollments({} as never, admin);
      expect(json(and(4))).not.toContain('gender');
    });
  });

  describe('online subscriptions', () => {
    const service = () => new OnlineSubscriptionsService(prisma as never, scope, {} as never);

    it('filters requests by the member section', async () => {
      await service().list(men);
      expect(prisma.$queryRawUnsafe.mock.calls[0][0]).not.toContain('gender');
      await service().list(men, 'male');
      expect(prisma.$queryRawUnsafe.mock.calls[1][0]).toContain('member_id IN (SELECT gm.id FROM club_members gm WHERE gm.gender = ?)');
      expect(prisma.$queryRawUnsafe.mock.calls[1]).toContain('male');
      await expect(service().list(men, 'female')).resolves.toBeDefined();
      expect(prisma.$queryRawUnsafe.mock.calls[2]).toContain('female');
      await expect(service().list(women, 'male')).resolves.toBeDefined();
      expect(prisma.$queryRawUnsafe.mock.calls[3]).toContain('male');
      await service().list(admin, 'female');
      expect(prisma.$queryRawUnsafe.mock.calls[4]).toContain('female');
      await service().list(admin);
      expect(prisma.$queryRawUnsafe.mock.calls[5][0]).not.toContain('gender');
    });

    it('approves a request from the other section', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{
        id: 5, branch_id: 2, member_id: 9, status: 'pending', payment_base_method: 'cash',
        customer_name: 'سيدة', subscription_type_id: 3, requested_start_date: '2026-11-22', subscription_value: 500,
      }]);
      prisma.club_members.findUnique.mockResolvedValue({ gender: 'female' });
      const create = jest.fn().mockResolvedValue({ id: 77 });
      const executeRaw = jest.fn().mockResolvedValue(1);
      const notify = jest.fn().mockResolvedValue({});
      Object.assign(prisma, { $executeRawUnsafe: executeRaw, am_member_notifications: { create: notify } });
      const online = new OnlineSubscriptionsService(prisma as never, scope, { create } as never);
      await expect(online.approve(5, men)).resolves.toEqual(expect.objectContaining({ success: true }));
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ memberId: 9, branchId: 2, paymentMethod: 'cash' }), men);
      expect(executeRaw).toHaveBeenCalled();
    });
  });

  describe('subscription reports', () => {
    const reports = () => new SubscriptionReportsService(prisma as never, scope);
    const q = { startDate: '2026-09-01', endDate: '2026-09-30' };

    it('does not lock subscriptions and receipts to the employee section; any picked section filters', () => {
      const service = reports() as any;
      expect(json(service.subscriptionWhere(q, men))).not.toContain('gender');
      expect(json(service.receiptWhere(q, men))).not.toContain('gender');
      expect(json(service.subscriptionWhere(q, women))).not.toContain('gender');
      expect(service.subscriptionWhere({ ...q, gender: 'male' }, men).AND).toContainEqual(subGender('male'));
      expect(service.receiptWhere({ ...q, gender: 'male' }, men).AND).toEqual([receiptGender('male')]);
      expect(() => service.subscriptionWhere({ ...q, gender: 'female' }, men)).not.toThrow();
      expect(service.subscriptionWhere({ ...q, gender: 'female' }, men).AND).toContainEqual(subGender('female'));
      expect(() => service.receiptWhere({ ...q, gender: 'male' }, women)).not.toThrow();
      expect(service.receiptWhere({ ...q, gender: 'male' }, women).AND).toEqual([receiptGender('male')]);
    });

    it('lets an admin pick female and is unfiltered by default', () => {
      const service = reports() as any;
      expect(service.subscriptionWhere({ ...q, gender: 'female' }, admin).AND).toContainEqual(subGender('female'));
      expect(service.receiptWhere({ ...q, gender: 'female' }, admin).AND).toEqual([receiptGender('female')]);
      expect(json(service.subscriptionWhere(q, admin))).not.toContain('gender');
      expect(service.receiptWhere(q, admin)).not.toHaveProperty('AND');
    });
  });
});
