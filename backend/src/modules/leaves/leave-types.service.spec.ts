import { LeavesService } from './leaves.service';

describe('LeavesService leave type pay policy', () => {
  it('persists and returns whether a leave type is paid', async () => {
    const prisma = {
      holiday_setting: {
        create: jest.fn().mockResolvedValue({ id: 23 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 23,
            name: 'إجازة رعاية',
            min_days: 1,
            max_days: 30,
            agaza_ttype: 0,
            mowazf_badel: 0,
            is_paid: false,
            active: 'yes',
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new LeavesService(prisma as never);

    await service.createType({ title: 'إجازة رعاية', maxDays: 30, isPaid: false });
    expect(prisma.holiday_setting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ is_paid: false }),
    });

    await expect(service.listTypes({ page: 1, pageSize: 25, skip: 0, take: 25 } as never))
      .resolves.toEqual(expect.objectContaining({
        data: [expect.objectContaining({ id: 23, isPaid: false })],
      }));
  });
});
