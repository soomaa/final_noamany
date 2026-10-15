import { UnauthorizedException } from '@nestjs/common';
import { FlexibleAuthGuard } from './flexible-auth.guard';

describe('FlexibleAuthGuard staff session validation', () => {
  const current = {
    sub: 7,
    sessionId: 'session-7',
    employeeId: 17,
    employeeCode: 4401,
  };

  function context(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
  }

  it('reloads staff identity through the server-side session check', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 7, sessionId: 'session-7' }) };
    const auth = { getSessionUser: jest.fn().mockResolvedValue(current) };
    const guard = new FlexibleAuthGuard(
      jwt as never,
      { get: jest.fn().mockReturnValue('secret') } as never,
      auth as never,
    );
    const request = { headers: {}, cookies: { hr_access: 'token' } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(auth.getSessionUser).toHaveBeenCalledWith(7, 'session-7');
    expect(request).toMatchObject({ user: current });
  });

  it('rejects a staff token that has no session id', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 7 }) };
    const auth = { getSessionUser: jest.fn() };
    const guard = new FlexibleAuthGuard(
      jwt as never,
      { get: jest.fn().mockReturnValue('secret') } as never,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ headers: {}, cookies: { hr_access: 'token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.getSessionUser).not.toHaveBeenCalled();
  });

  it('delegates external bearer-token validation without sharing the staff signing key', async () => {
    const externalClaims = { sub: 41, type: 'external' };
    const jwt = { verifyAsync: jest.fn() };
    const auth = { getSessionUser: jest.fn() };
    const external = {
      validateAccessToken: jest.fn().mockResolvedValue(externalClaims),
      supportsClaims: jest.fn().mockReturnValue(true),
    };
    const guard = new FlexibleAuthGuard(
      jwt as never,
      { get: jest.fn().mockReturnValue('staff-secret') } as never,
      auth as never,
      external as never,
    );
    const request = { headers: { authorization: 'Bearer external-token' }, cookies: {} };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(external.validateAccessToken).toHaveBeenCalledWith('external-token');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(request).toMatchObject({ user: externalClaims });
  });
});
