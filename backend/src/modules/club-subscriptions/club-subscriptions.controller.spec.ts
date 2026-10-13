import { ClubSubscriptionsController } from './club-subscriptions.controller';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';

describe('ClubSubscriptionsController.create', () => {
  it('allows reception and member-transfer grants to load source subscriptions', () => {
    const permissions = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, ClubSubscriptionsController.prototype.memberTransferSources);
    expect(permissions).toEqual(expect.arrayContaining(['club.reception:view', 'club.reception:update', 'club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create']));
  });
  it('injects the complete authenticated user so branch access is evaluated with their scope', () => {
    const administrator = { sub: 128, level: 1, branch: 0 } as never;
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ClubSubscriptionsController,
      'create',
    ) as Record<string, { factory: (data: unknown, context: unknown) => unknown; data: unknown }>;
    const userParameter = Object.entries(metadata).find(([key]) => key.endsWith(':1'))?.[1];

    expect(userParameter?.factory(userParameter.data, {
      switchToHttp: () => ({ getRequest: () => ({ user: administrator }) }),
    })).toBe(administrator);
  });
});
