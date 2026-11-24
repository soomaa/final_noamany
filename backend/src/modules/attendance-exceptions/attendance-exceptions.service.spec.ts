import { BadRequestException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { AttendanceExceptionsService } from './attendance-exceptions.service';

const MORNING = {
  id: 5,
  title: 'صباحي',
  hdoor_from_time: '08:00 AM',
  hdoor_to_time: '10:00 AM',
  hdoor_khasm_from: '08:15 AM',
  ensraf_from_time: '01:45 PM',
  ensraf_khasm_from: '02:00 PM',
  ensraf_to_time: '04:00 PM',
};
const EVENING = {
  ...MORNING,
  id: 6,
  title: 'مسائي',
  hdoor_from_time: '06:00 PM',
  hdoor_to_time: '08:00 PM',
  hdoor_khasm_from: '06:15 PM',
  ensraf_from_time: '11:45 PM',
  ensraf_khasm_from: '12:00 AM',
  ensraf_to_time: '02:00 AM',
};
const EMPLOYEE = { id: 1, emp_code: 1001, employee: 'أحمد', mosma_wazefy_n: 'مدرب', branch_id_fk: 2 };
// 24 Nov 2026 is a Tuesday; noon in Cairo.
const NOW = new Date('2026-11-24T10:00:00Z');
const ADMIN = { sub: 9, level: 1, name: 'HR', branch: 0 } as never;

interface Setup {
  weekly?: boolean;
  slots?: Array<{ weekday: number; shift_id: number | null; branch_id: number | null }>;
  rows?: Array<Record<string, unknown>>;
  leaves?: Array<Record<string, unknown>>;
  resolutions?: Array<Record<string, unknown>>;
  offDay?: string;
}

function setup(options: Setup = {}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma: Record<string, any> = {
    attendance_weekly_schedule_settings: { findUnique: jest.fn().mockResolvedValue({ id: 1, enabled: options.weekly ?? false }) },
    employee_weekly_schedules: {
      findMany: jest.fn().mockResolvedValue(options.weekly
        ? [{ employee_id: 1, effective_from: '2026-01-01', effective_to: null, slots: options.slots ?? [] }]
        : []),
    },
    employee_weekly_schedule_slots: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_hdoor_dawms_emps: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, dwam_id_fk: 5, emp_id_fk: 1, emp_code_fk: 1001, branch_id_fk: '2' }]),
    },
    hr_emp_agazat_dayes: {
      findMany: jest.fn().mockResolvedValue([{ emp_id_fk: 1, emp_code_fk: 1001, off_day: options.offDay ?? 'Friday' }]),
    },
    tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_hdodr_setting: { findMany: jest.fn().mockResolvedValue([MORNING, EVENING]) },
    tbl_hdoor_emps: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? []),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve({ hodoor_id: 777, ...data });
      }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    holiday_setting: { findMany: jest.fn().mockResolvedValue([]) },
    hr_all_agzat_orders: { findMany: jest.fn().mockResolvedValue(options.leaves ?? []) },
    hr_all_ozonat_orders: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 2, branch_name: 'طنطا' }]) },
    employees: {
      findMany: jest.fn().mockResolvedValue([EMPLOYEE]),
      findFirst: jest.fn().mockResolvedValue(EMPLOYEE),
    },
    $queryRaw: jest.fn().mockResolvedValue(options.resolutions ?? []),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const service = new AttendanceExceptionsService(prisma as never, new BranchScopeService());
  return { service, prisma, created };
}

