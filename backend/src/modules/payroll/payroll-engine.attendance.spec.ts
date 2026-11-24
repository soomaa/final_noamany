import { PayrollEngineService } from './payroll-engine.service';
import { FINAL_APPROVAL_SUSPEND, isFinallyApproved } from './leave-approval.util';

// Window: Sun 1 Nov – Sat 7 Nov 2026. Friday 6 Nov is the weekly off day → 6 working days.
const FROM = '2026-11-01';
const TO = '2026-11-07';
const MORNING = { id: 5, title: 'صباحي', hdoor_from_time: '08:00 AM', hdoor_to_time: '10:00 AM', hdoor_khasm_from: '08:15 AM', ensraf_from_time: '01:45 PM', ensraf_khasm_from: '02:00 PM', ensraf_to_time: '04:00 PM' };
const EVENING = { ...MORNING, id: 6, title: 'مسائي', hdoor_from_time: '06:00 PM', hdoor_to_time: '08:00 PM', hdoor_khasm_from: '06:15 PM', ensraf_from_time: '11:45 PM', ensraf_khasm_from: '12:00 AM', ensraf_to_time: '02:00 AM' };

type Row = { action_date: string; dwam_id_fk?: number; sheft_type?: number; hdoor_time: string | null; ensraf_time: string | null; late_min?: number };

interface Setup {
  rows: Row[];
  /** shift ids per weekday (Saturday = 0) for a weekly schedule; omitted → legacy single assignment. */
  weeklySlots?: number[];
  resolutions?: Array<{ work_date: string; shift_id?: number; decision: string; leave_type_id?: number | null }>;
  vacations?: Array<{ agaza_from_date_m: string; agaza_to_date_m: string }>;
}

function setup(options: Setup) {
  const weekly = options.weeklySlots != null;
  const prisma: Record<string, any> = {
    hr_emp_agazat_dayes: {
      findFirst: jest.fn().mockResolvedValue({ off_day: 'Friday' }),
      findMany: jest.fn().mockResolvedValue([{ emp_id_fk: 1, emp_code_fk: 1001, off_day: 'Friday' }]),
    },
    tbl_hdoor_emps: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.late_min ? options.rows.filter((row) => (row.late_min ?? 0) > 0) : options.rows)),
    },
    hr_all_agzat_orders: { findMany: jest.fn().mockResolvedValue(options.vacations ?? []) },
    hr_all_ozonat_orders: { findMany: jest.fn().mockResolvedValue([]) },
    holiday_setting: { findMany: jest.fn().mockResolvedValue([]) },
    attendance_weekly_schedule_settings: { findUnique: jest.fn().mockResolvedValue({ id: 1, enabled: weekly }) },
    employee_weekly_schedules: {
      findMany: jest.fn().mockResolvedValue(weekly
        ? [{
            employee_id: 1,
            effective_from: '2026-01-01',
            effective_to: null,
            slots: [0, 1, 2, 3, 4, 6].flatMap((weekday) =>
              options.weeklySlots!.map((shift_id) => ({ weekday, shift_id, branch_id: 2 }))),
          }]
        : []),
    },
    tbl_hdoor_dawms_emps: { findMany: jest.fn().mockResolvedValue([{ dwam_id_fk: 5, emp_id_fk: 1, emp_code_fk: 1001, branch_id_fk: '2' }]) },
    tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([MORNING, EVENING]) },
    $queryRaw: jest.fn().mockResolvedValue((options.resolutions ?? []).map((r, index) => ({
      id: index + 1, emp_code: 1001, work_date: r.work_date, shift_id: r.shift_id ?? 0, branch_id: 2, case_type: 'no_punch',
      decision: r.decision, check_in: null, check_out: null, leave_type_id: r.leave_type_id ?? null, reason: 'x',
      attendance_id: null, created_row: 0, resolved_by: 1, resolved_by_name: 'HR', resolved_at: null,
    }))),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const engine = new PayrollEngineService(prisma as never, config as never);
  const ctx = () => engine.loadAttendanceContext({ id: 1, emp_code: 1001, branch_id_fk: 2 }, FROM, TO);
  return { engine, prisma, ctx };
}

const full = (date: string, shift = 5): Row => ({ action_date: date, dwam_id_fk: shift, sheft_type: 0, hdoor_time: '08:00 AM', ensraf_time: '02:00 PM' });
const inOnly = (date: string, shift = 5): Row => ({ action_date: date, dwam_id_fk: shift, sheft_type: 0, hdoor_time: '08:00 AM', ensraf_time: null });
const outOnly = (date: string, shift = 5): Row => ({ action_date: date, dwam_id_fk: shift, sheft_type: 0, hdoor_time: null, ensraf_time: '02:00 PM' });

