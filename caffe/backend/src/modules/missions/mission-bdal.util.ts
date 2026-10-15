import { BadRequestException } from '@nestjs/common';

/**
 * Mission expense (بدل المأمورية) computation.
 *
 * Inclusive day count between two ISO date strings (mirrors Api::num_days).
 * Rejects inverted dates — legacy abs() silently accepted end-before-start.
 *
 * `bdal_count_method` semantics:
 *   '1' (per-day / يومي)  -> bdal_total = bdal_value * num_days
 *   '2' (lump-sum / مقطوع) -> bdal_total = bdal_value
 * Any other / empty method falls back to the lump-sum value.
 */

export const BDAL_METHOD_PER_DAY = '1';
export const BDAL_METHOD_LUMP_SUM = '2';

/** Inclusive number of days between two ISO date strings. */
export function missionNumDays(fromDate?: string | null, toDate?: string | null): number {
  if (!fromDate || !toDate) return 0;
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to < from) {
    throw new BadRequestException('تاريخ نهاية المأمورية يجب أن يكون بعد تاريخ البداية');
  }
  const diff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diff) + 1;
}

/** Compute total allowance from method, per-unit value and day count. */
export function computeBdalTotal(method: string | null | undefined, value: number, numDays: number): number {
  const m = (method ?? '').toString().trim();
  if (m === BDAL_METHOD_PER_DAY) {
    return value * (numDays > 0 ? numDays : 1);
  }
  // lump-sum (method '2' or unspecified)
  return value;
}