describe('AttendanceExceptionsService.list', () => {
  it('lists no_punch for a scheduled employee who never punched (no attendance row exists)', async () => {
    const { service } = setup();
    const result = await service.list({ date: '2026-11-23' }, ADMIN, NOW);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      empCode: 1001,
      date: '2026-11-23',
      shiftId: 5,
      caseType: 'no_punch',
      caseTypes: ['no_punch'],
      expectedIn: '08:00 AM',
      expectedOut: '02:00 PM',
      branchName: 'طنطا',
      resolution: null,
    });
    expect(result.counters).toMatchObject({ total: 1, open: 1, byType: { no_punch: 1 } });
  });

  it('skips the weekly off day and finally-approved leave, but flags a leave still at the manager step', async () => {
    const { service } = setup({
      leaves: [
        { emp_code_fk: BigInt(1001), suspend: 4, agaza_from_date_m: '2026-11-22', agaza_to_date_m: '2026-11-22' },
        { emp_code_fk: BigInt(1001), suspend: 1, agaza_from_date_m: '2026-11-23', agaza_to_date_m: '2026-11-23' },
      ],
    });
    // 20 Nov = Friday (off), 22 Nov = approved leave, 23 Nov = leave approved by the manager only.
    const result = await service.list({ from: '2026-11-20', to: '2026-11-23' }, ADMIN, NOW);
    const dates = result.items.map((item) => item.date).sort();
    expect(dates).toEqual(['2026-11-21', '2026-11-23']);
    expect(result.items.find((item) => item.date === '2026-11-23')?.pendingLeave).toBe(true);
  });

  it('does not report today before the check-in window has closed', async () => {
    const { service } = setup();
    const early = new Date('2026-11-24T06:30:00Z'); // 08:30 Cairo, window open until 10:00
    const result = await service.list({ date: '2026-11-24' }, ADMIN, early);
    expect(result.items).toHaveLength(0);
  });

  it('classifies missing check-out, missing check-in and late rows', async () => {
    const { service } = setup({
      rows: [
        { hodoor_id: 1, member_code: 1001, action_date: '2026-11-21', action_date_s: null, hdoor_time: '08:40 AM', ensraf_time: null, late_min: 25, mobaker_min: 0, dwam_id_fk: 5, sheft_type: 0, branch_id_fk: 2 },
        { hodoor_id: 2, member_code: 1001, action_date: '2026-11-22', action_date_s: null, hdoor_time: null, ensraf_time: '02:00 PM', late_min: 0, mobaker_min: 0, dwam_id_fk: 5, sheft_type: 0, branch_id_fk: 2 },
        { hodoor_id: 3, member_code: 1001, action_date: '2026-11-23', action_date_s: null, hdoor_time: '08:00 AM', ensraf_time: '02:00 PM', late_min: 0, mobaker_min: 0, dwam_id_fk: 5, sheft_type: 0, branch_id_fk: 2 },
      ],
    });
    const result = await service.list({ from: '2026-11-21', to: '2026-11-23' }, ADMIN, NOW);
    const byDate = Object.fromEntries(result.items.map((item) => [item.date, item.caseTypes]));
    expect(byDate).toEqual({
      '2026-11-21': ['missing_checkout', 'late'],
      '2026-11-22': ['missing_checkin'],
    });
    expect(result.items.find((item) => item.date === '2026-11-21')?.minutes).toBe(0);
  });

  it('judges split shifts per slot: only the missed evening shift is listed', async () => {
    const { service } = setup({
      weekly: true,
      // 23 Nov 2026 = Monday = weekday 2 (Saturday = 0)
      slots: [
        { weekday: 2, shift_id: 5, branch_id: 2 },
        { weekday: 2, shift_id: 6, branch_id: 2 },
      ],
      rows: [
        { hodoor_id: 3, member_code: 1001, action_date: '2026-11-23', action_date_s: null, hdoor_time: '08:00 AM', ensraf_time: '02:00 PM', late_min: 0, mobaker_min: 0, dwam_id_fk: 5, sheft_type: 0, branch_id_fk: 2 },
      ],
    });
    const result = await service.list({ date: '2026-11-23' }, ADMIN, NOW);
    expect(result.items.map((item) => [item.shiftId, item.caseType])).toEqual([[6, 'no_punch']]);
  });

  it('keeps a resolved case visible with who decided it', async () => {
    const { service } = setup({
      resolutions: [{
        id: 1, emp_code: 1001, work_date: '2026-11-23', shift_id: 5, branch_id: 2, case_type: 'no_punch', decision: 'excused',
        check_in: null, check_out: null, leave_type_id: null, reason: 'مأمورية', attendance_id: null, created_row: 0,
        resolved_by: 9, resolved_by_name: 'HR', resolved_at: '2026-11-24 09:00:00',
      }],
    });
    const result = await service.list({ date: '2026-11-23' }, ADMIN, NOW);
    expect(result.items[0].resolution).toMatchObject({ decision: 'excused', resolvedByName: 'HR', shiftId: 5 });
    expect(result.counters).toMatchObject({ open: 0, resolved: 1 });
  });
});

