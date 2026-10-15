// Read-only diagnostic. Run with the deployed application directory as argv[2].
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const appRoot = path.resolve(process.argv[2] || process.cwd());
const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');
const p = new PrismaClient({ log: [] });
const since = '2026-09-01';
const report = { startedAt: new Date().toISOString(), since, appRoot, errors: [] };
async function section(name, read) {
  try { report[name] = await read(); return report[name]; }
  catch (error) {
    // Do not print raw connection errors, credentials, or SQL.
    report.errors.push({ section: name, type: error.name, code: error.code || null });
    return [];
  }
}
async function pages(model, where, select) {
  const rows = [];
  let last = 0;
  for (;;) {
    const batch = await model.findMany({ where: { AND: [where, { id: { gt: last } }] }, select, orderBy: { id: 'asc' }, take: 500 });
    rows.push(...batch);
    if (batch.length < 500) return rows;
    last = batch[batch.length - 1].id;
    if (rows.length >= 50000) throw new Error('DiagnosticRowLimit');
  }
}
const saleSelect = {
  id: true, sale_number: true, sale_date: true, sale_time: true,
  sale_type: true, status: true, branch_id: true, shift_session_id: true,
  warehouse_id: true, inventory_posted: true, employee_id: true, partner_id: true,
  billing_cycle: true, billing_status: true, total_amount: true, collected_amount: true,
  created_at: true, updated_at: true,
  items: { select: { id: true, name: true, quantity: true, product_id: true, cafe_product_id: true, inventory_product_id: true } },
  events: { select: { event_type: true, created_at: true } },
};
async function main() {
  report.runtime = { node: process.version, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  report.deployedFiles = ['dist/main.js', 'public/index.html', 'dist/modules/sales/quick-sales.service.js', 'dist/modules/sales/billing-statements.service.js'].map(file => {
    const full = path.join(appRoot, file);
    if (!fs.existsSync(full)) return { file, exists: false };
    const stat = fs.statSync(full);
    const source = fs.readFileSync(full, 'utf8');
    return { file, modifiedAt: stat.mtime.toISOString(), bytes: stat.size, hasHospitality: source.includes('hospitality') };
  });
  await section('inventorySettings', () => p.sales_pos_settings.findMany({ where: { setting_key: 'inventory_tracking_enabled' }, select: { id: true, branch_id: true, category: true, setting_value: true, setting_type: true, is_active: true, updated_at: true } }));
  const names = ['مياه', 'ماء', 'ميه', 'ماية', 'water'];
  const products = await section('waterProducts', () => p.inv_products.findMany({ where: { OR: names.flatMap(name => [{ name_ar: { contains: name } }, { name_en: { contains: name } }]) }, select: { id: true, name_ar: true, product_code: true, status: true, is_deleted: true, unit_of_measure: true } }));
  const ids = products.map(row => row.id);
  const cafe = await section('cafeProducts', () => p.cafe_products.findMany({ where: { OR: [{ inventory_product_id: { in: ids } }, ...names.map(name => ({ name: { contains: name } }))] }, select: { id: true, name: true, product_type: true, inventory_product_id: true, is_active: true } }));
  await section('waterBalances', () => p.inv_stock_balances.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, warehouse_id: true, current_stock: true, last_updated: true } }));
  await section('waterBranchBalances', () => p.inv_product_branches.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, branch_id: true, stock_quantity: true, last_updated: true } }));
  const movements = await section('waterMovements', () => pages(p.inv_movements, { product_id: { in: ids }, created_at: { gte: new Date(since) } }, { id: true, product_id: true, warehouse_id: true, branch_id: true, movement_date: true, created_at: true, quantity: true, direction: true, balance_after: true, doc_type: true, doc_ref: true }));
  const waterItem = { OR: [{ inventory_product_id: { in: ids } }, { cafe_product_id: { in: cafe.map(row => row.id) } }, { cafe_product_id: null, product_id: { in: ids } }, ...names.map(name => ({ name: { contains: name } }))] };
  await section('waterSales', () => pages(p.sales_quick_sales, { OR: [{ sale_date: { gte: since }, items: { some: waterItem } }, { sale_number: { in: [...new Set(movements.map(row => row.doc_ref).filter(Boolean))] } }] }, saleSelect));
  await section('waterCounts', () => p.inv_count_sessions.findMany({ where: { items: { some: { product_id: { in: ids } } } }, take: 30, orderBy: { id: 'desc' }, select: { id: true, session_number: true, warehouse_id: true, branch_id: true, status: true, created_at: true, updated_at: true, items: { where: { product_id: { in: ids } }, select: { product_id: true, system_quantity: true, counted_quantity: true, variance: true } } } }));
  await section('hospitalityAndAccountSales', () => pages(p.sales_quick_sales, { sale_date: { gte: since }, sale_type: { in: ['hospitality', 'employee', 'partner'] } }, saleSelect));
  await section('statements', () => pages(p.sales_billing_statements, { OR: [{ period_end: { gte: since } }, { status: 'issued' }] }, { id: true, statement_number: true, account_type: true, employee_id: true, partner_id: true, branch_id: true, billing_cycle: true, period_start: true, period_end: true, total_amount: true, paid_amount: true, status: true, settlement_method: true, payment_method: true, settled_at: true, created_at: true, items: { select: { quick_sale_id: true, amount: true } } }));
  await section('shifts', () => pages(p.sales_shift_sessions, { session_date: { gte: since } }, { id: true, branch_id: true, session_date: true, start_time: true, end_time: true, status: true }));
  report.movementsAround1212 = movements.filter(row => Math.abs(Number(row.balance_after) - 1212) <= 5);
  report.finishedAt = new Date().toISOString();
  report.note = 'Read-only, sequential queries; sales may continue during collection. Movement history starts at since; do not interpret period sums as lifetime balances. No customer names, phones, passwords or environment values exported. waterCounts contains the latest 30 matching sessions.';
}
main().catch(error => { report.errors.push({ section: 'main', type: error.name, code: error.code || null }); }).finally(async () => {
  await p.$disconnect();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.errors.length) process.exitCode = 2;
});
