import { AttendanceService } from './attendance.service';

describe('AttendanceService full attendance sheet', () => {
  it('returns every day and applies punch, weekly-off, swapped-leave and absence states', async () => {
    const prisma = {
      employees: {
        findMany: jest.fn().mockResolvedValue([{
          id: 7,
          emp_code: 1007,
          employee: 'موظف',
          branch_id_fk: 1,
          edara_n: 'الإدارة',
          qsm_n: 'القسم',
        }]),
      },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([{
          hodoor_id: 1,
          member_code: 1007,
          action_date: '2026-08-03',
          action_date_s: '2026-08-03',
          hdoor_time: '08:00 AM',
          ensraf_time: '04:00 PM',
          hdoor_img_path: 'in.jpg',
          ensraf_img_path: 'out.jpg',
          second_hdoor_time: null,
          second_ensraf_time: null,
          second_hdoor_img_path: null,
          second_ensraf_img_path: null,
          late_min: 0,
          second_late_min: null,
        }]),
      },
      hr_emp_agazat_dayes: {
        findMany: jest.fn().mockResolvedValue([{
          emp_id_fk: 7,
          emp_code_fk: 1007,
          off_day: 'Sunday',
        }]),
      },
      hr_all_agzat_orders: {
        findMany: jest.fn().mockResolvedValue([{
          emp_code_fk: BigInt(1007),
          no3_agaza: 19,
          agaza_date: '2026-08-04',
          agaza_from_date_m: null,
          agaza_to_date_m: null,
        }]),
      },
      tbl_branches: {
        findMany: jest.fn().mockResolvedValue([{ branch_id: 1, branch_name: 'الفرع' }]),
      },
    };
    const service = new AttendanceService(prisma as never);

    const result = await service.fullAttendanceSheet({
      dateFrom: '2026-08-02',
      dateTo: '2026-08-05',
      empCode: '1007',
      branchId: '1',
      page: 1,
      pageSize: 25,
      skip: 0,
      take: 25,
    } as never);

    expect(result.total).toBe(4);
    expect(result.data.map((row) => row.status)).toEqual([
      'weekly_off',
      'present',
      'swapped_leave',
      'absent',
    ]);
    expect(result.data[1]).toEqual(expect.objectContaining({
      checkInPhoto: 'in.jpg',
      checkOutPhoto: 'out.jpg',
      workingSeconds: 8 * 60 * 60,
    }));
  });

  it('limits an employee account to self and direct reports in its branch', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AttendanceService(prisma as never);

    await service.manualOptions({ level: 2, emp_code: 7, branch: 3, man_women_type: 0 } as never, '3');

    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branch_id_fk: 3,
        OR: [{ id: 7 }, { manger: '7' }],
      }),
    }));
  });
});
