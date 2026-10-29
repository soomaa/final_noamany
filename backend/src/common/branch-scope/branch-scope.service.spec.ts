import { BranchScopeService } from "./branch-scope.service";

describe("BranchScopeService", () => {
  const service = new BranchScopeService();

  it("allows a super-admin to view all branches", () => {
    expect(service.resolveListFilter({ level: 1 } as never, "all")).toBeNull();
  });

  it("allows an RBAC super-admin role to view all branches", () => {
    const user = { level: 2, branch: 2, is_super_admin: true } as never;

    expect(service.resolveListFilter(user, "all")).toBeNull();
    expect(service.isBranchAllowed(user, 5)).toBe(true);
  });

  it("keeps a super-admin's explicit branch selection exact", () => {
    expect(service.resolveListFilter({ level: 1 } as never, "2")).toEqual([2]);
  });

  it("locks a non-admin to exactly their assigned branch", () => {
    expect(
      service.resolveListFilter({ level: 2, branch: 4 } as never, null),
    ).toEqual([4]);
  });

  it("gives a Tanta main employee the Tanta Up and Down sub-branches", () => {
    const user = { level: 2, branch: 2 } as never;
    expect(service.resolveListFilter(user, null)).toEqual([2, 5, 6]);
    expect(service.resolveListFilter(user, 5)).toEqual([5]);
    expect(service.isBranchAllowed(user, 6)).toBe(true);
    expect(service.isBranchAllowed(user, 4)).toBe(false);
  });

  it("keeps a sub-branch employee inside the sub-branch", () => {
    const user = { level: 2, branch: 5 } as never;
    expect(service.allowedBranchIds(user)).toEqual([5]);
    expect(service.isBranchAllowed(user, 2)).toBe(false);
    expect(service.isBranchAllowed(user, 6)).toBe(false);
  });

  it("does not honour a non-admin's foreign branch selection", () => {
    expect(
      service.resolveListFilter({ level: 2, branch: 2 } as never, 4),
    ).toEqual([2, 5, 6]);
    expect(service.isBranchAllowed({ level: 2, branch: 2 } as never, 4)).toBe(
      false,
    );
  });

  it("fails closed for an unassigned non-admin", () => {
    const user = { level: 2, branch: 0 } as never;
    expect(service.allowedBranchIds(user)).toEqual([]);
    expect(service.resolveListFilter(user, null)).toEqual([]);
    expect(service.isBranchAllowed(user, 1)).toBe(false);
  });

  it("fails closed when no authenticated user is supplied", () => {
    expect(service.allowedBranchIds(undefined)).toEqual([]);
    expect(service.resolveListFilter(undefined, null)).toEqual([]);
    expect(service.isBranchAllowed(undefined, 1)).toBe(false);
  });

  it('does not gender-filter an employee assigned to all sections', () => {
    const user = { level: 2, branch: 2, man_women_type: 3 } as never;

    expect(service.memberGenderFilter(user)).toBeNull();
    expect(service.isMemberGenderAllowed(user, 'male')).toBe(true);
    expect(service.isMemberGenderAllowed(user, 'female')).toBe(true);
    expect(service.resolveListFilter(user, null)).toEqual([2, 5, 6]);
  });

  it("lets Tanta Up/Down staff serve Tanta members stored under Tanta main", () => {
    const up = { level: 2, branch: 5 } as never;
    expect(service.memberBranchIds(up)).toEqual([2, 5, 6]);
    expect(service.isMemberBranchAllowed(up, 2)).toBe(true);
    expect(service.isMemberBranchAllowed(up, 4)).toBe(false);
    expect(service.memberBranchIds({ level: 2, branch: 4 } as never)).toEqual([4]);
    expect(service.memberBranchIds({ level: 1 } as never)).toBeNull();
  });
});
