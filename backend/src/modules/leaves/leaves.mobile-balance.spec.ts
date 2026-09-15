import { BadRequestException } from '@nestjs/common';
import { LeavesService } from './leaves.service';

describe('LeavesService legacy mobile balance', () => {
  const prisma = {
    hr_all_agzat_orders: { aggregate: jest.fn() },
  };
  const service = new LeavesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('enforces the documented 7-day annual balance after one year', async () => {
    prisma.hr_all_agzat_orders.aggregate.mockResolvedValue({ _sum: { num_days: 2 } });
    const oldHireDate = `${new Date().getFullYear() - 2}-01-01`;

    await expect(
      (service as unknown as {
        assertLegacyMobileBalance: (
          empId: number,
          start: string,
          type: number,
          days: number,
        ) => Promise<void>;
      }).assertLegacyMobileBalance(8, oldHireDate, 21, 6),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not apply that special ladder to unrelated leave types', async () => {
    await expect(
      (service as unknown as {
        assertLegacyMobileBalance: (
          empId: number,
          start: string,
          type: number,
          days: number,
        ) => Promise<void>;
      }).assertLegacyMobileBalance(8, '2020-01-01', 9, 20),
    ).resolves.toBeUndefined();
    expect(prisma.hr_all_agzat_orders.aggregate).not.toHaveBeenCalled();
  });

  it('rejects a fourth sick-leave request in the same calendar month', async () => {
    prisma.hr_all_agzat_orders.aggregate.mockResolvedValue({ _count: { id: 3 } });

    await expect(
      (service as unknown as {
        assertSickLeaveMonthlyLimit: (empId: number, startDate: string) => Promise<void>;
      }).assertSickLeaveMonthlyLimit(8, '2026-08-23'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.hr_all_agzat_orders.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        emp_id_fk: 8,
        no3_agaza: { in: [3, 4] },
        suspend: { notIn: [2, 5] },
        agaza_from_date_m: { gte: '2026-08-01', lt: '2026-09-01' },
      }),
    }));
  });
});
