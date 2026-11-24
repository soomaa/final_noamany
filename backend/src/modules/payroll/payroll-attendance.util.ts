import type { ScheduledSlot } from '../attendance-exceptions/scheduled-shifts.util';
import type { ResolutionIndex, ResolutionRecord } from '../attendance-exceptions/resolutions.repo';
import { DEFAULT_MISSING_PUNCH_LADDER, MissingPunchLadder } from '../hr-payroll-settings/hr-payroll-settings.defaults';

/**
 * Pure per-shift attendance maths for payroll.
 *
 * Single-shift days (0 or 1 scheduled slot) keep the legacy rules exactly:
 *   absence = a working day with no attendance row at all (1 day);
 *   forgotten fingerprint = every one-sided row is one occurrence on the 1/4 → 1/2 → 1 day ladder.
 * Split-shift days (2–3 slots) are judged per slot:
 *   absence = Σ share of the slots with no row (a missed second shift is that shift's share of the day);
 *   forgotten fingerprint = at most ONE ladder occurrence per day, weighted by the share of the
 *   slots that are one-sided (so one forgotten punch is not penalised twice).
 * Manager resolutions (hr_attendance_exception_resolutions) override both:
 *   present / excused / permission → not absent, no missing-punch penalty;
 *   absent → absent (that slot's share), no missing-punch penalty on top;
 *   leave  → not absent, counted as leave of the chosen type.
 */

export interface PayrollAttendanceRow {
  action_date?: string | null;
  dwam_id_fk?: number | null;
  sheft_type?: number | null;
  hdoor_time?: string | null;
  ensraf_time?: string | null;
  late_min?: number | null;
}

export interface SlotMatch<R> {
  slot: ScheduledSlot;
  rows: R[];
}

/** Rows to slots by shift id; rows recorded under another (non-extra) shift fill the empty slots in order. */
export function matchRowsToSlots<R extends PayrollAttendanceRow>(
  slots: ScheduledSlot[],
  rows: R[],
): { matches: SlotMatch<R>[]; unmatched: R[] } {
  const matches: SlotMatch<R>[] = slots.map((slot) => ({ slot, rows: [] }));
  const leftovers: R[] = [];
  for (const row of rows) {
    const match = matches.find((item) => item.slot.shiftId === row.dwam_id_fk);
    if (match) match.rows.push(row);
    else leftovers.push(row);
  }
  const unmatched: R[] = [];
  for (const row of leftovers) {
    const empty = row.sheft_type === 2 ? undefined : matches.find((item) => item.rows.length === 0 && item.slot.source !== 'extra');
    if (empty) empty.rows.push(row);
    else unmatched.push(row);
  }
  return { matches, unmatched };
}

const isOneSided = (row: PayrollAttendanceRow) =>
  Boolean(row.hdoor_time?.trim()) !== Boolean(row.ensraf_time?.trim());

export interface DayAbsence {
  /** Fraction of the day counted as absence (0…1). */
  fraction: number;
  /** Leave granted through a manager resolution, as a fraction of the day. */
  leave: Array<{ leaveTypeId: number | null; days: number }>;
}

function applyDecision(
  resolution: ResolutionRecord | undefined,
  share: number,
  hasRow: boolean,
  out: DayAbsence,
): void {
  if (!resolution) {
    if (!hasRow) out.fraction += share;
    return;
  }
  if (resolution.decision === 'absent') out.fraction += share;
  else if (resolution.decision === 'leave') out.leave.push({ leaveTypeId: resolution.leaveTypeId, days: share });
  // present / excused / permission: nothing to deduct
}

/**
 * Absence for one working day (already excluding off days, approved leave and holidays).
 * `slots` are the counted (main/replacement) slots scheduled that day.
 */
export function dayAbsence<R extends PayrollAttendanceRow>(
  date: string,
  slots: ScheduledSlot[],
  rows: R[],
  resolutions: ResolutionIndex,
): DayAbsence {
  const out: DayAbsence = { fraction: 0, leave: [] };
  const counted = slots.filter((slot) => slot.source !== 'extra');
  if (counted.length <= 1) {
    applyDecision(resolutions.forDay(date, counted[0]?.shiftId), 1, rows.length > 0, out);
    return out;
  }
  const { matches } = matchRowsToSlots(counted, rows);
  for (const { slot, rows: slotRows } of matches) {
    applyDecision(resolutions.forSlot(date, slot.shiftId), slot.share, slotRows.length > 0, out);
  }
  out.fraction = round4(out.fraction);
  return out;
}

/**
 * Ladder (defaults = legacy): 1st occurrence 1/4 day, 2nd 1/2 day, every later one a full day.
 * With `ladder.free` = N the first N occurrences of the period cost nothing and the ladder starts after them.
 */
export function ladderDays(occurrence: number, ladder: MissingPunchLadder = DEFAULT_MISSING_PUNCH_LADDER): number {
  const step = occurrence - Math.max(0, Math.floor(ladder.free));
  if (step <= 0) return 0;
  if (step === 1) return ladder.first;
  if (step === 2) return ladder.second;
  return ladder.thirdPlus;
}

/**
 * Missing-punch deduction over the period. `slotsFor(date)` returns the counted slots for the day
 * ([] when unknown → legacy per-row counting).
 */
export function forgottenFingerprint<R extends PayrollAttendanceRow>(
  rows: R[],
  slotsFor: (date: string) => ScheduledSlot[],
  resolutions: ResolutionIndex,
  ladder: MissingPunchLadder = DEFAULT_MISSING_PUNCH_LADDER,
): { count: number; deductionDays: number } {
  const byDate = new Map<string, R[]>();
  const order: string[] = [];
  for (const row of rows) {
    const date = row.action_date ?? '';
    if (!byDate.has(date)) {
      byDate.set(date, []);
      order.push(date);
    }
    byDate.get(date)!.push(row);
  }
  const weights: number[] = [];
  for (const date of order.sort()) {
    const dayRows = byDate.get(date)!;
    const counted = date ? slotsFor(date).filter((slot) => slot.source !== 'extra') : [];
    if (counted.length <= 1) {
      for (const row of dayRows) {
        if (!isOneSided(row)) continue;
        if (date && resolutions.forDay(date, row.dwam_id_fk)) continue;
        weights.push(1);
      }
      continue;
    }
    const { matches, unmatched } = matchRowsToSlots(counted, dayRows);
    let affected = 0;
    for (const { slot, rows: slotRows } of matches) {
      if (!slotRows.some(isOneSided)) continue;
      if (resolutions.forSlot(date, slot.shiftId)) continue;
      affected += slot.share;
    }
    for (const row of unmatched) {
      if (!isOneSided(row) || resolutions.forSlot(date, row.dwam_id_fk)) continue;
      affected += 1 / counted.length;
    }
    if (affected > 0) weights.push(Math.min(1, affected));
  }
  const deductionDays = weights.reduce((sum, weight, index) => sum + ladderDays(index + 1, ladder) * weight, 0);
  return { count: weights.length, deductionDays: round4(deductionDays) };
}

/** What a resolution does to a late row: keep it, move it under "with permission", or drop it. */
export function lateTreatment(resolution: ResolutionRecord | undefined): 'keep' | 'permission' | 'drop' {
  if (!resolution) return 'keep';
  if (resolution.decision === 'permission') return 'permission';
  if (resolution.decision === 'present') return 'keep';
  return 'drop'; // excused, absent (already counted as absence), leave
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}
