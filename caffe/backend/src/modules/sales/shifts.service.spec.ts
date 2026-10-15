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

describe('ShiftsService cafe operator eligibility', () => {
  it('accepts a barista whose department is Cafe Management', async () => {
    const prisma = {
      users: {
        findMany: jest.fn().mockResolvedValue([
          {
            user_id: 21,
            username: 'barista',
            name: 'Barista User',
            level: 2,
            emp_code: 44,
            branch_id_fk: 3,
          },
        ]),
      },
      employees: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 44,
            employee: 'Barista Employee',
            mosma_wazefy_n: 'شيف باريستا',
            mosma_wazefy_code: null,
            edara_n: 'إدارة الكافيه',
          },
        ]),
      },
      department_jobs: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShiftsService(prisma as never, {} as never);

    await expect(service.eligibleUsers(3)).resolves.toEqual([
      expect.objectContaining({
        id: 21,
        jobTitle: 'شيف باريستا',
        department: 'إدارة الكافيه',
        eligible: true,
      }),
    ]);
  });

  it('does not admit an unrelated employee merely because they have a login', async () => {
    const prisma = {
      users: {
        findMany: jest.fn().mockResolvedValue([
          {
            user_id: 22,
            username: 'trainer',
            name: 'Trainer User',
            level: 2,
            emp_code: 45,
            branch_id_fk: 3,
          },
        ]),
      },
      employees: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 45,
            employee: 'Trainer Employee',
            mosma_wazefy_n: 'مدرب لياقة',
            mosma_wazefy_code: null,
            edara_n: 'إدارة التدريب',
          },
        ]),
      },
      department_jobs: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShiftsService(prisma as never, {} as never);

    await expect(service.eligibleUsers(3)).resolves.toEqual([]);
  });
});
