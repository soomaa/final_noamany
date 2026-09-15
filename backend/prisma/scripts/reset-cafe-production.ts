import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const CAFE_PRODUCT_SQL = `
  (
    inventory_section IN ('preparation_ingredients', 'serving_packaging', 'ready_products')
    OR inventory_kind = 'manufactured_internal'
  )
`;

const CAFE_SYSTEM_EXPENSE_SQL = `
  invoice_number LIKE 'WASTE-%'
  AND category = 'مخزون'
  AND sub_category = 'هالك كافيه'
  AND payment_method = 'تسوية مخزون'
  AND description LIKE 'هالك خامات منتجات مُحضّرة%'
`;

const REQUIRED_ACK = 'DELETE_CAFE_KEEP_SHIFTS_USERS';

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

async function protectedFingerprint(db: Db) {
  return {
    users: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', user_id, COALESCE(username, ''),
          COALESCE(name, ''), COALESCE(level, ''), COALESCE(branch_id_fk, ''),
          COALESCE(approved, ''), must_change_password))), 0) checksum
      FROM users
    `),
    shifts: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, shift_name, start_time, end_time,
          COALESCE(branch_id, ''), COALESCE(responsible_user_id, ''), is_active,
          COALESCE(description, ''), color,
          DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f')))), 0) checksum
      FROM sales_shifts
    `),
    shiftSessions: await query(db, `
      SELECT COUNT(*) total,
        COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, shift_id, COALESCE(branch_id, ''),
          user_id, session_date, DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s.%f'),
          COALESCE(DATE_FORMAT(end_time, '%Y-%m-%d %H:%i:%s.%f'), ''),
          opening_balance, COALESCE(closing_balance, ''), total_sales, total_cash,
          total_card, total_wallet, total_transfer, total_discount, total_tax,
          transactions_count, status,
          DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f')))), 0) checksum
      FROM sales_shift_sessions
    `),
    otherBusinessData: await query(db, `
      SELECT
        (SELECT COUNT(*) FROM club_members) members,
        (SELECT COUNT(*) FROM club_subscriptions) subscriptions,
        (SELECT COUNT(*) FROM club_subscription_types) packages,
        (SELECT COUNT(*) FROM employees) employees,
        (SELECT COUNT(*) FROM fin_expenses
          WHERE NOT (${CAFE_SYSTEM_EXPENSE_SQL})) non_cafe_expenses,
        (SELECT COUNT(*) FROM fin_revenues revenue
          WHERE NOT (
            revenue.source_module = 'quick_sale'
            AND (
              NOT EXISTS (
                SELECT 1 FROM sales_quick_sales existing_sale
                WHERE existing_sale.sale_number = revenue.source_ref
              )
              OR EXISTS (
                SELECT 1
                FROM sales_quick_sales sale
                JOIN sales_quick_sale_items item ON item.quick_sale_id = sale.id
                LEFT JOIN inv_products product
                  ON product.id = COALESCE(item.inventory_product_id, item.product_id)
                WHERE sale.sale_number = revenue.source_ref
                  AND (
                    item.item_type = 'cafe'
                    OR item.cafe_product_id IS NOT NULL
                    OR ${CAFE_PRODUCT_SQL.replaceAll(/(?<![a-z_])(inventory_section|inventory_kind)/g, 'product.$1')}
                  )
              )
            )
          )) non_cafe_revenues
    `),
  };
}

