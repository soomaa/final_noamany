// Removes a DELETED inventory ingredient from every café recipe that still references it, so
// the drinks become sellable again (the sale guard refuses recipes with deleted ingredients).
// Use this only for ingredients the venue does not want to track any more (cups, lemon, sauces);
// for ingredients that have an active replacement use repair-deleted-cafe-recipe-links.cjs.
// Default is a read-only preview. Pass --apply to delete the recipe rows.
// Usage: node remove-deleted-ingredient-from-recipes.cjs APP_DIR --ingredient-ids=113,114 [--apply]
const path = require('node:path');
const { createRequire } = require('node:module');

const appRoot = path.resolve(process.argv[2] || process.cwd());
const idsArg = process.argv.find((arg) => arg.startsWith('--ingredient-ids='));
const ingredientIds = (idsArg ? idsArg.split('=')[1] : '').split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0);
const apply = process.argv.includes('--apply');
if (!ingredientIds.length) throw new Error('Usage: node remove-deleted-ingredient-from-recipes.cjs APP_DIR --ingredient-ids=113,114 [--apply]');

const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');
const db = new PrismaClient({ log: [] });

async function snapshot(client) {
  const ingredients = await client.inv_products.findMany({
    where: { id: { in: ingredientIds } },
    select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, status: true, is_deleted: true },
  });
  for (const id of ingredientIds) {
    const row = ingredients.find((x) => x.id === id);
    if (!row) throw new Error(`Ingredient ${id} was not found`);
    // Safety: only ingredients the venue already deleted may be dropped from recipes.
    if (!row.is_deleted) throw new Error(`Ingredient ${id} (${row.name_ar}) is NOT deleted; refusing to strip it from recipes`);
  }
  const [productRows, variantRows] = await Promise.all([
    client.cafe_product_recipes.findMany({
      where: { ingredient_id: { in: ingredientIds } },
      select: { id: true, product_id: true, ingredient_id: true, quantity: true, unit: true, product: { select: { name: true, product_code: true, is_active: true } } },
      orderBy: [{ product_id: 'asc' }, { id: 'asc' }],
    }),
    client.cafe_variant_recipes.findMany({
      where: { ingredient_id: { in: ingredientIds } },
      select: { id: true, variant_id: true, ingredient_id: true, quantity: true, unit: true, variant: { select: { name: true, is_active: true, product: { select: { name: true, product_code: true, is_active: true } } } } },
      orderBy: [{ variant_id: 'asc' }, { id: 'asc' }],
    }),
  ]);
  // A recipe must keep at least one ingredient, otherwise the drink would sell with no stock effect.
  const affectedProductIds = [...new Set(productRows.map((r) => r.product_id))];
  const affectedVariantIds = [...new Set(variantRows.map((r) => r.variant_id))];
  const [remainingProduct, remainingVariant] = await Promise.all([
    affectedProductIds.length ? client.cafe_product_recipes.groupBy({ by: ['product_id'], where: { product_id: { in: affectedProductIds }, ingredient_id: { notIn: ingredientIds } }, _count: { _all: true } }) : [],
    affectedVariantIds.length ? client.cafe_variant_recipes.groupBy({ by: ['variant_id'], where: { variant_id: { in: affectedVariantIds }, ingredient_id: { notIn: ingredientIds } }, _count: { _all: true } }) : [],
  ]);
  const emptied = [
    ...affectedProductIds.filter((id) => !remainingProduct.some((g) => g.product_id === id)).map((id) => `product:${id}`),
    ...affectedVariantIds.filter((id) => !remainingVariant.some((g) => g.variant_id === id)).map((id) => `variant:${id}`),
  ];
  if (emptied.length) throw new Error(`Removing these ingredients would leave recipes with no ingredient at all: ${emptied.join(', ')}; no rows were changed`);
  return { ingredients, productRows, variantRows };
}

async function main() {
  const before = await snapshot(db);
  const report = {
    mode: apply ? 'apply' : 'preview',
    ingredients: before.ingredients,
    productRecipes: before.productRows.map((r) => ({ id: r.id, ingredientId: r.ingredient_id, productId: r.product_id, productName: r.product.name, productCode: r.product.product_code, active: r.product.is_active, quantity: String(r.quantity), unit: r.unit })),
    variantRecipes: before.variantRows.map((r) => ({ id: r.id, ingredientId: r.ingredient_id, variantId: r.variant_id, productName: r.variant.product.name, productCode: r.variant.product.product_code, variantName: r.variant.name, active: r.variant.is_active && r.variant.product.is_active, quantity: String(r.quantity), unit: r.unit })),
  };
  if (!apply) return report;
  const applied = await db.$transaction(async (tx) => {
    const current = await snapshot(tx);
    const [p, v] = await Promise.all([
      tx.cafe_product_recipes.deleteMany({ where: { id: { in: current.productRows.map((r) => r.id) }, ingredient_id: { in: ingredientIds } } }),
      tx.cafe_variant_recipes.deleteMany({ where: { id: { in: current.variantRows.map((r) => r.id) }, ingredient_id: { in: ingredientIds } } }),
    ]);
    await tx.business_audit_log.create({
      data: {
        entity_type: 'cafe_recipe_ingredient_removal',
        entity_id: ingredientIds.join(','),
        action: 'recipes.remove_deleted_ingredient',
        actor_name: 'one80 maintenance',
        before_json: { ingredients: current.ingredients.map((i) => ({ id: i.id, name: i.name_ar, code: i.product_code })), productRecipes: report.productRecipes, variantRecipes: report.variantRecipes },
        after_json: { removedProductRows: p.count, removedVariantRows: v.count },
        changed_fields: [...current.productRows.map((r) => `product:${r.id}`), ...current.variantRows.map((r) => `variant:${r.id}`)],
        reason: 'Deleted, untracked ingredients (cups/lemon/sauces) removed from café recipes so the drinks can be sold again; stock and past sales untouched',
      },
    });
    return { removedProductRows: p.count, removedVariantRows: v.count };
  });
  return { ...report, applied };
}

main()
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
