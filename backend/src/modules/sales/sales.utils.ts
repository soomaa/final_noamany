import { Prisma } from '@prisma/client';

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

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ }).format(date);
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

export function computeSaleTotals(
  items: { unitPrice: number; quantity: number }[],
  discountPercentage = 0,
  taxPercentage = 15,
  /** Fixed discount in money; overrides the percentage and is capped at the subtotal. */
  fixedDiscountAmount?: number,
) {
  const lineItems = items.map((i) => ({
    ...i,
    lineTotal: roundMoney(i.unitPrice * i.quantity),
  }));
  const subtotal = roundMoney(lineItems.reduce((s, i) => s + i.lineTotal, 0));
  const discountAmount = fixedDiscountAmount != null
    ? roundMoney(Math.min(Math.max(fixedDiscountAmount, 0), subtotal))
    : roundMoney(subtotal * (discountPercentage / 100));
  const taxable = roundMoney(subtotal - discountAmount);
  const taxAmount = roundMoney(taxable * (taxPercentage / 100));
  const totalAmount = roundMoney(taxable + taxAmount);
  return { lineItems, subtotal, discountAmount, taxAmount, totalAmount };
}
