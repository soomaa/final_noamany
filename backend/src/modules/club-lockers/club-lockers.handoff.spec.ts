import { BadRequestException } from '@nestjs/common';
import { ClubLockersService } from './club-lockers.service';

describe('ClubLockersService visit handoffs', () => {
  const user = { sub: 7, level: 2, branch: 3 } as never;

  function serviceWith(prisma: Record<string, unknown>) {
    return new ClubLockersService(
      prisma as never,
      {} as never,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as never,
    );
  }

  it('switches lockers atomically, closes the old history row, and starts a new one', async () => {
    const oldHandoff = { id: 40, locker_id: 1, member_id: 9, released_at: null };
    const createdAt = new Date('2026-09-30T10:15:30.123Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 9 }]),
      club_members: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          name: 'عضو الاختبار',
          member_code: 'A000009',
          branch_id: 3,
          is_deleted: false,
          is_blocked: false,
        }),
      },
      club_locker_handoffs: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([oldHandoff]),
        update: jest.fn().mockResolvedValue({ ...oldHandoff, released_at: new Date() }),
        create: jest.fn().mockResolvedValue({ id: 41, assigned_at: createdAt }),
      },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_lockers: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          locker_number: 'L-002',
          main_branch_id: 3,
          is_available: true,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = serviceWith(prisma);

    await expect(service.assignHandoff({ lockerId: 2, memberId: 9 }, user)).resolves.toEqual({
      handoffId: 41,
      lockerId: 2,
      lockerNumber: 'L-002',
      memberId: 9,
      memberName: 'عضو الاختبار',
      assignedAt: createdAt.toISOString(),
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.club_locker_handoffs.update).toHaveBeenCalledWith({
      where: { id: 40 },
      data: { released_at: expect.any(Date), released_by: 7 },
    });
    expect(tx.club_lockers.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { is_available: true },
    });
    expect(tx.club_lockers.updateMany).toHaveBeenCalledWith({
      where: { id: 2, is_available: true },
      data: { is_available: false },
    });
    expect(tx.club_locker_handoffs.create).toHaveBeenCalledWith({
      data: { locker_id: 2, member_id: 9, branch_id: 3, assigned_by: 7 },
    });
  });

  it('does not release the member current locker when the requested locker is already held', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 9 }]),
      club_members: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          name: 'عضو الاختبار',
          member_code: 'A000009',
          branch_id: 3,
          is_deleted: false,
          is_blocked: false,
        }),
      },
      club_locker_handoffs: {
        findFirst: jest.fn().mockResolvedValue({ id: 60, member_id: 12 }),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      club_lockers: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          locker_number: 'L-002',
          main_branch_id: 3,
          is_available: false,
        }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = serviceWith(prisma);

    await expect(service.assignHandoff({ lockerId: 2, memberId: 9 }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.club_locker_handoffs.findMany).not.toHaveBeenCalled();
    expect(tx.club_locker_handoffs.update).not.toHaveBeenCalled();
    expect(tx.club_lockers.updateMany).not.toHaveBeenCalled();
  });

  it('shows a member only their gender section plus legacy shared lockers when splitting is on', async () => {
    const prisma = {
      club_gym_policies: {
        findUnique: jest.fn().mockResolvedValue({ split_lockers_by_gender: true }),
      },
      club_members: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          branch_id: 3,
          is_deleted: false,
          gender: 'female',
        }),
      },
      club_locker_handoffs: { findFirst: jest.fn().mockResolvedValue(null) },
      club_lockers: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, locker_number: '10', is_available: true, section: 'male' },
          { id: 2, locker_number: '10', is_available: true, section: 'female' },
          { id: 3, locker_number: '11', is_available: true, section: 'shared' },
        ]),
      },
    };
    const service = serviceWith(prisma);

    await expect(service.deskOptions(9, user)).resolves.toMatchObject({
      splitByGender: true,
      section: 'female',
      lockers: [
        { id: 2, lockerNumber: '10', section: 'female' },
        { id: 3, lockerNumber: '11', section: 'shared' },
      ],
    });
  });

  it('rejects a gender-section mismatch even when a client submits the locker id directly', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 9 }]),
      club_lockers: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          locker_number: 'L-002',
          main_branch_id: 3,
          is_available: true,
          section: 'male',
        }),
      },
      club_members: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          name: 'عضوة الاختبار',
          member_code: 'A000009',
          branch_id: 3,
          is_deleted: false,
          is_blocked: false,
          gender: 'female',
        }),
      },
      club_locker_handoffs: { findFirst: jest.fn() },
    };
    const prisma = {
      club_gym_policies: {
        findUnique: jest.fn().mockResolvedValue({ split_lockers_by_gender: true }),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = serviceWith(prisma);

    await expect(service.assignHandoff({ lockerId: 2, memberId: 9 }, user)).rejects.toEqual(
      expect.objectContaining({ message: 'البنت بتاخد لوكر حريمي' }),
    );
    expect(tx.club_locker_handoffs.findFirst).not.toHaveBeenCalled();
  });

  it('locks the member before checkout releases their open locker', async () => {
    const open = {
      id: 70,
      locker_id: 4,
      locker: { locker_number: 'L-004' },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 9 }]),
      club_locker_handoffs: {
        findMany: jest.fn().mockResolvedValue([open]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_lockers: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = serviceWith(prisma);

    await expect(service.releaseOpenForMember(9, 7)).resolves.toEqual({
      lockerId: 4,
      lockerNumber: 'L-004',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.club_locker_handoffs.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [70] } },
      data: { released_at: expect.any(Date), released_by: 7 },
    });
    expect(tx.club_lockers.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { is_available: true },
    });
  });
});
