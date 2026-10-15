import { Prisma } from '@prisma/client';

export function toNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function toDecimal(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

export function notDeletedFilter(): { is_deleted: false } {
  return { is_deleted: false };
}