describe('payroll regression: single-shift employees are unchanged', () => {
  const rows = [full('2026-11-01'), inOnly('2026-11-02'), outOnly('2026-11-03'), inOnly('2026-11-04'), outOnly('2026-11-05')];

  it('absence = working days without any row (legacy rule)', async () => {
    const { engine, ctx } = setup({ rows });
    const absence = await engine.getActualAbsence(1001, FROM, TO, await ctx());
    expect(absence).toEqual({ count: 1, days: ['2026-11-07'], resolutionLeave: { paidDays: 0, unpaidDays: 0 } });
  });

  it('missing punch ladder 1/4, 1/2, then full days per one-sided row', async () => {
    const { engine, ctx } = setup({ rows });
    await expect(engine.getForgottenFingerprintByDate(1001, FROM, TO, await ctx()))
      .resolves.toEqual({ count: 4, deductionDays: 2.75 });
  });

  it('a single-shift weekly schedule behaves exactly like the legacy assignment', async () => {
    const legacy = setup({ rows });
    const weekly = setup({ rows, weeklySlots: [5] });
    const [a, b] = await Promise.all([legacy.ctx(), weekly.ctx()]);
    expect(await weekly.engine.getActualAbsence(1001, FROM, TO, b)).toEqual(await legacy.engine.getActualAbsence(1001, FROM, TO, a));
    expect(await weekly.engine.getForgottenFingerprintByDate(1001, FROM, TO, b))
      .toEqual(await legacy.engine.getForgottenFingerprintByDate(1001, FROM, TO, a));
  });
});

describe('payroll split shifts (per scheduled slot)', () => {
  // Morning 08:00→14:00 (6h) and evening 18:00→00:00 (6h): each is half the day.
  const allDays = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-07'];

  it('a missed second shift counts as that shift\'s share of the day', async () => {
    const rows = allDays.flatMap((d) => (d === '2026-11-03' ? [full(d, 5)] : [full(d, 5), full(d, 6)]));
    const { engine, ctx } = setup({ rows, weeklySlots: [5, 6] });
    const absence = await engine.getActualAbsence(1001, FROM, TO, await ctx());
    expect(absence.count).toBe(0.5);
    expect(absence.days).toEqual(['2026-11-03']);
  });

  it('one forgotten punch on a two-shift day is penalised once, at that shift\'s share', async () => {
    const rows = allDays.flatMap((d) => (d === '2026-11-02' ? [inOnly(d, 5), outOnly(d, 6)] : [full(d, 5), full(d, 6)]));
    const { engine, ctx } = setup({ rows, weeklySlots: [5, 6] });
    // Legacy per-row counting would give 2 occurrences = 0.75 day; per day it is one occurrence.
    await expect(engine.getForgottenFingerprintByDate(1001, FROM, TO, await ctx()))
      .resolves.toEqual({ count: 1, deductionDays: 0.25 });
  });

  it('a split day with no row at all is still a full day of absence', async () => {
    const rows = allDays.filter((d) => d !== '2026-11-04').flatMap((d) => [full(d, 5), full(d, 6)]);
    const { engine, ctx } = setup({ rows, weeklySlots: [5, 6] });
    expect((await engine.getActualAbsence(1001, FROM, TO, await ctx())).count).toBe(1);
  });
});

describe('payroll honours manager resolutions', () => {
  const rows = [full('2026-11-01'), full('2026-11-02'), inOnly('2026-11-03'), full('2026-11-04'), full('2026-11-05')];

  it('present → not absent; absent → absent even with a row; excused → no missing-punch penalty', async () => {
    const { engine, ctx } = setup({
      rows,
      resolutions: [
        { work_date: '2026-11-07', shift_id: 5, decision: 'present' },
        { work_date: '2026-11-05', shift_id: 5, decision: 'absent' },
        { work_date: '2026-11-03', shift_id: 5, decision: 'excused' },
      ],
    });
    const c = await ctx();
    const absence = await engine.getActualAbsence(1001, FROM, TO, c);
    expect(absence.count).toBe(1);
    expect(absence.days).toEqual(['2026-11-05']);
    await expect(engine.getForgottenFingerprintByDate(1001, FROM, TO, c)).resolves.toEqual({ count: 0, deductionDays: 0 });
  });

  it('leave → counted as leave of the chosen type instead of absence', async () => {
    const { engine, ctx } = setup({
      rows: rows.slice(0, 2),
      resolutions: [
        { work_date: '2026-11-03', decision: 'leave', leave_type_id: 17 },
        { work_date: '2026-11-04', decision: 'leave', leave_type_id: 20 },
      ],
    });
    const absence = await engine.getActualAbsence(1001, FROM, TO, await ctx());
    expect(absence.days).toEqual(['2026-11-05', '2026-11-07']);
    expect(absence.resolutionLeave).toEqual({ paidDays: 1, unpaidDays: 1 });
  });

  it('excused late is dropped, permission late moves under "with permission"', async () => {
    const lateRows: Row[] = [
      { ...full('2026-11-01'), late_min: 30 },
      { ...full('2026-11-02'), late_min: 20 },
      { ...full('2026-11-03'), late_min: 10 },
    ];
    const { engine, ctx } = setup({
      rows: lateRows,
      resolutions: [
        { work_date: '2026-11-01', shift_id: 5, decision: 'excused' },
        { work_date: '2026-11-02', shift_id: 5, decision: 'permission' },
      ],
    });
    await expect(engine.getLateByDate(1001, FROM, TO, await ctx()))
      .resolves.toEqual({ lateWithPermission: 20, lateWithoutPermission: 10 });
  });

  it('works without the resolutions table (migration not applied yet)', async () => {
    const { engine, prisma, ctx } = setup({ rows });
    prisma.$queryRaw.mockRejectedValue(new Error("Table 'hr_attendance_exception_resolutions' doesn't exist"));
    expect((await engine.getActualAbsence(1001, FROM, TO, await ctx())).count).toBe(1);
  });
});

