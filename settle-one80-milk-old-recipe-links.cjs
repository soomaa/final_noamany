'use strict';
// Moves the milk that café sales deducted from the RETIRED milk product (83)
// onto the CURRENT milk product (155), but only for sales recorded AFTER the
// last approved stock count of product 155 — earlier deductions were already
// absorbed when that count reset the balance to the physically counted amount.
//
// Default = read-only preview. Pass --apply to record the correction.
// No accounting entry is posted: each sale already booked its COGS when it
// was rung up; this only fixes which inventory balance carries the deduction.
const OLD_ID = 83, OLD_CODE = 'PRD000047';
const NEW_ID = 155, NEW_CODE = 'PRD000119';
const WAREHOUSE_ID = 1, BRANCH_ID = 1;
const REF = 'ONE80-MILK-OLD-RECIPE-LINKS-20260920';
const SALE_DOC_TYPES = ['sale', 'cafe_sale', 'cafe_sale_edit'];

function round3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }

function plan({ cutoff, oldMovements, newBalance }) {
  const rows = oldMovements
    .filter((m) => m.direction === 'out' && SALE_DOC_TYPES.includes(m.doc_type) && new Date(m.created_at) > cutoff)
    .map((m) => ({ id: m.id, at: m.created_at, saleNumber: m.doc_ref, liters: round3(Math.abs(Number(m.quantity))) }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const total = round3(rows.reduce((sum, r) => sum + r.liters, 0));
  const before = Number(newBalance.current_stock);
  if (!Number.isFinite(before)) throw new Error('Current milk balance is not numeric');
  if (total <= 0) throw new Error('Nothing to move: no old-milk sale deductions after the last approved count');
  if (before < total) throw new Error(`Current milk balance ${before} is below the ${total} L to move`);
  return { rows, total, before, after: round3(before - total) };
}
module.exports = { plan };

async function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createRequire } = require('node:module');
  const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
  const apply = process.argv.includes('--apply');
  const req = createRequire(path.join(app, 'package.json'));
  req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
  const { PrismaClient } = req('@prisma/client');
  const { InventoryStockService } = req(path.join(app, 'dist/modules/inventory/inventory-stock.service.js'));
  const p = new PrismaClient();
  const stock = new InventoryStockService(p);
  try {
    const result = await p.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM inv_stock_balances WHERE warehouse_id=${WAREHOUSE_ID} AND product_id IN (${OLD_ID},${NEW_ID}) ORDER BY product_id FOR UPDATE`);
      const existing = await tx.inv_count_sessions.findUnique({ where: { session_number: REF } });
      if (existing) return { status: 'ALREADY_RECORDED_NO_DEDUCTION', reference: REF, statusRecorded: existing.status };
      if (await tx.inv_movements.findFirst({ where: { doc_ref: REF } })) throw new Error('Existing movement without session; manual review required');

      const products = await tx.inv_products.findMany({ where: { id: { in: [OLD_ID, NEW_ID] } } });
      const oldP = products.find((x) => x.id === OLD_ID), newP = products.find((x) => x.id === NEW_ID);
      if (!oldP || oldP.product_code !== OLD_CODE || !oldP.is_deleted) throw new Error('Old milk identity mismatch (expected deleted PRD000047)');
      if (!newP || newP.product_code !== NEW_CODE || newP.is_deleted || newP.status !== 'active') throw new Error('Current milk identity mismatch (expected active PRD000119)');
      if (String(oldP.unit_of_measure).toLowerCase() !== String(newP.unit_of_measure).toLowerCase()) throw new Error('Unit mismatch between old and current milk');
      if (!(Number(newP.cost_price) > 0)) throw new Error('Current milk has no positive cost price');

      // Cutoff = last APPROVED count adjustment whose session counted the current milk.
      const adj = await tx.inv_adjustments.findFirst({
        where: { status: 'approved', approved_at: { not: null }, session: { items: { some: { product_id: NEW_ID } } } },
        orderBy: { approved_at: 'desc' }, include: { session: { select: { session_number: true } } },
      });
      if (!adj) throw new Error('No approved stock count found for the current milk; refusing to guess a cutoff');
      const cutoff = adj.approved_at;

      const oldMovements = await tx.inv_movements.findMany({ where: { product_id: OLD_ID, warehouse_id: WAREHOUSE_ID }, orderBy: { created_at: 'asc' } });
      const balances = await tx.inv_stock_balances.findMany({ where: { warehouse_id: WAREHOUSE_ID, product_id: { in: [OLD_ID, NEW_ID] } } });
      const newBalance = balances.find((b) => b.product_id === NEW_ID);
      if (!newBalance) throw new Error('Current milk has no warehouse balance row');
      const mirror = await tx.inv_product_branches.findFirst({ where: { branch_id: BRANCH_ID, product_id: NEW_ID } });
      if (!mirror || Number(mirror.stock_quantity) !== Number(newBalance.current_stock)) throw new Error('Branch/warehouse balance mismatch for current milk');

      const planned = plan({ cutoff, oldMovements, newBalance });
      const report = {
        cutoff: { adjustment: adj.adjustment_number, session: adj.session?.session_number, approvedAt: cutoff },
        oldMilkGhostBalance: Number(balances.find((b) => b.product_id === OLD_ID)?.current_stock ?? 0),
        movesToCurrentMilk: planned.rows, totalLiters: planned.total,
        currentMilk: { before: planned.before, after: planned.after },
      };
      if (!apply) return { status: 'PREVIEW_ONLY', ...report };

      fs.mkdirSync(path.join(app, 'backups'), { recursive: true });
      const dir = fs.mkdtempSync(path.join(app, 'backups', 'milk-old-recipe-links-'));
      fs.chmodSync(dir, 0o700);
      const backup = path.join(dir, 'before.json');
      fs.writeFileSync(backup, JSON.stringify({ reference: REF, createdAt: new Date(), products, balances, mirror, report }, null, 2), { flag: 'wx', mode: 0o600 });

      const notes = `نقل خصم لبن ${planned.total} لتر من الصنف القديم المحذوف ${OLD_CODE} إلى الصنف الحالي ${NEW_CODE}: ${planned.rows.length} فاتورة بعد آخر جرد معتمد (${adj.adjustment_number}). الفواتير: ${planned.rows.map((r) => r.saleNumber).join(', ')}. بدون قيد محاسبي لأن المبيعات سجلت تكلفتها وقتها.`;
      const session = await tx.inv_count_sessions.create({ data: {
        session_number: REF, warehouse_id: WAREHOUSE_ID, branch_id: BRANCH_ID, status: 'completed', notes,
        items: { create: [{ product_id: NEW_ID, item_code: newP.product_code, item_name: newP.name_ar,
          system_quantity: planned.before, counted_quantity: planned.after, variance: -planned.total, variance_reason: 'خصم مبيعات سُجل على صنف لبن محذوف' }] },
      } });
      await tx.inv_adjustments.create({ data: { adjustment_number: REF, session_id: session.id, warehouse_id: WAREHOUSE_ID, status: 'approved', approved_at: new Date(), approved_by: 'SSH: owner-authorized', notes } });
      await stock.applyMovement({ productId: NEW_ID, warehouseId: WAREHOUSE_ID, branchId: BRANCH_ID, direction: 'out', quantity: planned.total,
        txnType: 'count', docType: 'stock_taking', docRef: REF, unitCost: Number(newP.cost_price), allowNegative: false }, tx);

      const after = await tx.inv_stock_balances.findFirst({ where: { warehouse_id: WAREHOUSE_ID, product_id: NEW_ID } });
      const moves = await tx.inv_movements.findMany({ where: { doc_ref: REF } });
      if (moves.length !== 1 || Number(after.current_stock) !== planned.after || Number(moves[0].quantity) !== -planned.total || Number(moves[0].balance_after) !== planned.after) {
        throw new Error('Verification failed; rolling back');
      }
      return { status: 'APPLIED_AND_VERIFIED', reference: REF, backup, ...report };
    }, { timeout: 30000, maxWait: 10000, isolationLevel: 'Serializable' });
    console.log(JSON.stringify(result, null, 2));
  } finally { await p.$disconnect(); }
}
if (require.main === module) main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; });
