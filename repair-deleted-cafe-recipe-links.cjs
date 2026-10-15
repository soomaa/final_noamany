// Relinks café recipes from one retired inventory product to one active replacement.
// Default is a read-only preview. Pass --apply to write the recipe links.
const path = require('node:path');
const { createRequire } = require('node:module');

const appRoot = path.resolve(process.argv[2] || process.cwd());
const sourceId = Number(process.argv.find((arg) => arg.startsWith('--source-id='))?.split('=')[1]);
const targetId = Number(process.argv.find((arg) => arg.startsWith('--target-id='))?.split('=')[1]);
const apply = process.argv.includes('--apply');

if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId <= 0 || targetId <= 0 || sourceId === targetId) {
  throw new Error('Usage: node repair-deleted-cafe-recipe-links.cjs APP_DIR --source-id=OLD --target-id=NEW [--apply]');
}

const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');
const db = new PrismaClient({ log: [] });

function normalizedUnit(unit) {
  return String(unit ?? '').trim().toLowerCase();
}

async function snapshot(client) {
  const [products, productRows, variantRows] = await Promise.all([
    client.inv_products.findMany({
      where: { id: { in: [sourceId, targetId] } },
      select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, status: true, is_deleted: true },
    }),
    client.cafe_product_recipes.findMany({
      where: { ingredient_id: sourceId },
      select: {
        id: true, product_id: true, quantity: true, unit: true,
        product: { select: { name: true, product_code: true, is_active: true } },
      },
      orderBy: [{ product_id: 'asc' }, { id: 'asc' }],
    }),
    client.cafe_variant_recipes.findMany({
      where: { ingredient_id: sourceId },
      select: {
        id: true, variant_id: true, quantity: true, unit: true,
        variant: { select: { name: true, is_active: true, product: { select: { name: true, product_code: true, is_active: true } } } },
      },
      orderBy: [{ variant_id: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const source = products.find((row) => row.id === sourceId);
  const target = products.find((row) => row.id === targetId);
  if (!source) throw new Error(`Source product ${sourceId} was not found`);
  if (!target || target.is_deleted || target.status !== 'active') {
    throw new Error(`Target product ${targetId} must exist, be active, and not be deleted`);
  }
  if (normalizedUnit(source.unit_of_measure) !== normalizedUnit(target.unit_of_measure)) {
    throw new Error(`Source and target units must match exactly (${source.unit_of_measure} vs ${target.unit_of_measure})`);
  }
  const [productConflicts, variantConflicts] = await Promise.all([
    productRows.length ? client.cafe_product_recipes.findMany({ where: { ingredient_id: targetId, product_id: { in: productRows.map((row) => row.product_id) } }, select: { id: true, product_id: true } }) : [],
    variantRows.length ? client.cafe_variant_recipes.findMany({ where: { ingredient_id: targetId, variant_id: { in: variantRows.map((row) => row.variant_id) } }, select: { id: true, variant_id: true } }) : [],
  ]);
  if (productConflicts.length || variantConflicts.length) {
    throw new Error(`Target already exists in ${productConflicts.length + variantConflicts.length} recipe container(s); no rows were changed`);
  }
  return { source, target, productRows, variantRows };
}

async function main() {
  const before = await snapshot(db);
  const report = {
    mode: apply ? 'apply' : 'preview',
    source: before.source,
    target: before.target,
    productRecipes: before.productRows.map((row) => ({ id: row.id, productId: row.product_id, productName: row.product.name, productCode: row.product.product_code, active: row.product.is_active, quantity: String(row.quantity), unit: row.unit })),
    variantRecipes: before.variantRows.map((row) => ({ id: row.id, variantId: row.variant_id, productName: row.variant.product.name, productCode: row.variant.product.product_code, variantName: row.variant.name, active: row.variant.is_active && row.variant.product.is_active, quantity: String(row.quantity), unit: row.unit })),
  };
  if (!apply) return report;

  const applied = await db.$transaction(async (tx) => {
    const current = await snapshot(tx);
    const [productUpdate, variantUpdate] = await Promise.all([
      tx.cafe_product_recipes.updateMany({ where: { id: { in: current.productRows.map((row) => row.id) }, ingredient_id: sourceId }, data: { ingredient_id: targetId } }),
      tx.cafe_variant_recipes.updateMany({ where: { id: { in: current.variantRows.map((row) => row.id) }, ingredient_id: sourceId }, data: { ingredient_id: targetId } }),
    ]);
    await tx.business_audit_log.create({
      data: {
        entity_type: 'cafe_recipe_ingredient_relink',
        entity_id: `${sourceId}->${targetId}`,
        action: 'recipes.relink_deleted_ingredient',
        actor_name: 'one80 maintenance',
        before_json: { id: sourceId, name: current.source.name_ar, code: current.source.product_code },
        after_json: { id: targetId, name: current.target.name_ar, code: current.target.product_code },
        changed_fields: [
          ...current.productRows.map((row) => `product:${row.id}`),
          ...current.variantRows.map((row) => `variant:${row.id}`),
        ],
        reason: `Relinked ${current.productRows.length + current.variantRows.length} café recipe rows without changing stock or past sales`,
      },
    });
    return { productRecipesUpdated: productUpdate.count, variantRecipesUpdated: variantUpdate.count };
  });
  return { ...report, applied };
}

main()
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => { await db.$disconnect(); });
