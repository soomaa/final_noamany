import { syncDrawerFinance } from './drawer-finance.util';
import { PrismaClient, Prisma } from '@prisma/client';
import { syncCafeSaleFinance } from './cafe-finance.util';
import { recordSystemExpense } from './system-expense.util';
import { localDateString } from '../sales/sales.utils';

/** Repair projections, never create sales, pay salaries, or post ledger entries. Safe to rerun. */
export async function reconcileCafeFinance(db: PrismaClient, range?: { from: string; to: string; branches: number[] | null }) {
  let cursor = 0;
  let sales = 0;
  let payroll = 0;
  for (;;) {
    const batch = await db.sales_quick_sales.findMany({
      where: { id: { gt: cursor }, status: { in: ['completed', 'refunded', 'cancelled'] },
        ...(range ? { sale_date: { gte: range.from, lte: range.to }, ...(range.branches === null ? {} : { branch_id: { in: range.branches } }) } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: 100,
    });
    if (!batch.length) break;
    for (const { id } of batch) {
      await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_quick_sales WHERE id = ${id} FOR UPDATE`);
        const sale = await tx.sales_quick_sales.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { created_at: 'asc' } } } });
        const reversed = sale.status === 'cancelled' || sale.status === 'refunded';
        if (reversed && !sale.events.some(event => ['completed', 'finalized'].includes(event.event_type))) return;
        const event = reversed ? sale.events.find(event => event.event_type === sale.status) : undefined;
        if (reversed && !event) return;
        await syncCafeSaleFinance(tx, sale, event ? { date: localDateString(event.created_at), createdBy: event.created_by } : undefined);
        sales++;
      });
      cursor = id;
    }
  }
  if (range) return { sales, payroll };
  // ONE80 payroll is owned by the existing HR engine, not a second net-pay ledger.
  // Recover only the expense projection of active, persisted payroll accruals.
  cursor = 0;
  for (;;) {
    const batch = await db.acc_journal_entries.findMany({
      where: { id: { gt: cursor }, status: 'posted', source_module: 'payroll', source_doc_type: 'payroll_accrual', reverses_id: null, reversed_by_id: null },
      orderBy: { id: 'asc' }, take: 100, include: { lines: { include: { account: true } } },
    });
    if (!batch.length) break;
    for (const entry of batch) {
      cursor = entry.id;
      const match = /^(\d+):branch:(\d+|global)$/.exec(entry.source_doc_id ?? '');
      if (!match) continue;
      const amount = entry.lines.filter(line => line.account.account_type === 'expense').reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);
      await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM acc_journal_entries WHERE id = ${entry.id} FOR UPDATE`);
        const current = await tx.acc_journal_entries.findUnique({ where: { id: entry.id } });
        if (!current || current.status !== 'posted' || current.reversed_by_id) return;
        await recordSystemExpense(tx, {
          invoiceNumber: `PAYROLL-${match[1]}-BR-${entry.branch_id ?? 'GLOBAL'}`,
          date: entry.date, category: 'رواتب', subCategory: 'مسيّرة رواتب', amount,
          description: entry.description ?? `مستحقات المسير ${match[1]}`,
          branchId: entry.branch_id ?? undefined, createdBy: entry.created_by ?? undefined,
          paymentMethod: 'تسوية',
        });
        payroll++;
      });
    }
  }
  cursor = 0;
  for (;;) {
    const batch = await db.sales_cash_drawer_transactions.findMany({ where: { id: { gt: cursor }, movement_type: 'petty_expense', status: 'posted' }, orderBy: { id: 'asc' }, take: 100 });
    if (!batch.length) break;
    for (const row of batch) {
      await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_cash_drawer_transactions WHERE id = ${row.id} FOR UPDATE`);
        await syncDrawerFinance(tx, row);
      });
      cursor = row.id;
    }
  }
  return { sales, payroll };
}
