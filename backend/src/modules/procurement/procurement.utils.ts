import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export { notDeletedFilter, toDecimal, toNumber } from '../inventory/inventory.utils';

export function isStockPostingReturnStatus(status: string): boolean {
  return status === 'معتمد' || status === 'مكتمل';
}

export async function generateQpoNumber(
  prisma: PrismaService | Prisma.TransactionClient,
): Promise<string> {
  const rows = await prisma.$queryRaw<{ maxNum: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(order_number, 5) AS UNSIGNED)) AS maxNum
    FROM prc_quick_purchase_orders WHERE order_number LIKE 'QPO-%'
  `;
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  return `QPO-${String(next).padStart(6, '0')}`;
}

export async function generatePurchaseReturnNumber(
  prisma: PrismaService | Prisma.TransactionClient,
): Promise<string> {
  const rows = await prisma.$queryRaw<{ maxNum: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(return_number, 4) AS UNSIGNED)) AS maxNum
    FROM prc_purchase_returns WHERE return_number LIKE 'PR-%'
  `;
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  return `PR-${String(next).padStart(6, '0')}`;
}

/** Transaction-safe document number from a table column. */
export async function nextDocNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  table: string,
  column: string,
  prefix: string,
  pad = 6,
): Promise<string> {
  // SQL SUBSTRING is one-based. The numeric part starts after both the
  // prefix and its separator (for example `SINV-000001` starts at 6).
  // Starting on the separator makes MySQL cast `-000001` to an unsigned
  // overflow value, which Prisma reports as P2010 once a document exists.
  const numberStart = prefix.length + 2;
  const rows = await prisma.$queryRawUnsafe<{ maxNum: number | null }[]>(
    `SELECT MAX(CAST(SUBSTRING(\`${column}\`, ${numberStart}) AS UNSIGNED)) AS maxNum
     FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
    `${prefix}-%`,
  );
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  return `${prefix}-${String(next).padStart(pad, '0')}`;
}

export const RFQ_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['quotes_received', 'cancelled'],
  quotes_received: ['under_comparison', 'cancelled'],
  under_comparison: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const GRN_STOCK_POSTING_STATUSES = ['completed', 'partial'];

export async function generateRequisitionNumber(
  prisma: PrismaService | Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  return nextDocNumber(prisma, 'prc_requisitions', 'request_number', `PR-${year}`, 4);
}

export function lineTotal(qty: number, price: number): number {
  return Math.round(qty * price * 100) / 100;
}

export async function getProcurementSettings(
  prisma: PrismaService | Prisma.TransactionClient,
) {
  let row = await prisma.prc_procurement_settings.findFirst({ orderBy: { id: 'asc' } });
  if (!row) {
    row = await prisma.prc_procurement_settings.create({ data: {} });
  }
  return row;
}
