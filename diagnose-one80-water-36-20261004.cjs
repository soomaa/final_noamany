'use strict';

// Read-only follow-up to the supplied movement report. Never modifies data.
// Product/branch and starting instant come from supplier movement 3257.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || process.cwd());
const productId = 36;
const branchId = 1;
const since = new Date('2026-10-03T13:52:23.962Z');
let db;
const out = {};

async function main() {
  const req = createRequire(path.join(app, 'package.json'));
  req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
  const { PrismaClient } = req('@prisma/client');
  db = new PrismaClient({ log: [{ level: 'error', emit: 'event' }] });
  out.info = {
    capturedUtc: new Date().toISOString(), sinceUtc: since.toISOString(), productId, branchId,
    mode: 'SELECT only / RepeatableRead snapshot',
    limits: 'Up to 500 matching invoices and 2000 movements; stop if exceeded.',
    interpretation: 'Invoice comparisons use CURRENT item quantities and mappings, not historical snapshots or a physical count. Discrepancies require review; they do not establish misconduct. Only invoices created after the starting instant are compared.',
  };
  out.version = ['inventory/inventory-stock.service', 'inventory/stock-taking.service', 'inventory/inventory-dashboard.service', 'cafe/cafe-products.service', 'sales/quick-sales.service'].map(name => {
    const relative = `dist/modules/${name}.js`;
    const file = path.join(app, relative);
    return fs.existsSync(file) ? {
      file: relative, modifiedUtc: fs.statSync(file).mtime.toISOString(),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    } : { file: relative, missing: true };
  });
  await db.$transaction(async tx => {
    out.product = await tx.inv_products.findUnique({
      where: { id: productId },
      select: { id: true, name_ar: true, product_code: true, unit_of_measure: true, is_deleted: true },
    });
    out.balances = await tx.inv_stock_balances.findMany({
      where: { product_id: productId },
      select: { warehouse_id: true, current_stock: true, last_updated: true,
        warehouse: { select: { name_ar: true, branch_id: true, is_deleted: true } } },
    });
    out.branchBalances = await tx.inv_product_branches.findMany({
      where: { product_id: productId },
      select: { branch_id: true, stock_quantity: true, last_updated: true },
    });
    out.cafeMappings = await tx.cafe_products.findMany({
      where: { OR: [{ inventory_product_id: productId }, { name: { in: ['مياه كبيره', 'مياه كبيرة'] } }] },
      select: { id: true, name: true, product_type: true, inventory_product_id: true, is_active: true },
    });
    out.inventorySettings = await tx.sales_pos_settings.findMany({
      where: { setting_key: 'inventory_tracking_enabled', OR: [{ branch_id: branchId }, { branch_id: null }] },
      select: { branch_id: true, setting_value: true, is_active: true, updated_at: true },
    });
    const movementSelect = { id: true, warehouse_id: true, branch_id: true, quantity: true,
      balance_after: true, doc_type: true, doc_ref: true, created_at: true, created_by: true };
    const moves = await tx.inv_movements.findMany({
      where: { product_id: productId, created_at: { gte: since } },
      select: movementSelect, orderBy: { id: 'asc' }, take: 2001,
    });
    if (moves.length > 2000) throw new Error('MOVEMENT_LIMIT');
    out.ledger = out.balances.map(b => {
      const mine = moves.filter(m => m.warehouse_id === b.warehouse_id);
      const gaps = mine.slice(1).flatMap((m, i) => {
        const expected = Number(mine[i].balance_after) + Number(m.quantity);
        return Math.abs(expected - Number(m.balance_after)) > 0.000001
          ? [{ previousId: mine[i].id, id: m.id, expected, recorded: Number(m.balance_after) }] : [];
      });
      return { warehouseId: b.warehouse_id, movements: mine.length,
        first: mine[0] || null, last: mine[mine.length - 1] || null,
        netQuantity: mine.reduce((s, m) => s + Number(m.quantity), 0),
        recordedSequenceGaps: gaps,
        currentMinusLastRecordedBalance: mine.length ? Number(b.current_stock) - Number(mine[mine.length - 1].balance_after) : null };
    });
    out.increasesAndTargetBalances = moves.filter(m => Number(m.quantity) > 0 || [165, 176].includes(Number(m.balance_after)));
    // A second display path calculates stock from lifetime movements. A recent
    // perfectly continuous ledger does not exclude an older opening/history gap.
    const history = await tx.inv_movements.findMany({
      where: { product_id: productId, warehouse_id: 1 },
      select: { ...movementSelect, movement_date: true, direction: true },
      orderBy: { id: 'asc' }, take: 10001,
    });
    if (history.length > 10000) throw new Error('HISTORY_LIMIT');
    const gaps = history.slice(1).flatMap((m, index) => {
      const previous = history[index];
      const expected = Number(previous.balance_after) + Number(m.quantity);
      return Math.abs(expected - Number(m.balance_after)) > 0.000001
        ? [{ previousId: previous.id, previousAt: previous.created_at,
          previousBalance: Number(previous.balance_after), next: m,
          recordedMinusExpected: Number(m.balance_after) - expected }] : [];
    });
    const anchor = history.find(m => m.id === 3373);
    const first = history[0];
    const live = out.balances.find(b => b.warehouse_id === 1);
    const lifetimeSum = history.reduce((n, m) => n + Number(m.quantity), 0);
    const anchorSum = anchor ? history.filter(m => m.id <= anchor.id).reduce((n, m) => n + Number(m.quantity), 0) : null;
    const targetRows = history.filter(m => [165, 176].includes(Number(m.balance_after)) || [165, 176].includes(Number(m.balance_after) - Number(m.quantity)));
    out.historyComparison = {
      warehouseId: 1, totalMovements: history.length,
      firstMovement: first || null,
      impliedBalanceBeforeFirstMovement: first ? Number(first.balance_after) - Number(first.quantity) : null,
      currentStoredBalance: live ? Number(live.current_stock) : null,
      lifetimeSignedQuantitySum: lifetimeSum,
      currentMinusLifetimeSum: live ? Number(live.current_stock) - lifetimeSum : null,
      atReported176: anchor ? { movement: anchor,
        quantitySumThroughMovementId: anchorSum,
        recordedBalanceMinusSum: Number(anchor.balance_after) - anchorSum } : null,
      sequenceGapCount: gaps.length, sequenceGaps: gaps.slice(-30),
      olderGapsOmitted: gaps.length > 30,
      targetBalanceRows: targetRows.slice(-30), olderTargetRowsOmitted: targetRows.length > 30,
      note: 'Gaps are candidates, not proof of loss: IDs are not a guaranteed transaction-commit order. A lifetime quantity sum requires a complete opening ledger. The anchor uses movement ID order, not a captured historical API response.',
    };
    const cafeIds = out.cafeMappings.map(c => c.id);
    const waterItem = { OR: [
      { inventory_product_id: productId },
      { cafe_product_id: { in: cafeIds } },
      { cafe_product_id: null, product_id: productId },
      { name: { in: ['مياه كبيره', 'مياه كبيرة'] } },
    ] };
    const sales = await tx.sales_quick_sales.findMany({
      where: { branch_id: branchId, created_at: { gte: since }, items: { some: waterItem } },
      take: 501, orderBy: { id: 'asc' },
      select: {
        id: true, sale_number: true, status: true, sale_type: true,
        inventory_posted: true, warehouse_id: true, created_at: true, updated_at: true,
        items: { where: waterItem, select: { name: true, quantity: true, product_id: true,
          cafe_product_id: true, inventory_product_id: true } },
      },
    });
    if (sales.length > 500) throw new Error('INVOICE_LIMIT');
    const refs = sales.map(s => s.sale_number);
    const invoiceMoves = refs.length ? await tx.inv_movements.findMany({
      where: { product_id: productId, doc_ref: { in: refs } },
      select: movementSelect, orderBy: { id: 'asc' }, take: 2001,
    }) : [];
    if (invoiceMoves.length > 2000) throw new Error('INVOICE_MOVEMENT_LIMIT');
    const readyCafeIds = new Set(out.cafeMappings.filter(c => c.inventory_product_id === productId && c.product_type === 'ready').map(c => c.id));
    const checked = sales.map(s => {
      const linked = s.items.filter(i => i.inventory_product_id === productId || readyCafeIds.has(i.cafe_product_id) || (i.cafe_product_id == null && i.product_id === productId));
      const quantity = linked.reduce((n, i) => n + Number(i.quantity), 0);
      const movements = invoiceMoves.filter(m => m.doc_ref === s.sale_number);
      const netDeducted = -movements.reduce((n, m) => n + Number(m.quantity), 0);
      const active = ['completed', 'draft'].includes(s.status);
      return { ...s, matchedQuantity: quantity, uncertainMapping: linked.length !== s.items.length,
        netDeducted, active, shortDeduction: active ? quantity - netDeducted : null, movements };
    });
    out.invoiceSummary = {
      invoicesChecked: checked.length,
      activeInvoices: checked.filter(s => s.active).length,
      activeMatchedQuantity: checked.filter(s => s.active).reduce((n, s) => n + s.matchedQuantity, 0),
      activeNetDeducted: checked.filter(s => s.active).reduce((n, s) => n + s.netDeducted, 0),
    };
    out.invoicesToReview = checked.filter(s => s.uncertainMapping || !s.inventory_posted || !s.active || Math.abs(s.shortDeduction || 0) > 0.000001);
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30000 });
  const displayOnly = process.argv.includes('--display-only');
  for (const [name, value] of Object.entries(out)) {
    if (displayOnly && !['info', 'version', 'product', 'balances', 'branchBalances', 'historyComparison'].includes(name)) continue;
    console.log(`\n=== ${name} ===`);
    for (const row of Array.isArray(value) ? value : [value]) console.log(JSON.stringify(row));
  }
}

main().catch(e => {
  const limits = new Set(['MOVEMENT_LIMIT', 'INVOICE_LIMIT', 'INVOICE_MOVEMENT_LIMIT', 'HISTORY_LIMIT']);
  console.error('READ_FAILED', limits.has(e.message) ? e.message : (e.code || e.name));
  process.exitCode = 1;
}).finally(async () => { if (db) await db.$disconnect(); });
