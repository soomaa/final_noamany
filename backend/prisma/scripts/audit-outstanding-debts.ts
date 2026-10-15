/* eslint-disable no-console */
/**
 * Read-only audit of the club subscription outstanding ("المديونيات") report.
 *
 * Reproduces exactly what `GET /club-subscriptions/outstanding-report` lists
 * (remaining_amount > 0) and, for every row, shows where that number came from:
 * the stored money columns, the receipts actually booked against the
 * subscription, and the difference between the two.
 *
 * Writes nothing. Safe to run on production.
 *
 * Run: npx ts-node prisma/scripts/audit-outstanding-debts.ts (uses DATABASE_URL).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const money = (v: number): string => v.toFixed(2).padStart(10);

/** Same formula the API uses: value − (discount if enabled) − paid − waived − transferred credit. */
function expectedRemaining(row: {
  subscription_value: unknown;
  discount_enabled: boolean;
  discount_value: unknown;
  paid_amount: unknown;
  waived_amount: unknown;
  transferred_credit_amount: unknown;
}): number {
  const net = num(row.subscription_value) - (row.discount_enabled ? num(row.discount_value) : 0);
  const covered = num(row.paid_amount) + num(row.waived_amount) + num(row.transferred_credit_amount);
  return Math.max(0, Math.round((net - covered) * 100) / 100);
}

async function main() {
  const rows = await prisma.club_subscriptions.findMany({
    where: { remaining_amount: { gt: 0 } },
    orderBy: [{ remaining_amount: 'desc' }, { registration_date: 'desc' }],
  });

  const receiptSums = new Map<number, number>();
  const refundSums = new Map<number, number>();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const receipts = await prisma.club_receipts.groupBy({
      by: ['subscription_id'],
      where: { subscription_id: { in: ids } },
      _sum: { amount: true },
    });
    for (const r of receipts) {
      if (r.subscription_id != null) receiptSums.set(r.subscription_id, num(r._sum.amount));
    }
    const refunds = await prisma.club_subscription_refunds.groupBy({
      by: ['subscription_id'],
      where: { subscription_id: { in: ids }, status: 'completed' },
      _sum: { refund_amount: true },
    });
    for (const r of refunds) {
      if (r.subscription_id != null) refundSums.set(r.subscription_id, num(r._sum.refund_amount));
    }
  }

  console.log(`\nOutstanding subscriptions: ${rows.length}`);
  console.log(
    `Total shown as debt: ${rows.reduce((s, r) => s + num(r.remaining_amount), 0).toFixed(2)}\n`,
  );

  // Which debt amounts repeat — a single value repeated across many members usually
  // means the price was recorded but the collected money never was.
  const byAmount = new Map<string, number>();
  for (const r of rows) {
    const key = num(r.remaining_amount).toFixed(2);
    byAmount.set(key, (byAmount.get(key) ?? 0) + 1);
  }
  console.log('Most repeated debt amounts:');
  for (const [amount, count] of [...byAmount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${money(Number(amount))} × ${count}`);
  }

  const neverPaid = rows.filter((r) => num(r.paid_amount) === 0 && !receiptSums.get(r.id));
  const formulaMismatch = rows.filter(
    (r) => Math.abs(num(r.remaining_amount) - expectedRemaining(r)) > 0.01,
  );
  const receiptMismatch = rows.filter((r) => {
    const booked = receiptSums.get(r.id) ?? 0;
    const refunded = refundSums.get(r.id) ?? 0;
    return Math.abs(num(r.paid_amount) - (booked - refunded)) > 0.01;
  });

  console.log(`\nFull price still owed, no receipt at all : ${neverPaid.length}`);
  console.log(`remaining_amount ≠ formula               : ${formulaMismatch.length}`);
  console.log(`paid_amount ≠ receipts − refunds         : ${receiptMismatch.length}`);

  console.log('\nsub#            | member            | value | disc | paid | waiv | xfer |  stored | expected | receipts | refunds');
  for (const r of rows.slice(0, 200)) {
    console.log(
      [
        String(r.subscription_number).padEnd(15),
        String(r.customer_name ?? '').slice(0, 17).padEnd(17),
        money(num(r.subscription_value)),
        money(r.discount_enabled ? num(r.discount_value) : 0),
        money(num(r.paid_amount)),
        money(num(r.waived_amount)),
        money(num(r.transferred_credit_amount)),
        money(num(r.remaining_amount)),
        money(expectedRemaining(r)),
        money(receiptSums.get(r.id) ?? 0),
        money(refundSums.get(r.id) ?? 0),
      ].join(' | '),
    );
  }
  if (rows.length > 200) console.log(`… ${rows.length - 200} more rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
