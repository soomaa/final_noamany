import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy live session claims', () => {
  const config = { get: jest.fn().mockReturnValue('test-secret') };
  const current = {
    sub: 7,
    sessionId: 'session-7',
    level: 2,
    employeeId: 10,
    employeeCode: 1010,
    emp_code: 10,
    branch: 4,
    branch_name: 'الفرع الحالي',
    man_women_type: 0,
    name: 'موظف',
    image: null,
    job_title: null,
    is_trainer: false,
    trainer_id: null,
  };

  it('replaces stale token scope with the current active account claims', async () => {
    const authService = { getSessionUser: jest.fn().mockResolvedValue(current) };
    const strategy = new JwtStrategy(config as never, authService as never);

    await expect(strategy.validate({ ...current, level: 1, branch: 0 })).resolves.toEqual(current);
    expect(authService.getSessionUser).toHaveBeenCalledWith(7, 'session-7');
  });

  it('rejects member tokens before looking up a staff session', async () => {
    const authService = { getSessionUser: jest.fn() };
    const strategy = new JwtStrategy(config as never, authService as never);

    await expect(strategy.validate({ ...current, type: 'member' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('propagates immediate suspension from the current account lookup', async () => {
    const authService = { getSessionUser: jest.fn().mockRejectedValue(new UnauthorizedException('انتهت الجلسة')) };
    const strategy = new JwtStrategy(config as never, authService as never);

    await expect(strategy.validate(current)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects legacy staff access tokens that have no server-side session id', async () => {
    const authService = { getSessionUser: jest.fn() };
    const strategy = new JwtStrategy(config as never, authService as never);

    const { sessionId: _sessionId, ...legacy } = current;
    await expect(strategy.validate(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });
});
