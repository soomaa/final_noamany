import { ClubMembersService } from './club-members.service';

describe('ClubMembersService blocking', () => {
  it('stores an auditable reason, deactivates the member, and stays branch-scoped', async () => {
    const existing = {
      id: 5,
      branch_id: 2,
      gender: 'male',
      is_deleted: false,
      is_active: true,
      is_blocked: false,
      block_reason: null,
    };
    const updated = {
      ...existing,
      member_code: 'B0005',
      name: 'عضو تجريبي',
      phone: null,
      email: null,
      gender: 'male',
      card_number: null,
      date_of_birth: null,
      address: null,
      marital_status: null,
      job_title: null,
      profile_picture: null,
      membership_type_id: null,
      start_date: null,
      end_date: null,
      notes: null,
      sales_id: null,
      employee_id: null,
      guardian_name: null,
      guardian_phone: null,
      created_by: 30,
      app_user_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      is_active: false,
      is_blocked: true,
      block_reason: 'مخالفة قواعد الجيم',
      blocked_at: new Date(),
      blocked_by: 30,
      membership_type: null,
    };
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const branchScope = {
      isBranchAllowed: jest.fn().mockReturnValue(true),
      isMemberGenderAllowed: jest.fn().mockReturnValue(true),
    };
    const service = new ClubMembersService(
      prisma as never,
      audit as never,
      branchScope as never,
      {} as never,
      {} as never,
    );

    const result = await service.block(
      5,
      '  مخالفة قواعد الجيم  ',
      { sub: 30, level: 2, branch: 2, name: 'الاستقبال' } as never,
    );

    expect(branchScope.isBranchAllowed).toHaveBeenCalledWith(expect.anything(), 2);
    expect(prisma.club_members.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5 },
      data: expect.objectContaining({
        is_blocked: true,
        is_active: false,
        block_reason: 'مخالفة قواعد الجيم',
        blocked_by: 30,
      }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'block',
      branchId: 2,
      actorUserId: 30,
    }));
    expect(result).toEqual(expect.objectContaining({
      isBlocked: true,
      isActive: false,
      blockReason: 'مخالفة قواعد الجيم',
    }));
  });
});
