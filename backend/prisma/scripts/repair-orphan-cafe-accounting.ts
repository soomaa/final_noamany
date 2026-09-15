import { Prisma, PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Db = PrismaClient | Prisma.TransactionClient;

const REQUIRED_ACK = 'DELETE_ORPHAN_CAFE_ACCOUNTING_ONLY';
const ROLLBACK_TEST = 'CAFE_ACCOUNTING_REPAIR_ROLLBACK_TEST';

const ORPHAN_CAFE_EXPENSE_SQL = `
  expense.invoice_number LIKE 'WASTE-%'
  AND expense.category = 'مخزون'
  AND expense.sub_category = 'هالك كافيه'
  AND expense.payment_method = 'تسوية مخزون'
  AND expense.description LIKE 'هالك خامات منتجات مُحضّرة%'
  AND NOT EXISTS (
    SELECT 1
    FROM sales_quick_sales sale
    WHERE sale.sale_number = SUBSTRING(expense.invoice_number, 7)
  )
`;

/**
 * Accounting rows left behind after the one-time Cafe reset.
 *
 * Every target must have a recognisable Cafe/procurement document reference AND no surviving
 * source document. Explicit collation keeps comparisons safe across legacy tables that were
 * created with different utf8mb4 collations.
 */
const ORPHAN_CAFE_ENTRY_SQL = `
  (
    entry.source_module = 'sales'
    AND entry.source_doc_id LIKE 'QS-%'
    AND NOT EXISTS (
      SELECT 1
      FROM sales_quick_sales sale
      WHERE sale.sale_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    )
  )
  OR
  (
    entry.source_module = 'sales'
    AND entry.source_doc_type = 'billing_statement_settlement'
    AND entry.source_doc_id LIKE 'ST-%-P-%'
    AND NOT EXISTS (
      SELECT 1
      FROM sales_billing_statements statement_row
      WHERE statement_row.statement_number COLLATE utf8mb4_unicode_ci
        = entry.source_doc_id COLLATE utf8mb4_unicode_ci
    )
  )
  OR
  (
    entry.source_module = 'procurement'
    AND entry.source_doc_type LIKE 'purchase_invoice%'
    AND entry.source_doc_id LIKE 'SINV-%'
    AND NOT EXISTS (
      SELECT 1
      FROM prc_supplier_invoices invoice
      WHERE
        entry.source_doc_id COLLATE utf8mb4_unicode_ci
          = invoice.invoice_number COLLATE utf8mb4_unicode_ci
        OR entry.source_doc_id COLLATE utf8mb4_unicode_ci
          LIKE CONCAT(invoice.invoice_number, ':%') COLLATE utf8mb4_unicode_ci
        OR entry.source_doc_id COLLATE utf8mb4_unicode_ci
          LIKE CONCAT(invoice.invoice_number, '-CORR-%') COLLATE utf8mb4_unicode_ci
        OR entry.source_doc_id COLLATE utf8mb4_unicode_ci
          LIKE CONCAT(invoice.invoice_number, '-rev-%') COLLATE utf8mb4_unicode_ci
    )
  )
  OR
  (
    entry.source_module = 'procurement'
    AND entry.source_doc_type LIKE 'supplier_payment%'
    AND entry.source_doc_id LIKE 'PAY-%'
    AND NOT EXISTS (
      SELECT 1
      FROM prc_supplier_payments payment
      WHERE
        entry.source_doc_id COLLATE utf8mb4_unicode_ci
          = payment.payment_number COLLATE utf8mb4_unicode_ci
        OR entry.source_doc_id COLLATE utf8mb4_unicode_ci
          LIKE CONCAT(payment.payment_number, '-rev-%') COLLATE utf8mb4_unicode_ci
    )
  )
  OR
  (
    entry.source_module = 'inventory'
    AND entry.source_doc_type LIKE 'opening_stock%'
    AND NOT EXISTS (
      SELECT 1
      FROM inv_opening_stocks opening_row
      WHERE
        entry.source_doc_id COLLATE utf8mb4_unicode_ci
          = CONVERT(opening_row.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR entry.source_doc_id COLLATE utf8mb4_unicode_ci
          LIKE CONCAT(CONVERT(opening_row.id USING utf8mb4), '-rev-%') COLLATE utf8mb4_unicode_ci
    )
  )
`;

function serializable(rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'bigint' ? value.toString() : value,
      ]),
    ),
  );
}