describe('payroll counts leaves and permissions only at final approval', () => {
  it('the final-approval helper is suspend 4, not the direct manager\'s 1', () => {
    expect(FINAL_APPROVAL_SUSPEND).toEqual([4]);
    expect(isFinallyApproved(1)).toBe(false);
    expect(isFinallyApproved(4)).toBe(true);
  });

  it('leave, vacation and permission reads use the final-approval filter', async () => {
    const { engine, prisma, ctx } = setup({ rows: [] });
    prisma.hr_all_agzat_orders.findMany.mockResolvedValue([]);
    await engine.getKeyabByDate(1001, FROM, TO);
    await engine.getActualAbsence(1001, FROM, TO, await ctx());
    await engine.getLateByDate(1001, FROM, TO, await ctx());
    for (const [args] of prisma.hr_all_agzat_orders.findMany.mock.calls) {
      expect(args.where.suspend).toEqual({ in: [4] });
    }
    expect(prisma.hr_all_ozonat_orders.findMany.mock.calls[0][0].where.suspend).toEqual({ in: [4] });
  });

  it('a leave at the manager step is still absence in payroll', async () => {
    const { engine, prisma, ctx } = setup({ rows: [] });
    // The DB query filters by suspend; a status-1 leave is simply not returned.
    prisma.hr_all_agzat_orders.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.suspend.in.includes(1) ? [{ agaza_from_date_m: FROM, agaza_to_date_m: TO }] : []));
    expect((await engine.getActualAbsence(1001, FROM, TO, await ctx())).count).toBe(6);
  });
});

describe('payroll extra shifts (شيفت إضافي) are paid only when punched', () => {
  it('counts an extra shift only with a punch row for the same date and shift', async () => {
    const prisma = {
      tbl_emps_shef_edafi: {
        findMany: jest.fn().mockResolvedValue([
          { sheft_date: '2026-11-02', dwam_id_fk: 6 }, // punched on shift 6 → paid
          { sheft_date: '2026-11-03', dwam_id_fk: 6 }, // only the normal shift punched → not paid
          { sheft_date: '2026-11-04', dwam_id_fk: 6 }, // never punched → not paid
          { sheft_date: '2026-11-05', dwam_id_fk: 0 }, // no shift named → any punch that day
        ]),
      },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([
          { action_date: '2026-11-02', action_date_s: null, dwam_id_fk: 6, hdoor_time: '06:00 PM', ensraf_time: null },
          { action_date: '2026-11-03', action_date_s: null, dwam_id_fk: 5, hdoor_time: '08:00 AM', ensraf_time: '02:00 PM' },
          { action_date: '2026-11-04', action_date_s: null, dwam_id_fk: 6, hdoor_time: null, ensraf_time: null },
          { action_date: '2026-11-05', action_date_s: null, dwam_id_fk: 5, hdoor_time: '08:00 AM', ensraf_time: null },
        ]),
      },
    };
    const engine = new PayrollEngineService(prisma as never, { get: jest.fn() } as never);
    await expect(engine.getSheftEdafi(1001, FROM, TO)).resolves.toBe(2);
  });

  it('pays nothing and skips the punch lookup when no extra shift was booked', async () => {
    const prisma = {
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps: { findMany: jest.fn() },
    };
    const engine = new PayrollEngineService(prisma as never, { get: jest.fn() } as never);
    await expect(engine.getSheftEdafi(1001, FROM, TO)).resolves.toBe(0);
    expect(prisma.tbl_hdoor_emps.findMany).not.toHaveBeenCalled();
  });
});
