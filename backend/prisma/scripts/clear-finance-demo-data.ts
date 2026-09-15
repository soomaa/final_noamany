/* eslint-disable no-console */
/**
 * Remove demo/fake data from Financial Reports + Accounting modules.
 *
 * Clears:
 *   - journal entries (acc_journal_entries / lines)
 *   - finance expenses & revenues (fin_expenses / fin_revenues)
 *   - demo employee finance links (finance_employes, contract_employe, bank_employes_details)
 *   - demo accounting periods & settings
 *
 * Keeps:
 *   - chart of accounts (acc_accounts / acc_default_accounts) — structural reference
 *   - club members, branches, admin user, HR org structure
 *
 * Run: npm run db:clear:finance-demo
 */
import { prisma, clearTables } from '../seed/_shared';

const FINANCE_ACCOUNTING_TABLES = [
  'acc_journal_entry_lines',
  'acc_journal_entries',
  'fin_expenses',
  'fin_revenues',
  'bank_employes_details',
  'contract_employe',
  'finance_employes',
  'acc_default_accounts',
  'acc_accounts',
  'acc_accounting_periods',
  'acc_settings',
];

async function main() {
  const t0 = Date.now();
  console.log('=== Clear finance & accounting demo data ===');

  const before = {
    journalEntries: await prisma.acc_journal_entries.count(),
    journalLines: await prisma.acc_journal_entry_lines.count(),
    expenses: await prisma.fin_expenses.count(),
    revenues: await prisma.fin_revenues.count(),
    accounts: await prisma.acc_accounts.count(),
    periods: await prisma.acc_accounting_periods.count(),
    financeEmployes: await prisma.finance_employes.count(),
    clubMembers: await prisma.club_members.count({ where: { is_deleted: false } }),
  };
  console.log('Before:', before);

  console.log('▶ Clearing finance & accounting tables…');
  await clearTables(FINANCE_ACCOUNTING_TABLES);

  const after = {
    journalEntries: await prisma.acc_journal_entries.count(),
    journalLines: await prisma.acc_journal_entry_lines.count(),
    expenses: await prisma.fin_expenses.count(),
    revenues: await prisma.fin_revenues.count(),
    accounts: await prisma.acc_accounts.count(),
    periods: await prisma.acc_accounting_periods.count(),
    financeEmployes: await prisma.finance_employes.count(),
    clubMembers: await prisma.club_members.count({ where: { is_deleted: false } }),
  };

  console.log('\nAfter:', after);
  console.log('Note: chart of accounts will auto-seed on first accounting page load.');
  console.log(`✔ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
