import {
  isSubscriptionTypeAvailableAtBranch,
  subscriptionTypeBranchWhere,
} from './subscription-type-branch-scope';

describe('subscription type branch isolation', () => {
  it('accepts only global or explicitly assigned plans', () => {
    expect(isSubscriptionTypeAvailableAtBranch({
      branch_id: null,
      apply_to_all_branches: true,
      branches: [],
    }, 2)).toBe(true);
    expect(isSubscriptionTypeAvailableAtBranch({
      branch_id: 2,
      apply_to_all_branches: false,
      branches: [],
    }, 2)).toBe(true);
    expect(isSubscriptionTypeAvailableAtBranch({
      branch_id: 1,
      apply_to_all_branches: false,
      branches: [{ branch_id: 2 }],
    }, 2)).toBe(true);
    expect(isSubscriptionTypeAvailableAtBranch({
      branch_id: null,
      apply_to_all_branches: false,
      branches: [],
    }, 2)).toBe(false);
    expect(isSubscriptionTypeAvailableAtBranch({
      branch_id: 1,
      apply_to_all_branches: false,
      branches: [{ branch_id: 1 }],
    }, 2)).toBe(false);
  });

  it('fails closed for a user with no assigned branches', () => {
    expect(subscriptionTypeBranchWhere([])).toEqual({ id: -1 });
  });

  it('keeps admin plan listing unrestricted', () => {
    expect(subscriptionTypeBranchWhere(null)).toEqual({});
  });
});

