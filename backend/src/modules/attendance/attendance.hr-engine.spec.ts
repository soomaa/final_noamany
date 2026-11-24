import {
  AttendanceService,
  applyShiftDayOverride,
  isWeeklyOffDay,
  punchConfirmedOvertimeMinutes,
} from './attendance.service';
import { defaultHrPayrollSettings } from '../hr-payroll-settings/hr-payroll-settings.defaults';

/** Shift 09:00 (deduction from 09:05) – 05:00 PM; on Friday the branch opens at 10:00. */
const dayShift = {
  id: 10,
  title: 'صباحي',
  hdoor_from_time: '09:00 AM',
  hdoor_to_time: '11:00 AM',
  hdoor_khasm_from: '09:05 AM',
  ensraf_from_time: '04:00 PM',
  ensraf_to_time: '08:00 PM',
  ensraf_khasm_from: '05:00 PM',
};
const fridayOverride = {
  shift_id: 10,
  weekday: 5,
  hdoor_from_time: '10:00 AM',
  hdoor_to_time: '12:00 PM',
  hdoor_khasm_from: '10:05 AM',
  ensraf_from_time: '05:00 PM',
  ensraf_to_time: '09:00 PM',
  ensraf_khasm_from: '06:00 PM',
};

/** $queryRaw double answering by SQL text: the punch lock and the weekday overrides. */
function rawQuery(overrides: unknown[]) {
  return jest.fn().mockImplementation((sql: { strings?: string[]; sql?: string }) => {
    const text = sql?.sql ?? (sql?.strings ?? []).join('?');
    if (text.includes('GET_LOCK')) return Promise.resolve([{ acquired: 1 }]);
    if (text.includes('tbl_hdodr_setting_day_overrides')) return Promise.resolve(overrides);
    return Promise.resolve([]);
  });
}

function punchPrisma(options: {
  overrides?: unknown[];
  recentRows?: unknown[];
  existing?: unknown;
  offDay?: string | null;
}) {
  const prisma: Record<string, unknown> = {
    employees: { findFirst: jest.fn().mockResolvedValue({ id: 7, emp_code: 1007, branch_id_fk: 1, emp_sign: '1' }) },
    attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
    attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_hdoor_dawms_emps: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, emp_code_fk: 1007, emp_id_fk: 7, branch_id_fk: '1', dwam_id_fk: 10 }]),
    },
    tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([dayShift]), findUnique: jest.fn().mockResolvedValue(dayShift) },
    tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    tbl_hdoor_emps: {
      findMany: jest.fn().mockResolvedValue(options.recentRows ?? []),
      findFirst: jest.fn().mockResolvedValue(options.existing ?? null),
      create: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 55, ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ hodoor_id: 55, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    hr_emp_agazat_dayes: {
      findFirst: jest.fn().mockResolvedValue(options.offDay ? { off_day: options.offDay } : null),
    },
    $queryRaw: rawQuery(options.overrides ?? []),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  prisma.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma as Record<string, any>;
}

