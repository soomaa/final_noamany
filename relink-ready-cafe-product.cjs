'use strict';
// Relinks READY café products that point at a deleted/inactive inventory item to an active one.
// Preview (default): lists the broken café products for --source-code and active candidates matching --match.
// Apply: --target-id=ID --apply   (units must match; past sales and stock are untouched).
// Usage: node relink-ready-cafe-product.cjs APP_DIR --source-code=PRD000076 --match=granol [--target-id=N --apply]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const sourceCode = arg('source-code');
const match = arg('match');
const targetId = Number(arg('target-id') || 0);
const apply = process.argv.includes('--apply');
if (!sourceCode) throw new Error('Usage: --source-code=PRD000076 [--match=granol] [--target-id=N --apply]');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });

async function main() {
  const source = await p.inv_products.findFirst({ where: { product_code: sourceCode }, select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, is_deleted: true, status: true } });
  if (!source) throw new Error(`Inventory item ${sourceCode} not found`);
  const cafe = await p.cafe_products.findMany({ where: { inventory_product_id: source.id, product_type: 'ready' }, select: { id: true, name: true, product_code: true, is_active: true } });
  const candidates = match ? await p.inv_products.findMany({
    where: { is_deleted: false, status: 'active', OR: [{ name_ar: { contains: match } }, { name_en: { contains: match } }] },
    select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, inventory_kind: true, balances: { select: { current_stock: true } } },
  }) : [];
  const report = {
    mode: apply ? 'apply' : 'preview',
    source,
    cafeProductsLinkedToSource: cafe,
    activeCandidates: candidates.map((c) => ({ id: c.id, code: c.product_code, name: c.name_ar, unit: c.unit_of_measure, kind: c.inventory_kind, stock: c.balances.map((b) => Number(b.current_stock)) })),
  };
  if (!apply) return report;
  if (!targetId) throw new Error('--target-id is required with --apply');
  const target = await p.inv_products.findUnique({ where: { id: targetId }, select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, is_deleted: true, status: true } });
  if (!target || target.is_deleted || target.status !== 'active') throw new Error('Target must exist and be active');
  if (String(target.unit_of_measure).toLowerCase() !== String(source.unit_of_measure).toLowerCase()) {
    throw new Error(`Unit mismatch (${source.unit_of_measure} vs ${target.unit_of_measure}); no change made`);
  }
  if (!cafe.length) throw new Error('No café product is linked to the source item');
  const updated = await p.$transaction(async (tx) => {
    const res = await tx.cafe_products.updateMany({ where: { id: { in: cafe.map((c) => c.id) }, inventory_product_id: source.id }, data: { inventory_product_id: target.id } });
    await tx.business_audit_log.create({ data: {
      entity_type: 'cafe_recipe_ingredient_relink', entity_id: `${source.id}->${target.id}`, action: 'cafe_products.relink_ready_item',
      actor_name: 'one80 maintenance', before_json: { source, cafe }, after_json: { target },
      changed_fields: cafe.map((c) => `cafe_product:${c.id}`),
      reason: `Relinked ready café product(s) ${cafe.map((c) => c.name).join(', ')} from deleted ${source.product_code} to ${target.product_code}; stock and past sales untouched`,
    } });
    return res.count;
  });
  return { ...report, target, updated };
}
main().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
