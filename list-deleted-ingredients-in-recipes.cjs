'use strict';
// Read-only. Lists every DELETED inventory item, when it was deleted (last update of the row —
// the app stamps updated_at on soft delete; an audit-log row is used when one exists), the last
// stock movement it ever had, and every café recipe (product or size) that still references it.
// Usage: node list-deleted-ingredients-in-recipes.cjs APP_DIR   (add --all to include deleted items no recipe uses)
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const all = process.argv.includes('--all');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const cairo = (d) => d ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : null;

async function main() {
  const deleted = await p.inv_products.findMany({
    where: { is_deleted: true },
    select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, inventory_kind: true, created_at: true, updated_at: true },
    orderBy: { updated_at: 'desc' },
  });
  const ids = deleted.map((d) => d.id);
  const [productRecipes, variantRecipes, balances, audits] = await Promise.all([
    p.cafe_product_recipes.findMany({ where: { ingredient_id: { in: ids } }, select: { ingredient_id: true, quantity: true, unit: true, product: { select: { id: true, name: true, product_code: true, is_active: true } } } }),
    p.cafe_variant_recipes.findMany({ where: { ingredient_id: { in: ids } }, select: { ingredient_id: true, quantity: true, unit: true, variant: { select: { name: true, is_active: true, product: { select: { id: true, name: true, product_code: true, is_active: true } } } } } }),
    p.inv_stock_balances.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, current_stock: true } }),
    p.business_audit_log.findMany({ where: { entity_id: { in: ids.map(String) }, entity_type: { contains: 'product' }, action: { contains: 'delete' } }, select: { entity_id: true, action: true, created_at: true, actor_name: true } }).catch(() => []),
  ]);
  const lastMoves = await Promise.all(ids.map((id) => p.inv_movements.findFirst({ where: { product_id: id }, orderBy: { created_at: 'desc' }, select: { created_at: true, doc_type: true, doc_ref: true } })));
  const rows = deleted.map((d, i) => {
    const audit = audits.find((a) => a.entity_id === String(d.id));
    const recipes = [
      ...productRecipes.filter((r) => r.ingredient_id === d.id).map((r) => `${r.product.name} (${r.product.product_code}${r.product.is_active ? '' : '، موقوف'}) ${r.quantity}${r.unit}`),
      ...variantRecipes.filter((r) => r.ingredient_id === d.id).map((r) => `${r.variant.product.name} / ${r.variant.name || 'default'} (${r.variant.product.product_code}) ${r.quantity}${r.unit}`),
    ];
    return {
      id: d.id, code: d.product_code, name: d.name_ar, unit: d.unit_of_measure, kind: d.inventory_kind,
      createdAt: cairo(d.created_at),
      deletedAt: cairo(audit?.created_at ?? d.updated_at), deletedAtSource: audit ? `audit (${audit.actor_name ?? '?'})` : 'updated_at (approx.)',
      ghostBalance: Number(balances.find((b) => b.product_id === d.id)?.current_stock ?? 0),
      lastMovement: lastMoves[i] ? `${cairo(lastMoves[i].created_at)} ${lastMoves[i].doc_type ?? ''} ${lastMoves[i].doc_ref ?? ''}`.trim() : null,
      usedInRecipes: recipes,
    };
  }).filter((r) => all || r.usedInRecipes.length);
  // Plain-text table for WhatsApp
  const lines = [`الأصناف المحذوفة من المخزون${all ? '' : ' واللي لسه في وصفات'} (${rows.length}):`, ''];
  for (const r of rows) {
    lines.push(`• ${r.name} [${r.code}] — اتحذف ${r.deletedAt}${r.ghostBalance ? ` — رصيد وهمي ${r.ghostBalance} ${r.unit}` : ''}`);
    lines.push(r.usedInRecipes.length ? `   موجود في وصفات: ${r.usedInRecipes.join(' | ')}` : '   مش موجود في أي وصفة');
  }
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2)}\n\n${lines.join('\n')}\n`);
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