describe('per-weekday shift times', () => {
  it('Friday 10:05 punch with a Friday override (deduction from 10:05) is not late', async () => {
    const prisma = punchPrisma({ overrides: [fridayOverride] });
    const service = new AttendanceService(prisma as never);

    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '10:05 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '10:05 AM' },
    );

    expect(result).toEqual(expect.objectContaining({ type: 'in' }));
    expect((result as { lateMin: number }).lateMin).toBeLessThanOrEqual(5);
    expect(prisma.tbl_hdoor_emps.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ late_min: 0, dwam_hdoor_time: '10:00 AM' }),
    }));
  });

  it('a 10:10 Friday punch is measured from the Friday deduction time (5 minutes, not 65)', async () => {
    const prisma = punchPrisma({ overrides: [fridayOverride] });
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '10:10 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '10:10 AM' },
    );
    expect((result as { lateMin: number }).lateMin).toBe(5);
  });

  it('other weekdays keep the normal shift times (Thursday 10:00 punch is 55 minutes late)', async () => {
    const prisma = punchPrisma({ overrides: [fridayOverride] });
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '10:00 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-26', time: '10:00 AM' },
    );
    expect((result as { lateMin: number }).lateMin).toBe(55);
  });

  it('a missing override table never breaks the punch', async () => {
    const prisma = punchPrisma({});
    prisma.$queryRaw = jest.fn().mockImplementation((sql: { strings?: string[] }) =>
      (sql.strings ?? []).join('').includes('tbl_hdodr_setting_day_overrides')
        ? Promise.reject(new Error("Table 'tbl_hdodr_setting_day_overrides' doesn't exist"))
        : Promise.resolve([{ acquired: 1 }]));
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '09:05 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '09:05 AM' },
    );
    expect((result as { lateMin: number }).lateMin).toBe(0);
  });

  it('without the override the same Friday 10:05 punch is the reported 60-minute bug', async () => {
    const prisma = punchPrisma({});
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'in', checkIn: '10:05 AM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '10:05 AM' },
    );
    expect((result as { lateMin: number }).lateMin).toBe(60);
  });

  it('applyShiftDayOverride only replaces the matching weekday', () => {
    const map = new Map([[10, [{ ...fridayOverride }]]]);
    expect(applyShiftDayOverride(dayShift, '2026-11-27', map).hdoor_khasm_from).toBe('10:05 AM');
    expect(applyShiftDayOverride(dayShift, '2026-11-26', map)).toBe(dayShift);
  });

  it('saves weekday overrides with the shift and validates them', async () => {
    const prisma: Record<string, any> = {
      tbl_hdodr_setting: { create: jest.fn().mockImplementation(({ data }) => ({ id: 3, ...data })) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
    const service = new AttendanceService(prisma as never);
    const base = {
      title: 'صباحي', hdoorFromTime: '08:00', hdoorToTime: '10:00', hdoorKhasmFrom: '09:05',
      ensrafFromTime: '16:00', ensrafToTime: '20:00', ensrafKhasmFrom: '17:00',
    };
    const saved = await service.createShift({
      ...base,
      dayOverrides: [{
        weekday: 5, hdoorFromTime: '09:00', hdoorToTime: '11:00', hdoorKhasmFrom: '10:05',
        ensrafFromTime: '17:00', ensrafToTime: '21:00', ensrafKhasmFrom: '18:00',
      }],
    });
    expect(saved.dayOverrides).toEqual([expect.objectContaining({ weekday: 5, hdoorKhasmFrom: '10:05 AM' })]);
    // DELETE + one INSERT
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);

    await expect(service.createShift({
      ...base,
      dayOverrides: [{
        weekday: 5, hdoorFromTime: '09:00', hdoorToTime: '11:00', hdoorKhasmFrom: '12:30',
        ensrafFromTime: '17:00', ensrafToTime: '21:00', ensrafKhasmFrom: '18:00',
      }],
    })).rejects.toThrow('الجمعة');
  });
});

describe('manager overtime is clamped to what the punches confirm', () => {
  function extraHoursPrisma(punches: unknown[], offDay: string | null = null) {
    return {
      users: { findUnique: jest.fn().mockResolvedValue({ user_id: 501, emp_code: 10 }) },
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 20, emp_code: 200, employee: 'موظف', branch_id_fk: 3, manger: '10' }),
        findFirst: jest.fn().mockResolvedValue({ id: 10, emp_code: 100 }),
      },
      hr_egraat_emp_setting: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_emps_hours_edafi: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 800, ...data })),
      },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue(punches) },
      tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([dayShift]) },
      hr_emp_agazat_dayes: { findFirst: jest.fn().mockResolvedValue(offDay ? { off_day: offDay } : null) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
  }

  it('manager asked for 2 hours, the fingerprint confirms 70 minutes ⇒ 1 paid hour + warning', async () => {
    const prisma = extraHoursPrisma([
      { hodoor_id: 1, hdoor_time: '09:00 AM', ensraf_time: '06:10 PM', sheft_type: 0, dwam_id_fk: 10 },
    ]);
    const service = new AttendanceService(prisma as never);
    const result = await service.createExtraHours({ empId: 20, numHours: 2, edafaDate: '2026-11-19' }, 501);

    expect(prisma.tbl_emps_hours_edafi.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ num_hours: 1 }),
    });
    expect(result).toEqual(expect.objectContaining({ requestedHours: 2, confirmedHours: 1, confirmedMinutes: 70 }));
    expect(result.warning).toContain('ساعتين');
    expect(result.warning).toContain('ساعة واحدة');
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('pays the requested hours when the punches cover them', async () => {
    const prisma = extraHoursPrisma([
      { hodoor_id: 1, hdoor_time: '09:00 AM', ensraf_time: '08:00 PM', sheft_type: 0, dwam_id_fk: 10 },
    ]);
    const service = new AttendanceService(prisma as never);
    const result = await service.createExtraHours({ empId: 20, numHours: 2, edafaDate: '2026-11-19' }, 501);
    expect(result).toEqual(expect.objectContaining({ confirmedHours: 2 }));
    expect(result.warning).toBeUndefined();
  });

  it('nothing is paid without a check-out, and future dates are refused', async () => {
    const prisma = extraHoursPrisma([{ hodoor_id: 1, hdoor_time: '09:00 AM', ensraf_time: null, sheft_type: 0, dwam_id_fk: 10 }]);
    const service = new AttendanceService(prisma as never);
    const result = await service.createExtraHours({ empId: 20, numHours: 3, edafaDate: '2026-11-20' }, 501);
    expect(result.confirmedHours).toBe(0);
    expect(result.warning).toBeDefined();
    await expect(service.createExtraHours({ empId: 20, numHours: 3, edafaDate: '2099-01-01' }, 501))
      .rejects.toThrow('لسه مجاش');
  });

  it('extra shift / weekly day off: the whole worked duration counts', () => {
    const shifts = new Map([[10, dayShift]]);
    const row = { hdoor_time: '10:00 AM', ensraf_time: '01:30 PM', sheft_type: 2, dwam_id_fk: 10 };
    expect(punchConfirmedOvertimeMinutes([row], shifts, false)).toBe(210);
    expect(punchConfirmedOvertimeMinutes([{ ...row, sheft_type: 0 }], shifts, true)).toBe(210);
    expect(punchConfirmedOvertimeMinutes([{ ...row, sheft_type: 0 }], shifts, false)).toBe(0);
  });
});

