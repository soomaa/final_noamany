import { BadRequestException } from '@nestjs/common';
import { ClubPaymentMethod, ClubSubStatus } from '@prisma/client';
import { localDateString, parseDateOnly } from '../club-members/club-member.utils';

/** Legacy sentinel previously used for session packages with no calendar expiry. */
export const OPEN_ENDED_SUBSCRIPTION_END = '2099-12-31';

/** Default calendar validity for session packages (حصص) when type.days is unset. */
export const DEFAULT_SESSION_PACKAGE_DAYS = 30;

export function isOpenEndedEndDate(endDate: string | null | undefined): boolean {
  return !!endDate && endDate >= '2099-01-01';
}

/** Normalize any free-text/enum payment method to the ClubPaymentMethod enum (or null). */
export function toClubPaymentMethod(v?: string | null): ClubPaymentMethod | null {
  if (!v) return null;
  const m = v.trim().toLowerCase();
  const exact: ClubPaymentMethod[] = [
    'cash',
    'card',
    'bank',
    'online',
    'visa',
    'transfer',
    'wallet',
    'instapay',
  ];
  if (exact.includes(m as ClubPaymentMethod)) return m as ClubPaymentMethod;
  if (m.includes('insta') || m.includes('إنستا') || m.includes('انستا')) return 'instapay';
  if (m.includes('wallet') || m.includes('محفظ')) return 'wallet';
  if (m.includes('visa') || m.includes('فيزا')) return 'visa';
  if (m.includes('bank account') || m.includes('حساب بنكي')) return 'bank';
  if (m.includes('transfer') || m.includes('تحويل')) return 'transfer';
  if (m.includes('bank') || m.includes('بنك')) return 'bank';
  if (m.includes('card') || m.includes('بطاق')) return 'card';
  if (m.includes('online') || m.includes('electronic') || m.includes('إلكترون')) return 'online';
  return 'cash';
}

export function deriveSubStatus(startDate: string, endDate: string): ClubSubStatus {
  const today = parseDateOnly(localDateString());
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (today < start) return 'upcoming';
  if (today > end) return 'expired';
  return 'active';
}

/**
 * Status for session packages (حصص): active from start until either the calendar end
 * date passes or sessions are exhausted. Legacy open-ended rows (2099) only expire by count.
 */
