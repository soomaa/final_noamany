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

  describe('resolveMemberGenderRequest (رجالي/حريمي/الكل filter)', () => {
    const men = { level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
    const women = { level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
    const both = { level: 2, branch: 2, man_women_type: 3, member_sections: ['male', 'female'] } as never;
    const admin = { level: 1, branch: 0, man_women_type: 0 } as never;

    it("never forces a men's employee to men: no request means everyone, women is allowed", () => {
      expect(service.resolveMemberGenderRequest(men, undefined)).toBeNull();
      expect(service.resolveMemberGenderRequest(men, 'all')).toBeNull();
      expect(service.resolveMemberGenderRequest(men, 'male')).toBe('male');
      expect(() => service.resolveMemberGenderRequest(men, 'female')).not.toThrow();
      expect(service.resolveMemberGenderRequest(men, 'female')).toBe('female');
    });

    it("never forces a women's employee to women: men is allowed", () => {
      expect(service.resolveMemberGenderRequest(women, '')).toBeNull();
      expect(service.resolveMemberGenderRequest(women, 'female')).toBe('female');
      expect(() => service.resolveMemberGenderRequest(women, 'male')).not.toThrow();
      expect(service.resolveMemberGenderRequest(women, 'male')).toBe('male');
    });

    it('ignores unknown section values instead of refusing them', () => {
      expect(service.resolveMemberGenderRequest(men, 'other')).toBeNull();
      expect(service.resolveMemberGenderRequest(women, 'MALE')).toBeNull();
    });

    it('lets admins and both-section staff switch freely, defaulting to all', () => {
      for (const user of [admin, both]) {
        expect(service.resolveMemberGenderRequest(user, 'all')).toBeNull();
        expect(service.resolveMemberGenderRequest(user, null)).toBeNull();
        expect(service.resolveMemberGenderRequest(user, 'male')).toBe('male');
        expect(service.resolveMemberGenderRequest(user, 'female')).toBe('female');
      }
    });

    it('lets a temporary section exception widen a one-section employee', () => {
      const menWithException = { level: 2, branch: 2, man_women_type: 1, member_sections: ['male', 'female'] } as never;
      expect(service.resolveMemberGenderRequest(menWithException, 'female')).toBe('female');
    });
  });

  describe('memberGenderFilter / isMemberGenderAllowed (no hard men/women restriction)', () => {
    const users = [
      { level: 2, branch: 2, man_women_type: 0 },
      { level: 2, branch: 2, man_women_type: 1 },
      { level: 2, branch: 2, man_women_type: 2 },
      { level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] },
      { level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] },
      { level: 2, branch: 2 },
      { level: 1, branch: 0, man_women_type: 0 },
    ] as never[];

    it('never filters or refuses a member by section, whatever the employee section', () => {
      for (const user of users) {
        expect(service.memberGenderFilter(user)).toBeNull();
        expect(service.isMemberGenderAllowed(user, 'male')).toBe(true);
        expect(service.isMemberGenderAllowed(user, 'female')).toBe(true);
        expect(service.isMemberGenderAllowed(user, null)).toBe(true);
      }
      expect(service.memberGenderFilter(undefined)).toBeNull();
    });
  });

  describe('defaultMemberSection (the section a screen opens on)', () => {
    it('maps the employee section: 0/1 men, 2 women, 3 both', () => {
      expect(service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 1 } as never)).toBe('male');
      expect(service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 0 } as never)).toBe('male');
      expect(service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 2 } as never)).toBe('female');
      expect(service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 3 } as never)).toBeNull();
    });

    it('opens admins and unknown users on everyone', () => {
      expect(service.defaultMemberSection({ level: 1, branch: 0, man_women_type: 1 } as never)).toBeNull();
      expect(service.defaultMemberSection(undefined)).toBeNull();
      expect(service.defaultMemberSection(null)).toBeNull();
    });

    it('follows member_sections exceptions over the employee type', () => {
      expect(
        service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 1, member_sections: ['female'] } as never),
      ).toBe('female');
      expect(
        service.defaultMemberSection({ level: 2, branch: 2, man_women_type: 2, member_sections: ['male'] } as never),
      ).toBe('male');
      expect(
        service.defaultMemberSection({
          level: 2,
          branch: 2,
          man_women_type: 1,
          member_sections: ['male', 'female'],
        } as never),
      ).toBeNull();
    });

    it('never throws for an employee without a section', () => {
      expect(() => service.defaultMemberSection({ level: 2, branch: 2 } as never)).not.toThrow();
      expect(service.defaultMemberSection({ level: 2, branch: 2 } as never)).toBeNull();
    });
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
