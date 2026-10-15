import { AuthController } from './auth.controller';

describe('AuthController staff cookie contract', () => {
  const staffResult = {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    sessionId: 'session-id',
    message: 'ok',
    accountType: 'staff' as const,
    mustChangePassword: false,
    user: { sub: 7 },
  };

  function makeController() {
    const auth = {
      login: jest.fn().mockResolvedValue(staffResult),
      refresh: jest.fn().mockResolvedValue(staffResult),
    };
    const controller = new AuthController(
      auth as never,
      { refresh: jest.fn().mockResolvedValue(null) } as never,
      { get: jest.fn().mockReturnValue('test') } as never,
    );
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const request = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('agent'),
      cookies: { hr_refresh: 'old-refresh' },
    };
    return { controller, auth, response, request };
  }

  it('sets staff tokens as HttpOnly cookies without exposing them in JSON', async () => {
    const { controller, response, request } = makeController();
    const body = await controller.login(
      { username: 'staff', password: 'password' },
      request as never,
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).toHaveBeenCalledWith(
      'hr_access',
      'access-secret',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(JSON.stringify(body)).not.toContain('access-secret');
    expect(JSON.stringify(body)).not.toContain('refresh-secret');
    expect(JSON.stringify(body)).not.toContain('session-id');
  });

  it('rotates both cookies while returning only the current user', async () => {
    const { controller, response, request } = makeController();
    const body = await controller.refresh(request as never, response as never);

    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ user: { sub: 7 } });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