async function preview(db: Db) {
  return {
    cafeProducts: await query(db, 'SELECT COUNT(*) total FROM cafe_products'),
    cafeCategories: await query(db, 'SELECT COUNT(*) total FROM inv_categories'),
    cafeInventoryProducts: await query(
      db,
      `SELECT COUNT(*) total FROM inv_products WHERE ${CAFE_PRODUCT_SQL}`,
    ),
    cafeSales: await query(db, `
      SELECT COUNT(DISTINCT sale.id) total
      FROM sales_quick_sales sale
      JOIN sales_quick_sale_items item ON item.quick_sale_id = sale.id
      LEFT JOIN inv_products product
        ON product.id = COALESCE(item.inventory_product_id, item.product_id)
      WHERE item.item_type = 'cafe'
        OR item.cafe_product_id IS NOT NULL
        OR ${CAFE_PRODUCT_SQL.replaceAll(/(?<![a-z_])(inventory_section|inventory_kind)/g, 'product.$1')}
    `),
    supplierInvoices: await query(
      db,
      'SELECT COUNT(*) total FROM prc_supplier_invoices',
    ),
    supplierPayments: await query(
      db,
      'SELECT COUNT(*) total FROM prc_supplier_payments',
    ),
    suppliers: await query(db, 'SELECT COUNT(*) total FROM inv_suppliers'),
    partners: await query(db, 'SELECT COUNT(*) total FROM cafe_partners'),
    cafeSystemExpenses: await query(
      db,
      `SELECT COUNT(*) total, COALESCE(SUM(total_amount), 0) amount
       FROM fin_expenses WHERE ${CAFE_SYSTEM_EXPENSE_SQL}`,
    ),
    cafeQuickSaleRevenues: await query(db, `
      SELECT COUNT(*) total, COALESCE(SUM(revenue.net_amount), 0) amount
      FROM fin_revenues revenue
      WHERE revenue.source_module = 'quick_sale'
        AND (
          NOT EXISTS (
            SELECT 1 FROM sales_quick_sales existing_sale
            WHERE existing_sale.sale_number = revenue.source_ref
          )
          OR EXISTS (
            SELECT 1
            FROM sales_quick_sales sale
            JOIN sales_quick_sale_items item ON item.quick_sale_id = sale.id
            LEFT JOIN inv_products product
              ON product.id = COALESCE(item.inventory_product_id, item.product_id)
            WHERE sale.sale_number = revenue.source_ref
              AND (
                item.item_type = 'cafe'
                OR item.cafe_product_id IS NOT NULL
                OR ${CAFE_PRODUCT_SQL.replaceAll(/(?<![a-z_])(inventory_section|inventory_kind)/g, 'product.$1')}
              )
          )
        )
    `),
    protected: await protectedFingerprint(db),
  };
}

const ROLLBACK_TEST = 'CAFE_RESET_ROLLBACK_TEST';

