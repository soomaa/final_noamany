import { BadRequestException, ConflictException } from '@nestjs/common';

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

/** end >= start (inclusive same-day allowed) */
export function assertDateOrder(
  start: DateInput,
  end: DateInput,
  message = 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له',
): void {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) throw new BadRequestException('التواريخ غير صالحة');
  if (e < s) throw new BadRequestException(message);
}

/** Reject dates strictly before today (local midnight UTC-safe via date-only strings). */
export function assertNotPastDate(
  value: DateInput,
  message = 'لا يمكن اختيار تاريخ في الماضي',
): void {
  const d = toDate(value);
  if (!d) throw new BadRequestException('التاريخ غير صالح');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(d);
  check.setHours(0, 0, 0, 0);
  if (check < today) throw new BadRequestException(message);
}

export function assertPositive(
  value: unknown,
  fieldLabel = 'المبلغ',
  allowZero = false,
): number {
  const n = toNumber(value);
  if (n == null) throw new BadRequestException(`${fieldLabel} غير صالح`);
  if (allowZero ? n < 0 : n <= 0) {
    throw new BadRequestException(`${fieldLabel} يجب أن يكون ${allowZero ? 'موجباً أو صفراً' : 'موجباً'}`);
  }
  return n;
}

/** paid must not exceed netRemaining (after discount). */
export function assertOverpayCap(
  paid: unknown,
  netRemaining: unknown,
  message = 'المبلغ المدفوع أكبر من المستحق',
): number {
  const p = assertPositive(paid, 'المبلغ المدفوع', true);
  const net = toNumber(netRemaining);
  if (net == null || net < 0) throw new BadRequestException('المبلغ المستحق غير صالح');
  if (p > net) throw new BadRequestException(message);
  return p;
}

export interface Interval {
  start: DateInput;
  end: DateInput;
  id?: string | number;
  label?: string;
}

function intervalBounds(interval: Interval): { start: Date; end: Date } | null {
  const start = toDate(interval.start);
  const end = toDate(interval.end);
  if (!start || !end) return null;
  return { start, end };
}

/** Two intervals overlap if startA < endB && startB < endA (touching edges allowed). */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  const ia = intervalBounds(a);
  const ib = intervalBounds(b);
  if (!ia || !ib) return false;
  return ia.start < ib.end && ib.start < ia.end;
}

export function assertNoOverlap(
  candidate: Interval,
  existing: Interval[],
  message = 'يوجد تداخل مع فترة موجودة',
): void {
  for (const other of existing) {
    if (candidate.id != null && other.id != null && candidate.id === other.id) continue;
    if (intervalsOverlap(candidate, other)) {
      const detail = other.label ? `: ${other.label}` : '';
      throw new ConflictException(`${message}${detail}`);
    }
  }
}

export function assertCapacity(
  currentCount: number,
  maxCapacity: number,
  increment = 1,
  message = 'تم تجاوز السعة المتاحة',
): void {
  if (!Number.isFinite(maxCapacity) || maxCapacity < 0) return;
  if (currentCount + increment > maxCapacity) throw new BadRequestException(message);
}

export function assertWithinCap(
  value: number,
  cap: number | null | undefined,
  message?: string,
): void {
  if (cap == null || !Number.isFinite(cap)) return;
  if (value > cap) {
    throw new BadRequestException(message ?? `القيمة تتجاوز الحد المسموح (${cap})`);
  }
}

export function assertWithinRange(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
  fieldLabel = 'القيمة',
): void {
  if (min != null && value < min) {
    throw new BadRequestException(`${fieldLabel} أقل من الحد الأدنى (${min})`);
  }
  if (max != null && value > max) {
    throw new BadRequestException(`${fieldLabel} أكبر من الحد الأقصى (${max})`);
  }
}

export async function assertUnique<T>(
  findExisting: () => Promise<T | null>,
  message: string,
): Promise<void> {
  const existing = await findExisting();
  if (existing) throw new ConflictException(message);
}

export async function assertExists<T>(
  findEntity: () => Promise<T | null>,
  message: string,
): Promise<T> {
  const entity = await findEntity();
  if (!entity) throw new BadRequestException(message);
  return entity;
}

export interface CodeRange {
  from: number;
  to: number;
  id?: number;
  label?: string;
}

/** Employee/dept code ranges must have from <= to. */
export function assertCodeRangeOrder(from: unknown, to: unknown, message?: string): void {
  const a = toNumber(from);
  const b = toNumber(to);
  if (a == null || b == null) throw new BadRequestException('نطاق الأكواد غير صالح');
  if (a > b) {
    throw new BadRequestException(message ?? 'بداية نطاق الكود يجب أن تكون ≤ نهايته');
  }
}

/** Reject overlapping [from,to] ranges (touching edges allowed). */
export function assertNoCodeRangeOverlap(
  candidate: CodeRange,
  existing: CodeRange[],
  message = 'نطاق الأكواد يتداخل مع إدارة/قسم آخر',
): void {
  for (const other of existing) {
    if (candidate.id != null && other.id != null && candidate.id === other.id) continue;
    if (candidate.from <= other.to && other.from <= candidate.to) {
      const detail = other.label ? `: ${other.label}` : '';
      throw new ConflictException(`${message}${detail}`);
    }
  }
}

/** Parse attendance-rule numeric fields — reject non-numeric instead of silent zero. */
export function parseStrictNumeric(
  value: unknown,
  fieldLabel: string,
  opts?: { allowEmpty?: boolean; min?: number; max?: number },
): number {
  if (value == null || value === '') {
    if (opts?.allowEmpty) return 0;
    throw new BadRequestException(`${fieldLabel} مطلوب`);
  }
  const n = toNumber(value);
  if (n == null) throw new BadRequestException(`${fieldLabel} يجب أن يكون رقمًا`);
  if (opts?.min != null && n < opts.min) {
    throw new BadRequestException(`${fieldLabel} أقل من الحد (${opts.min})`);
  }
  if (opts?.max != null && n > opts.max) {
    throw new BadRequestException(`${fieldLabel} أكبر من الحد (${opts.max})`);
  }
  return n;
}

/** Arabic-Indic / Persian digits → Western, strip spaces. */
export function normalizeDigitString(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
}

/** Parse employee punch code — accepts Western or Arabic digits. */
export function parseEmployeeCode(value: unknown, fieldLabel = 'كود الموظف'): number {
  const normalized = normalizeDigitString(value);
  if (!normalized) throw new BadRequestException(`${fieldLabel} مطلوب`);
  const code = parseInt(normalized, 10);
  if (Number.isNaN(code)) throw new BadRequestException(`${fieldLabel} غير صالح`);
  return code;
}

/** HH:MM (24h) — start must be strictly before end unless overnight shift flagged. */
export function assertTimeOrder(
  start: string,
  end: string,
  message = 'وقت البداية يجب أن يكون قبل وقت النهاية',
): void {
  const toMin = (t: string) => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) throw new BadRequestException('صيغة الوقت غير صالحة');
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s >= e) throw new BadRequestException(message);
}

const VALID_WEEKDAYS = new Set([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
]);

export function assertValidWeekday(day: string): void {
  if (!VALID_WEEKDAYS.has(day.trim())) {
    throw new BadRequestException('يوم الإجازة الأسبوعية غير صالح');
  }
}
