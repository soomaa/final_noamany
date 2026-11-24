import { toArabicDigits } from '@/lib/utils';

/** Minutes as «س د»: 135 → «٢ س ١٥ د», 45 → «٤٥ د», null → «—». */
export function minutesLabel(minutes: number | string | null | undefined): string {
  if (minutes == null || minutes === '') return '—';
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return toArabicDigits(h ? `${h} س ${m ? `${m} د` : ''}`.trim() : `${m} د`);
}
