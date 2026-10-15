import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionReportsService } from './subscription-reports.service';

describe('SubscriptionReportsService quick_service split', () => {
  const prisma = {
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    club_receipts: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_receipt_payments: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
    club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscription_refunds: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: null }, _count: 0 }),
    },
    club_subscription_waivers: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
    },
    club_customer_sources: { findMany: jest.fn().mockResolvedValue([]) },
    club_members: { groupBy: jest.fn().mockResolvedValue([]) },
    employees: { findMany: jest.fn().mockResolvedValue([]) },
    users: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue(null),
  };
  const service = new SubscriptionReportsService(
    prisma as unknown as PrismaService,
    branchScope as unknown as BranchScopeService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscriptions.findMany.mockResolvedValue([]);
    prisma.club_subscriptions.groupBy.mockResolvedValue([]);
    prisma.club_receipts.groupBy.mockResolvedValue([]);
    prisma.club_receipt_payments.groupBy.mockResolvedValue([]);
    prisma.club_receipts.findMany.mockResolvedValue([]);
  });

  it('excludes quick_service from per-user receipt totals', async () => {
    await service.summary({ startDate: '2026-08-01', endDate: '2026-08-29' });

    expect(prisma.club_receipts.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['created_by'],
        where: expect.objectContaining({
          NOT: { type: 'quick_service' },
        }),
      }),
    );
  });

  it('returns quick_service as its own revenue source', async () => {
    prisma.club_receipts.findMany.mockImplementation(({ where }) => {
      if (where?.type === 'quick_service') {
        return Promise.resolve([
          { receipt_date: '2026-08-29', amount: 100, payment_method: 'cash', payments: [] },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.summary({ startDate: '2026-08-29', endDate: '2026-08-29' });
    const quick = result.services.find((row) => row.key === 'quick_service');

    expect(quick).toMatchObject({
      name: 'بيع سريع (ID / Session)',
      count: 1,
      amount: 100,
    });
  });
});
