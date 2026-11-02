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

  it('accepts an extra shift saved with the employee home branch for fixed-site staff (legacy build_available_shifts_for_date)', async () => {
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

    // The 02:00 PM arrival is nearest the extra shift's deduction time, so the extra
    // shift (saved under home branch 1 while punching at branch 2) is used.
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dwam_id_fk: 20, sheft_type: 2, branch_id_fk: 2 }),
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

  it('dates an after-midnight arrival on a night shift to the shift day, with late minutes on real datetimes', async () => {
    const nightShift = {
      id: 30, title: 'night', hdoor_from_time: '11:00 PM', hdoor_to_time: '01:00 AM', hdoor_khasm_from: '11:15 PM',
      ensraf_from_time: '06:00 AM', ensraf_to_time: '08:00 AM', ensraf_khasm_from: '07:00 AM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn().mockResolvedValue([{ emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: null, dwam_id_fk: 30 }]) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([nightShift]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
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
      { empCode: '1007', checkIn: '12:30 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-08-26', time: '12:30 AM' },
    )).resolves.toEqual(expect.objectContaining({ id: 90, type: 'in', lateMin: 75 }));
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action_date: '2026-08-25', dwam_id_fk: 30 }),
    }));
    expect(prisma.tbl_hdoor_emps.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ hdoor_time: '12:30 AM', late_min: 75 }),
    }));
  });

  it("does not let yesterday's forgotten checkout block today's arrival (legacy stale open row)", async () => {
    const shift = {
      id: 10, title: 'main', hdoor_from_time: '07:00 AM', hdoor_to_time: '09:00 AM', hdoor_khasm_from: '08:00 AM',
      ensraf_from_time: '04:00 PM', ensraf_to_time: '05:00 PM', ensraf_khasm_from: '04:00 PM',
    };
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn().mockResolvedValue([{ emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 }]) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([shift]), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([{ hodoor_id: 71, dwam_id_fk: 10, action_date: '2026-08-25', action_date_s: '1787605200', hdoor_time: '08:00 AM', ensraf_time: null }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 91, ...data })),
        update: jest.fn().mockResolvedValue({ hodoor_id: 91 }),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '1007', checkIn: '08:10 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-08-26', time: '08:10 AM' },
    )).resolves.toEqual(expect.objectContaining({ id: 91, type: 'in', lateMin: 10 }));
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action_date: '2026-08-26', action_date_s: '1787691600' }),
    }));
    expect(prisma.tbl_hdoor_emps.updateMany).not.toHaveBeenCalled();
  });

  // Real production shifts (old system recorded these arrivals on the first open shift, not the right one).
  const realShift = (id: number, title: string, times: [string, string, string, string, string, string]) => ({
    id, title, hdoor_from_time: times[0], hdoor_to_time: times[1], hdoor_khasm_from: times[2],
    ensraf_from_time: times[3], ensraf_to_time: times[4], ensraf_khasm_from: times[5],
  });
  const multiShiftPrisma = (shifts: ReturnType<typeof realShift>[]) => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 29, branch_id_fk: 1, emp_sign: '1' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn().mockResolvedValue(shifts.map((shift) => ({ emp_code_fk: 29, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: shift.id }))) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue(shifts), findUnique: jest.fn() },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 95, ...data })),
        update: jest.fn().mockResolvedValue({ hodoor_id: 95 }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    return prisma;
  };

  it.each([
    // [assigned shifts, arrival, expected shift, expected late]
    [[realShift(16, 'صباحي10 (11ص-7م)', ['10:00 AM', '05:30 PM', '11:00 AM', '06:55 PM', '11:30 PM', '08:00 PM']),
      realShift(19, 'مسائى3 (12م-8م)', ['11:00 AM', '06:30 PM', '12:00 PM', '07:55 PM', '11:30 PM', '09:00 PM'])], '11:55 AM', 19, 0],
    [[realShift(12, 'صباحي6 (9ص-4م)', ['08:05 AM', '02:30 PM', '09:00 AM', '03:55 PM', '11:30 PM', '05:00 PM']),
      realShift(50, 'صباحي (11ص-4م)', ['10:00 AM', '02:30 PM', '11:00 AM', '03:55 PM', '10:30 PM', '05:29 PM'])], '10:58 AM', 50, 0],
    [[realShift(12, 'صباحي6 (9ص-4م)', ['08:05 AM', '02:30 PM', '09:00 AM', '03:55 PM', '11:30 PM', '05:00 PM']),
      realShift(50, 'صباحي (11ص-4م)', ['10:00 AM', '02:30 PM', '11:00 AM', '03:55 PM', '10:30 PM', '05:29 PM'])], '09:10 AM', 12, 10],
  ])('an employee with several shifts is recorded on the shift nearest the arrival (%#)', async (shifts, arrival, expectedShift, expectedLate) => {
    const prisma = multiShiftPrisma(shifts);
    const service = new AttendanceService(prisma as never);

    await expect(service.manualCheck(
      { empCode: '29', checkIn: arrival, channel: 'app' },
      9,
      1,
      { actionDate: '2026-10-15', time: arrival },
    )).resolves.toEqual(expect.objectContaining({ type: 'in', lateMin: expectedLate }));
    expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dwam_id_fk: expectedShift, action_date: '2026-10-15' }),
    }));
  });
});
