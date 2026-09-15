import { Prisma, sales_cash_drawer_transactions } from '@prisma/client';
import { recordSystemExpense } from './system-expense.util';
import { localDateString } from '../sales/sales.utils';

export async function syncDrawerFinance(tx: Prisma.TransactionClient, row: sales_cash_drawer_transactions) {
  // Custody is an advance, not an expense. Finance-originated drawer withdrawals already have a record.
  if (
    row.movement_type !== 'petty_expense'
    || row.status !== 'posted'
    || row.reference.startsWith('FIN-EXP-')
  ) return;
  await recordSystemExpense(tx, {
    invoiceNumber: `DRAWER-${row.id}`, date: localDateString(row.created_at),
    category: row.category === 'maintenance' ? 'صيانة' : 'مصروفات تشغيل الكافيه',
    amount: Number(row.amount), description: row.description ?? `مصروف درج ${row.reference}`,
    branchId: row.branch_id ?? undefined, createdBy: row.created_by ?? undefined, paymentMethod: 'نقدي',
  });
}

