import { BadRequestException } from '@nestjs/common';
import { dateOnlyOrdinal } from '../../common/utils/cairo-date';

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
  const from = dateOnlyOrdinal(fromDate);
  const to = dateOnlyOrdinal(toDate);
  if (to < from) {
    throw new BadRequestException('تاريخ نهاية المأمورية يجب أن يكون بعد تاريخ البداية');
  }
  return to - from + 1;
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
