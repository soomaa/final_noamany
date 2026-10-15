import { ConflictException } from '@nestjs/common';
import { ClubWellnessService } from './club-wellness.service';

describe('ClubWellnessService subscription benefits', () => {
  const makeService = () =>
    new ClubWellnessService({} as never, {} as never) as unknown as {
      consumeBenefit: (
        tx: Record<string, unknown>,
        memberId: number,
        kind: 'inbody' | 'spa',
        quantity: number,
      ) => Promise<number | null>;
    };

  it('consumes a SPA quantity across subscriptions in earliest-expiry order', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, inbody_used: 0, spa_used: 1, type: { includes_spa: true, spa_count: 2 } },
          { id: 11, inbody_used: 0, spa_used: 0, type: { includes_spa: true, spa_count: 1 } },
        ]),
        updateMany,
      },
    };

    await expect(makeService().consumeBenefit(tx, 7, 'spa', 2)).resolves.toBe(10);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 10, spa_used: 1 }, data: { spa_used: { increment: 1 } } }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: 11, spa_used: 0 }, data: { spa_used: { increment: 1 } } }),
    );
  });

  it('rejects a stale concurrent allowance update', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 20, inbody_used: 0, spa_used: 0, type: { inbody_count: 1 } },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(makeService().consumeBenefit(tx, 8, 'inbody', 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