async function resetCafe(client: PrismaClient, rollbackOnly = false) {
  const protectedBefore = await protectedFingerprint(client);

  try {
    const result = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_products (
          id INT PRIMARY KEY
        ) SELECT id FROM inv_products WHERE ${CAFE_PRODUCT_SQL}
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_sales (
          id INT PRIMARY KEY,
          sale_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        )
        SELECT DISTINCT sale.id, sale.sale_number
        FROM sales_quick_sales sale
        JOIN sales_quick_sale_items item ON item.quick_sale_id = sale.id
        LEFT JOIN _reset_cafe_products product
          ON product.id = COALESCE(item.inventory_product_id, item.product_id)
        WHERE item.item_type = 'cafe'
          OR item.cafe_product_id IS NOT NULL
          OR product.id IS NOT NULL
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_expenses (
          id INT PRIMARY KEY,
          sale_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        )
        SELECT
          id,
          SUBSTRING(invoice_number, 7) AS sale_number
        FROM fin_expenses
        WHERE ${CAFE_SYSTEM_EXPENSE_SQL}
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_sale_numbers (
          sale_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY
        )
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_sale_numbers (sale_number)
        SELECT sale_number FROM _reset_cafe_sales
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_sale_numbers (sale_number)
        SELECT sale_number FROM _reset_cafe_expenses
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_sale_numbers (sale_number)
        SELECT revenue.source_ref
        FROM fin_revenues revenue
        WHERE revenue.source_module = 'quick_sale'
          AND revenue.source_ref IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sales_quick_sales sale
            WHERE sale.sale_number = revenue.source_ref
          )
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_revenues (
          id INT PRIMARY KEY
        )
        SELECT revenue.id
        FROM fin_revenues revenue
        JOIN _reset_cafe_sale_numbers target
          ON target.sale_number = revenue.source_ref
        WHERE revenue.source_module = 'quick_sale'
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_sales_statement_copy (
          id INT PRIMARY KEY,
          sale_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        )
        SELECT id, sale_number FROM _reset_cafe_sales
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_statements (
          id INT PRIMARY KEY,
          statement_number VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        )
        SELECT DISTINCT statement_row.id, statement_row.statement_number
        FROM sales_billing_statement_items item
        JOIN sales_billing_statements statement_row ON statement_row.id = item.statement_id
        JOIN _reset_cafe_sales sale ON sale.id = item.quick_sale_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM sales_billing_statement_items other_item
          LEFT JOIN _reset_cafe_sales_statement_copy other_sale
            ON other_sale.id = other_item.quick_sale_id
          WHERE other_item.statement_id = statement_row.id
            AND other_sale.id IS NULL
        )
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_transactions (
          id INT PRIMARY KEY
        )
        SELECT DISTINCT transaction_id AS id
        FROM inv_movements
        WHERE transaction_id IS NOT NULL
          AND product_id IN (SELECT id FROM _reset_cafe_products)
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_transactions (id)
        SELECT DISTINCT transaction_id AS id
        FROM inv_transaction_items
        WHERE product_id IN (SELECT id FROM _reset_cafe_products)
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_counts (
          id INT PRIMARY KEY
        )
        SELECT DISTINCT session_id AS id
        FROM inv_count_items
        WHERE product_id IN (SELECT id FROM _reset_cafe_products)
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_opening (
          id INT PRIMARY KEY
        )
        SELECT id FROM inv_opening_stocks
        WHERE product_id IN (SELECT id FROM _reset_cafe_products)
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_suppliers (
          id INT PRIMARY KEY
        )
        SELECT supplier.id
        FROM inv_suppliers supplier
        WHERE NOT EXISTS (
          SELECT 1 FROM inv_products product
          WHERE product.supplier_id = supplier.id
            AND product.id NOT IN (SELECT id FROM _reset_cafe_products)
        )
        AND NOT EXISTS (SELECT 1 FROM inv_spare_parts ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM inv_consumables ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_quick_purchase_orders ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_purchase_returns ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_quotations ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_purchase_orders ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_purchase_invoices ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_debit_notes ref WHERE ref.supplier_id = supplier.id)
        AND NOT EXISTS (SELECT 1 FROM prc_supplier_contracts ref WHERE ref.supplier_id = supplier.id)
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_keep_categories (
          id INT PRIMARY KEY
        )
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_keep_categories (id)
        WITH RECURSIVE kept_categories AS (
          SELECT DISTINCT category_id AS id
          FROM inv_products
          WHERE category_id IS NOT NULL
            AND id NOT IN (SELECT id FROM _reset_cafe_products)
          UNION DISTINCT
          SELECT category.parent_category_id AS id
          FROM inv_categories category
          JOIN kept_categories kept ON kept.id = category.id
          WHERE category.parent_category_id IS NOT NULL
        )
        SELECT id FROM kept_categories WHERE id IS NOT NULL
      `);

      // Resolve accounting targets before deleting any source documents. Include partner billing
      // settlements and both sides of correction/reversal chains so the Cafe reset cannot leave
      // orphan rows in the general ledger.
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_accounting_entries (
          id INT PRIMARY KEY
        )
        SELECT entry.id
        FROM acc_journal_entries entry
        WHERE
          (entry.source_module = 'sales'
            AND entry.source_doc_type IN ('quick_sale', 'quick_sale_refund', 'quick_sale_cancel')
            AND entry.source_doc_id IN (SELECT sale_number FROM _reset_cafe_sale_numbers))
          OR
          (entry.source_module = 'sales'
            AND entry.source_doc_type = 'billing_statement_settlement'
            AND entry.source_doc_id IN (
              SELECT statement_number FROM _reset_cafe_statements
            ))
          OR
          (entry.source_module = 'procurement'
            AND (
              (entry.source_doc_type = 'purchase_invoice'
                AND entry.source_doc_id IN (SELECT invoice_number FROM prc_supplier_invoices))
              OR (entry.source_doc_type = 'supplier_payment'
                AND entry.source_doc_id IN (SELECT payment_number FROM prc_supplier_payments))
              OR (entry.source_doc_type = 'purchase_invoice_correction'
                AND EXISTS (
                  SELECT 1 FROM prc_supplier_invoices invoice
                  WHERE entry.source_doc_id LIKE CONCAT(invoice.invoice_number, ':v%')
                    OR entry.source_doc_id LIKE CONCAT(invoice.invoice_number, '-CORR-%')
                ))
            ))
          OR
          (entry.source_module = 'inventory'
            AND entry.source_doc_type = 'opening_stock'
            AND entry.source_doc_id IN (
              SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci
              FROM _reset_cafe_opening
            ))
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_reversal_entries (
          id INT PRIMARY KEY
        )
        SELECT entry.id
        FROM acc_journal_entries entry
        JOIN _reset_cafe_accounting_entries target ON target.id = entry.reverses_id
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_accounting_entries (id)
        SELECT id FROM _reset_cafe_reversal_entries
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMPORARY TABLE _reset_cafe_reversed_entries (
          id INT PRIMARY KEY
        )
        SELECT entry.reverses_id AS id
        FROM acc_journal_entries entry
        JOIN _reset_cafe_accounting_entries target ON target.id = entry.id
        WHERE entry.reverses_id IS NOT NULL
      `);
      await tx.$executeRawUnsafe(`
        INSERT IGNORE INTO _reset_cafe_accounting_entries (id)
        SELECT id FROM _reset_cafe_reversed_entries
      `);
      await tx.$executeRawUnsafe(`
        DELETE line FROM acc_journal_entry_lines line
        JOIN _reset_cafe_accounting_entries target ON target.id = line.entry_id
      `);
      await tx.$executeRawUnsafe(`
        DELETE entry FROM acc_journal_entries entry
        JOIN _reset_cafe_accounting_entries target ON target.id = entry.id
      `);

      await tx.$executeRawUnsafe('DELETE target_row FROM sales_shift_sale_adjustments target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_billing_statement_items target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_invoice_item_feedback target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_invoice_feedback target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_invoice_events target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_pos_payments target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_quick_sale_items target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.quick_sale_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM sales_quick_sales target_row JOIN _reset_cafe_sales sale ON sale.id = target_row.id');
      await tx.$executeRawUnsafe('DELETE target_row FROM fin_revenues target_row JOIN _reset_cafe_revenues revenue ON revenue.id = target_row.id');
      await tx.$executeRawUnsafe('DELETE target_row FROM fin_expenses target_row JOIN _reset_cafe_expenses expense ON expense.id = target_row.id');
      await tx.$executeRawUnsafe(`
        DELETE statement FROM sales_billing_statements statement
        JOIN _reset_cafe_statements target ON target.id = statement.id
        WHERE NOT EXISTS (
          SELECT 1 FROM sales_billing_statement_items item
          WHERE item.statement_id = statement.id
        )
      `);

      await tx.$executeRawUnsafe('DELETE FROM prc_supplier_payments');
      await tx.$executeRawUnsafe('DELETE FROM prc_supplier_invoice_items');
      await tx.$executeRawUnsafe('DELETE FROM prc_supplier_invoices');

      await tx.$executeRawUnsafe('DELETE FROM cafe_variant_recipes');
      await tx.$executeRawUnsafe('DELETE FROM cafe_product_variants');
      await tx.$executeRawUnsafe('DELETE FROM cafe_product_recipes');
      await tx.$executeRawUnsafe('DELETE FROM cafe_products');

      await tx.$executeRawUnsafe('DELETE target_row FROM inv_composite_items target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_product_storages target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_stock_balances target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_product_branches target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_movements target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_transaction_items target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_opening_stocks target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_count_items target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_supplier_products target_row JOIN _reset_cafe_products product ON product.id = target_row.product_id');
      await tx.$executeRawUnsafe('DELETE target_row FROM inv_products target_row JOIN _reset_cafe_products product ON product.id = target_row.id');
      await tx.$executeRawUnsafe(`
        DELETE adjustment FROM inv_adjustments adjustment
        JOIN _reset_cafe_counts target ON target.id = adjustment.session_id
        WHERE NOT EXISTS (
          SELECT 1 FROM inv_count_items item WHERE item.session_id = adjustment.session_id
        )
      `);
      await tx.$executeRawUnsafe(`
        DELETE session FROM inv_count_sessions session
        JOIN _reset_cafe_counts target ON target.id = session.id
        WHERE NOT EXISTS (
          SELECT 1 FROM inv_count_items item WHERE item.session_id = session.id
        )
      `);
      await tx.$executeRawUnsafe(`
        DELETE transaction FROM inv_transactions transaction
        JOIN _reset_cafe_transactions target ON target.id = transaction.id
        WHERE NOT EXISTS (
          SELECT 1 FROM inv_transaction_items item WHERE item.transaction_id = transaction.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM inv_movements movement WHERE movement.transaction_id = transaction.id
        )
      `);

      await tx.$executeRawUnsafe(`
        UPDATE inv_categories category
        SET category.parent_category_id = NULL
        WHERE category.id NOT IN (SELECT id FROM _reset_keep_categories)
      `);
      await tx.$executeRawUnsafe(`
        DELETE FROM inv_categories
        WHERE id NOT IN (SELECT id FROM _reset_keep_categories)
      `);
      await tx.$executeRawUnsafe('DELETE FROM cafe_partner_phones');
      await tx.$executeRawUnsafe('DELETE FROM cafe_partners');
      await tx.$executeRawUnsafe(`
        DELETE phone FROM inv_supplier_phones phone
        JOIN _reset_cafe_suppliers supplier ON supplier.id = phone.supplier_id
      `);
      await tx.$executeRawUnsafe(`
        DELETE link FROM inv_supplier_products link
        JOIN _reset_cafe_suppliers supplier ON supplier.id = link.supplier_id
      `);
      await tx.$executeRawUnsafe(`
        DELETE supplier FROM inv_suppliers supplier
        JOIN _reset_cafe_suppliers target ON target.id = supplier.id
      `);

      const protectedAfter = await protectedFingerprint(tx);
      if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
        throw new Error(
          'Safety check failed: protected users, shifts, gym data or non-Cafe finance data changed. Reset rolled back.',
        );
      }
      if (rollbackOnly) throw new Error(ROLLBACK_TEST);
      return { protectedBefore, protectedAfter };
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
    }, { maxWait: 20_000, timeout: 120_000 });

    return { ...result, after: await preview(client) };
  } catch (error) {
    if (rollbackOnly && error instanceof Error && error.message === ROLLBACK_TEST) {
      return {
        rollbackTest: true,
        protectedBefore,
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
    const confirmed = process.argv.includes('--confirm-cafe-reset');
    if (!confirmed) {
      console.log('\nNo data was changed. This was preview mode only.');
      console.log(`To execute: CAFE_RESET_ACK=${REQUIRED_ACK} npm run db:reset:cafe -- --confirm-cafe-reset`);
      return;
    }
    if (process.env.CAFE_RESET_ACK !== REQUIRED_ACK) {
      throw new Error(`Refusing destructive reset. Set CAFE_RESET_ACK=${REQUIRED_ACK}`);
    }
    console.log('\nConfirmed: resetting Cafe data only; users and shifts stay unchanged...');
    console.log(JSON.stringify(await resetCafe(client, process.argv.includes('--test-rollback')), null, 2));
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
