import { localDateString } from '../club-members/club-member.utils';

export interface FreezeDates {
  freeze_start_date: string;
  freeze_end_date: string | null;
  original_end_date?: string | null;
  planned_days?: number;
}
function dateValue(date: string): number { return Date.parse(`${date}T00:00:00.000Z`); }
/** Display only: thaw remains the only operation that extends the stored contract. */
export function projectedFreezeEnd(end: string, freeze?: FreezeDates | null, today = localDateString()): string | null {
  if (!freeze || end.startsWith('9999-')) return null;
  const base = freeze.original_end_date || end;
  const stop = freeze.freeze_end_date || today;
  const days = Math.max(0, Math.round((dateValue(stop) - dateValue(freeze.freeze_start_date)) / 86400000));
  const value = dateValue(base) + days * 86400000;
  return Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : null;
}
