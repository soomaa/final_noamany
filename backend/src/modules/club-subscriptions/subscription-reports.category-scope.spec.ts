import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { SubscriptionReportsService } from './subscription-reports.service';

describe('SubscriptionReportsService category scope', () => {
  it('keeps a women-section employee in their branch, lets them pick either section, and does not force women', () => {
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
      resolveMemberGenderRequest: jest.fn((user: JwtUser, requested?: string | null) =>
        BranchScopeService.prototype.resolveMemberGenderRequest.call(branchScope, user, requested)),
    };
    const service = new SubscriptionReportsService(
      {} as PrismaService,
      branchScope as unknown as BranchScopeService,
    );

    const men = (service as any).subscriptionWhere({
      startDate: '2026-09-01',
      endDate: '2026-09-21',
      gender: 'male',
    }, { level: 2, branch: 3, man_women_type: 2 });
    expect(men.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      { OR: [{ gender: 'male' }, { gender: null, member: { is: { gender: 'male' } } }] },
    ]));

    const women = (service as any).subscriptionWhere({
      startDate: '2026-09-01',
      endDate: '2026-09-21',
      gender: 'female',
    }, { level: 2, branch: 3, man_women_type: 2 });
    expect(women.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
      { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
    ]));

    const where = (service as any).subscriptionWhere({
      startDate: '2026-09-01',
      endDate: '2026-09-21',
    }, { level: 2, branch: 3, man_women_type: 2 });

    expect(where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [3] } },
    ]));
    expect(JSON.stringify(where)).not.toContain('gender');
  });
});