describe('compensatory day for working on the weekly day off', () => {
  const openRow = {
    hodoor_id: 71,
    member_code: 1007,
    dwam_id_fk: 10,
    action_date: '2026-11-27',
    action_date_s: '2026-11-27',
    sheft_type: 0,
    hdoor_time: '09:00 AM',
    ensraf_time: null,
  };

  it('check-out on the off day records an earned comp day', async () => {
    const prisma = punchPrisma({ recentRows: [openRow], existing: openRow, offDay: 'Friday' });
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'out', checkOut: '05:00 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '05:00 PM' },
    );
    expect(result).toEqual(expect.objectContaining({ type: 'out', compDayEarned: true }));
    const inserts = prisma.$executeRaw.mock.calls
      .map(([sql]: [{ strings: string[]; values: unknown[] }]) => sql)
      .filter((sql: { strings: string[] }) => sql.strings.join('?').includes('hr_comp_day_credits'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual([1007, '2026-11-27', 480]);
  });

  it('a normal working day records nothing', async () => {
    const prisma = punchPrisma({ recentRows: [openRow], existing: openRow, offDay: 'Saturday' });
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'out', checkOut: '05:00 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '05:00 PM' },
    );
    expect(result).not.toHaveProperty('compDayEarned');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('below the minimum worked time («أيام البدل») the day is recorded but not announced as earned', async () => {
    const prisma = punchPrisma({ recentRows: [openRow], existing: openRow, offDay: 'Friday' });
    const settings = { get: jest.fn().mockResolvedValue({ ...defaultHrPayrollSettings(), compDayMinWorkedMinutes: 600 }) };
    const service = new AttendanceService(prisma as never, undefined, settings as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'out', checkOut: '05:00 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '05:00 PM' },
    );
    expect(result).not.toHaveProperty('compDayEarned');
  });

  it('weekly-schedule mode: a replacement shift on a rest weekday earns a comp day', async () => {
    const replacementRow = { ...openRow, sheft_type: 1 };
    const prisma = punchPrisma({ recentRows: [replacementRow], existing: replacementRow, offDay: null });
    prisma.attendance_weekly_schedule_settings = { findUnique: jest.fn().mockResolvedValue({ id: 1, enabled: true }) };
    prisma.employee_weekly_schedules = {
      findFirst: jest.fn().mockResolvedValue({ id: 1, slots: [{ weekday: 6, shift_id: null, branch_id: 1 }] }),
    };
    prisma.tbl_emps_shef_edafi.findMany.mockResolvedValue([
      { id: 3, emp_code_fk: 1007, sheft_date: '2026-11-27', ttype: 1, dwam_id_fk: 10, branch_id_fk: 1 },
    ]);
    const service = new AttendanceService(prisma as never);
    const result = await service.manualCheck(
      { empCode: '1007', type: 'out', checkOut: '05:00 PM', channel: 'app' },
      9,
      1,
      { actionDate: '2026-11-27', time: '05:00 PM' },
    );
    expect(result).toEqual(expect.objectContaining({ type: 'out', compDayEarned: true }));
  });

  it('isWeeklyOffDay accepts English and Arabic day names', () => {
    expect(isWeeklyOffDay('Friday', '2026-11-27')).toBe(true);
    expect(isWeeklyOffDay('الجمعة', '2026-11-27')).toBe(true);
    expect(isWeeklyOffDay('friday', '2026-11-26')).toBe(false);
    expect(isWeeklyOffDay(null, '2026-11-27')).toBe(false);
  });
});
