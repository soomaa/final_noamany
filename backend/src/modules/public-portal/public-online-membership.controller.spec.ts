import { PublicPortalController } from './public-portal.controller';

describe('PublicPortalController online membership proof lifecycle', () => {
  it('removes a privately stored proof when authoritative request validation fails', async () => {
    const service = {} as any;
    const online = { createRequest: jest.fn().mockRejectedValue(new Error('invalid package')) };
    const proofs = {
      store: jest.fn().mockReturnValue({ path: 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', mime: 'image/png', size: 8 }),
      remove: jest.fn(),
    };
    const controller = new PublicPortalController(service, online as any, proofs as any);

    await expect(controller.onlineMembership({ packageId: 99 }, {} as any)).rejects.toThrow('invalid package');

    expect(proofs.remove).toHaveBeenCalledWith('proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png');
  });
});
