import { EntitlementService } from './entitlement.service';

describe('EntitlementService branch isolation', () => {
  it('blocks a member from another branch and never falls back to that branch subscriptions', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 10, branch_id: 1, is_active: true }),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const policies = {
      get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: false }),
    };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({ memberId: 10, branchId: 2 });

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain('member_branch_mismatch');
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ member_id: 10, branch_id: 2 }),
      }),
    );
  });

  it('blocks a banned member and returns the saved reason to reception', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          member_code: 'A0010',
          name: 'عضو تجريبي',
          phone: null,
          branch_id: 1,
          is_active: false,
          is_blocked: true,
          block_reason: 'سلوك غير لائق',
        }),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const policies = {
      get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: false }),
    };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({ memberId: 10, branchId: 1 });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'member_blocked',
        messageAr: expect.stringContaining('سلوك غير لائق'),
      }),
    ]));
    expect(result.reasons.map((reason) => reason.code)).not.toContain('member_inactive');
  });
});
