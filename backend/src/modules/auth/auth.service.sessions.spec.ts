import { AuthService } from './auth.service';
import { JwtUser } from '../../common/types/jwt-user';

describe('AuthService staff session tokens', () => {
  const claims: JwtUser = {
    sub: 7,
    level: 2,
    employeeId: 17,
    employeeCode: 4401,
    emp_code: 17,
    branch: 3,
    branch_name: 'الفرع',
    man_women_type: 1,
    name: 'موظف',
    image: null,
    job_title: null,
    is_trainer: false,
    trainer_id: null,
  };

  function makeService() {
    const jwt = {
      signAsync: jest.fn(async (payload: Record<string, unknown>) =>
        payload.type === 'staff-refresh'
          ? `refresh-${payload.sid}`
          : `access-${payload.sessionId}`,
      ),
      verifyAsync: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.refreshTtl') return '7d';
        if (key === 'jwt.accessTtl') return '2h';
        return 'secret';
      }),
    };
    const sessions = {
      create: jest.fn(),
      rotate: jest.fn(),
      revokeFamily: jest.fn(),
      revokeAllForUser: jest.fn(),
      assertAccessSession: jest.fn(),
    };
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue({ user_id: 7, approved: 1 }) },
    };
    const service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      {} as never,
      sessions as never,
    );
    return { service, jwt, sessions };
  }

  it('issues typed tokens and persists the refresh digest through the session service', async () => {
    const { service, jwt, sessions } = makeService();

    const result = await service.signTokens(claims, {
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    const refreshPayload = jwt.signAsync.mock.calls.find(
      ([payload]) => payload.type === 'staff-refresh',
    )?.[0];
    if (!refreshPayload) throw new Error('refresh payload was not signed');
    expect(refreshPayload).toMatchObject({
      sub: 7,
      type: 'staff-refresh',
      sid: expect.any(String),
      familyId: expect.any(String),
    });
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: refreshPayload.sid,
        familyId: refreshPayload.familyId,
        userId: 7,
        refreshToken: result.refreshToken,
        ipAddress: '127.0.0.1',
      }),
    );
    expect(result.sessionId).toBe(refreshPayload.sid);
  });

  it('rotates a refresh token and returns a new cookie pair', async () => {
    const { service, jwt, sessions } = makeService();
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      type: 'staff-refresh',
      sid: 'current-session',
      familyId: 'family',
    });
    jest.spyOn(service as any, 'buildJwtUser').mockResolvedValue(claims);

    const result = await service.refresh('current-refresh');

    expect(result.refreshToken).toMatch(/^refresh-/);
    expect(sessions.rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentSessionId: 'current-session',
        familyId: 'family',
        userId: 7,
        currentRefreshToken: 'current-refresh',
        successor: expect.objectContaining({ refreshToken: result.refreshToken }),
      }),
    );
  });
});
