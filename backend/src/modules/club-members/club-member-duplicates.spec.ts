import { findMemberDuplicates } from './club-member-duplicates';

describe('findMemberDuplicates', () => {
  it('rejects a phone that belongs to a member in another branch', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn(async ({ where }: { where: { phone?: string; branch_id?: number } }) => {
          if (where.phone === '01012345678' && where.branch_id === undefined) {
            return {
              id: 91,
              member_code: 'B000091',
              name: 'عضو مسجل',
              phone: '01012345678',
              card_number: null,
            };
          }
          return null;
        }),
      },
    };

    const duplicates = await findMemberDuplicates(prisma as never, {
      branchId: 2,
      phone: '01012345678',
    });

    expect(duplicates).toEqual([
      expect.objectContaining({ field: 'phone', memberId: 91, memberCode: 'B000091' }),
    ]);
  });
});
