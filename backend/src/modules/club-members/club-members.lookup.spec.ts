import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';
import { ForbiddenException } from '@nestjs/common';

describe('ClubMembersService lookup', () => {
  it.each(['01012345678', 'ندا حازم سبيكة'])('puts the exact phone/name first in refund suggestions for %s', async (query) => {
    const target = { id: 868, member_code: 'B868', name: 'ندا حازم سبيكة', phone: '01012345678', gender: 'female', branch_id: 3 };
    const partial = Array.from({ length: 20 }, (_, index) => ({ ...target, id: index + 1, member_code: `B${index}`, name: `اسم ${index}` }));
    const findMany = jest.fn().mockResolvedValueOnce(partial).mockResolvedValueOnce([]).mockResolvedValueOnce([target]);
    const service = new ClubMembersService({ club_members: { findMany } } as never, {} as never, new BranchScopeService(), {} as never, {} as never);
    const hits = await service.lookup(query, undefined, { level: 1 } as never, false, false, true);
    expect(hits).toHaveLength(20);
    expect(hits[0]).toMatchObject({ id: 868, memberCode: 'B868' });
  });
  it('puts B868 first even when twenty longer matching codes precede it alphabetically', async () => {
    const target = { id: 868, member_code: 'B868', name: 'ندا حازم سبيكة', phone: '01012345678', gender: 'female', branch_id: 3 };
    const partial = Array.from({ length: 20 }, (_, index) => ({ ...target, id: index + 1, member_code: `B868${index}`, name: `اسم ${index}` }));
    const findMany = jest.fn().mockResolvedValueOnce(partial).mockResolvedValueOnce([target]).mockResolvedValueOnce([]);
    const service = new ClubMembersService({ club_members: { findMany } } as never, {} as never, new BranchScopeService(), {} as never, {} as never, { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) });
    const user = { level: 2, branch: 3, man_women_type: 2, job_title: 'موظف استقبال' } as never;
    const hits = await service.lookup('B868', '3', user, false, true);
    expect(hits).toHaveLength(20);
    expect(hits[0]).toMatchObject({ id: 868, memberCode: 'B868', name: target.name });
    expect(findMany.mock.calls[1][0].where.AND).toEqual(expect.arrayContaining([
      { member_code: { equals: 'B868' } }, { branch_id: { in: [3, 7] } }, { gender: 'female' }, { is_deleted: false },
    ]));
  });

  it('does not repeat the exact-code member when it also appears among partial matches', async () => {
    const row = { id: 868, member_code: 'B868', name: 'ندا', phone: null, gender: 'female', branch_id: 3 };
    const findMany = jest.fn().mockResolvedValue([row]);
    const service = new ClubMembersService({ club_members: { findMany } } as never, {} as never, new BranchScopeService(), {} as never, {} as never);
    expect(await service.lookup('B868', undefined, { level: 1 } as never)).toHaveLength(1);
  });
  it('finds older members in the active group for refunds and restricts a transfer recipient to its selected branch', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue({ id: 14, member_code: 'M-14', name: 'عضو قديم', phone: '01012345678', gender: 'male', branch_id: 7, created_at: new Date('2020-01-01T12:00:00Z') });
    const service = new ClubMembersService({ club_members: { findMany, findFirst } } as never, {} as never, new BranchScopeService(), {} as never, {} as never, { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) });
    const receptionist = { level: 2, branch: 3, job_title: 'موظف استقبال', man_women_type: 3 } as never;
    await service.lookup('01012345678', undefined, receptionist, false, false, true);
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ branch_id: { in: [3, 7] } });
    expect(findMany.mock.calls[0][0].where.AND.some((filter: object) => 'created_at' in filter)).toBe(false);
    await service.lookup('01012345678', '7', receptionist, true, false, true);
    expect(findMany.mock.calls[3][0].where.AND).toContainEqual({ branch_id: 7 });
    await expect(service.findOne(14, receptionist, false, true)).resolves.toMatchObject({ id: 14, branchId: 7 });
    await expect(service.lookup('01012345678', '9', receptionist, true, false, true)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('limits transfer recipient search to the selected branch exactly', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const siblingBranchIds = jest.fn().mockResolvedValue([3, 4]);
    const service = new ClubMembersService(
      { club_members: { findMany } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
      { siblingBranchIds } as never,
    );

    await service.lookup('أسماء', '3', { level: 1 } as never, true);

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ branch_id: 3 });
    expect(siblingBranchIds).not.toHaveBeenCalled();
  });

  it('finds a member from the selected branch group without widening to other branches', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 14,
        member_code: 'M-14',
        name: 'أسماء',
        phone: '01012345678',
        gender: 'female',
        branch_id: 3,
      },
    ]);
    const service = new ClubMembersService(
      { club_members: { findMany } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([3, 4]) } as never,
    );

    await expect(service.lookup('01012345678', '3', { level: 1 } as never)).resolves.toEqual([
      {
        id: 14,
        memberCode: 'M-14',
        name: 'أسماء',
        phone: '01012345678',
        gender: 'female',
        branchId: 3,
      },
    ]);

    const query = findMany.mock.calls[0][0];
    expect(query).toEqual(expect.objectContaining({
      take: 20,
      select: {
        id: true,
        member_code: true,
        name: true,
        phone: true,
        gender: true,
        branch_id: true,
      },
    }));
    expect(query.where.AND).toContainEqual({
      OR: [
        { name: { contains: '01012345678' } },
        { member_code: { contains: '01012345678' } },
        { phone: { contains: '01012345678' } },
      ],
    });
    expect(query.where.AND).toContainEqual({ branch_id: { in: [3, 4] } });
    expect(query).not.toHaveProperty('include');
  });

  it('finds existing Tanta members for a receptionist creating a subscription', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClubMembersService(
      { club_members: { findMany } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([5]) } as never,
    );
    const receptionist = { level: 2, branch: 5, job_title: 'ريسبشن', man_women_type: 3 } as never;

    await service.lookup('01112974223', '5', receptionist, false, true);

    const filters = findMany.mock.calls[0][0].where.AND;
    expect(filters).toContainEqual({ branch_id: { in: [2, 5, 6] } });
    expect(filters).not.toEqual(expect.arrayContaining([expect.objectContaining({ created_at: expect.anything() })]));
    await service.lookup('01112974223', '5', receptionist);
    expect(findMany.mock.calls[3][0].where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ created_at: expect.anything() }),
    ]));
  });

  it('finds older members in any selected branch for membership operations', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClubMembersService(
      { club_members: { findMany } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([7]) } as never,
    );
    const receptionist = { level: 2, branch: 7, job_title: 'ريسبشن', man_women_type: 3 } as never;

    await service.lookup('01012345678', '7', receptionist, false, true);

    const filters = findMany.mock.calls[0][0].where.AND;
    expect(filters).toContainEqual({ branch_id: { in: [7] } });
    expect(filters.some((filter: Record<string, unknown>) => 'created_at' in filter)).toBe(false);
  });

  it('loads an older Tanta member for a subscription without opening the ordinary member profile', async () => {
    const member = {
      id: 14, member_code: 'M-14', name: 'عضو قديم', phone: '01112974223',
      gender: 'male', branch_id: 2, created_at: new Date('2020-01-01T12:00:00Z'),
    };
    const service = new ClubMembersService(
      { club_members: { findFirst: jest.fn().mockResolvedValue(member) } } as never,
      {} as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([5]) } as never,
    );
    const receptionist = { level: 2, branch: 5, job_title: 'ريسبشن', man_women_type: 3 } as never;

    await expect(service.findOne(14, receptionist, true)).resolves.toEqual(expect.objectContaining({ id: 14, branchId: 2 }));
    await expect(service.findOne(14, receptionist)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
