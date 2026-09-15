/** Add calendar days to a date (date-only safe). */
export function addDays(start: Date | string, days: number): Date {
  const d = start instanceof Date ? new Date(start) : new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** Compute end date from start + durationDays (inclusive: 30-day sub ends start+29). */
export function computeEndDateFromDuration(start: Date | string, durationDays: number): Date {
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw new Error('مدة غير صالحة');
  }
  return addDays(start, durationDays - 1);
}

export function toDateOnlyString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** BMI = weight(kg) / height(m)^2 */
export function computeBmi(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || heightCm <= 0 || weightKg <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}
