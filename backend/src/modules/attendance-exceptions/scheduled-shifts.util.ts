/**
 * Which shift slots an employee is scheduled to work on a date — the same schedule sources the
 * attendance engine (AttendanceService.performCheck) uses to accept a punch:
 *
 *  - weekly schedules (attendance_weekly_schedule_settings.enabled): the active
 *    employee_weekly_schedules row covering the date, its slots for that weekday (Saturday = 0)
 *    with a shift. A weekday whose slots are all rest is the weekly off day. Up to 3 slots a day.
 *  - otherwise the legacy assignment tbl_hdoor_dawms_emps (shift ids per employee/branch) plus the
 *    weekly off day from hr_emp_agazat_dayes (default: payroll.defaultOffDay, Friday).
 *  - tbl_emps_shef_edafi for the date: ttype 1 replaces the normal shifts, ttype 2 adds an extra one.
 *
 * Pure loader over Prisma reads only (no new tables), shared by the daily exceptions page and payroll.
 */

export interface ShiftTimes {
  id: number;
  title: string | null;
  hdoor_from_time: string | null;
  hdoor_to_time: string | null;
  hdoor_khasm_from: string | null;
  ensraf_from_time: string | null;
  ensraf_khasm_from: string | null;
  ensraf_to_time: string | null;
}

export type SlotSource = 'main' | 'replacement' | 'extra';

export interface ScheduledSlot {
  shiftId: number;
  branchId: number | null;
  source: SlotSource;
  shift: ShiftTimes | null;
  /** Fraction of the working day this slot represents (main/replacement slots sum to 1; extras 0). */
  share: number;
}

export interface DaySchedule {
  /** Weekly rest day (and no replacement/extra shift was booked for it). */
  offDay: boolean;
  slots: ScheduledSlot[];
}

export interface ScheduleEmployee {
  id: number;
  emp_code: number;
  branch_id_fk: number | null;
}

/** getUTCDay() index (Sunday = 0) → accepted spellings of hr_emp_agazat_dayes.off_day. */
export const WEEKDAY_ALIASES: string[][] = [
  ['sunday', 'الأحد', 'الاحد'],
  ['monday', 'الإثنين', 'الاثنين'],
  ['tuesday', 'الثلاثاء'],
  ['wednesday', 'الأربعاء', 'الاربعاء'],
  ['thursday', 'الخميس'],
  ['friday', 'الجمعة', 'الجمعه'],
  ['saturday', 'السبت'],
];

export const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function utcWeekday(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/** employee_weekly_schedule_slots.weekday numbering (Saturday = 0 … Friday = 6). */
export function scheduleWeekday(date: string): number {
  return (utcWeekday(date) + 1) % 7;
}

export function isOffDayName(offDay: string | null | undefined, date: string): boolean {
  const name = (offDay ?? '').trim().toLowerCase();
  if (!name) return false;
  return WEEKDAY_ALIASES[utcWeekday(date)].includes(name);
}

/** Minutes since midnight of "hh:mm AM" / "HH:mm"; null when unparseable. */
export function timeToMinutes(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  const ampm = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|ص|م)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = /^(PM|م)$/i.test(ampm[3]);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  return null;
}

