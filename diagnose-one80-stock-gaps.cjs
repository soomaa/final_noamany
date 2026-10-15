'use strict';
// Read-only: for each inventory product matching --search=a,b,c (name contains, active only),
// show the balance, the last APPROVED count, and every movement since that count grouped by
// document type, by day and by shift session — so a physical gap can be placed in time.
// Usage: node diagnose-one80-stock-gaps.cjs APP_DIR --search=لبن,Espresso,تركي,استيفيا [--days=45]
const path = require('node:path');
const { createRequire } = require('node:module');

const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const searchArg = process.argv.find((a) => a.startsWith('--search='));
const terms = (searchArg ? searchArg.slice(9) : '').split(',').map((t) => t.trim()).filter(Boolean);
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) || 45);
if (!terms.length) throw new Error('Usage: node diagnose-one80-stock-gaps.cjs APP_DIR --search=a,b,c');

const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const num = (v) => Number(v ?? 0);
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const cairoDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));

async function main() {
  const products = await p.inv_products.findMany({
    where: { is_deleted: false, status: 'active', OR: terms.flatMap((t) => [{ name_ar: { contains: t } }, { name_en: { contains: t } }]) },
    select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, inventory_kind: true, cost_price: true },
    orderBy: { id: 'asc' },
  });
  const sessions = await p.sales_shift_sessions.findMany({
    where: { start_time: { gte: new Date(Date.now() - days * 86400000) } },
    select: { id: true, shift_id: true, session_date: true, start_time: true, end_time: true, status: true, shift: { select: { shift_name: true } } },
    orderBy: { start_time: 'asc' },
  });
  const report = { generatedAt: new Date().toISOString(), searchTerms: terms, products: [] };
  for (const product of products) {
    const balances = await p.inv_stock_balances.findMany({ where: { product_id: product.id }, select: { warehouse_id: true, current_stock: true, last_updated: true } });
    const lastCount = await p.inv_adjustments.findFirst({
      where: { status: 'approved', approved_at: { not: null }, session: { items: { some: { product_id: product.id } } } },
      orderBy: { approved_at: 'desc' },
      include: { session: { select: { session_number: true, items: { where: { product_id: product.id }, select: { system_quantity: true, counted_quantity: true, variance: true, variance_reason: true } } } } },
    });
    const since = lastCount?.approved_at ?? new Date(Date.now() - days * 86400000);
    const movements = await p.inv_movements.findMany({
      where: { product_id: product.id, created_at: { gt: since } },
      select: { id: true, created_at: true, direction: true, txn_type: true, quantity: true, balance_after: true, doc_type: true, doc_ref: true, created_by: true },
      orderBy: { created_at: 'asc' },
    });
    const saleRefs = [...new Set(movements.filter((m) => m.doc_ref && /^QS-/.test(m.doc_ref)).map((m) => m.doc_ref))];
    const sales = saleRefs.length ? await p.sales_quick_sales.findMany({ where: { sale_number: { in: saleRefs } }, select: { sale_number: true, shift_session_id: true, sale_type: true, status: true, cashier_id: true, created_by: true } }) : [];
    const saleByRef = new Map(sales.map((s) => [s.sale_number, s]));

    const byDoc = {}; const byDay = {}; const byShift = {}; const byUser = {};
    let netSince = 0;
    for (const m of movements) {
      const q = num(m.quantity);
      // The approved count's own adjustment row is already reflected in `counted`.
      if (!(lastCount && m.doc_ref === lastCount.adjustment_number && m.doc_type === 'stock_taking')) netSince += q;
      const k = `${m.doc_type ?? m.txn_type}:${m.direction}`;
      byDoc[k] = r3((byDoc[k] ?? 0) + q);
      const day = cairoDay(m.created_at);
      byDay[day] = byDay[day] ?? { in: 0, out: 0, saleDocs: 0 };
      if (q >= 0) byDay[day].in = r3(byDay[day].in + q); else byDay[day].out = r3(byDay[day].out + q);
      const sale = m.doc_ref ? saleByRef.get(m.doc_ref) : null;
      if (sale) {
        byDay[day].saleDocs += 1;
        const sess = sessions.find((s) => s.id === sale.shift_session_id);
        const sk = sess ? `${sess.session_date} ${sess.shift?.shift_name ?? '#' + sess.shift_id} (#${sess.id})` : `session ${sale.shift_session_id}`;
        byShift[sk] = byShift[sk] ?? { out: 0, invoices: 0, byType: {} };
        byShift[sk].out = r3(byShift[sk].out + q); byShift[sk].invoices += 1;
        byShift[sk].byType[sale.sale_type] = r3((byShift[sk].byType[sale.sale_type] ?? 0) + q);
        const u = `user ${sale.cashier_id ?? sale.created_by ?? m.created_by ?? '?'}`;
        byUser[u] = r3((byUser[u] ?? 0) + q);
      }
    }
    const countItem = lastCount?.session?.items?.[0];
    report.products.push({
      id: product.id, code: product.product_code, name: product.name_ar, unit: product.unit_of_measure, kind: product.inventory_kind,
      currentBalance: balances.map((b) => ({ warehouseId: b.warehouse_id, stock: num(b.current_stock), lastUpdated: b.last_updated })),
      lastApprovedCount: lastCount ? { adjustment: lastCount.adjustment_number, session: lastCount.session?.session_number, approvedAt: lastCount.approved_at,
        systemAtCount: num(countItem?.system_quantity), counted: num(countItem?.counted_quantity), variance: num(countItem?.variance), reason: countItem?.variance_reason ?? null } : null,
      sinceCutoff: { from: since, movements: movements.length, netChange: r3(netSince), byDocumentType: byDoc, byDay, salesByShift: byShift, salesByUser: byUser },
      expectedBalanceFromMovements: lastCount ? r3(num(countItem?.counted_quantity) + netSince) : null,
    });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
