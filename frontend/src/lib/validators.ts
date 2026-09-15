/** Mirror of backend validation helpers for frontend forms (throws Error). */
import { uiStatic } from '@/lib/ui-static';

export type DateInput = Date | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function validateDateOrder(start: DateInput, end: DateInput, message?: string): string | null {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return uiStatic('التواريخ غير صالحة');
  if (e < s) return message ?? uiStatic('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
  return null;
}

export function validatePositive(value: unknown, allowZero = false): string | null {
  const n = toNumber(value);
  if (n == null) return uiStatic('قيمة غير صالحة');
  if (allowZero ? n < 0 : n <= 0) return allowZero ? uiStatic('يجب أن تكون موجبة أو صفر') : uiStatic('يجب أن تكون موجبة');
  return null;
}

export function validateOverpayCap(paid: unknown, netRemaining: unknown): string | null {
  const p = toNumber(paid);
  const net = toNumber(netRemaining);
  if (p == null || net == null || p < 0) return uiStatic('المبلغ غير صالح');
  if (p > net) return uiStatic('المبلغ المدفوع أكبر من المستحق');
  return null;
}

export function validateNotPastDate(value: DateInput, message?: string): string | null {
  const d = toDate(value);
  if (!d) return uiStatic('التاريخ غير صالح');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(d);
  check.setHours(0, 0, 0, 0);
  if (check < today) return message ?? uiStatic('لا يمكن اختيار تاريخ في الماضي');
  return null;
}

export function computeEndDateFromDuration(start: string, durationDays: number): string {
  const d = new Date(start);
  d.setDate(d.getDate() + durationDays - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeBmi(weightKg: number, heightCm: number): number | null {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function isDryRunResponse(data: unknown): data is {
  dryRun: true;
  preview: unknown;
  rows?: { label: string; before?: string; after?: string }[];
  warning?: string;
} {
  return typeof data === 'object' && data != null && (data as { dryRun?: boolean }).dryRun === true;
}
