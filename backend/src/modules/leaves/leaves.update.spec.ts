import { LeavesService } from './leaves.service';

describe('LeavesService update', () => {
  const prisma = {
    hr_all_agzat_orders: { findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new LeavesService(prisma as never) as unknown as {
    update: (
      id: number,
      body: { startDate: string; endDate: string; returnToWorkDate: string; reason: string; addressSinceAgaza: string },
      actor: { sub: number; level: number },
    ) => Promise<{ id: number }>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hr_all_agzat_orders.findUnique.mockResolvedValue({
      id: 44, publisher: 17, suspend: 0,
      agaza_from_date_m: '2026-08-30', agaza_to_date_m: '2026-08-31', mobashret_amal_date_m: '2026-09-01',
    });
    prisma.hr_all_agzat_orders.update.mockResolvedValue({ id: 44 });
  });

  it('updates an unreviewed owner request and recalculates its inclusive day count', async () => {
    await expect(service.update(44, {
      startDate: '2026-09-02', endDate: '2026-09-04', returnToWorkDate: '2026-09-05',
      reason: 'ظرف عائلي', addressSinceAgaza: 'القاهرة',
    }, { sub: 17, level: 2 })).resolves.toEqual({ id: 44 });

    expect(prisma.hr_all_agzat_orders.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 44 },
      data: expect.objectContaining({
        agaza_from_date_m: '2026-09-02',
        agaza_to_date_m: '2026-09-04',
        mobashret_amal_date_m: '2026-09-05',
        num_days: 3,
        reason: 'ظرف عائلي',
        address_since_agaza: 'القاهرة',
      }),
    }));
  });
});
