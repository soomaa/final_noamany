import { AttendanceService } from './attendance.service';

describe('AttendanceService basma report', () => {
  it('returns both shift punches, scheduled times and the branch name for the Excel export', async () => {
    const punch = {
      hodoor_id: 11,
      member_code: 1007,
      branch_id_fk: 3,
      action_date: '2026-10-28',
      hdoor_time: '09:20',
      dwam_hdoor_time: '09:00',
      ensraf_time: '15:00',
      dwam_ensraf_time: '15:00',
      second_hdoor_time: '18:05',
      second_ensraf_time: '22:00',
      second_late_min: 5,
      hdoor_img_path: 'in.jpg',
      ensraf_img_path: null,
      late_min: 20,
      mobaker_min: 0,
      num_min: null,
    };
    const prisma = {
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([punch, { ...punch, hodoor_id: 12, branch_id_fk: 0, second_hdoor_time: null, second_ensraf_time: null, second_late_min: null }]),
        count: jest.fn().mockResolvedValue(2),
      },
      employees: {
        findMany: jest.fn().mockResolvedValue([{ emp_code: 1007, employee: 'موظف', edara_n: 'الإدارة', mosma_wazefy_n: 'ريسبشن' }]),
      },
      tbl_branches: {
        findMany: jest.fn().mockResolvedValue([{ branch_id: 3, branch_name: 'طنطا' }]),
      },
    };
    const service = new AttendanceService(prisma as never);

    const result = await service.basmaReport({
      dateFrom: '2026-10-28',
      dateTo: '2026-10-28',
      empCode: 'all',
      branchId: 'all',
      page: 1,
      pageSize: 500,
      skip: 0,
      take: 500,
    } as never);

    expect(result.total).toBe(2);
    expect(result.data[0]).toEqual(expect.objectContaining({
      empName: 'موظف',
      branchTitle: 'طنطا',
      weekday: 'الأربعاء',
      scheduledIn: '09:00',
      checkIn: '09:20',
      lateMin: 20,
      secondCheckIn: '18:05',
      secondCheckOut: '22:00',
      secondLateMin: 5,
    }));
    expect(result.data[1]).toEqual(expect.objectContaining({ branchTitle: 'الادارة', secondCheckIn: undefined, secondLateMin: 0 }));
  });
});
