/**
 * «إعدادات الحضور والمرتبات» — every HR/payroll rule the owner can edit.
 *
 * The defaults reproduce the behaviour that was hard-coded before this page existed, so nothing
 * changes until a value is saved. Rate basis / off day / exempt codes default to the env-driven
 * `payroll.*` config (PAYROLL_WORKING_DAYS, PAYROLL_HOURS_PER_DAY, PAYROLL_DEFAULT_OFF_DAY,
 * PAYROLL_DEDUCTION_EXEMPT_EMP_CODES), which is what payroll used before.
 *
 * Pure module (no Nest / Prisma) so payroll, attendance and the unit specs share it.
 */

export interface HrPayrollSettings {
  // ── أساس الحساب ──
  rateIncludeBasic: boolean;
  rateIncludeHousing: boolean;
  rateIncludeTransport: boolean;
  rateIncludeRaise: boolean;
  workingDaysPerMonth: number;
  hoursPerDay: number;
  // ── التأخير ──
  lateHourMultiplier: number;
  lateCapEnabled: boolean;
  lateCapThresholdMin: number;
  lateCapValueMin: number;
  // ── الانصراف المبكر ──
  earlyLeaveDeduct: boolean;
  earlyLeaveHourMultiplier: number;
  permittedEarlyLeaveDeduct: boolean;
  // ── الأذونات ──
  permittedLateDeduct: boolean;
  permittedLateRatePercent: number;
  // ── البصمة المنسية ──
  missingPunchFreePerMonth: number;
  missingPunchFirstDays: number;
  missingPunchSecondDays: number;
  missingPunchThirdPlusDays: number;
  // ── الغياب والإجازات ──
  absenceDayMultiplier: number;
  paidLeaveDeductMultiplier: number;
  unpaidLeaveDayMultiplier: number;
  // ── الإضافي ──
  overtimeHourMultiplier: number;
  extraShiftDayMultiplier: number;
  // ── أيام البدل ──
  compDayMinWorkedMinutes: number;
  compDayInWeeklyScheduleMode: boolean;
  // ── الإجازة الأسبوعية ──
  defaultWeeklyOffDay: string;
  // ── المستثنون من الخصم ──
  deductionExemptEmpCodes: number[];
  // ── الحالات اليومية ──
  /** YYYY-MM-DD: daily-exception cases before this date are never listed, counted or reminded. null = all history. */
  exceptionsTrackingStartDate: string | null;
}

export type HrPayrollSettingKey = keyof HrPayrollSettings;

export type SettingKind = 'boolean' | 'number' | 'weekday' | 'codes' | 'date';

export interface SettingDef {
  key: HrPayrollSettingKey;
  kind: SettingKind;
  min?: number;
  max?: number;
  /** Whole numbers only. */
  integer?: boolean;
}

