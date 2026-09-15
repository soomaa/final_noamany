import { ShiftsService } from './shifts.service';

describe('ShiftsService last shift of day', () => {
  it('keeps only one last shift per branch when creating a shift', async () => {
    const createdAt = new Date();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({
      id: 12,
      shift_name: 'المسائية',
      start_time: '16:00:00',
      end_time: '00:00:00',
      branch_id: 3,
      responsible_user_id: null,
      is_last_shift_of_day: true,
      is_active: true,
      description: null,
      color: '#3b82f6',
      created_by: 8,
      created_at: createdAt,
      updated_at: createdAt,
    });
    const prisma = {
      sales_shifts: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback({
        sales_shifts: { updateMany, create },
      })),
    };
    const window = { rangesOverlap: jest.fn().mockReturnValue(false) };
    const service = new ShiftsService(prisma as never, window as never);

    const result = await service.create({
      shiftName: 'المسائية',
      startTime: '16:00:00',
      endTime: '00:00:00',
      branchId: 3,
      isLastShiftOfDay: true,
    }, 8);

    expect(updateMany).toHaveBeenCalledWith({
      where: { branch_id: 3, is_last_shift_of_day: true },
      data: { is_last_shift_of_day: false },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ is_last_shift_of_day: true }),
    }));
    expect(result).toEqual(expect.objectContaining({ isLastShiftOfDay: true }));
  });
});
