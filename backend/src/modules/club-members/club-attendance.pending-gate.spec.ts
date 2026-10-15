import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

const pendingRow = {
  id: 55, member_id: 9, member_code: 'B000009', member_name: 'عضو', subscription_id: null, subscription_type: null,
  branch_id: 2, check_in_time: new Date('2026-09-27T08:00:00Z'), check_out_time: null, attendance_date: '2026-09-27',
  status: 'checked_in', duration: null, notes: 'C3-200 gate Gate', pending_subscription_choice: true,
  created_by: null, created_at: new Date('2026-09-27T08:00:00Z'),
};

function makeService(overrides: { claimed?: number; subBranch?: number } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    club_attendance: {
      updateMany: jest.fn().mockResolvedValue({ count: overrides.claimed ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...pendingRow, pending_subscription_choice: false, subscription_id: 31 }),
    },
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue({ member_id: 9, branch_id: 2, status: 'active', freezes: [], sessions_count: 12, sessions_used: 4 }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    club_attendance: { findUnique: jest.fn().mockResolvedValue(pendingRow) },
    club_subscriptions: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ member_id: 9, branch_id: overrides.subBranch ?? 2 })
        .mockResolvedValue({ private_package_id: null }),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const entitlement = {
    validate: jest.fn().mockResolvedValue({
      allowed: true,
      reasons: [],
      activeSubscription: {
        id: 31, subscriptionType: '12 حصة', isLinkedToSessions: true, sessionsRemaining: 8,
        endDate: '2026-10-27', specialClassTypeId: null,
      },
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ClubAttendanceService(
    prisma as never, {} as never, entitlement as never, audit as never,
    { emit: jest.fn() } as never, { dispatch: jest.fn() } as never, {} as never,
    { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
  );
  return { service, prisma, tx };
}

describe('reception pick for a pending gate entry', () => {
  it('claims the pending flag and takes exactly one session on the chosen subscription', async () => {
    const { service, tx } = makeService();

    const result = await service.resolvePendingSubscription(55, 31, { sub: 1, level: 2, branch: 2 } as never);

    expect(tx.club_attendance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 55, pending_subscription_choice: true, status: 'checked_in' },
        data: expect.objectContaining({ pending_subscription_choice: false, subscription_id: 31 }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result.subscription).toMatchObject({ id: 31, sessionsRemaining: 7 });
  });

  it('does not take a second session when another receptionist already picked', async () => {
    const { service, tx } = makeService({ claimed: 0 });

    await expect(
      service.resolvePendingSubscription(55, 31, { sub: 1, level: 2, branch: 2 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses a receptionist of another branch and a subscription of another branch', async () => {
    await expect(
      makeService().service.resolvePendingSubscription(55, 31, { sub: 1, level: 2, branch: 3 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      makeService({ subBranch: 3 }).service.resolvePendingSubscription(55, 31, { sub: 1, level: 1, branch: 0 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
