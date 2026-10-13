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

  it('rejects a weekly schedule that repeats a day', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      tbl_branches: { findMany: jest.fn() },
      tbl_hdodr_setting: { findMany: jest.fn() },
    };
    const service = new EmployeesService(prisma as never);
    const slots = Array.from({ length: 7 }, (_, weekday) => ({ weekday: weekday === 6 ? 5 : weekday, branchId: null, shiftId: null }));

    await expect(service.validateWeeklySchedule(7, { effectiveFrom: '2026-09-24', slots }))
      .rejects.toThrow('يجب تحديد أيام الأسبوع السبعة بدون تكرار');
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
