'use strict';

// Read-only database diagnostic. Run with the deployed app directory as argv[2].
// No mutations, repairs, deployment, or service restarts. Never print connection errors.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const appRoot = path.resolve(process.argv[2] || process.cwd());
const report = {};
let db;

async function main() {
  const req = createRequire(path.join(appRoot, 'package.json'));
  req('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
  const { PrismaClient } = req('@prisma/client');
  db = new PrismaClient({ log: [{ level: 'error', emit: 'event' }] });
  const names = ['مياه', 'ماء', 'مايه', 'ماية', 'ميه', 'water'];
  const since = new Date(Date.now() - 7 * 86400000);
  report.info = {
    capturedUtc: new Date().toISOString(), sinceUtc: since.toISOString(),
    timestamps: 'UTC', mode: 'SELECT only / RepeatableRead snapshot',
    note: 'Before balances are inferred from each recorded movement, not independent snapshots. Invoice items show their current state. This report alone does not establish who caused an error.',
  };
  report.version = [
    'dist/modules/inventory/inventory-stock.service.js',
    'dist/modules/inventory/stock-taking.service.js',
    'dist/modules/sales/quick-sales.service.js',
  ].map(file => {
    const full = path.join(appRoot, file);
    return fs.existsSync(full) ? {
      file, modifiedUtc: fs.statSync(full).mtime.toISOString(),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'),
    } : { file, missing: true };
  });

  await db.$transaction(async tx => {
    report.products = await tx.inv_products.findMany({
      where: { OR: names.flatMap(name => [
        { name_ar: { contains: name } }, { name_en: { contains: name } },
      ]) },
      select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, is_deleted: true },
    });
    const ids = report.products.map(x => x.id);
    if (!ids.length) return;
    report.balances = await tx.inv_stock_balances.findMany({
      where: { product_id: { in: ids } },
      select: {
        product_id: true, warehouse_id: true, current_stock: true, last_updated: true,
        warehouse: { select: { name_ar: true, branch_id: true } },
      },
    });
    report.branchBalances = await tx.inv_product_branches.findMany({
      where: { product_id: { in: ids } },
      select: { product_id: true, branch_id: true, stock_quantity: true, last_updated: true },
    });
    const rows = await tx.inv_movements.findMany({
      where: { product_id: { in: ids }, created_at: { gte: since } },
      orderBy: { id: 'desc' }, take: 301,
      select: {
        id: true, product_id: true, warehouse_id: true, branch_id: true,
        created_at: true, movement_date: true, quantity: true, balance_after: true,
        doc_type: true, doc_ref: true, created_by: true,
      },
    });
    report.historyLimit = { maximum: 300, olderRowsOmitted: rows.length > 300 };
    report.movements = rows.slice(0, 300).reverse().map(m => ({
      ...m, beforeFromRecordedMovement: Number(m.balance_after) - Number(m.quantity),
    }));
    report.increases = report.movements.filter(m => Number(m.quantity) > 0);
    report.near165or176 = report.movements.filter(m =>
      [165, 176].includes(Number(m.balance_after)) || [165, 176].includes(m.beforeFromRecordedMovement));
    const counts = await tx.inv_count_sessions.findMany({
      where: { items: { some: { product_id: { in: ids } } } },
      orderBy: { id: 'desc' }, take: 11,
      select: {
        id: true, session_number: true, status: true, branch_id: true, warehouse_id: true,
        created_by: true, created_at: true, updated_at: true,
        items: {
          where: { product_id: { in: ids } },
          select: {
            id: true, product_id: true, item_name: true, system_quantity: true,
            counted_quantity: true, variance: true, created_at: true,
          },
        },
        adjustments: {
          select: { adjustment_number: true, status: true, approved_at: true, created_at: true },
        },
      },
    });
    report.countLimit = { maximum: 10, olderRowsOmitted: counts.length > 10 };
    report.counts = counts.slice(0, 10);
    const refs = [...new Set(report.increases.map(m => m.doc_ref).filter(Boolean))];
    const invoices = refs.length ? await tx.sales_quick_sales.findMany({
      where: { sale_number: { in: refs } },
      select: {
        id: true, sale_number: true, status: true, branch_id: true, warehouse_id: true,
        inventory_posted: true, cashier_id: true, created_at: true, updated_at: true,
        items: { select: { name: true, quantity: true, inventory_product_id: true, cafe_product_id: true } },
        events: {
          orderBy: { id: 'desc' }, take: 11,
          select: { event_type: true, created_by: true, created_at: true },
        },
      },
    }) : [];
    report.invoicesBehindIncreases = invoices.map(invoice => ({
      ...invoice, olderEventsOmitted: invoice.events.length > 10, events: invoice.events.slice(0, 10),
    }));
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30000 });

  for (const [section, value] of Object.entries(report)) {
    console.log('\n=== ' + section + ' ===');
    for (const row of Array.isArray(value) ? value : [value]) console.log(JSON.stringify(row));
  }
}

main().catch(e => {
  console.error('READ_FAILED', e.code || e.name);
  process.exitCode = 1;
}).finally(async () => { if (db) await db.$disconnect(); });
