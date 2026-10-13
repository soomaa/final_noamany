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
});
