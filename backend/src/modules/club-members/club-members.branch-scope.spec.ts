import { BadRequestException } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';

function makeService(prisma: Record<string, unknown>) {
  return new ClubMembersService(
    prisma as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {
      isBranchAllowed: jest.fn().mockReturnValue(true),
      resolveListFilter: jest.fn().mockReturnValue(null),
    } as never,
    {} as never,
  );
}

describe('ClubMembersService branch integrity', () => {
  it('blocks changing a member branch through the generic edit endpoint', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, branch_id: 1, is_deleted: false }),
        update: jest.fn(),
      },
    };
    const service = makeService(prisma);

    await expect(
      service.update(7, { branchId: 2 }, { sub: 1, level: 1, branch: 0 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_members.update).not.toHaveBeenCalled();
  });
});

describe('ClubMembersService scanner lookup', () => {
  const row = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    member_code: `A00000${id}`,
    branch_id: 1,
    card_number: null,
    phone: null,
    gate_credential: null,
    ...extra,
  });

  it('keeps a scanned code inside the reception branch', async () => {
    const prisma = { club_members: { findMany: jest.fn().mockResolvedValue([row(5)]) } };
    const service = makeService(prisma);

    await service.resolveByIdOrCode(undefined, 'A000005', 2);

    expect(prisma.club_members.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ is_deleted: false, branch_id: 2 }),
      }),
    );
  });

  it('matches an exact phone and prefers the member code over it', async () => {
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          row(5, { phone: '01012345678' }),
          row(6, { member_code: '01012345678' }),
        ]),
      },
    };
    const service = makeService(prisma);

    await expect(service.resolveByIdOrCode(undefined, '01012345678', 1)).resolves.toMatchObject({ id: 6 });
    const where = prisma.club_members.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ phone: '01012345678' }]));
  });

  it('refuses an ambiguous match instead of guessing the member', async () => {
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          row(5, { phone: '01012345678' }),
          row(6, { phone: '01012345678' }),
        ]),
      },
    };
    const service = makeService(prisma);

    await expect(service.resolveByIdOrCode(undefined, '01012345678')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
