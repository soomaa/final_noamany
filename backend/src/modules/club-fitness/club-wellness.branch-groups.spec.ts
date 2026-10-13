import { ClubWellnessService } from './club-wellness.service';

describe('ClubWellnessService branch-group SPA check-in', () => {
  it('records a sibling-branch member visit against the scanner branch', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 11,
          member_code: 'EAST-100',
          name: 'عضو البر الشرقي',
          branch_id: 2,
        }),
      },
      users: { findUnique: jest.fn().mockResolvedValue({ branch_id_fk: 3 }) },
      club_spa_attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (work) => work({ club_spa_attendance: { create } })),
    };
    const service = new ClubWellnessService(prisma as never, {} as never) as unknown as {
      checkInSpaByBarcode: (memberCode: string, userId: number) => Promise<unknown>;
      consumeBenefit: jest.Mock;
      getMemberBenefits: jest.Mock;
      branchGroups: { siblingBranchIds: (branchId: number) => Promise<number[]> };
    };
    service.branchGroups = { siblingBranchIds: async () => [2, 3] };
    service.consumeBenefit = jest.fn().mockResolvedValue(41);
    service.getMemberBenefits = jest.fn().mockResolvedValue({
      member: { id: 11, memberCode: 'EAST-100', name: 'عضو البر الشرقي', branchId: 2 },
      spa: { remaining: 2 },
    });

    await service.checkInSpaByBarcode('EAST-100', 7);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branch_id: 3, member_id: 11 }),
    }));
  });
});
