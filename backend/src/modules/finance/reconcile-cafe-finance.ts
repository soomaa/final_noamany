import { Prisma, PrismaClient } from '@prisma/client';
import { syncCafeSaleFinance } from './cafe-finance.util';
import { syncDrawerFinance } from './drawer-finance.util';
import { localDateString } from '../sales/sales.utils';

/** Repair café-owned projections only; payroll remains behind its host adapter. */
export async function reconcileCafeFinance(
  db: PrismaClient,
  range?: { from: string; to: string; branches: number[] | null },
) {
  let cursor = 0;
  let sales = 0;
  let drawer = 0;
  for (;;) {
    const batch = await db.sales_quick_sales.findMany({
      where: {
        id: { gt: cursor },
        status: { in: ['completed', 'refunded', 'cancelled'] },
        ...(range
          ? {
              sale_date: { gte: range.from, lte: range.to },
              ...(range.branches === null ? {} : { branch_id: { in: range.branches } }),
            }
          : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    if (!batch.length) break;
    for (const { id } of batch) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id = ${id} FOR UPDATE`);
        const sale = await tx.sales_quick_sales.findUniqueOrThrow({
          where: { id },
          include: { events: { orderBy: { created_at: 'asc' } } },
        });
        const reversed = sale.status === 'cancelled' || sale.status === 'refunded';
        if (reversed && !sale.events.some((event) => ['completed', 'finalized'].includes(event.event_type))) return;
        const event = reversed ? sale.events.find((row) => row.event_type === sale.status) : undefined;
        if (reversed && !event) return;
        await syncCafeSaleFinance(
          tx,
          sale,
          event ? { date: localDateString(event.created_at), createdBy: event.created_by } : undefined,
        );
        sales += 1;
      });
      cursor = id;
    }
  }

  cursor = 0;
  for (;;) {
    const batch = await db.sales_cash_drawer_transactions.findMany({
      where: { id: { gt: cursor }, movement_type: 'petty_expense', status: 'posted' },
      orderBy: { id: 'asc' },
      take: 100,
    });
    if (!batch.length) break;
    for (const row of batch) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_cash_drawer_transactions WHERE id = ${row.id} FOR UPDATE`);
        await syncDrawerFinance(tx, row);
      });
      cursor = row.id;
      drawer += 1;
    }
  }
  return { sales, drawer };
}