export const WEEKDAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export const HR_PAYROLL_SETTING_DEFS: readonly SettingDef[] = [
  { key: 'rateIncludeBasic', kind: 'boolean' },
  { key: 'rateIncludeHousing', kind: 'boolean' },
  { key: 'rateIncludeTransport', kind: 'boolean' },
  { key: 'rateIncludeRaise', kind: 'boolean' },
  { key: 'workingDaysPerMonth', kind: 'number', min: 1, max: 31, integer: true },
  { key: 'hoursPerDay', kind: 'number', min: 1, max: 24 },
  { key: 'lateHourMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'lateCapEnabled', kind: 'boolean' },
  { key: 'lateCapThresholdMin', kind: 'number', min: 0, max: 1440, integer: true },
  { key: 'lateCapValueMin', kind: 'number', min: 0, max: 1440, integer: true },
  { key: 'earlyLeaveDeduct', kind: 'boolean' },
  { key: 'earlyLeaveHourMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'permittedEarlyLeaveDeduct', kind: 'boolean' },
  { key: 'permittedLateDeduct', kind: 'boolean' },
  { key: 'permittedLateRatePercent', kind: 'number', min: 0, max: 1000 },
  { key: 'missingPunchFreePerMonth', kind: 'number', min: 0, max: 31, integer: true },
  { key: 'missingPunchFirstDays', kind: 'number', min: 0, max: 5 },
  { key: 'missingPunchSecondDays', kind: 'number', min: 0, max: 5 },
  { key: 'missingPunchThirdPlusDays', kind: 'number', min: 0, max: 5 },
  { key: 'absenceDayMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'paidLeaveDeductMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'unpaidLeaveDayMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'overtimeHourMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'extraShiftDayMultiplier', kind: 'number', min: 0, max: 10 },
  { key: 'compDayMinWorkedMinutes', kind: 'number', min: 0, max: 1440, integer: true },
  { key: 'compDayInWeeklyScheduleMode', kind: 'boolean' },
  { key: 'defaultWeeklyOffDay', kind: 'weekday' },
  { key: 'deductionExemptEmpCodes', kind: 'codes' },
  { key: 'exceptionsTrackingStartDate', kind: 'date' },
];

/** The env-driven `payroll.*` config values the defaults start from. */
export interface PayrollConfigDefaults {
  workingDays?: number | null;
  hoursPerDay?: number | null;
  defaultOffDay?: string | null;
  deductionExemptEmpCodes?: number[] | null;
}

const positive = (value: number | null | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/** Today's (pre-settings) behaviour. */
export function defaultHrPayrollSettings(config: PayrollConfigDefaults = {}): HrPayrollSettings {
  return {
    rateIncludeBasic: true,
    rateIncludeHousing: true,
    rateIncludeTransport: true,
    rateIncludeRaise: true,
    workingDaysPerMonth: positive(config.workingDays, 30),
    hoursPerDay: positive(config.hoursPerDay, 8),
    lateHourMultiplier: 1,
    lateCapEnabled: true,
    lateCapThresholdMin: 120,
    lateCapValueMin: 240,
    earlyLeaveDeduct: false,
    earlyLeaveHourMultiplier: 1,
    permittedEarlyLeaveDeduct: false,
    permittedLateDeduct: true,
    permittedLateRatePercent: 100,
    missingPunchFreePerMonth: 0,
    missingPunchFirstDays: 0.25,
    missingPunchSecondDays: 0.5,
    missingPunchThirdPlusDays: 1,
    absenceDayMultiplier: 1,
    paidLeaveDeductMultiplier: 1,
    unpaidLeaveDayMultiplier: 1,
    overtimeHourMultiplier: 1,
    extraShiftDayMultiplier: 1,
    compDayMinWorkedMinutes: 0,
    compDayInWeeklyScheduleMode: true,
    defaultWeeklyOffDay: normalizeWeekday(config.defaultOffDay) ?? 'Friday',
    deductionExemptEmpCodes: [...new Set((config.deductionExemptEmpCodes ?? []).filter((c) => Number.isInteger(c) && c > 0))],
    exceptionsTrackingStartDate: null,
  };
}

export function normalizeWeekday(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return WEEKDAYS.find((day) => day.toLowerCase() === v) ?? null;
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const date = new Date(`${value.trim()}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.trim();
}

function parseCodes(value: unknown): number[] | null {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,،]+/).filter(Boolean)
      : null;
  if (!list) return null;
  const codes: number[] = [];
  for (const item of list) {
    const n = typeof item === 'number' ? item : Number(String(item).trim());
    if (!Number.isInteger(n) || n <= 0) return null;
    if (!codes.includes(n)) codes.push(n);
  }
  return codes;
}

/**
 * Coerce one stored / submitted value. Returns `undefined` when it is not valid for the key
 * (stored rows: fall back to the default; submitted values: reject).
 */
export function coerceSettingValue(def: SettingDef, raw: unknown): HrPayrollSettings[HrPayrollSettingKey] | undefined {
  switch (def.kind) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 1 || raw === '1' || raw === 'true') return true;
      if (raw === 0 || raw === '0' || raw === 'false') return false;
      return undefined;
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return undefined;
      if (def.integer && !Number.isInteger(n)) return undefined;
      if (def.min != null && n < def.min) return undefined;
      if (def.max != null && n > def.max) return undefined;
      return n;
    }
    case 'weekday':
      return normalizeWeekday(raw) ?? undefined;
    case 'codes':
      return parseCodes(raw) ?? undefined;
    case 'date':
      if (raw === null || raw === '') return null;
      return isIsoDate(raw) ? (raw as string).trim().slice(0, 10) : undefined;
  }
}

/** Defaults overlaid with the stored values (invalid stored values are ignored). */
export function mergeHrPayrollSettings(
  defaults: HrPayrollSettings,
  stored: Partial<Record<string, unknown>>,
): HrPayrollSettings {
  const out = { ...defaults, deductionExemptEmpCodes: [...defaults.deductionExemptEmpCodes] };
  for (const def of HR_PAYROLL_SETTING_DEFS) {
    if (!(def.key in stored)) continue;
    const value = coerceSettingValue(def, stored[def.key]);
    if (value !== undefined) (out as Record<string, unknown>)[def.key] = value;
  }
  return out;
}

/** Missing-punch ladder: the first `free` occurrences in the month cost nothing, then 1st / 2nd / 3rd+. */
export interface MissingPunchLadder {
  free: number;
  first: number;
  second: number;
  thirdPlus: number;
}

export const DEFAULT_MISSING_PUNCH_LADDER: MissingPunchLadder = { free: 0, first: 0.25, second: 0.5, thirdPlus: 1 };

export function missingPunchLadder(settings: HrPayrollSettings): MissingPunchLadder {
  return {
    free: settings.missingPunchFreePerMonth,
    first: settings.missingPunchFirstDays,
    second: settings.missingPunchSecondDays,
    thirdPlus: settings.missingPunchThirdPlusDays,
  };
}
