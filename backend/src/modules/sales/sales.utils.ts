import { Prisma } from '@prisma/client';
import { cairoDateString } from '../../common/utils/cairo-date';

/**
 * The café no longer uses a separate "daily" collection cycle: every deferred employee/partner
 * invoice is collected monthly (one statement, one payroll deduction). Legacy rows and old cached
 * clients may still say "daily"; they are treated as monthly everywhere.
 */
export const DEFERRED_BILLING_CYCLES = ['daily', 'monthly'] as const;

/**
 * True when a saved invoice holds exactly the cart of an incoming request (same products, sizes,
 * bundles and quantities). An idempotent replay is only allowed for the SAME cart; a different
 * cart carrying a reused attempt id is a new sale and must be recorded, never silently dropped.
 */
export function sameSaleCart(
  requested: Array<{ bundleId?: number | null; bundleSelections?: Array<{ groupId: number; cafeProductId: number; cafeVariantId?: number | null }>; cafeProductId?: number | null; cafeVariantId?: number | null; productId?: number | null; quantity: number | string }>,
  saved: Array<{ bundle_id?: number | null; bundle_selection?: unknown; cafe_product_id?: number | null; cafe_variant_id?: number | null; product_id?: number | null; quantity: unknown }>,
): boolean {
  const explicitBundleChoices = new Set(requested.filter(item => item.bundleId && item.bundleSelections?.length).map(item => item.bundleId));
  const selectionsKey = (value: unknown) => JSON.stringify((Array.isArray(value) ? value : [])
    .map(selection => [selection.groupId, selection.cafeProductId, selection.cafeVariantId ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const bundleKey = (id: number, selections: unknown) => `b${id}${explicitBundleChoices.has(id) ? selectionsKey(selections) : ''}`;
  const tally = (rows: Array<[string, number]>) => {
    const m = new Map<string, number>();
    for (const [k, q] of rows) m.set(k, Math.round(((m.get(k) ?? 0) + q) * 1000) / 1000);
    return m;
  };
  const a = tally(requested.map((i) => [
    i.bundleId ? bundleKey(i.bundleId, i.bundleSelections) : i.cafeProductId ? `c${i.cafeProductId}v${i.cafeVariantId ?? 0}` : `p${i.productId ?? 0}`,
    Number(i.quantity),
  ]));
  const b = tally(saved.map((i) => [
    i.bundle_id ? bundleKey(i.bundle_id, i.bundle_selection) : i.cafe_product_id ? `c${i.cafe_product_id}v${i.cafe_variant_id ?? 0}` : `p${i.product_id ?? 0}`,
    Number(i.quantity),
  ]));
  if (a.size !== b.size) return false;
  for (const [k, q] of a) if (b.get(k) !== q) return false;
  return true;
}
export function normalizeBillingCycle<T extends string | null | undefined>(cycle: T): T | 'monthly' {
  return cycle === 'daily' ? 'monthly' : cycle;
}

const EGYPT_TZ = 'Africa/Cairo';

export function toNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function toDecimal(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The POS may override the configured default for this invoice only. */
export function resolvePosDiscountPercentage(
  requested: number | null | undefined,
  configuredDefault: number,
): number {
  const value = requested ?? configuredDefault;
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return cairoDateString(date);
}

/** Local time HH:MM:SS (Egypt). */
export function localTimeString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}:${get('second')}`;
}

export function allocateFreeDrinks(items: { quantity: number; eligible: boolean }[], remaining: number): number[] {
  let available = Math.max(0, Math.floor(remaining));
  return items.map((item) => {
    const count = item.eligible ? Math.min(available, Math.max(0, Math.floor(item.quantity))) : 0;
    available -= count;
    return count;
  });
}

export function computeSaleTotals(
  items: { unitPrice: number; quantity: number; freeQuantity?: number }[],
  discountPercentage = 0,
  taxPercentage = 15,
) {
  const lineItems = items.map((i) => ({
    ...i,
    lineTotal: roundMoney(i.unitPrice * i.quantity),
  }));
  const subtotal = roundMoney(lineItems.reduce((s, i) => s + i.lineTotal, 0));
  const freeAmount = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * Math.min(item.quantity, Math.max(0, item.freeQuantity ?? 0)), 0));
  const discountAmount = roundMoney(freeAmount + (subtotal - freeAmount) * (discountPercentage / 100));
  const taxable = roundMoney(subtotal - discountAmount);
  const taxAmount = roundMoney(taxable * (taxPercentage / 100));
  const totalAmount = roundMoney(taxable + taxAmount);
  return { lineItems, subtotal, discountAmount, taxAmount, totalAmount };
}
