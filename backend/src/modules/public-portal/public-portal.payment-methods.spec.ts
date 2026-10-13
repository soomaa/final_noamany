import { PublicPortalService } from './public-portal.service';

describe('PublicPortalService payment methods', () => {
  it('returns active payment methods configured in Settings', async () => {
    const activeMethods = [
      { id: 1, name: 'فودافون كاش', number: '01012345678', username: null, image: '/uploads/vodafone.png' },
      { id: 2, name: 'أورانج كاش', number: '01212345678', username: 'orange-wallet', image: null },
    ];
    const prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => Promise.resolve(
        sql.includes('settings_payment_methods') ? activeMethods : [],
      )),
    };
    const service = new PublicPortalService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.paymentMethods()).resolves.toEqual(activeMethods);
  });
});
