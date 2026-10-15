// Read-only milk investigation. No updates, stock adjustments, or sale creation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const appRoot = path.resolve(process.argv[2] || process.cwd());
const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { PrismaClient, Prisma } = appRequire('@prisma/client');
const db = new PrismaClient({ log: [] });
const report = {
  version: 1, startedAt: new Date().toISOString(), appRoot,
  clientReport: { lastAddedLitres: 15.2, previousShortageLitres: 4, latestShortageLitres: 9 },
  errors: [], omittedFields: [], truncations: [],
  note: 'All retained history, maximum 50000 rows per section. Reads are sequential, not one database snapshot; compare start/end balances. Current recipes do not prove historical recipes. No physical-count conclusion can be drawn from this export alone. No customer contact fields or environment contents are exported.',
};
const fields = (...names) => Object.fromEntries(names.map(name => [name, true]));
// Different deployed versions may not yet expose variants or bundles. Record every omission.
function compatibleSelect(modelName, selection, prefix = modelName) {
  const model = Prisma.dmmf.datamodel.models.find(model => model.name === modelName);
  if (!model) throw new Error('ModelUnavailable');
  return Object.fromEntries(Object.entries(selection).flatMap(([key, value]) => {
    const field = model.fields.find(field => field.name === key);
    if (!field) { report.omittedFields.push(`${prefix}.${key}`); return []; }
    if (value && typeof value === 'object' && value.select) {
      return [[key, { ...value, select: compatibleSelect(field.type, value.select, `${prefix}.${key}`) }]];
    }
    return [[key, value]];
  }));
}
const selections = {
  inv_products: fields('id', 'product_code', 'name_ar', 'name_en', 'unit_of_measure', 'unit_template_id', 'inventory_kind', 'status', 'is_deleted', 'created_at', 'updated_at'),
  cafe_products: fields('id', 'name', 'product_code', 'product_type', 'inventory_product_id', 'is_active', 'created_at', 'updated_at'),
  cafe_product_recipes: fields('id', 'product_id', 'ingredient_id', 'quantity', 'unit'),
  cafe_product_variants: fields('id', 'product_id', 'name', 'is_active', 'is_default', 'created_at', 'updated_at'),
  cafe_variant_recipes: fields('id', 'variant_id', 'ingredient_id', 'quantity', 'unit'),
  inv_unit_templates: fields('id', 'code', 'name_ar', 'base_unit', 'is_active', 'is_deleted'),
  inv_unit_conversions: fields('id', 'template_id', 'from_unit', 'to_unit', 'factor', 'formula'),
  inv_stock_balances: fields('id', 'product_id', 'warehouse_id', 'current_stock', 'last_updated'),
  inv_product_branches: fields('id', 'product_id', 'branch_id', 'stock_quantity', 'last_updated'),
  inv_movements: fields('id', 'product_id', 'warehouse_id', 'branch_id', 'movement_date', 'created_at', 'txn_type', 'direction', 'quantity', 'uom', 'balance_after', 'doc_type', 'doc_ref', 'transaction_id', 'notes', 'created_by'),
  inv_opening_stocks: fields('id', 'product_id', 'item_code', 'quantity', 'opening_stock_date', 'branch_id', 'warehouse_id', 'is_deleted', 'created_at', 'updated_at', 'notes'),
  inv_transactions: {
    ...fields('id', 'reference', 'txn_type', 'status', 'txn_date', 'source_warehouse_id', 'target_warehouse_id', 'branch_id', 'created_at', 'updated_at', 'approved_at', 'created_by', 'approved_by', 'is_deleted', 'reason', 'notes'),
    items: { select: fields('id', 'product_id', 'item_name', 'item_code', 'quantity', 'unit', 'notes') },
  },
  inv_count_sessions: {
    ...fields('id', 'session_number', 'branch_id', 'warehouse_id', 'status', 'created_at', 'updated_at', 'created_by', 'notes'),
    items: { select: fields('id', 'product_id', 'item_name', 'item_code', 'system_quantity', 'counted_quantity', 'variance', 'variance_reason', 'status', 'created_at') },
    adjustments: { select: fields('id', 'adjustment_number', 'status', 'approved_at', 'created_at', 'updated_at') },
  },
  sales_quick_sales: {
    ...fields('id', 'sale_number', 'sale_date', 'sale_time', 'business_date', 'sale_type', 'status', 'branch_id', 'warehouse_id', 'shift_session_id', 'inventory_posted', 'created_at', 'updated_at', 'created_by', 'cashier_id'),
    items: { select: fields('id', 'item_type', 'name', 'product_id', 'cafe_product_id', 'cafe_variant_id', 'variant_name', 'inventory_product_id', 'quantity', 'free_quantity', 'bundle_id', 'bundle_selection', 'item_note') },
    events: { select: fields('id', 'event_type', 'notes', 'created_by', 'created_at') },
  },
  cafe_waste_records: fields('id', 'reference', 'transaction_id', 'reversal_transaction_id', 'branch_id', 'warehouse_id', 'shift_session_id', 'source_kind', 'inventory_product_id', 'cafe_product_id', 'cafe_variant_id', 'source_name', 'component_snapshot', 'quantity', 'unit', 'reason_name', 'status', 'created_at', 'updated_at', 'reversed_at', 'created_by', 'reversed_by', 'notes', 'reversal_reason'),
  sales_pos_settings: fields('id', 'branch_id', 'category', 'setting_key', 'setting_value', 'setting_type', 'is_active', 'updated_at'),
  sales_shift_sessions: fields('id', 'branch_id', 'session_date', 'start_time', 'end_time', 'status'),
  inv_warehouses: fields('id', 'name_ar', 'name_en', 'branch_id', 'is_deleted'),
  prc_purchase_invoices: {
    ...fields('id', 'invoice_number', 'invoice_date', 'branch_id', 'status', 'matching_status', 'goods_receipt_id', 'is_deleted', 'created_at', 'updated_at'),
    items: { select: fields('id', 'name', 'quantity', 'po_quantity', 'grn_quantity', 'variance') },
  },
};
async function collect(name, modelName, where = {}) {
  const rows = [];
  report[name] = rows;
  try {
    const select = compatibleSelect(modelName, selections[modelName]);
    if (!db[modelName]) throw new Error('ModelUnavailable');
    let last = 0;
    while (rows.length < 50000) {
      const batch = await db[modelName].findMany({ where: { AND: [where, { id: { gt: last } }] }, select, orderBy: { id: 'asc' }, take: 500 });
      rows.push(...batch);
      if (batch.length < 500) return rows;
      last = batch[batch.length - 1].id;
    }
    report.truncations.push({ section: name, retained: rows.length });
  } catch (error) {
    report.errors.push({ section: name, type: error.name, code: error.code || null });
  }
  return rows;
}
function milkName(name) {
  return /لبن|حليب|milk/i.test(String(name || '').normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, ''));
}
async function main() {
  if (process.argv.includes('--validate-schema')) {
    for (const [model, select] of Object.entries(selections)) compatibleSelect(model, select);
    report.schemaValidationOnly = true;
    return;
  }
  report.runtime = { node: process.version, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  report.codeVersions = ['dist/modules/cafe/cafe-products.service.js', 'dist/modules/sales/quick-sales.service.js', 'dist/common/utils/units.js', 'dist/modules/inventory/inventory-stock.service.js'].map(file => {
    const full = path.join(appRoot, file);
    if (!fs.existsSync(full)) return { file, exists: false };
    return { file, modifiedAt: fs.statSync(full).mtime.toISOString(), sha256: crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') };
  });
  await collect('inventorySettings', 'sales_pos_settings', { setting_key: 'inventory_tracking_enabled' });
  const products = await collect('inventoryCatalog', 'inv_products');
  const cafe = await collect('cafeCatalog', 'cafe_products');
  const recipes = await collect('currentRecipes', 'cafe_product_recipes');
  await collect('variants', 'cafe_product_variants');
  await collect('currentVariantRecipes', 'cafe_variant_recipes');
  await collect('unitTemplates', 'inv_unit_templates');
  await collect('unitConversions', 'inv_unit_conversions');
  const milkIds = products.filter(row => milkName(row.name_ar) || milkName(row.name_en)).map(row => row.id);
  report.milkCandidateIds = milkIds;
  if (!milkIds.length) report.errors.push({ section: 'milkMatching', type: 'NoMilkNameMatch', code: null });
  // Follow manufactured ingredients upwards too (milk may be consumed through a sub-recipe).
  const related = new Set(milkIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const product of cafe) {
      if (product.product_type === 'internal' && product.inventory_product_id && !related.has(product.inventory_product_id) && recipes.some(recipe => recipe.product_id === product.id && related.has(recipe.ingredient_id))) {
        related.add(product.inventory_product_id); changed = true;
      }
    }
  }
  report.relatedIngredientIds = [...related];
  const productFilter = { product_id: { in: [...related] } };
  await collect('balancesBefore', 'inv_stock_balances', productFilter);
  await collect('branchBalances', 'inv_product_branches', productFilter);
  const movements = await collect('ingredientMovements', 'inv_movements', productFilter);
  await collect('openingStocks', 'inv_opening_stocks', productFilter);
  await collect('stockTransactions', 'inv_transactions', { items: { some: productFilter } });
  await collect('stockCounts', 'inv_count_sessions', { items: { some: productFilter } });
  // Deliberately include all cafe sales, even products with no milk in their CURRENT recipe.
  // Otherwise missing/deleted recipes or historic ingredient swaps would disappear from the evidence.
  await collect('sales', 'sales_quick_sales');
  await collect('wasteRecords', 'cafe_waste_records');
  await collect('shifts', 'sales_shift_sessions');
  await collect('warehouses', 'inv_warehouses');
  await collect('milkPurchaseInvoices', 'prc_purchase_invoices', { items: { some: { OR: ['لبن', 'حليب', 'milk'].map(name => ({ name: { contains: name } })) } } });
  await collect('balancesAfter', 'inv_stock_balances', productFilter);
  report.possible152Additions = movements.filter(row => Number(row.quantity) > 0 && [15.2, 15200].some(q => Math.abs(Number(row.quantity) - q) < 0.0001));
  report.sectionCounts = Object.fromEntries(Object.entries(report).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
}
main().catch(error => { report.errors.push({ section: 'main', type: error.name, code: error.code || null }); }).finally(async () => {
  try { await db.$disconnect(); } catch { report.errors.push({ section: 'disconnect', type: 'DisconnectError', code: null }); }
  report.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.errors.length || report.omittedFields.length || report.truncations.length) process.exitCode = 2;
});
