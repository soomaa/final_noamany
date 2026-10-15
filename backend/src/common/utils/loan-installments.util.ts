import { BadRequestException } from '@nestjs/common';
import { cairoMidnightUtc, dateOnlyParts } from './cairo-date';

/** Mirrors Solaf_requests_model.php installment generation with deterministic calendar dates. */
export interface LoanInstallmentDraft {
  no: number;
  dueDate: string;
  amount: number;
  month: number;
  year: number;
  qstDate: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Add whole calendar months to a canonical YYYY-MM-DD date.
 * Preserve end-of-month; otherwise preserve the day when it exists and clamp
 * to the target month's final day when it does not.
 */
export function addCalendarMonths(value: string, months: number): string {
  if (!Number.isInteger(months)) throw new BadRequestException('عدد الشهور يجب أن يكون عددًا صحيحًا');
  const source = dateOnlyParts(value);
  const sourceLastDay = daysInMonth(source.year, source.month);
  const absoluteMonth = source.year * 12 + source.month - 1 + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  const targetLastDay = daysInMonth(targetYear, targetMonth);
  const targetDay = source.day === sourceLastDay
    ? targetLastDay
    : Math.min(source.day, targetLastDay);
  return formatDateOnly(targetYear, targetMonth, targetDay);
}

function canonicalInstallmentDate(dueDate: string) {
  const { year, month } = dateOnlyParts(dueDate);
  return {
    dueDate,
    year,
    month,
    qstDate: String(Math.floor(cairoMidnightUtc(dueDate).getTime() / 1000)),
  };
}

export function buildLoanInstallments(
  qemtSolaf: number,
  qstNum: number,
  khsmFormDateM: string,
): LoanInstallmentDraft[] {
  if (!Number.isInteger(qstNum) || qstNum <= 0) return [];
  dateOnlyParts(khsmFormDateM);

  const qustValue = qemtSolaf / qstNum;
  const qustRemain = (qustValue - Math.round(qustValue)) * qstNum;
  const installments: LoanInstallmentDraft[] = [];

  for (let i = 0; i < qstNum; i++) {
    const due = canonicalInstallmentDate(addCalendarMonths(khsmFormDateM, i));
    const amount = i === qstNum - 1 ? Math.round(qustValue) + qustRemain : Math.round(qustValue);
    installments.push({
      no: i + 1,
      amount,
      ...due,
    });
  }
  return installments;
}

export function khsmToDateM(khsmFormDateM: string, qstNum: number): string {
  if (!Number.isInteger(qstNum) || qstNum <= 0) {
    throw new BadRequestException('عدد الأقساط يجب أن يكون أكبر من صفر');
  }
  return addCalendarMonths(khsmFormDateM, qstNum - 1);
}
