import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionReportsService } from './subscription-reports.service';

describe('SubscriptionReportsService category scope', () => {
  it('forces a women-section employee to female subscriptions in their branch', () => {
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue('female'),
    };
    const service = new SubscriptionReportsService(
      {} as PrismaService,
      branchScope as unknown as BranchScopeService,
    );

    const where = (service as any).subscriptionWhere({
      startDate: '2026-09-01',
      endDate: '2026-09-21',
      gender: 'male',
    }, { level: 2, branch: 3, man_women_type: 1 });

    expect(where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
    ]));
  });
});
