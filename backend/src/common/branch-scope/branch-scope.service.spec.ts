import { BranchScopeService } from "./branch-scope.service";

describe("BranchScopeService", () => {
  const service = new BranchScopeService();

  it("allows a super-admin to view all branches", () => {
    expect(service.resolveListFilter({ level: 1 } as never, "all")).toBeNull();
  });

  it("keeps a super-admin's explicit branch selection exact", () => {
    expect(service.resolveListFilter({ level: 1 } as never, "2")).toEqual([2]);
  });

  it("locks a non-admin to exactly their assigned branch", () => {
    expect(
      service.resolveListFilter({ level: 2, branch: 2 } as never, null),
    ).toEqual([2]);
  });

  it("does not honour a non-admin's foreign branch selection", () => {
    expect(
      service.resolveListFilter({ level: 2, branch: 2 } as never, 5),
    ).toEqual([2]);
    expect(service.isBranchAllowed({ level: 2, branch: 2 } as never, 5)).toBe(
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

  it("enforces the legacy men/women audience scope independently of branch scope", () => {
    const menManager = { level: 3, branch: 2, man_women_type: 0 } as never;
    const womenManager = { level: 3, branch: 2, man_women_type: 1 } as never;
    expect(service.memberGenderFilter(menManager)).toBe('male');
    expect(service.memberGenderFilter(womenManager)).toBe('female');
    expect(service.isMemberGenderAllowed(menManager, 'male')).toBe(true);
    expect(service.isMemberGenderAllowed(menManager, 'female')).toBe(false);
  });

  it("keeps only system administrators unrestricted and fails closed for legacy mixed scope", () => {
    expect(service.memberGenderFilter({ level: 1, man_women_type: 0 } as never)).toBeNull();
    expect(() => service.memberGenderFilter({ level: 3, man_women_type: 2 } as never))
      .toThrow('نطاق القسم غير مضبوط');
  });
});
