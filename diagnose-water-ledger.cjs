const path = require('node:path');
const { createRequire } = require('node:module');
const appRoot = path.resolve(process.argv[2] || process.cwd());
const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');
const p = new PrismaClient();

async function pages(model, where, select) {
  const rows = [];
  let last = 0;
  while (true) {
    const batch = await model.findMany({ where: { AND: [where, { id: { gt: last } }] }, select, orderBy: { id: 'asc' }, take: 500 });
    rows.push(...batch);
    if (batch.length < 500) return rows;
    last = batch[batch.length - 1].id;
    if (rows.length >= 50000) throw new Error('Diagnostic size limit exceeded; narrow the period');
  }
}

(async () => {
  const startedAt = new Date().toISOString();
  const names = ['مياه', 'ماء', 'ميه', 'water'];
  const products = await p.inv_products.findMany({ where: { OR: names.flatMap(name => [{ name_ar: { contains: name } }, { name_en: { contains: name } }]) }, select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, status: true, is_deleted: true } });
  const ids = products.map(row => row.id);
  if (!ids.length) throw new Error('No matching water products');
  const cafeProducts = await p.cafe_products.findMany({ where: { inventory_product_id: { in: ids } }, select: { id: true, name: true, product_type: true, inventory_product_id: true } });
  const cafeIds = cafeProducts.map(row => row.id);
  const waterItem = { OR: [{ inventory_product_id: { in: ids } }, { cafe_product_id: { in: cafeIds } }, { cafe_product_id: null, product_id: { in: ids } }, ...names.map(name => ({ name: { contains: name } }))] };
  const movements = await pages(p.inv_movements, { product_id: { in: ids } }, { id: true, product_id: true, warehouse_id: true, branch_id: true, movement_date: true, created_at: true, direction: true, quantity: true, balance_after: true, doc_type: true, doc_ref: true });
  // Include invoices whose water lines were later removed, using the movement reference.
  const saleReferences = [...new Set(movements.map(m => m.doc_ref).filter(Boolean))];
  const sales = await pages(p.sales_quick_sales, { OR: [{ items: { some: waterItem } }, { sale_number: { in: saleReferences } }] }, { id: true, sale_number: true, sale_date: true, sale_time: true, sale_type: true, status: true, branch_id: true, warehouse_id: true, inventory_posted: true, employee_id: true, partner_id: true, billing_cycle: true, billing_status: true, total_amount: true, collected_amount: true, events: true, items: { where: waterItem, select: { id: true, name: true, quantity: true, product_id: true, inventory_product_id: true, cafe_product_id: true } } });
  const balances = await p.inv_stock_balances.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, warehouse_id: true, current_stock: true } });
  const counts = await p.inv_count_sessions.findMany({ where: { items: { some: { product_id: { in: ids } } } }, orderBy: { id: 'asc' }, select: { id: true, session_number: true, warehouse_id: true, status: true, created_at: true, updated_at: true, items: { where: { product_id: { in: ids } }, select: { product_id: true, system_quantity: true, counted_quantity: true, variance: true } } } });
  const byReference = new Map();
  for (const m of movements) {
    const list = byReference.get(m.doc_ref) || [];
    list.push(m);
    byReference.set(m.doc_ref, list);
  }
  const comparisons = sales.filter(s => s.status === 'completed').flatMap(s => {
    const expected = new Map();
    for (const item of s.items) {
      const id = item.inventory_product_id || (!item.cafe_product_id ? item.product_id : null);
      if (id) expected.set(id, (expected.get(id) || 0) + Number(item.quantity));
    }
    for (const movement of byReference.get(s.sale_number) || []) {
      if (!expected.has(movement.product_id)) expected.set(movement.product_id, 0);
    }
    return [...expected].map(([productId, quantity]) => {
      const linked = (byReference.get(s.sale_number) || []).filter(m => m.product_id === productId);
      const netDeducted = -linked.reduce((sum, m) => sum + Number(m.quantity), 0);
      return { saleNumber: s.sale_number, saleType: s.sale_type, productId, quantity, netDeducted, matches: Math.abs(quantity - netDeducted) < 0.0001, movementIds: linked.map(m => m.id) };
    });
  });
  const balanceChecks = balances.map(b => {
    const linked = movements.filter(m => m.product_id === b.product_id && m.warehouse_id === b.warehouse_id);
    return { ...b, ledgerTotal: linked.reduce((sum, m) => sum + Number(m.quantity), 0), lastMovementBalance: linked.length ? linked[linked.length - 1].balance_after : null };
  });
  const nonCompletedSales = sales.filter(s => s.status !== 'completed').map(s => ({ ...s, movements: byReference.get(s.sale_number) || [] }));
  const movementSummary = [];
  for (const product of products) {
    const groups = new Map();
    for (const m of movements.filter(row => row.product_id === product.id)) {
      const key = `${m.warehouse_id}/${m.doc_type}`;
      const group = groups.get(key) || { warehouseId: m.warehouse_id, type: m.doc_type, incoming: 0, outgoing: 0, count: 0 };
      const quantity = Number(m.quantity);
      group.incoming += Math.max(quantity, 0);
      group.outgoing += Math.max(-quantity, 0);
      group.count++;
      groups.set(key, group);
    }
    movementSummary.push({ productId: product.id, name: product.name_ar, groups: [...groups.values()] });
  }
  console.log(JSON.stringify({ version: 2, appRoot, startedAt, finishedAt: new Date().toISOString(), note: 'Read-only queries; sales can continue during collection. Ledger totals require complete opening history. Returned stock does not prove physical return.', products, cafeProducts, balanceChecks, counts, movementSummary, nonCompletedSales, checkedSaleProductPairs: comparisons.length, mismatches: comparisons.filter(row => !row.matches), accountSales: sales.filter(s => s.sale_type !== 'customer'), sales, movements }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
