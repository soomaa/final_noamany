import { Prisma } from '@prisma/client';
import { cairoDateString } from '../../common/utils/cairo-date';

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