async function query(db: Db, sql: string) {
  return serializable(
    await db.$queryRawUnsafe<Array<Record<string, unknown>>>(sql),
  );
}

async function preview(db: Db) {
  return {
    orphanCafeExpenses: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(expense.total_amount), 0) amount
      FROM fin_expenses expense
      WHERE ${ORPHAN_CAFE_EXPENSE_SQL}
    `),
    orphanCafeExpenseRows: await query(db, `
      SELECT
        expense.id,
        expense.expense_number,
        expense.expense_date,
        expense.invoice_number,
        expense.total_amount
      FROM fin_expenses expense
      WHERE ${ORPHAN_CAFE_EXPENSE_SQL}
      ORDER BY expense.id
    `),
    orphanQuickSaleRevenues: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(revenue.net_amount), 0) amount
      FROM fin_revenues revenue
      WHERE revenue.source_module = 'quick_sale'
        AND revenue.source_ref IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM sales_quick_sales sale
          WHERE sale.sale_number = revenue.source_ref
        )
    `),
    orphanJournalEntries: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(entry.total_debit), 0) total_debit,
        COALESCE(SUM(entry.total_credit), 0) total_credit
      FROM acc_journal_entries entry
      WHERE ${ORPHAN_CAFE_ENTRY_SQL}
    `),
    orphanJournalEntryRows: await query(db, `
      SELECT
        entry.id,
        entry.entry_no,
        entry.date,
        entry.description,
        entry.status,
        entry.source_module,
        entry.source_doc_type,
        entry.source_doc_id,
        entry.total_debit,
        entry.total_credit
      FROM acc_journal_entries entry
      WHERE ${ORPHAN_CAFE_ENTRY_SQL}
      ORDER BY entry.date, entry.id
    `),
  };
}

async function protectedFingerprint(db: Db) {
  return {
    coreBusinessData: await query(db, `
      SELECT
        (SELECT COUNT(*) FROM users) users,
        (SELECT COUNT(*) FROM sales_shifts) shifts,
        (SELECT COUNT(*) FROM sales_shift_sessions) shift_sessions,
        (SELECT COUNT(*) FROM employees) employees,
        (SELECT COUNT(*) FROM club_members) members,
        (SELECT COUNT(*) FROM club_subscriptions) subscriptions,
        (SELECT COUNT(*) FROM club_receipts) receipts,
        (SELECT COUNT(*) FROM club_subscription_types) packages,
        (SELECT COUNT(*) FROM sales_quick_sales) quick_sales,
        (SELECT COUNT(*) FROM cafe_products) cafe_products,
        (SELECT COUNT(*) FROM inv_products) inventory_products,
        (SELECT COUNT(*) FROM prc_supplier_invoices) supplier_invoices
    `),
    nonTargetExpenses: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(expense.total_amount), 0) amount,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          expense.id,
          expense.expense_number,
          expense.expense_date,
          expense.category,
          COALESCE(expense.sub_category, ''),
          expense.total_amount,
          COALESCE(expense.invoice_number, ''),
          expense.is_deleted
        ))), 0) checksum
      FROM fin_expenses expense
      LEFT JOIN _repair_cafe_expenses target ON target.id = expense.id
      WHERE target.id IS NULL
    `),
    nonTargetRevenues: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(revenue.net_amount), 0) amount,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          revenue.id,
          revenue.revenue_number,
          revenue.revenue_date,
          revenue.source,
          COALESCE(revenue.sub_source, ''),
          revenue.net_amount,
          COALESCE(revenue.source_module, ''),
          COALESCE(revenue.source_ref, ''),
          revenue.is_deleted
        ))), 0) checksum
      FROM fin_revenues revenue
      LEFT JOIN _repair_cafe_revenues target ON target.id = revenue.id
      WHERE target.id IS NULL
    `),
    nonTargetJournalEntries: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(entry.total_debit), 0) total_debit,
        COALESCE(SUM(entry.total_credit), 0) total_credit,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          entry.id,
          entry.entry_no,
          entry.date,
          entry.status,
          COALESCE(entry.source_module, ''),
          COALESCE(entry.source_doc_type, ''),
          COALESCE(entry.source_doc_id, ''),
          entry.source_version,
          entry.total_debit,
          entry.total_credit
        ))), 0) checksum
      FROM acc_journal_entries entry
      LEFT JOIN _repair_cafe_entries target ON target.id = entry.id
      WHERE target.id IS NULL
    `),
    nonTargetJournalLines: await query(db, `
      SELECT
        COUNT(*) total,
        COALESCE(SUM(line.debit), 0) total_debit,
        COALESCE(SUM(line.credit), 0) total_credit,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|',
          line.id,
          line.entry_id,
          line.account_id,
          line.debit,
          line.credit,
          line.line_order
        ))), 0) checksum
      FROM acc_journal_entry_lines line
      LEFT JOIN _repair_cafe_entries target ON target.id = line.entry_id
      WHERE target.id IS NULL
    `),
  };
}

