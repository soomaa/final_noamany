import { Prisma } from '@prisma/client';
import { EmployeesService } from './employees.service';

describe('weekly schedule persistence', () => {
  it('exposes versioned weekly schedule models through the generated Prisma client', () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((model) => model.name);

    expect(modelNames).toEqual(expect.arrayContaining([
      'employee_weekly_schedules',
      'employee_weekly_schedule_slots',
      'attendance_weekly_schedule_settings',
    ]));
  });

  it('rejects a weekly schedule that misses a day', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      tbl_branches: { findMany: jest.fn() },
      tbl_hdodr_setting: { findMany: jest.fn() },
    };
    const service = new EmployeesService(prisma as never);
    const slots = Array.from({ length: 7 }, (_, weekday) => ({ weekday: weekday === 6 ? 5 : weekday, branchId: null, shiftId: null }));

    await expect(service.validateWeeklySchedule(7, { effectiveFrom: '2026-09-24', slots }))
      .rejects.toThrow('يجب تحديد دوام أو راحة لكل أيام الأسبوع السبعة');
  });

  describe('split shifts on the same day', () => {
    const morning = { id: 10, title: 'صباحي', hdoor_from_time: '07:30 AM', ensraf_to_time: '12:00 PM' };
    const evening = { id: 11, title: 'مسائي', hdoor_from_time: '02:30 PM', ensraf_to_time: '11:00 PM' };
    const overlapping = { id: 12, title: 'متداخل', hdoor_from_time: '10:00 AM', ensraf_to_time: '04:00 PM' };
    const build = (shifts: object[]) => new EmployeesService({
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 1 }]) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue(shifts) },
    } as never);
    const week = (saturday: Array<{ branchId: number | null; shiftId: number | null }>) => [
      ...saturday.map((slot) => ({ weekday: 0, ...slot })),
      ...Array.from({ length: 6 }, (_, i) => ({ weekday: i + 1, branchId: null, shiftId: null })),
    ];

    it('accepts a morning and an evening shift on Saturday', async () => {
      await expect(build([morning, evening]).validateWeeklySchedule(7, {
        effectiveFrom: '2026-10-20',
        slots: week([{ branchId: 1, shiftId: 10 }, { branchId: 1, shiftId: 11 }]),
      })).resolves.toEqual({ valid: true, errors: [] });
    });

    it('rejects overlapping shifts on the same day', async () => {
      await expect(build([morning, overlapping]).validateWeeklySchedule(7, {
        effectiveFrom: '2026-10-20',
        slots: week([{ branchId: 1, shiftId: 10 }, { branchId: 1, shiftId: 12 }]),
      })).rejects.toThrow('متداخلة');
    });

    it('rejects the same shift twice on one day', async () => {
      await expect(build([morning]).validateWeeklySchedule(7, {
        effectiveFrom: '2026-10-20',
        slots: week([{ branchId: 1, shiftId: 10 }, { branchId: 1, shiftId: 10 }]),
      })).rejects.toThrow('لا يمكن تكرار نفس الدوام');
    });

    it('rejects mixing rest and work on one day', async () => {
      await expect(build([morning]).validateWeeklySchedule(7, {
        effectiveFrom: '2026-10-20',
        slots: week([{ branchId: 1, shiftId: 10 }, { branchId: null, shiftId: null }]),
      })).rejects.toThrow('راحة ودوامًا');
    });
  });

  it('edits the active schedule when it has the same effective date', async () => {
    const updated = {
      id: 44,
      effective_from: '2026-09-24',
      slots: Array.from({ length: 7 }, (_, weekday) => ({ weekday, branch_id: 1, shift_id: 10 })),
    };
    const tx = {
      employee_weekly_schedules: {
        findFirst: jest.fn().mockResolvedValue({ id: 44, effective_from: '2026-09-24', created_by: 3 }),
        update: jest.fn().mockResolvedValue(updated),
        create: jest.fn(),
      },
    };
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 1 }]) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([{ id: 10 }]) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new EmployeesService(prisma as never);
    const slots = Array.from({ length: 7 }, (_, weekday) => ({ weekday, branchId: 1, shiftId: 10 }));

    await expect(service.putWeeklySchedule(7, { effectiveFrom: '2026-09-24', slots }, 9))
      .resolves.toEqual(expect.objectContaining({ id: 44, employeeId: 7 }));
    expect(tx.employee_weekly_schedules.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 44 },
      data: expect.objectContaining({ slots: expect.objectContaining({ deleteMany: {}, create: expect.any(Array) }) }),
    }));
    expect(tx.employee_weekly_schedules.create).not.toHaveBeenCalled();
  });
});