export function deriveSessionAwareStatus(opts: {
  startDate: string;
  endDate: string;
  isLinkedToSessions: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
}): ClubSubStatus {
  if (!opts.isLinkedToSessions) {
    return deriveSubStatus(opts.startDate, opts.endDate);
  }
  const today = parseDateOnly(localDateString());
  const start = parseDateOnly(opts.startDate);
  if (today < start) return 'upcoming';
  if (!isOpenEndedEndDate(opts.endDate) && today > parseDateOnly(opts.endDate)) {
    return 'expired';
  }
  if (opts.sessionsCount != null) {
    const remaining = Math.max(0, opts.sessionsCount - (opts.sessionsUsed ?? 0));
    if (remaining <= 0) return 'expired';
  }
  return 'active';
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * End date for a new/updated subscription.
 * Session packages (حصص) default to start + 30 days when type days are unset/zero.
 */
export function resolveSubscriptionEndDate(
  startDate: string,
  days: number,
  isLinkedToSessions: boolean,
): string {
  if (isLinkedToSessions) {
    const validityDays = days > 0 ? days : DEFAULT_SESSION_PACKAGE_DAYS;
    return addDays(startDate, validityDays);
  }
  return addDays(startDate, days);
}

/** MySQL UNSIGNED aggregates may return bigint — normalize before arithmetic. */
export function nextSeqFromMax(maxNum: unknown): number {
  if (maxNum == null) return 1;
  if (typeof maxNum === 'bigint') return Number(maxNum) + 1;
  if (typeof maxNum === 'number') return maxNum + 1;
  const n = Number(maxNum);
  return Number.isFinite(n) ? n + 1 : 1;
}

export function daysBetween(start: string, end: string): number {
  const ms = parseDateOnly(end).getTime() - parseDateOnly(start).getTime();
  return Math.ceil(ms / 86400000);
}

/**
 * Resolve charge for buying `selectedSessions` from a session package.
 * Prefer an explicit matrix row; otherwise fall back to proportional price/N × k.
 */
export function resolveSessionMatrixPrice(opts: {
  packagePrice: number;
  maxSessions: number;
  selectedSessions: number;
  matrix?: Array<{ sessionsCount: number; price: number }> | null;
}): number {
  const selected = Math.max(1, Math.floor(opts.selectedSessions) || 1);
  const max = Math.max(1, Math.floor(opts.maxSessions) || 1);
  const clamped = Math.min(selected, max);
  const hit = opts.matrix?.find((row) => row.sessionsCount === clamped);
  if (hit && Number.isFinite(hit.price)) return roundMoney(hit.price);
  return roundMoney((opts.packagePrice / max) * clamped);
}

/** Build default 1..N matrix from package price (unit = price / N). */
export function buildDefaultSessionPriceMatrix(
  packagePrice: number,
  sessionsCount: number,
): Array<{ sessionsCount: number; price: number }> {
  const max = Math.max(0, Math.floor(sessionsCount) || 0);
  if (max < 1) return [];
  const unit = packagePrice / max;
  return Array.from({ length: max }, (_, i) => ({
    sessionsCount: i + 1,
    price: roundMoney(unit * (i + 1)),
  }));
}

export function netValue(
  subscriptionValue: number,
  discountEnabled: boolean,
  discountValue: number,
): number {
  return subscriptionValue - (discountEnabled ? discountValue : 0);
}

export function remainingAmount(
  subscriptionValue: number,
  discountEnabled: boolean,
  discountValue: number,
  paidAmount: number,
): number {
  const discount = discountEnabled ? discountValue : 0;
  return Math.max(0, subscriptionValue - discount - paidAmount);
}

export function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

/** Round a monetary value to 2 decimals — same rounding the ledger uses (Math.round(x*100)/100). */
export function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

/** One tender line of a receipt: this much money arrived through this method. */
export interface ClubPaymentSplit {
  method: ClubPaymentMethod;
  amount: number;
}

/** Collapse repeats so a receipt never stores the same method twice. Order of first use is kept. */
export function mergeClubPayments(rows: ClubPaymentSplit[]): ClubPaymentSplit[] {
  const byMethod = new Map<ClubPaymentMethod, number>();
  for (const r of rows) {
    byMethod.set(r.method, roundMoney((byMethod.get(r.method) ?? 0) + r.amount));
  }
  return [...byMethod].map(([method, amount]) => ({ method, amount }));
}

/**
 * Build the tender breakdown for a collection of `total`.
 *
 * `payments` is the split the user entered; when it is empty the whole amount falls back to the
 * single `paymentMethod`, so callers get the same shape whether or not the receipt was split.
 * A split that doesn't add up is rejected rather than silently adjusted — letting it through would
 * desync the receipt amount from treasury and produce an unbalanced journal entry.
 */
export function resolveClubPayments(
  total: number,
  paymentMethod?: string | null,
  payments?: { method?: string | null; amount?: number | null }[] | null,
): ClubPaymentSplit[] {
  const expected = roundMoney(total);
  if (expected <= 0) return [];

  const rows = (payments ?? [])
    .map((p) => ({
      method: toClubPaymentMethod(p.method) ?? 'cash',
      amount: roundMoney(Number(p.amount) || 0),
    }))
    .filter((p) => p.amount > 0);

  if (rows.length === 0) {
    return [{ method: toClubPaymentMethod(paymentMethod) ?? 'cash', amount: expected }];
  }

  const sum = roundMoney(rows.reduce((s, p) => s + p.amount, 0));
  if (sum !== expected) {
    throw new BadRequestException(
      `مجموع طرق الدفع (${sum}) لا يساوي المبلغ المدفوع (${expected})`,
    );
  }
  return mergeClubPayments(rows);
}

/**
 * Dominant method of a split, used for the denormalized `payment_method` header column that
 * older screens and reports still read. Biggest slice wins; ties keep the first-entered method.
 */
export function primaryClubPaymentMethod(
  rows: ClubPaymentSplit[],
): ClubPaymentMethod | null {
  let best: ClubPaymentSplit | null = null;
  for (const r of rows) {
    if (!best || r.amount > best.amount) best = r;
  }
  return best?.method ?? null;
}
