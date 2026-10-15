'use strict';
// Restores (un-deletes) inventory items so recipes that still reference them work again,
// exactly as if they had never been deleted. Recipes, stock balances and past sales are untouched.
// Default = preview. Pass --apply to restore.
// Usage: node restore-deleted-ingredients.cjs APP_DIR --ids=113,114,102,104 [--apply]
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const ids = (process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
const apply = process.argv.includes('--apply');
if (!ids.length) throw new Error('Usage: --ids=113,114');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });

async function main() {
  const rows = await p.inv_products.findMany({ where: { id: { in: ids } }, select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, status: true, is_deleted: true } });
  if (rows.length !== ids.length) throw new Error('Some ids were not found');
  const balances = await p.inv_stock_balances.findMany({ where: { product_id: { in: ids } }, select: { product_id: true, warehouse_id: true, current_stock: true } });
  const [pr, vr] = await Promise.all([
    p.cafe_product_recipes.count({ where: { ingredient_id: { in: ids } } }),
    p.cafe_variant_recipes.count({ where: { ingredient_id: { in: ids } } }),
  ]);
  const report = {
    mode: apply ? 'apply' : 'preview',
    items: rows.map((r) => ({ ...r, stock: balances.filter((b) => b.product_id === r.id).map((b) => Number(b.current_stock)) })),
    recipeRowsUsingThem: { product: pr, variant: vr },
  };
  if (!apply) return report;
  const restored = await p.$transaction(async (tx) => {
    const res = await tx.inv_products.updateMany({ where: { id: { in: ids }, is_deleted: true }, data: { is_deleted: false, status: 'active' } });
    await tx.business_audit_log.create({ data: {
      entity_type: 'inventory_product_restore', entity_id: ids.join(','), action: 'products.restore_deleted',
      actor_name: 'one80 maintenance', before_json: rows, after_json: { restored: res.count },
      changed_fields: ids.map((id) => `product:${id}`),
      reason: 'Restored ingredients still used by café recipes (deleted 1-2 Aug); recipes/stock/sales untouched',
    } });
    return res.count;
  });
  return { ...report, restored };
}
main().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
