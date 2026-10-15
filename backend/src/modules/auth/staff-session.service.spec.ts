import { UnauthorizedException } from '@nestjs/common';
import { hashRefreshToken } from './staff-session.policy';
import { StaffSessionService } from './staff-session.service';

describe('StaffSessionService', () => {
  const now = new Date('2026-08-26T08:00:00.000Z');
  const expiresAt = new Date('2026-09-02T08:00:00.000Z');

  function makeService(session?: Record<string, unknown>) {
    const tx = {
      staff_auth_sessions: {
        findUnique: jest.fn().mockResolvedValue(session ?? null),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'next' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      staff_auth_sessions: {
        create: jest.fn().mockResolvedValue({ id: 'current' }),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    return { service: new StaffSessionService(prisma as never), prisma, tx };
  }

  it('stores only the digest when creating a session', async () => {
    const { service, prisma } = makeService();

    await service.create({
      id: 'current',
      familyId: 'family',
      userId: 7,
      refreshToken: 'raw-refresh',
      expiresAt,
    });

    expect(prisma.staff_auth_sessions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'current',
        family_id: 'family',
        user_id: 7,
        refresh_token_hash: hashRefreshToken('raw-refresh'),
      }),
    });
    expect(JSON.stringify(prisma.staff_auth_sessions.create.mock.calls)).not.toContain('raw-refresh');
  });

  it('atomically consumes one refresh row and creates its successor', async () => {
    const { service, tx } = makeService({
      id: 'current',
      family_id: 'family',
      user_id: 7,
      refresh_token_hash: hashRefreshToken('current-token'),
      expires_at: expiresAt,
      consumed_at: null,
      revoked_at: null,
    });

    await service.rotate({
      currentSessionId: 'current',
      familyId: 'family',
      userId: 7,
      currentRefreshToken: 'current-token',
      successor: {
        id: 'next',
        refreshToken: 'next-token',
        expiresAt,
      },
      now,
    });

    expect(tx.staff_auth_sessions.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'current', consumed_at: null, revoked_at: null }),
        data: expect.objectContaining({ consumed_at: now, replaced_by: 'next' }),
      }),
    );
    expect(tx.staff_auth_sessions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'next',
        family_id: 'family',
        refresh_token_hash: hashRefreshToken('next-token'),
      }),
    });
  });

  it('revokes the real family and rejects replay of a consumed refresh token', async () => {
    const { service, tx } = makeService({
      id: 'current',
      family_id: 'family',
      user_id: 7,
      refresh_token_hash: hashRefreshToken('current-token'),
      expires_at: expiresAt,
      consumed_at: now,
      revoked_at: null,
    });

    await expect(
      service.rotate({
        currentSessionId: 'current',
        familyId: 'family',
        userId: 7,
        currentRefreshToken: 'current-token',
        successor: { id: 'next', refreshToken: 'next-token', expiresAt },
        now,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tx.staff_auth_sessions.updateMany).toHaveBeenCalledWith({
      where: { family_id: 'family', revoked_at: null },
      data: { revoked_at: now, revocation_reason: 'refresh_token_replay' },
    });
    expect(tx.staff_auth_sessions.create).not.toHaveBeenCalled();
  });

  it('requires an active server-side row for access tokens', async () => {
    const { service, prisma } = makeService();
    prisma.staff_auth_sessions.findFirst
      .mockResolvedValueOnce({ id: 'active' })
      .mockResolvedValueOnce(null);

    await expect(service.assertAccessSession(7, 'active', now)).resolves.toBeUndefined();
    await expect(service.assertAccessSession(7, 'revoked', now)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
