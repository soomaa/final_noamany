import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AccountsService } from '../../src/modules/accounting/accounts.service';
import { LedgerService } from '../../src/modules/accounting/ledger.service';
import { ModuleLedgerService } from '../../src/modules/accounting/module-ledger.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const [ledgerRow] = await prisma.$queryRaw<{ value: number | string | null }[]>`
      SELECT ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) AS value
      FROM acc_journal_entry_lines l
      JOIN acc_journal_entries e ON e.id = l.entry_id
      JOIN acc_accounts a ON a.id = l.account_id
      WHERE a.code = '1.01.005'
        AND e.status IN ('posted', 'reversed')
    `;
    const [stockRow] = await prisma.$queryRaw<{ value: number | string | null }[]>`
      SELECT ROUND(COALESCE(SUM(b.current_stock * p.cost_price), 0), 2) AS value
      FROM inv_stock_balances b
      JOIN inv_products p ON p.id = b.product_id
      WHERE p.is_deleted = 0
    `;
    const ledgerValue = Number(ledgerRow?.value ?? 0);
    const stockValue = Number(stockRow?.value ?? 0);
    const difference = Math.round((stockValue - ledgerValue) * 100) / 100;
    const apply = process.argv.includes('--apply');
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', ledgerValue, stockValue, difference }));
    if (!apply || Math.abs(difference) < 0.005) return;
    if (Math.abs(difference) > 1) {
      throw new Error('فرق تقييم المخزون أكبر من حد التقريب؛ يلزم جرد فعلي بدل تسوية تلقائية');
    }

    const user = await prisma.users.findFirst({
      orderBy: { user_id: 'asc' },
      select: { user_id: true },
    });
    const moduleLedger = new ModuleLedgerService(
      new LedgerService(prisma),
      new AccountsService(prisma),
    );
    const cents = String(Math.round(Math.abs(difference) * 100)).padStart(3, '0');
    await moduleLedger.postInventoryCountAdjustment({
      adjustmentNumber: `VALUATION-ROUNDING-20260721-${cents}`,
      date: '2026-07-21',
      gainAmount: difference > 0 ? difference : 0,
      lossAmount: difference < 0 ? -difference : 0,
      createdBy: user?.user_id ?? 1,
    });
    console.log(JSON.stringify({ reconciled: Math.abs(difference) }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
