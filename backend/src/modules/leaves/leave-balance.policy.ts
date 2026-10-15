import { BadRequestException } from '@nestjs/common';

function dateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} غير صالح`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${label} غير صالح`);
  }
  return parsed;
}

export function inclusiveLeaveDays(startDate: string, endDate: string): number {
  const start = dateOnly(startDate, 'تاريخ البداية');
  const end = dateOnly(endDate, 'تاريخ النهاية');
  if (end < start) throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد البداية');
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** Monthly accrual earned through completed months in the leave's calendar year. */
export function accruedAnnualLeave(input: {
  annualQuota: number;
  previousBalance: number;
  accrualStartDate?: string | null;
  employmentStartDate?: string | null;
  asOfDate: string;
}): number {
  const asOf = dateOnly(input.asOfDate, 'تاريخ احتساب الرصيد');
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1, 12));
  const rawAnchor = input.accrualStartDate || input.employmentStartDate;
  const anchor = rawAnchor ? dateOnly(rawAnchor.slice(0, 10), 'تاريخ بداية الاستحقاق') : yearStart;
  const effectiveStart = anchor > yearStart ? anchor : yearStart;
  if (effectiveStart > asOf) return Math.max(0, input.previousBalance);

  let completedMonths =
    (asOf.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - effectiveStart.getUTCMonth());
  if (asOf.getUTCDate() < effectiveStart.getUTCDate()) completedMonths -= 1;
  completedMonths = Math.max(0, Math.min(12, completedMonths));
  const annualQuota = Math.max(0, input.annualQuota);
  return Math.max(0, input.previousBalance) + (annualQuota / 12) * completedMonths;
}
