import { AttendanceService } from './attendance.service';

describe('AttendanceService legacy multi-shift selection', () => {
  it('creates a separate row for the extra shift nearest to the punch time', async () => {
    const mainShift = {
      id: 10,
      title: 'main',
      hdoor_from_time: '07:00 AM',
      hdoor_to_time: '09:00 AM',
      hdoor_khasm_from: '08:00 AM',
      ensraf_from_time: '04:00 PM',
      ensraf_to_time: '05:00 PM',
      ensraf_khasm_from: '04:00 PM',
    };
    const extraShift = {
      ...mainShift,
      id: 20,
      title: 'extra',
      hdoor_from_time: '01:00 PM',
      hdoor_to_time: '03:00 PM',
      hdoor_khasm_from: '02:00 PM',
      ensraf_from_time: '08:00 PM',
      ensraf_to_time: '10:00 PM',
      ensraf_khasm_from: '09:00 PM',
    };
    const prisma = {
      employees: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7,
          emp_code: 1007,
          branch_id_fk: 1,
          emp_sign: '1',
        }),
      },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 },
        ]),
      },
      tbl_hdoor_emps_history: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ hodoor_id: 901 }),
      },
      tbl_hdodr_setting: {
        findMany: jest.fn()
          .mockResolvedValueOnce([mainShift])
          .mockResolvedValueOnce([extraShift]),
        findUnique: jest.fn(),
      },
      tbl_emps_shef_edafi: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 4, emp_code_fk: 1007, ttype: 2, dwam_id_fk: 20, branch_id_fk: 1 },
          ])
          .mockResolvedValueOnce([]),
      },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 88, ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 88, ...data })),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockResolvedValueOnce([{ released: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '02:00 PM', channel: 'app' },
      9,
      1,
    );

    expect(result).toEqual(expect.objectContaining({ id: 88, type: 'in' }));
    expect(prisma.tbl_hdoor_emps.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ dwam_id_fk: 20 }) }),
    );
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dwam_id_fk: 20, sheft_type: 2 }),
      }),
    );
    expect(prisma.tbl_hdoor_emps_history.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ member_code: 1007, ttype: 'hdoor' }) }),
    );
    expect(prisma.tbl_hdoor_emps.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hdoor_img_path: '/asisst/admin_asset/img/avatar5.png' }) }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('uses the weekly slot after rollout and does not read legacy assignments', async () => {
    const weeklyShift = {
      id: 30,
      title: 'weekly',
      hdoor_from_time: '08:00 AM',
      hdoor_to_time: '09:00 AM',
      hdoor_khasm_from: '08:15 AM',
      ensraf_from_time: '04:00 PM',
      ensraf_to_time: '05:00 PM',
      ensraf_khasm_from: '04:00 PM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_weekly_schedule_settings: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      employee_weekly_schedules: { findFirst: jest.fn().mockResolvedValue({ slots: [{ weekday: 3, branch_id: 1, shift_id: 30 }] }) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn() },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([weeklyShift]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ hodoor_id: 902 }) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 90, ...data })),
        update: jest.fn().mockResolvedValue({ hodoor_id: 90 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '08:30 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-09-23', time: '08:30 AM' },
    )).resolves.toEqual(expect.objectContaining({ id: 90, type: 'in' }));
    expect(prisma.employee_weekly_schedules.findFirst).toHaveBeenCalled();
    expect(prisma.tbl_hdoor_dawms_emps.findMany).not.toHaveBeenCalled();
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dwam_id_fk: 30, sheft_type: 0 }),
    }));
  });

  it('accepts a punch for the second (evening) split shift of the same weekday', async () => {
    const morning = {
      id: 30, title: 'morning',
      hdoor_from_time: '07:30 AM', hdoor_to_time: '09:00 AM', hdoor_khasm_from: '08:15 AM',
      ensraf_from_time: '11:00 AM', ensraf_to_time: '12:00 PM', ensraf_khasm_from: '11:00 AM',
    };
    const evening = {
      id: 31, title: 'evening',
      hdoor_from_time: '02:30 PM', hdoor_to_time: '04:00 PM', hdoor_khasm_from: '03:15 PM',
      ensraf_from_time: '10:00 PM', ensraf_to_time: '11:00 PM', ensraf_khasm_from: '10:00 PM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_weekly_schedule_settings: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      employee_weekly_schedules: { findFirst: jest.fn().mockResolvedValue({ slots: [
        { weekday: 3, branch_id: 1, shift_id: 30 },
        { weekday: 3, branch_id: 1, shift_id: 31 },
      ] }) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn() },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([morning, evening]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ hodoor_id: 903 }) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 91, ...data })),
        update: jest.fn().mockResolvedValue({ hodoor_id: 91 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '03:05 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-09-23', time: '03:05 PM' },
    )).resolves.toEqual(expect.objectContaining({ id: 91, type: 'in' }));
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dwam_id_fk: 31, sheft_type: 0 }),
    }));
  });

  it('does not use the employee home branch to select an extra shift', async () => {
    const mainShift = {
      id: 10,
      title: 'main',
      hdoor_from_time: '07:00 AM',
      hdoor_to_time: '09:00 AM',
      hdoor_khasm_from: '08:00 AM',
      ensraf_from_time: '04:00 PM',
      ensraf_to_time: '05:00 PM',
      ensraf_khasm_from: '04:00 PM',
    };
    const homeBranchExtra = {
      ...mainShift,
      id: 20,
      title: 'home-branch-extra',
      hdoor_from_time: '01:00 PM',
      hdoor_to_time: '03:00 PM',
      hdoor_khasm_from: '02:00 PM',
      ensraf_from_time: '08:00 PM',
      ensraf_to_time: '10:00 PM',
      ensraf_khasm_from: '09:00 PM',
    };
    const prisma = {
      employees: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '2' }),
      },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '2', dwam_id_fk: 10 },
        ]),
      },
      tbl_hdodr_setting: {
        findMany: jest.fn()
          .mockResolvedValueOnce([mainShift])
          .mockResolvedValueOnce([homeBranchExtra]),
        findUnique: jest.fn(),
      },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      tbl_emps_shef_edafi: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 4, emp_code_fk: 1007, ttype: 2, dwam_id_fk: 20, branch_id_fk: 1 }])
          .mockResolvedValueOnce([]),
      },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 89, ...data })),
        update: jest.fn().mockResolvedValue({ hodoor_id: 89 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '02:00 PM', channel: 'app' },
      9,
      2,
    );

    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dwam_id_fk: 10, sheft_type: 0, branch_id_fk: 2 }),
    }));
  });

  it('rejects a shift with incomplete timing instead of treating missing values as midnight', async () => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: {
        findMany: jest.fn().mockResolvedValue([{ emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 }]),
      },
      tbl_hdodr_setting: {
        findMany: jest.fn().mockResolvedValue([{
          id: 10, title: 'broken', hdoor_from_time: '08:00 AM', hdoor_to_time: '09:00 AM',
          hdoor_khasm_from: '08:15 AM', ensraf_from_time: null, ensraf_to_time: '05:00 PM', ensraf_khasm_from: '04:00 PM',
        }]),
      },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ hodoor_id: 72 }), update: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck({ empCode: '1007', type: 'in', checkIn: '08:30 AM', channel: 'app' }, 9, 1))
      .rejects.toThrow('راجع الإدارة لتصحيح إعداد الوردية');
    expect(prisma.tbl_hdoor_emps.create).not.toHaveBeenCalled();
  });

  it('blocks a new check-in while another shift still has an open attendance row', async () => {
    const firstShift = {
      id: 10, title: 'first', hdoor_from_time: '07:00 AM', hdoor_to_time: '09:00 AM', hdoor_khasm_from: '08:00 AM',
      ensraf_from_time: '04:00 PM', ensraf_to_time: '05:00 PM', ensraf_khasm_from: '04:00 PM',
    };
    const secondShift = {
      ...firstShift, id: 20, title: 'second', hdoor_from_time: '01:00 PM', hdoor_to_time: '03:00 PM', hdoor_khasm_from: '02:00 PM',
      ensraf_from_time: '08:00 PM', ensraf_to_time: '09:00 PM', ensraf_khasm_from: '08:00 PM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: {
        findMany: jest.fn().mockResolvedValue([
          { emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 },
          { emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 20 },
        ]),
      },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([firstShift, secondShift]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([{ hodoor_id: 70, dwam_id_fk: 10, action_date_s: '2026-08-26', hdoor_time: '08:00 AM', ensraf_time: null }]),
        findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ hodoor_id: 73 }), update: jest.fn(),
      },
      hr_all_ozonat_orders: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '02:00 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-08-26', time: '02:00 PM' },
    )).rejects.toThrow('لا يمكن تسجيل الانصراف الآن بدون إذن معتمد');
    expect(prisma.tbl_hdoor_emps.create).not.toHaveBeenCalled();
  });

  it('closes a stale open attendance row within 24 hours when no new check-in is waiting', async () => {
    const shift = {
      id: 10, title: 'main', hdoor_from_time: '07:00 AM', hdoor_to_time: '09:00 AM', hdoor_khasm_from: '08:00 AM',
      ensraf_from_time: '04:00 PM', ensraf_to_time: '05:00 PM', ensraf_khasm_from: '04:00 PM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: {
        findMany: jest.fn().mockResolvedValue([{ emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 }]),
      },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([shift]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([{ hodoor_id: 71, dwam_id_fk: 10, action_date_s: '2026-08-25', hdoor_time: '08:00 AM', ensraf_time: null }]),
        findFirst: jest.fn().mockResolvedValue({ hodoor_id: 71, hdoor_time: '08:00 AM', ensraf_time: null }),
        create: jest.fn(), update: jest.fn().mockResolvedValue({ hodoor_id: 71 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '1007', checkIn: '05:00 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-08-26', time: '05:00 AM' },
    )).resolves.toEqual(expect.objectContaining({ id: 71, type: 'out' }));
    expect(prisma.tbl_hdoor_emps.create).not.toHaveBeenCalled();
    expect(prisma.tbl_hdoor_emps.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hodoor_id: 71, ensraf_time: null },
    }));
  });
});
