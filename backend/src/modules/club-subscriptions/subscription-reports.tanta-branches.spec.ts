import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { SubscriptionReportsService } from './subscription-reports.service';

describe('SubscriptionReportsService Tanta branch grouping', () => {
  const service = new SubscriptionReportsService(
    {} as never,
    new BranchScopeService(),
  );
  const branchIds = (branch: string | undefined, user: { level: number; branch: number }) =>
    (
      service as unknown as {
        branchIds: (
          query: { branch?: string },
          jwtUser: { level: number; branch: number },
        ) => number[] | null;
      }
    ).branchIds({ branch }, user);

  it('includes Tanta main, up and down when an admin selects Tanta main', () => {
    expect(branchIds('2', { level: 1, branch: 0 })).toEqual([2, 5, 6]);
  });

  it('includes the full Tanta group for a user assigned to Tanta main', () => {
    expect(branchIds(undefined, { level: 2, branch: 2 })).toEqual([2, 5, 6]);
  });

  it.each([5, 6])('keeps Tanta section %i separate when selected directly', (id) => {
    expect(branchIds(String(id), { level: 1, branch: 0 })).toEqual([id]);
  });

  it('cannot broaden a men/women-scoped report with a query-string gender filter', () => {
    const where = (service as unknown as {
      subscriptionWhere: (query: { gender?: string }, jwtUser: { level: number; branch: number; man_women_type: number }) => { AND: Array<Record<string, unknown>> };
    }).subscriptionWhere({ gender: 'female' }, { level: 3, branch: 2, man_women_type: 0 });
    expect(where.AND).toContainEqual({
      member: { is: { is_deleted: false, gender: 'male' } },
    });
    expect(where.AND).not.toContainEqual({ gender: 'male' });
    expect(where.AND).not.toContainEqual({ gender: 'female' });
  });

  it('applies the server-owned audience to receipt totals and payment detail queries', () => {
    const where = (service as unknown as {
      receiptWhere: (
        query: { startDate: string; endDate: string; gender?: string },
        jwtUser: { level: number; branch: number; man_women_type: number },
      ) => { AND: Array<Record<string, unknown>> };
    }).receiptWhere(
      { startDate: '2026-09-01', endDate: '2026-09-30', gender: 'female' },
      { level: 3, branch: 5, man_women_type: 0 },
    );

    expect(where.AND).toContainEqual(expect.objectContaining({
      OR: expect.arrayContaining([
        expect.objectContaining({
          subscription_id: { not: null },
          subscription: { is: { member: { is: { is_deleted: false, gender: 'male' } } } },
        }),
        expect.objectContaining({ subscription_id: null, locker_subscription_id: { not: null } }),
      ]),
    }));
    expect(where.AND).toContainEqual(expect.objectContaining({
      OR: expect.arrayContaining([
        expect.objectContaining({
          subscription_id: { not: null },
          subscription: { is: { branch_id: { in: [5] } } },
        }),
      ]),
    }));
  });

  it('applies an unrestricted admin requested audience to the sales drill-down', async () => {
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const report = new SubscriptionReportsService(prisma as never, new BranchScopeService());

    await report.details('sales', '8', {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      gender: 'female',
    }, { sub: 1, level: 1, branch: 0, man_women_type: -1 } as never);

    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ gender: 'female' }),
    }));
  });
});
