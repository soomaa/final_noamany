import { BadRequestException } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';

describe('ClubMembersService edit of imported members with legacy identity data', () => {
  const legacyMember = {
    id: 7,
    app_user_id: 71,
    branch_id: 1,
    is_deleted: false,
    name: 'عضو قديم',
    phone: '0123456',
    gender: 'female',
    card_number: '0',
    start_date: null,
    end_date: null,
  };

  const build = () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue(legacyMember),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...legacyMember, ...data })),
      },
      api_users: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const audit = { log: jest.fn() };
    const service = new ClubMembersService(
      prisma as never,
      audit as never,
      branchScope as never,
      {} as never,
    );
    jest.spyOn(service as never, 'mapMember' as never).mockImplementation(((row: unknown) => row) as never);
    return { prisma, service };
  };
  const user = { sub: 1, level: 1, branch: 0 } as never;

  it('saves a name change without re-validating the untouched legacy card number and phone', async () => {
    const { prisma, service } = build();
    await service.update(7, {
      branchId: 1,
      name: 'عضو قديم معدل',
      phone: '0123456',
      cardNumber: '0',
      gender: 'female',
    }, user);

    const data = prisma.club_members.update.mock.calls[0][0].data;
    expect(data.name).toBe('عضو قديم معدل');
    expect(data).not.toHaveProperty('card_number');
    expect(data).not.toHaveProperty('phone');
  });

  it('still validates a card number the operator changed', async () => {
    const { prisma, service } = build();
    await expect(
      service.update(7, { cardNumber: '12345' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_members.update).not.toHaveBeenCalled();
  });

  it('clears the card number to null instead of an empty string', async () => {
    const { prisma, service } = build();
    await service.update(7, { cardNumber: '' }, user);
    expect(prisma.club_members.update.mock.calls[0][0].data.card_number).toBeNull();
  });
  it.each(['public-file:replacement', ''])('allows staff replacement/removal and keeps self-service permanently locked: %s', async (profilePicture) => {
    const { prisma, service } = build();
    await service.update(7, { profilePicture }, user);
    expect(prisma.club_members.update.mock.calls[0][0].data).toMatchObject({
      profile_picture: profilePicture || null, profile_photo_locked: true,
    });
    expect(prisma.api_users.updateMany).toHaveBeenCalledWith({
      where: { user_id: 71 }, data: { m_image: profilePicture || null },
    });
  });

  it('does not overwrite or unlock the photo for an unrelated staff edit', async () => {
    const { prisma, service } = build();
    await service.update(7, { name: 'اسم جديد' }, user);
    const data = prisma.club_members.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('profile_picture');
    expect(data).not.toHaveProperty('profile_photo_locked');
    expect(prisma.api_users.updateMany).not.toHaveBeenCalled();
  });

});
