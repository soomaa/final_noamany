import type { PlanDay } from './model';
export function numericDayInput(value: string): string | null {
  const normalized = value.replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 0x6f0));
  return /^\d*$/.test(normalized) ? normalized : null;
}
export function validDayNumber(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function savedDayNumber(name: string): string | null {
  const normalized = numericDayInput(name.trim());
  if (normalized && validDayNumber(normalized)) return String(Number(normalized));
  const match = name.trim().match(/^(?:day|اليوم|يوم)\s+([0-9٠-٩۰-۹]+)$/i);
  return match ? savedDayNumber(match[1]) : null;
}
export function dayLabel(day: Pick<PlanDay, 'name'>, locale: string): string {
  const number = savedDayNumber(day.name);
  if (!number) return day.name;
  const displayed = locale === 'ar' ? number.replace(/\d/g, d => String.fromCharCode(0x660 + Number(d))) : number;
  return `${locale === 'ar' ? 'اليوم' : 'Day'} ${displayed}`;
}
export function nextDayNumber(days: Pick<PlanDay, 'name'>[]): string {
  const used = new Set(days.map(day => savedDayNumber(day.name)));
  let next = 1;
  while (used.has(String(next))) next++;
  return String(next);
}
export function validPlanDayNumbers(days: Pick<PlanDay, 'name'>[]): boolean {
  return days.every(day => validDayNumber(day.name)) && new Set(days.map(day => Number(day.name))).size === days.length;
}