describe('AttendanceExceptionsService.resolve', () => {
  it('present back-fills a manual attendance row for the past date with the approximate times', async () => {
    const { service, prisma, created } = setup();
    await service.resolve(
      { empCode: 1001, date: '2026-11-23', decision: 'present', checkIn: '08:10', checkOut: '14:05', reason: 'نسي البصمة' },
      ADMIN,
      NOW,
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      member_code: 1001,
      action_date: '2026-11-23',
      dwam_id_fk: 5,
      branch_id_fk: 2,
      tasgel_type: 'manual',
      hdoor_time: '08:10 AM',
      ensraf_time: '02:05 PM',
      late_min: 0,
      hdoor_user_id: 9,
      ensraf_user_id: 9,
    });
    const insert = prisma.$executeRaw.mock.calls[0][0];
    expect(insert.values).toEqual(expect.arrayContaining([1001, '2026-11-23', 5, 'no_punch', 'present', 'نسي البصمة', 777, 1]));
  });

  it('present completes only the missing check-out of an existing row', async () => {
    const row = { hodoor_id: 1, member_code: 1001, action_date: '2026-11-21', action_date_s: null, hdoor_time: '08:40 AM', ensraf_time: null, late_min: 25, mobaker_min: 0, dwam_id_fk: 5, sheft_type: 0, branch_id_fk: 2 };
    const { service, prisma, created } = setup({ rows: [row] });
    prisma.tbl_hdoor_emps.findUnique.mockResolvedValue(row);
    await service.resolve({ empCode: 1001, date: '2026-11-21', decision: 'present', checkOut: '02:00 PM', reason: 'نسي الانصراف' }, ADMIN, NOW);
    expect(created).toHaveLength(0);
    expect(prisma.tbl_hdoor_emps.update).toHaveBeenCalledWith({
      where: { hodoor_id: 1 },
      data: expect.objectContaining({ ensraf_time: '02:00 PM', tasgel_type: 'manual', ensraf_user_id: 9 }),
    });
    expect(prisma.tbl_hdoor_emps.update.mock.calls[0][0].data.hdoor_time).toBeUndefined();
  });

  it('requires the approximate times for present, a leave type for leave and a reason', async () => {
    const { service } = setup();
    await expect(service.resolve({ empCode: 1001, date: '2026-11-23', decision: 'present', checkIn: '08:00', reason: 'x' }, ADMIN, NOW))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolve({ empCode: 1001, date: '2026-11-23', decision: 'leave', reason: 'x' }, ADMIN, NOW))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolve({ empCode: 1001, date: '2026-11-23', decision: 'absent', reason: '   ' }, ADMIN, NOW))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('absent records the decision without touching attendance', async () => {
    const { service, prisma } = setup();
    await service.resolve({ empCode: 1001, date: '2026-11-23', decision: 'absent', reason: 'غياب بدون إذن' }, ADMIN, NOW);
    expect(prisma.tbl_hdoor_emps.create).not.toHaveBeenCalled();
    expect(prisma.$executeRaw.mock.calls[0][0].values).toEqual(expect.arrayContaining(['absent', 'غياب بدون إذن']));
  });

  it('blocks a branch manager from resolving another branch', async () => {
    const { service } = setup();
    const manager = { sub: 3, level: 3, branch: 7, name: 'مدير' } as never;
    await expect(service.resolve({ empCode: 1001, date: '2026-11-23', decision: 'excused', reason: 'x' }, manager, NOW))
      .rejects.toThrow('لا تملك صلاحية');
  });
});

describe('AttendanceExceptionsService filters and pending summary', () => {
  it('«قديم مفتوح» keeps only open cases at least STALE_AFTER_DAYS old', async () => {
    const { service } = setup();
    const result = await service.list({ from: '2026-11-21', to: '2026-11-24', status: 'stale' }, ADMIN, NOW);
    expect(result.items.map((item) => item.date).sort()).toEqual(['2026-11-21', '2026-11-22']);
  });

  it('filters by staff section and lets a section manager open on their own section', async () => {
    const { service, prisma } = setup();
    prisma.employees.findMany.mockResolvedValue([{ ...EMPLOYEE, emp_type: 2 }]);
    expect((await service.list({ date: '2026-11-23', gender: 'male' }, ADMIN, NOW)).items).toHaveLength(0);
    expect((await service.list({ date: '2026-11-23', gender: 'female' }, ADMIN, NOW)).items[0].section).toBe('female');
    const menSupervisor = { sub: 4, level: 3, branch: 2, name: 'مشرف', job_title: 'مشرف إدارة رجالي' } as never;
    const result = await service.list({ date: '2026-11-23' }, menSupervisor, NOW);
    expect(result.gender).toBe('male');
    expect(result.items).toHaveLength(0);
    expect((await service.list({ date: '2026-11-23', gender: 'all' }, menSupervisor, NOW)).items).toHaveLength(1);
  });

  it('returns only the branches in scope as picker options', async () => {
    const { service, prisma } = setup();
    const manager = { sub: 3, level: 3, branch: 2, name: 'مدير', job_title: 'مدير فرع' } as never;
    await service.list({ date: '2026-11-23' }, manager, NOW);
    expect(prisma.tbl_branches.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branch_id: { in: [2, 5, 6] } } }));
  });

  it('summarizes open cases of the last two weeks, cached per user', async () => {
    const { service, prisma } = setup();
    const summary = await service.pendingSummary(ADMIN, NOW);
    // 11–24 Nov without the two Fridays; today's shift window has closed at noon.
    expect(summary).toMatchObject({ open: 12, stale: 10, oldestOpenDate: '2026-11-11', since: '2026-11-11' });
    expect(summary.branches).toEqual([{ branchId: 2, branchName: 'طنطا', open: 12, stale: 10 }]);
    const calls = prisma.employees.findMany.mock.calls.length;
    await service.pendingSummary(ADMIN, new Date(NOW.getTime() + 30_000));
    expect(prisma.employees.findMany.mock.calls.length).toBe(calls);
    await service.pendingSummary(ADMIN, new Date(NOW.getTime() + 61_000));
    expect(prisma.employees.findMany.mock.calls.length).toBeGreaterThan(calls);
  });

  it('a user without a branch gets an empty summary without scanning attendance', async () => {
    const { service, prisma } = setup();
    const summary = await service.pendingSummary({ sub: 5, level: 2, branch: 0, name: 'x' } as never, NOW);
    expect(summary.open).toBe(0);
    expect(prisma.tbl_hdoor_emps.findMany).not.toHaveBeenCalled();
  });
});