/** The legacy "hh:mm AM" format every tbl_hdoor_emps time column uses. */
export function minutesToLegacyTime(totalMin: number): string {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/** Nominal shift length: start of attendance window → deduction-free leave time (wraps midnight). */
export function shiftNominalMinutes(shift: ShiftTimes | null): number | null {
  if (!shift) return null;
  const start = timeToMinutes(shift.hdoor_from_time);
  const end = timeToMinutes(shift.ensraf_khasm_from);
  if (start == null || end == null) return null;
  const length = end > start ? end - start : end + 1440 - start;
  return length > 0 && length <= 16 * 60 ? length : null;
}

/** Weights each counted slot by its length; equal split when any length is unknown. */
export function withShares(slots: ScheduledSlot[]): ScheduledSlot[] {
  const counted = slots.filter((slot) => slot.source !== 'extra');
  const lengths = counted.map((slot) => shiftNominalMinutes(slot.shift));
  const known = lengths.every((length) => length != null);
  const total = known ? (lengths as number[]).reduce((sum, length) => sum + length, 0) : 0;
  return slots.map((slot) => {
    if (slot.source === 'extra') return { ...slot, share: 0 };
    const index = counted.indexOf(slot);
    const share = known && total > 0 ? (lengths[index] as number) / total : 1 / counted.length;
    return { ...slot, share };
  });
}

export function* eachIsoDay(from: string, to: string): Generator<string> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function toDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function specialDateToIso(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

/** Legacy get_dwams_for_emp_by_branch: NULL/''/0/non-numeric branch = every branch. */
function assignmentBranch(raw: string | null | undefined): number | null {
  const value = String(raw ?? '').trim().toLowerCase();
  const n = Number(value);
  if (!value || value === 'all' || !Number.isFinite(n) || n === 0) return null;
  return n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface WeeklySchedule {
  employee_id: number;
  effective_from: string;
  effective_to: string | null;
  slots: Array<{ weekday: number; shift_id: number | null; branch_id: number | null }>;
}

export class ScheduleResolver {
  private constructor(
    readonly weeklyMode: boolean,
    private readonly employees: Map<number, ScheduleEmployee>,
    private readonly weekly: Map<number, WeeklySchedule[]>,
    private readonly legacy: Map<number, Array<{ shiftId: number; branchId: number | null }>>,
    private readonly offDays: Map<number, string>,
    private readonly defaultOffDay: string,
    private readonly specials: Map<string, Array<{ id: number; ttype: number; dwam_id_fk: number; branch_id_fk: number | null }>>,
    private readonly shifts: Map<number, ShiftTimes>,
  ) {}

  /**
   * Loads every schedule source for the employees over [from, to]. Delegates are read with optional
   * chaining so unit-test doubles (and databases predating the weekly-schedule migration) degrade to
   * "no schedule" instead of throwing.
   */
  static async load(
    db: Db,
    employees: ScheduleEmployee[],
    from: string,
    to: string,
    options: { defaultOffDay?: string; includeSpecial?: boolean } = {},
  ): Promise<ScheduleResolver> {
    const byCode = new Map(employees.map((employee) => [employee.emp_code, employee]));
    const ids = employees.map((employee) => employee.id);
    const codes = employees.map((employee) => employee.emp_code);
    const defaultOffDay = options.defaultOffDay ?? 'Friday';
    const empty = new ScheduleResolver(false, byCode, new Map(), new Map(), new Map(), defaultOffDay, new Map(), new Map());
    if (!employees.length) return empty;

    const settings = await db.attendance_weekly_schedule_settings?.findUnique?.({ where: { id: 1 } });
    const weeklyMode = Boolean(settings?.enabled);

    const weekly = new Map<number, WeeklySchedule[]>();
    const legacy = new Map<number, Array<{ shiftId: number; branchId: number | null }>>();
    const offDays = new Map<number, string>();
    const shiftIds = new Set<number>();

    if (weeklyMode) {
      const schedules: WeeklySchedule[] =
        (await db.employee_weekly_schedules?.findMany?.({
          where: {
            employee_id: { in: ids },
            status: 'active',
            effective_from: { lte: to },
            OR: [{ effective_to: null }, { effective_to: { gte: from } }],
          },
          include: { slots: true },
          orderBy: { effective_from: 'desc' },
        })) ?? [];
      for (const schedule of schedules) {
        const list = weekly.get(schedule.employee_id) ?? [];
        list.push(schedule);
        weekly.set(schedule.employee_id, list);
        for (const slot of schedule.slots ?? []) if (slot.shift_id != null) shiftIds.add(slot.shift_id);
      }
    } else {
      const assignments: Array<{ dwam_id_fk: number | null; emp_id_fk: number | null; emp_code_fk: number | null; branch_id_fk: string | null }> =
        (await db.tbl_hdoor_dawms_emps?.findMany?.({
          where: { OR: [{ emp_code_fk: { in: codes } }, { emp_id_fk: { in: ids } }] },
          orderBy: { id: 'asc' },
        })) ?? [];
      const codeById = new Map(employees.map((employee) => [employee.id, employee.emp_code]));
      const raw = new Map<number, Array<{ shiftId: number; branchId: number | null }>>();
      for (const row of assignments) {
        if (!row.dwam_id_fk) continue;
        const code = (row.emp_code_fk && byCode.has(row.emp_code_fk) ? row.emp_code_fk : null)
          ?? (row.emp_id_fk != null ? codeById.get(row.emp_id_fk) ?? null : null);
        if (code == null) continue;
        const list = raw.get(code) ?? [];
        list.push({ shiftId: row.dwam_id_fk, branchId: assignmentBranch(row.branch_id_fk) });
        raw.set(code, list);
      }
      for (const [code, list] of raw) {
        const employee = byCode.get(code)!;
        // Assignments for the home branch (or "every branch"); other-branch rows are alternatives
        // for punching elsewhere, not extra shifts the same day.
        const home = list.filter((item) => item.branchId == null || item.branchId === employee.branch_id_fk);
        const chosen = home.length ? home : list;
        const unique = new Map<number, { shiftId: number; branchId: number | null }>();
        for (const item of chosen) if (!unique.has(item.shiftId)) unique.set(item.shiftId, item);
        legacy.set(code, [...unique.values()]);
        for (const item of unique.values()) shiftIds.add(item.shiftId);
      }
      const offs: Array<{ emp_id_fk: number; emp_code_fk: number; off_day: string }> =
        (await db.hr_emp_agazat_dayes?.findMany?.({
          where: { OR: [{ emp_id_fk: { in: ids } }, { emp_code_fk: { in: codes } }] },
          orderBy: { id: 'asc' },
        })) ?? [];
      for (const off of offs) {
        const code = byCode.has(off.emp_code_fk) ? off.emp_code_fk : codeById.get(off.emp_id_fk);
        if (code != null && off.off_day?.trim()) offDays.set(code, off.off_day);
      }
    }

    const specials = new Map<string, Array<{ id: number; ttype: number; dwam_id_fk: number; branch_id_fk: number | null }>>();
    if (options.includeSpecial !== false) {
      const dates = [...eachIsoDay(from, to)];
      const rows: Array<{ id: number; ttype: number; dwam_id_fk: number; branch_id_fk: number | null; emp_code_fk: number; sheft_date: string }> =
        (await db.tbl_emps_shef_edafi?.findMany?.({
          where: { emp_code_fk: { in: codes }, sheft_date: { in: [...dates, ...dates.map(toDmy)] } },
          orderBy: { id: 'desc' },
        })) ?? [];
      for (const row of rows) {
        const iso = specialDateToIso(row.sheft_date);
        if (!iso) continue;
        const key = `${row.emp_code_fk}|${iso}`;
        const list = specials.get(key) ?? [];
        list.push(row);
        specials.set(key, list);
        if (row.dwam_id_fk) shiftIds.add(row.dwam_id_fk);
      }
    }

    const shiftRows: ShiftTimes[] = shiftIds.size
      ? (await db.tbl_hdodr_setting?.findMany?.({ where: { id: { in: [...shiftIds] } } })) ?? []
      : [];
    const shifts = new Map(shiftRows.map((shift) => [shift.id, shift]));
    return new ScheduleResolver(weeklyMode, byCode, weekly, legacy, offDays, defaultOffDay, specials, shifts);
  }

  shift(id: number): ShiftTimes | null {
    return this.shifts.get(id) ?? null;
  }

  day(empCode: number, date: string): DaySchedule {
    const employee = this.employees.get(empCode);
    if (!employee) return { offDay: false, slots: [] };
    let offDay = false;
    let main: ScheduledSlot[] = [];
    if (this.weeklyMode) {
      const schedule = (this.weekly.get(employee.id) ?? [])
        .filter((item) => item.effective_from <= date && (item.effective_to == null || item.effective_to >= date))
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
      if (schedule) {
        const weekday = scheduleWeekday(date);
        const working = (schedule.slots ?? []).filter((slot) => slot.weekday === weekday && slot.shift_id != null);
        offDay = working.length === 0;
        const seen = new Set<number>();
        for (const slot of working) {
          if (seen.has(slot.shift_id as number)) continue;
          seen.add(slot.shift_id as number);
          main.push({ shiftId: slot.shift_id as number, branchId: slot.branch_id ?? employee.branch_id_fk, source: 'main', shift: this.shift(slot.shift_id as number), share: 0 });
        }
      }
    } else {
      offDay = isOffDayName(this.offDays.get(empCode) ?? this.defaultOffDay, date);
      if (!offDay) {
        main = (this.legacy.get(empCode) ?? []).map((item) => ({
          shiftId: item.shiftId,
          branchId: item.branchId ?? employee.branch_id_fk,
          source: 'main' as const,
          shift: this.shift(item.shiftId),
          share: 0,
        }));
      }
    }

    const special = this.specials.get(`${empCode}|${date}`) ?? [];
    const replacement = special.find((row) => row.ttype === 1);
    let slots: ScheduledSlot[] = replacement
      ? [{ shiftId: replacement.dwam_id_fk, branchId: replacement.branch_id_fk || employee.branch_id_fk, source: 'replacement', shift: this.shift(replacement.dwam_id_fk), share: 0 }]
      : main;
    for (const extra of special.filter((row) => row.ttype === 2)) {
      if (slots.some((slot) => slot.shiftId === extra.dwam_id_fk)) continue;
      slots = [...slots, { shiftId: extra.dwam_id_fk, branchId: extra.branch_id_fk || employee.branch_id_fk, source: 'extra', shift: this.shift(extra.dwam_id_fk), share: 0 }];
    }
    if (slots.length) offDay = false;
    return { offDay, slots: withShares(slots) };
  }
}
