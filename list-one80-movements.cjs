'use strict';
// Read-only: every stock movement of one inventory product in the last N days, one line each,
// with the invoice type/status behind it — to see exactly which event moved the balance.
// Usage: node list-one80-movements.cjs APP_DIR --product=155 [--days=3]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
let productId = Number(process.argv.find((a) => a.startsWith('--product='))?.slice(10));
const nameArg = process.argv.find((a) => a.startsWith('--name='))?.slice(7);
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) || 3);
if (!productId && !nameArg) throw new Error('Usage: --product=ID or --name=text');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const cairo = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(d));
async function main() {
  if (!productId) {
    const matches = await p.inv_products.findMany({ where: { OR: [{ name_ar: { contains: nameArg } }, { name_en: { contains: nameArg } }] }, select: { id: true, name_ar: true, unit_of_measure: true, is_deleted: true, status: true } });
    console.log('أصناف المخزون المطابقة:', JSON.stringify(matches));
    const cafe = await p.cafe_products.findMany({ where: { name: { contains: nameArg } }, select: { id: true, name: true, product_type: true, inventory_product_id: true, recipes: { select: { ingredient_id: true, quantity: true, unit: true } } } });
    console.log('منتجات الكافيه المطابقة:', JSON.stringify(cafe));
    const active = matches.filter((m) => !m.is_deleted);
    if (active.length !== 1) { console.log('حدد الصنف بـ --product=ID'); return; }
    productId = active[0].id;
  }
  const product = await p.inv_products.findUnique({ where: { id: productId }, select: { name_ar: true, unit_of_measure: true } });
  const moves = await p.inv_movements.findMany({ where: { product_id: productId, created_at: { gte: new Date(Date.now() - days * 86400000) } }, orderBy: { id: 'asc' } });
  const refs = [...new Set(moves.map((m) => m.doc_ref).filter((r) => r && /^QS-/.test(r)))];
  const sales = refs.length ? await p.sales_quick_sales.findMany({ where: { sale_number: { in: refs } }, select: { sale_number: true, status: true, sale_type: true, cashier_id: true, items: { select: { name: true, quantity: true } }, events: { select: { event_type: true, created_at: true, created_by: true } } } }) : [];
  const users = await p.users.findMany({ select: { user_id: true, name: true, username: true } });
  const uname = (id) => { const u = users.find((x) => x.user_id === id); return u ? (u.name || u.username) : `#${id}`; };
  console.log(`${product?.name_ar} (${product?.unit_of_measure}) — آخر ${days} أيام — ${moves.length} حركة\n`);
  console.log('الوقت              | الكمية    | الرصيد بعدها | النوع             | المرجع                | تفاصيل');
  for (const m of moves) {
    const s = sales.find((x) => x.sale_number === m.doc_ref);
    const detail = s ? `${s.sale_type}/${s.status} كاشير ${uname(s.cashier_id)} — ${s.items.map((i) => `${i.name}×${Number(i.quantity)}`).join(', ')}${s.events.filter((e) => e.event_type !== 'completed').map((e) => ` [${e.event_type} ${cairo(e.created_at)} ${uname(e.created_by)}]`).join('')}` : (m.notes ?? '');
    console.log(`${cairo(m.created_at)} | ${String(Number(m.quantity)).padStart(8)} | ${String(Number(m.balance_after)).padStart(11)} | ${(m.doc_type ?? m.txn_type).padEnd(17)} | ${(m.doc_ref ?? '').padEnd(21)} | ${detail}`);
  }
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
