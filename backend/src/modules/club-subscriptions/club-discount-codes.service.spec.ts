import { BadRequestException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubDiscountCodesService, memberGrantExpiryOn } from './club-discount-codes.service';

describe('ClubDiscountCodesService.resolveDiscount', () => {
  const prisma = {
    tbl_discount_codes: { findUnique: jest.fn() },
    club_members: { findFirst: jest.fn() },
  };
  const service = new ClubDiscountCodesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('calculates the amount from the saved percentage on the server', async () => {
    prisma.tbl_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      title: 'SUMMER20',
      nesba: 20,
    });

    await expect(service.resolveDiscount({
      subscriptionValue: 500,
      discountCodeId: 7,
      discountEnabled: true,
      discountValue: 499,
    })).resolves.toEqual({
      discountEnabled: true,
      discountCodeId: 7,
      discountPercentage: 20,
      discountValue: 100,
    });
  });

  it('treats a manual discount as a fixed EGP amount', async () => {
    await expect(service.resolveDiscount({
      subscriptionValue: 500,
      discountEnabled: true,
      discountValue: 75,
    })).resolves.toEqual({
      discountEnabled: true,
      discountCodeId: null,
      discountPercentage: null,
      discountValue: 75,
    });
  });

  it('rejects a discount code that does not exist in the original catalog', async () => {
    prisma.tbl_discount_codes.findUnique.mockResolvedValue(null);
    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a usage report whose start date is after its end date', async () => {
    await expect(service.usageReport({ fromDate: '2026-09-10', toDate: '2026-09-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('finds a member by membership code or by phone in the legacy phone formats', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 44, name: 'عضو تجريبي', member_code: 'A10467', phone: '01012345678' });

    await expect(service.findMemberForDiscountGrant('A10467')).resolves.toEqual({
      id: 44, name: 'عضو تجريبي', memberCode: 'A10467', phone: '01012345678',
    });
    await expect(service.findMemberForDiscountGrant('+201012345678')).resolves.toEqual({
      id: 44, name: 'عضو تجريبي', memberCode: 'A10467', phone: '01012345678',
    });
    expect(prisma.club_members.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { OR: [
        { phone: { contains: '201012345678' } },
        { phone: { contains: '0201012345678' } },
        { phone: { contains: '+2201012345678' } },
        { phone: { contains: '20201012345678' } },
      ] },
    }));
  });

  it('uses the legacy month-end expiry date as the saved member-code expiry', () => {
    expect(memberGrantExpiryOn(new Date('2026-09-21T12:00:00.000Z'))).toBe('2026-09-30');
    expect(memberGrantExpiryOn(new Date('2026-10-31T12:00:00.000Z'))).toBe('2026-11-30');
  });
});

