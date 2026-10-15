'use strict';
// READ-ONLY full reconciliation dump for inventory items matching --search (default: water).
// Collects every source that can move their stock — movements, invoices (+items, events),
// drafts, refunds/cancels, invoice edits, stock counts (+audit of every line edit), purchases,
// waste, internal issues, opening stock — plus daily sales of every café product (to find drinks
// that consume the item without having it in their recipe). Nothing is written.
// Usage: node diagnose-one80-full-reconciliation.cjs APP_DIR [--search=مياه,water] [--since=2026-09-01]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const terms = (arg('search') ?? 'مياه,مياة,ميه,مية,water').split(',').map((t) => t.trim()).filter(Boolean);
const since = new Date(`${arg('since') ?? '2026-09-01'}T00:00:00+03:00`);
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const out = { meta: { generatedAt: new Date().toISOString(), since: since.toISOString(), terms }, errors: [] };
const num = (v) => (v == null ? null : Number(v));

async function section(name, fn) {
  try { out[name] = await fn(); } catch (e) { out.errors.push({ section: name, message: String(e.message).slice(0, 400) }); }
}

async function main() {
  const products = await p.inv_products.findMany({
    where: { OR: terms.flatMap((t) => [{ name_ar: { contains: t } }, { name_en: { contains: t } }]) },
    select: { id: true, product_code: true, name_ar: true, name_en: true, unit_of_measure: true, inventory_kind: true, status: true, is_deleted: true, cost_price: true, created_at: true, updated_at: true },
  });
  out.products = products.map((x) => ({ ...x, cost_price: num(x.cost_price) }));
  const ids = products.map((x) => x.id);
  if (!ids.length) throw new Error('No inventory item matched the search terms');

  await section('balances', async () => (await p.inv_stock_balances.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, warehouse_id: true, current_stock: true, last_updated: true } })).map((b) => ({ ...b, current_stock: num(b.current_stock) })));
  await section('branchMirrors', async () => (await p.inv_product_branches.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, branch_id: true, stock_quantity: true, last_updated: true } })).map((b) => ({ ...b, stock_quantity: num(b.stock_quantity) })));

  await section('cafeProducts', () => p.cafe_products.findMany({ select: { id: true, name: true, product_code: true, product_type: true, is_active: true, inventory_product_id: true, created_at: true, updated_at: true } }));
  await section('recipes', async () => (await p.cafe_product_recipes.findMany({ select: { product_id: true, ingredient_id: true, quantity: true, unit: true } })).map((r) => ({ ...r, quantity: num(r.quantity) })));
  await section('variants', () => p.cafe_product_variants.findMany({ select: { id: true, product_id: true, name: true, is_active: true } }));
  await section('variantRecipes', async () => (await p.cafe_variant_recipes.findMany({ select: { variant_id: true, ingredient_id: true, quantity: true, unit: true } })).map((r) => ({ ...r, quantity: num(r.quantity) })));
  await section('bundles', () => p.cafe_bundles.findMany({ select: { id: true, name: true, is_active: true, groups: { select: { id: true, name: true, options: { select: { cafe_product_id: true, cafe_variant_id: true, is_active: true } } } } } }));
  // Café products that move these items: ready products linked to them AND drinks whose recipe
  // (product or size) uses them — so drink orders are reconciled even if nothing was deducted.
  const variantProduct = new Map((out.variants ?? []).map((v) => [v.id, v.product_id]));
  const itemCafeIds = [...new Set([
    ...(out.cafeProducts ?? []).filter((c) => ids.includes(c.inventory_product_id)).map((c) => c.id),
    ...(out.recipes ?? []).filter((r) => ids.includes(r.ingredient_id)).map((r) => r.product_id),
    ...(out.variantRecipes ?? []).filter((r) => ids.includes(r.ingredient_id)).map((r) => variantProduct.get(r.variant_id)).filter(Boolean),
  ])];
  out.meta.itemCafeIds = itemCafeIds;

  // Opening balance: last movement before `since`, then every movement after it.
  await section('movementsBefore', async () => Promise.all(ids.map(async (id) => {
    const m = await p.inv_movements.findFirst({ where: { product_id: id, created_at: { lt: since } }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], select: { id: true, product_id: true, warehouse_id: true, created_at: true, balance_after: true } });
    return m ? { ...m, balance_after: num(m.balance_after) } : { product_id: id, none: true };
  })));
  await section('movements', async () => (await p.inv_movements.findMany({
    where: { product_id: { in: ids }, created_at: { gte: since } },
    select: { id: true, product_id: true, warehouse_id: true, branch_id: true, created_at: true, movement_date: true, txn_type: true, direction: true, quantity: true, balance_after: true, unit_cost: true, doc_type: true, doc_ref: true, transaction_id: true, created_by: true, notes: true },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  })).map((m) => ({ ...m, quantity: num(m.quantity), balance_after: num(m.balance_after), unit_cost: num(m.unit_cost) })));

  // Every invoice that touched these items: by movement doc_ref OR by line item.
  const refs = [...new Set((out.movements ?? []).map((m) => m.doc_ref).filter((r) => r && /^QS-/.test(r)))];
  await section('sales', async () => {
    const where = { OR: [
      ...(refs.length ? [{ sale_number: { in: refs } }] : []),
      { created_at: { gte: new Date(since.getTime() - 86400000) }, items: { some: { OR: [{ inventory_product_id: { in: ids } }, ...(itemCafeIds.length ? [{ cafe_product_id: { in: itemCafeIds } }] : []), { bundle_id: { not: null } }] } } },
    ] };
    const rows = await p.sales_quick_sales.findMany({
      where,
      select: { id: true, sale_number: true, daily_number: true, sale_date: true, sale_time: true, business_date: true, sale_type: true, status: true, branch_id: true, warehouse_id: true, shift_session_id: true, inventory_posted: true, cashier_id: true, created_by: true, created_at: true, updated_at: true, total_amount: true, collected_amount: true, payment_method: true, billing_status: true, employee_id: true, partner_id: true,
        items: { select: { id: true, item_type: true, product_id: true, cafe_product_id: true, cafe_variant_id: true, inventory_product_id: true, bundle_id: true, bundle_selection: true, name: true, quantity: true, free_quantity: true, unit_price: true, line_total: true } },
        events: { select: { event_type: true, created_by: true, created_at: true, notes: true }, orderBy: { created_at: 'asc' } } },
      orderBy: { id: 'asc' },
    });
    return rows.map((s) => ({ ...s, total_amount: num(s.total_amount), collected_amount: num(s.collected_amount), items: s.items.map((i) => ({ ...i, quantity: num(i.quantity), unit_price: num(i.unit_price), line_total: num(i.line_total) })) }));
  });

  // Daily quantity sold of EVERY café product (to spot drinks that use the item off-recipe).
  await section('productSalesDaily', async () => {
    const rows = await p.$queryRawUnsafe(`
      SELECT s.business_date AS day, s.status, s.shift_session_id AS shift, i.cafe_product_id AS cafe_product_id, i.name AS name,
             SUM(i.quantity) AS qty, COUNT(*) AS line_count
      FROM sales_quick_sale_items i JOIN sales_quick_sales s ON s.id = i.quick_sale_id
      WHERE s.created_at >= ?
      GROUP BY s.business_date, s.status, s.shift_session_id, i.cafe_product_id, i.name`, since);
    return rows.map((r) => ({ day: r.day, status: r.status, shift: r.shift == null ? null : Number(r.shift), cafe_product_id: r.cafe_product_id == null ? null : Number(r.cafe_product_id), name: r.name, qty: Number(r.qty), lines: Number(r.line_count) }));
  });

  await section('countSessions', async () => (await p.inv_count_sessions.findMany({
    where: { OR: [{ created_at: { gte: new Date(since.getTime() - 3 * 86400000) } }, { items: { some: { product_id: { in: ids } } }, updated_at: { gte: since } }] },
    select: { id: true, session_number: true, status: true, notes: true, created_by: true, created_at: true, updated_at: true, warehouse_id: true, branch_id: true,
      items: { select: { id: true, product_id: true, item_name: true, system_quantity: true, counted_quantity: true, variance: true, variance_reason: true, created_at: true } },
      adjustments: { select: { id: true, adjustment_number: true, status: true, approved_by: true, approved_at: true, created_at: true } } },
    orderBy: { id: 'asc' },
  })).map((s) => ({ ...s, itemCount: s.items.length, items: s.items.filter((i) => ids.includes(i.product_id)).map((i) => ({ ...i, system_quantity: num(i.system_quantity), counted_quantity: num(i.counted_quantity), variance: num(i.variance) })) })));

  await section('audit', async () => (await p.business_audit_log.findMany({
    where: { created_at: { gte: since }, entity_type: { in: ['products', 'cafe-products', 'cafe-bundles', 'stock-taking', 'opening-stocks', 'cafe-waste', 'inventory-transactions', 'cafe_recipe_ingredient_relink', 'cafe_recipe_ingredient_removal', 'inventory_product_restore', 'cafe_ingredient_swap', 'sales_billing_cycle'] } },
    select: { id: true, entity_type: true, entity_id: true, action: true, actor_user_id: true, actor_name: true, created_at: true, after_json: true, reason: true },
    orderBy: { created_at: 'asc' },
  })));

  await section('supplierInvoiceItems', async () => (await p.prc_supplier_invoice_items.findMany({
    where: { product_id: { in: ids }, invoice: { created_at: { gte: new Date(since.getTime() - 7 * 86400000) } } },
    select: { id: true, product_id: true, product_name: true, quantity: true, unit: true, base_quantity: true, package_id: true, unit_price: true,
      invoice: { select: { id: true, invoice_number: true, supplier_invoice_number: true, supplier_id: true, invoice_date: true, status: true, stock_applied: true, stocked_at: true, is_deleted: true, created_by: true, created_at: true, updated_at: true } } },
  })).map((i) => ({ ...i, quantity: num(i.quantity), base_quantity: num(i.base_quantity), unit_price: num(i.unit_price) })));

  await section('waste', async () => (await p.cafe_waste_records.findMany({
    where: { created_at: { gte: since }, OR: [{ inventory_product_id: { in: ids } }, ...(itemCafeIds.length ? [{ cafe_product_id: { in: itemCafeIds } }] : [])] },
    select: { id: true, reference: true, source_name: true, inventory_product_id: true, cafe_product_id: true, quantity: true, unit: true, reason_name: true, status: true, created_by: true, created_at: true, reversed_at: true, shift_session_id: true },
  })).map((w) => ({ ...w, quantity: num(w.quantity) })));

  const txIds = [...new Set((out.movements ?? []).map((m) => m.transaction_id).filter(Boolean))];
  await section('transactions', async () => (await p.inv_transactions.findMany({
    where: { id: { in: txIds } },
    select: { id: true, reference: true, txn_type: true, status: true, txn_date: true, notes: true, reason: true, created_by: true, approved_by: true, created_at: true, items: { where: { product_id: { in: ids } }, select: { product_id: true, item_name: true, quantity: true, unit: true } } },
  })).map((t) => ({ ...t, items: t.items.map((i) => ({ ...i, quantity: num(i.quantity) })) })));

  await section('packages', async () => (await p.inv_product_packages.findMany({ where: { product_id: { in: ids } } })).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v != null && typeof v === 'object' && 'toNumber' in v ? Number(v) : v]))));
  await section('openingStocks', async () => (await p.inv_opening_stocks.findMany({ where: { product_id: { in: ids } }, select: { id: true, product_id: true, quantity: true, opening_stock_date: true, is_deleted: true, created_at: true, notes: true } })).map((o) => ({ ...o, quantity: num(o.quantity) })));

  await section('shiftSessions', () => p.sales_shift_sessions.findMany({
    where: { start_time: { gte: new Date(since.getTime() - 86400000) } },
    select: { id: true, shift_id: true, branch_id: true, user_id: true, session_date: true, start_time: true, end_time: true, status: true, closed_by: true, transactions_count: true, shift: { select: { shift_name: true } } },
    orderBy: { start_time: 'asc' },
  }));

  await section('posSettings', () => p.sales_pos_settings.findMany({ where: { setting_key: 'inventory_tracking_enabled' }, select: { branch_id: true, setting_value: true, is_active: true, updated_at: true } }));

  const userIds = new Set();
  for (const m of out.movements ?? []) if (m.created_by) userIds.add(m.created_by);
  for (const s of out.sales ?? []) { [s.cashier_id, s.created_by].forEach((u) => u && userIds.add(u)); s.events.forEach((e) => e.created_by && userIds.add(e.created_by)); }
  for (const c of out.countSessions ?? []) { if (c.created_by) userIds.add(c.created_by); c.adjustments.forEach((a) => /^\d+$/.test(a.approved_by ?? '') && userIds.add(Number(a.approved_by))); }
  for (const a of out.audit ?? []) if (a.actor_user_id) userIds.add(a.actor_user_id);
  for (const s of out.shiftSessions ?? []) [s.user_id, s.closed_by].forEach((u) => u && userIds.add(u));
  await section('users', () => p.users.findMany({ where: { user_id: { in: [...userIds].map(Number).filter(Number.isInteger) } }, select: { user_id: true, name: true, username: true } }));
}

main()
  .catch((e) => out.errors.push({ section: 'main', message: String(e.message).slice(0, 400) }))
  .finally(async () => {
    await p.$disconnect();
    process.stdout.write(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    process.stderr.write(`sections: ${Object.keys(out).join(', ')} | errors: ${out.errors.length}\n`);
  });