async function repair(client: PrismaClient, rollbackOnly = false) {
  try {
    return await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      try {
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_expenses (
            id INT PRIMARY KEY,
            sale_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
          )
          SELECT
            expense.id,
            SUBSTRING(expense.invoice_number, 7) AS sale_number
          FROM fin_expenses expense
          WHERE ${ORPHAN_CAFE_EXPENSE_SQL}
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_revenues (
            id INT PRIMARY KEY,
            sale_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
          )
          SELECT
            revenue.id,
            revenue.source_ref AS sale_number
          FROM fin_revenues revenue
          WHERE revenue.source_module = 'quick_sale'
            AND revenue.source_ref IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM sales_quick_sales sale
              WHERE sale.sale_number = revenue.source_ref
            )
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_sale_numbers (
            sale_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY
          )
        `);
        await tx.$executeRawUnsafe(`
          INSERT IGNORE INTO _repair_cafe_sale_numbers (sale_number)
          SELECT sale_number FROM _repair_cafe_expenses
        `);
        await tx.$executeRawUnsafe(`
          INSERT IGNORE INTO _repair_cafe_sale_numbers (sale_number)
          SELECT sale_number FROM _repair_cafe_revenues
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_entries (
            id INT PRIMARY KEY
          )
          SELECT DISTINCT entry.id
          FROM acc_journal_entries entry
          WHERE
            (${ORPHAN_CAFE_ENTRY_SQL})
            OR (
              entry.source_module = 'sales'
              AND entry.source_doc_type IN (
                'quick_sale',
                'quick_sale_refund',
                'quick_sale_cancel'
              )
              AND EXISTS (
                SELECT 1
                FROM _repair_cafe_sale_numbers target
                WHERE target.sale_number COLLATE utf8mb4_unicode_ci
                  = entry.source_doc_id COLLATE utf8mb4_unicode_ci
              )
            )
        `);
        // Include both sides of any accounting reversal chain so no dangling
        // reversal link can remain after deleting the orphan Cafe document.
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_reversal_entries (
            id INT PRIMARY KEY
          )
          SELECT entry.id
          FROM acc_journal_entries entry
          JOIN _repair_cafe_entries target ON target.id = entry.reverses_id
        `);
        await tx.$executeRawUnsafe(`
          INSERT IGNORE INTO _repair_cafe_entries (id)
          SELECT id FROM _repair_cafe_reversal_entries
        `);
        await tx.$executeRawUnsafe(`
          CREATE TEMPORARY TABLE _repair_cafe_reversed_entries (
            id INT PRIMARY KEY
          )
          SELECT entry.reverses_id AS id
          FROM acc_journal_entries entry
          JOIN _repair_cafe_entries target ON target.id = entry.id
          WHERE entry.reverses_id IS NOT NULL
        `);
        await tx.$executeRawUnsafe(`
          INSERT IGNORE INTO _repair_cafe_entries (id)
          SELECT id FROM _repair_cafe_reversed_entries
        `);

        const targets = {
          expenses: await query(tx, `
            SELECT COUNT(*) total, COALESCE(SUM(expense.total_amount), 0) amount
            FROM fin_expenses expense
            JOIN _repair_cafe_expenses target ON target.id = expense.id
          `),
          revenues: await query(tx, `
            SELECT COUNT(*) total, COALESCE(SUM(revenue.net_amount), 0) amount
            FROM fin_revenues revenue
            JOIN _repair_cafe_revenues target ON target.id = revenue.id
          `),
          journalEntries: await query(tx, `
            SELECT COUNT(*) total
            FROM acc_journal_entries entry
            JOIN _repair_cafe_entries target ON target.id = entry.id
          `),
          journalLines: await query(tx, `
            SELECT COUNT(*) total
            FROM acc_journal_entry_lines line
            JOIN _repair_cafe_entries target ON target.id = line.entry_id
          `),
        };
        const protectedBefore = await protectedFingerprint(tx);
        const backup = {
          createdAt: new Date().toISOString(),
          reason: 'Orphan Cafe accounting cleanup',
          targets,
          journalEntries: await query(tx, `
            SELECT entry.*
            FROM acc_journal_entries entry
            JOIN _repair_cafe_entries target ON target.id = entry.id
            ORDER BY entry.id
          `),
          journalLines: await query(tx, `
            SELECT line.*
            FROM acc_journal_entry_lines line
            JOIN _repair_cafe_entries target ON target.id = line.entry_id
            ORDER BY line.entry_id, line.line_order, line.id
          `),
          expenses: await query(tx, `
            SELECT expense.*
            FROM fin_expenses expense
            JOIN _repair_cafe_expenses target ON target.id = expense.id
            ORDER BY expense.id
          `),
          revenues: await query(tx, `
            SELECT revenue.*
            FROM fin_revenues revenue
            JOIN _repair_cafe_revenues target ON target.id = revenue.id
            ORDER BY revenue.id
          `),
        };
        const backupDir = resolve(
          process.env.CAFE_ACCOUNTING_BACKUP_DIR || 'backups',
        );
        mkdirSync(backupDir, { recursive: true });
        const backupPath = resolve(
          backupDir,
          `orphan-cafe-accounting-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
        );
        writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });

        await tx.$executeRawUnsafe(`
          DELETE line
          FROM acc_journal_entry_lines line
          JOIN _repair_cafe_entries target ON target.id = line.entry_id
        `);
        await tx.$executeRawUnsafe(`
          DELETE entry
          FROM acc_journal_entries entry
          JOIN _repair_cafe_entries target ON target.id = entry.id
        `);
        await tx.$executeRawUnsafe(`
          DELETE expense
          FROM fin_expenses expense
          JOIN _repair_cafe_expenses target ON target.id = expense.id
        `);
        await tx.$executeRawUnsafe(`
          DELETE revenue
          FROM fin_revenues revenue
          JOIN _repair_cafe_revenues target ON target.id = revenue.id
        `);

        const protectedAfter = await protectedFingerprint(tx);
        if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
          throw new Error(
            'Safety check failed: non-Cafe data changed. Repair rolled back.',
          );
        }
        if (rollbackOnly) throw new Error(ROLLBACK_TEST);
        return { targets, backupPath, protectedBefore, protectedAfter };
      } finally {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
      }
    }, { maxWait: 20_000, timeout: 120_000 });
  } catch (error) {
    if (rollbackOnly && error instanceof Error && error.message === ROLLBACK_TEST) {
      return {
        rollbackTest: true,
        afterRollback: await preview(client),
      };
    }
    throw error;
  }
}

async function main() {
  const client = new PrismaClient();
  try {
    const before = await preview(client);
    console.log(JSON.stringify({ mode: 'preview', before }, null, 2));
    const confirmed = process.argv.includes('--confirm-cafe-accounting-repair');
    if (!confirmed) {
      console.log('\nNo data was changed. This was preview mode only.');
      console.log(
        `To execute: CAFE_ACCOUNTING_REPAIR_ACK=${REQUIRED_ACK} npm run db:repair:cafe-accounting -- --confirm-cafe-accounting-repair`,
      );
      return;
    }
    if (process.env.CAFE_ACCOUNTING_REPAIR_ACK !== REQUIRED_ACK) {
      throw new Error(
        `Refusing repair. Set CAFE_ACCOUNTING_REPAIR_ACK=${REQUIRED_ACK}`,
      );
    }
    console.log('\nConfirmed: removing orphan Cafe accounting rows only...');
    console.log(JSON.stringify(
      await repair(client, process.argv.includes('--test-rollback')),
      null,
      2,
    ));
    console.log(JSON.stringify({ after: await preview(client) }, null, 2));
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