describe('ClubDiscountCodesService member grants (Nada 2 Nov)', () => {
  const reception = { sub: 9, level: 2, branch: 3, emp_code: 50, man_women_type: 3 } as never;
  const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as never;
  const build = (grant: Record<string, unknown> | null) => {
    const prisma = {
      tbl_emps_members_dis_codes: {
        findUnique: jest.fn().mockResolvedValue(grant),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, service: new ClubDiscountCodesService(prisma as unknown as PrismaService) };
  };

  it('lets the issuing employee take back an unused code', async () => {
    const { prisma, service } = build({ id: 4, emp_id_fk: 50, approved: false });
    await expect(service.revokeMemberGrant(4, reception)).resolves.toEqual({ id: 4, deleted: true });
    expect(prisma.tbl_emps_members_dis_codes.delete).toHaveBeenCalledWith({ where: { id: 4 } });
  });

  it('refuses a code already used on a subscription', async () => {
    const { prisma, service } = build({ id: 4, emp_id_fk: 50, approved: true });
    await expect(service.revokeMemberGrant(4, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tbl_emps_members_dis_codes.delete).not.toHaveBeenCalled();
  });

  it("refuses another employee's code", async () => {
    const { prisma, service } = build({ id: 4, emp_id_fk: 77, approved: false });
    await expect(service.revokeMemberGrant(4, reception)).rejects.toThrow('لا يمكنك عرض أكواد موظف آخر');
    expect(prisma.tbl_emps_members_dis_codes.delete).not.toHaveBeenCalled();
  });

  it('limits the list to the current allowance month on request', async () => {
    const { prisma, service } = build(null);
    await service.memberGrants(undefined, reception, { currentMonth: true });
    const where = prisma.tbl_emps_members_dis_codes.findMany.mock.calls[0][0].where;
    const now = new Date().toISOString();
    expect(where.emp_id_fk).toEqual({ in: [50] });
    expect(where.year).toBe(now.slice(0, 4));
    expect(where.month.in).toContain(now.slice(5, 7));
  });
});

describe('ClubDiscountCodesService رجالي/حريمي/الكل filter', () => {
  const men = { sub: 20, level: 2, branch: 2, emp_code: 60, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 21, level: 2, branch: 2, emp_code: 61, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;
  const build = () => {
    const prisma = {
      tbl_emps_members_dis_codes: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, emp_id_fk: 60, mem_id_fk: 100, code_id_fk: null, member_code: 'M1', approved: false },
          { id: 2, emp_id_fk: 60, mem_id_fk: 200, code_id_fk: null, member_code: 'F1', approved: false },
        ]),
      },
      tbl_cobon_exhausted_history: {
        findMany: jest.fn().mockResolvedValue([
          { id: 5, member_id: 100, member_code: 'M1' },
          { id: 6, member_id: 200, member_code: 'F1' },
        ]),
      },
      club_members: {
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(
          [{ id: 100, gender: 'male', name: 'رجل' }, { id: 200, gender: 'female', name: 'سيدة' }]
            .filter((m) => where.id.in.includes(m.id) && (!where.gender || where.gender === m.gender)),
        )),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new ClubDiscountCodesService(prisma as unknown as PrismaService, new BranchScopeService()) };
  };
  const memberWhere = (prisma: ReturnType<typeof build>['prisma']) => prisma.club_members.findMany.mock.calls[0][0].where;

  it('men employee: all-grants list holds everyone by default, men on a pick, and women may be opened', async () => {
    const { prisma, service } = build();
    const rows = await service.memberGrants(undefined, men);
    expect(memberWhere(prisma)).not.toHaveProperty('gender');
    expect(rows.map((r) => r.id)).toEqual([1, 2]);

    const picked = build();
    expect((await picked.service.memberGrants(undefined, men, { gender: 'male' })).map((r) => r.id)).toEqual([1]);
    expect(memberWhere(picked.prisma)).toEqual(expect.objectContaining({ gender: 'male' }));

    const other = build();
    expect((await other.service.memberGrants(undefined, men, { gender: 'female' })).map((r) => r.id)).toEqual([2]);
    expect(memberWhere(other.prisma)).toEqual(expect.objectContaining({ gender: 'female' }));
  });

  it('women employee: usage report holds female members on a pick, and men may be opened', async () => {
    const { prisma, service } = build();
    const rows = await service.usageReport({ fromDate: '2026-09-01', toDate: '2026-09-30', gender: 'female' }, women);
    expect(memberWhere(prisma)).toEqual(expect.objectContaining({ gender: 'female' }));
    expect(rows.map((r) => r.id)).toEqual([6]);

    const other = build();
    const menRows = await other.service.usageReport({ fromDate: '2026-09-01', toDate: '2026-09-30', gender: 'male' }, women);
    expect(memberWhere(other.prisma)).toEqual(expect.objectContaining({ gender: 'male' }));
    expect(menRows.map((r) => r.id)).toEqual([5]);
  });

  it('member lookup is not held to the employee section, only to an explicit pick', async () => {
    const { prisma, service } = build();
    await expect(service.findMemberForDiscountGrant('A1', men)).rejects.toThrow();
    expect(prisma.club_members.findFirst.mock.calls[0][0].where.AND[0]).not.toHaveProperty('gender');

    const other = build();
    other.prisma.club_members.findFirst.mockResolvedValue({ id: 200, name: 'سيدة', member_code: 'A1', phone: null } as never);
    await expect(other.service.findMemberForDiscountGrant('A1', men, 'female'))
      .resolves.toEqual({ id: 200, name: 'سيدة', memberCode: 'A1', phone: null });
    expect(other.prisma.club_members.findFirst.mock.calls[0][0].where.AND[0]).toEqual(expect.objectContaining({ gender: 'female' }));
  });

  it('admin: gender=female filters female, none is unfiltered', async () => {
    const first = build();
    expect((await first.service.memberGrants(undefined, admin, { gender: 'female' })).map((r) => r.id)).toEqual([2]);
    expect(memberWhere(first.prisma)).toEqual(expect.objectContaining({ gender: 'female' }));
    expect((await first.service.usageReport({ fromDate: '2026-09-01', toDate: '2026-09-30', gender: 'female' }, admin)).map((r) => r.id)).toEqual([6]);

    const second = build();
    expect((await second.service.memberGrants(undefined, admin)).map((r) => r.id)).toEqual([1, 2]);
    expect(memberWhere(second.prisma)).not.toHaveProperty('gender');
    expect((await second.service.usageReport({ fromDate: '2026-09-01', toDate: '2026-09-30' }, admin)).map((r) => r.id)).toEqual([5, 6]);
  });
});
