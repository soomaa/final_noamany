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

  it('records a SPA barcode visit against an active subscription benefit', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 41,
            subscription_number: 'SUB-41',
            subscription_end_date: '2026-12-31',
            spa_used: 0,
            type: { includes_spa: true, spa_count: 3 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      club_spa_attendance: { create: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 9,
          member_code: '1001',
          name: 'عضو اختبار',
          branch_id: 2,
        }),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 41,
            subscription_number: 'SUB-41',
            subscription_end_date: '2026-12-31',
            spa_used: 1,
            inbody_used: 0,
            type: { includes_spa: true, spa_count: 3, inbody_count: 0 },
          },
        ]),
      },
      club_spa_attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new ClubWellnessService(prisma as never, {} as never) as unknown as {
      checkInSpaByBarcode: (memberCode: string, userId: number) => Promise<{ remaining: number }>;
    };

    await expect(service.checkInSpaByBarcode('1001', 4)).resolves.toMatchObject({ remaining: 2 });
    expect(tx.club_spa_attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 9, member_code: '1001', subscription_id: 41 }),
    }));
  });
});
