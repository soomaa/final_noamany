import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { FlexibleAuthGuard } from '../../../common/guards/flexible-auth.guard';

describe('Store JWT audience isolation', () => {
  const customer = { sub: 1, type: 'portal-customer', name: 'Customer', phone: '01012345678' };
  const config = { get: () => 'test-only-secret' } as any;

  it('rejects a valid customer token on staff routes even when its id matches a staff id', async () => {
    await expect(new JwtStrategy(config).validate(customer as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects customer tokens on shared staff/member password routes', async () => {
    const guard = new FlexibleAuthGuard({ verifyAsync: async () => customer } as any, config);
    const request = { headers: { authorization: 'Bearer customer-token' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request).not.toHaveProperty('user');
  });
});
