import { hr_mosayer } from '@prisma/client';

export type PayrollRunStatus =
  | 'draft'
  | 'computed'
  | 'reviewing'
  | 'approved'
  | 'posted'
  | 'banked'
  | 'completed';

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/** Payroll period: 26th of previous month → 25th of current (legacy Employee_salaries). */
export function payrollPeriod(month: number, year: number): {
  fromDate: string;
  toDate: string;
  prevMonth: number;
  prevYear: number;
} {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  const fromDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`;
  const toDate = `${year}-${String(month).padStart(2, '0')}-25`;
  return { fromDate, toDate, prevMonth, prevYear };
}

export function monthLabel(month: number): string {
  return AR_MONTHS[month - 1] ?? String(month);
}

export function runTitle(month: number, year: number): string {
  return `مسيرة رواتب ${monthLabel(month)} ${year}`;
}

/** Map legacy hr_mosayer suspend/taghez fields → frontend PayrollStepper status. */
export function mapRunStatus(row: hr_mosayer): PayrollRunStatus {
  if (row.finish_sarf_date) return 'completed';
  if (row.file_downloded || row.tanfez_ezn_sarf === 'yes') return 'banked';
  if (row.halet_sarf === 'yes') return 'posted';
  if (row.approved === 1 || row.suspend_moder_3am === 'yes') return 'approved';
  if (
    row.suspend_mohasb === 'yes' ||
    row.suspend_direct_manager === 'yes' ||
    row.suspend_moder_mali === 'yes'
  ) {
    return 'reviewing';
  }
  if (row.taghez === 'yes') return 'computed';
  return 'draft';
}

export function decimal(n: unknown): number {
  if (n == null) return 0;
  return Number(n);
}

export function todayAr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeAr(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
