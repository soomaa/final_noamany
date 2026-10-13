import { shareClubMemberIdentity } from './club-branch-groups';

describe('club member branch grouping', () => {
  it.each([
    [2, 5],
    [2, 6],
    [5, 6],
    [2, 2],
  ])('treats Tanta branch pair %i and %i as one member group', (memberBranchId, subscriptionBranchId) => {
    expect(shareClubMemberIdentity(memberBranchId, subscriptionBranchId)).toBe(true);
  });

  it('keeps branches outside the Tanta group separate', () => {
    expect(shareClubMemberIdentity(2, 3)).toBe(false);
  });
});
