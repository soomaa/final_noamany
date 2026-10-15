'use strict';
// Read-only. Answers "can an invoice be issued without deducting stock?" for products matching
// --search: lists (1) café products whose NAME matches but are NOT linked to any inventory item
// (selling them never deducts anything), and (2) completed invoices since --since that contain a
// linked product but have NO stock movement for it.
// Usage: node check-one80-sale-deductions.cjs APP_DIR --search=stevia,milk --since=2026-09-01
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(process.argv[2] || '/home/alatheertech/one80.alatheertech.com');
const terms = (process.argv.find((a) => a.startsWith('--search='))?.slice(9) ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const since = process.argv.find((a) => a.startsWith('--since='))?.slice(8) ?? '2026-09-01';
if (!terms.length) throw new Error('Usage: node check-one80-sale-deductions.cjs APP_DIR --search=a,b --since=YYYY-MM-DD');
const req = createRequire(path.join(app, 'package.json'));
req('dotenv').config({ path: path.join(app, '.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const p = new PrismaClient({ log: [] });
const nameWhere = terms.map((t) => ({ name: { contains: t } }));

async function main() {
  // 1) café products by name: how are they linked to inventory?
  const cafeProducts = await p.cafe_products.findMany({
    where: { OR: nameWhere },
    select: { id: true, name: true, product_code: true, product_type: true, is_active: true, inventory_product_id: true,
      inventory_product: { select: { id: true, name_ar: true, is_deleted: true, status: true } },
      recipes: { select: { ingredient_id: true, quantity: true, unit: true, ingredient: { select: { name_ar: true, is_deleted: true, status: true } } } },
      variants: { select: { id: true, name: true, is_active: true, recipes: { select: { ingredient_id: true, ingredient: { select: { name_ar: true, is_deleted: true } } } } } } },
  });
  const inventoryProducts = await p.inv_products.findMany({
    where: { OR: terms.flatMap((t) => [{ name_ar: { contains: t } }, { name_en: { contains: t } }]) },
    select: { id: true, product_code: true, name_ar: true, unit_of_measure: true, status: true, is_deleted: true },
  });
  const products = cafeProducts.map((c) => ({
    id: c.id, name: c.name, code: c.product_code, type: c.product_type, active: c.is_active,
    linkedInventory: c.inventory_product ? `${c.inventory_product.id} ${c.inventory_product.name_ar}${c.inventory_product.is_deleted ? ' (DELETED)' : ''}` : null,
    recipeIngredients: c.recipes.map((r) => `${r.ingredient_id} ${r.ingredient?.name_ar}${r.ingredient?.is_deleted ? ' (DELETED)' : ''} ${r.quantity}${r.unit}`),
    variantIngredients: c.variants.map((v) => `${v.name || 'default'}: ${v.recipes.map((r) => `${r.ingredient_id}${r.ingredient?.is_deleted ? '(DELETED)' : ''}`).join(',') || 'none'}`),
    deductsStock: Boolean(c.inventory_product) || c.recipes.length > 0 || c.variants.some((v) => v.recipes.length > 0),
  }));
  const linkedIds = new Set(cafeProducts.filter((c) => c.inventory_product || c.recipes.length || c.variants.some((v) => v.recipes.length)).map((c) => c.id));
  const stockIds = new Set([...inventoryProducts.map((i) => i.id), ...cafeProducts.flatMap((c) => [c.inventory_product_id, ...c.recipes.map((r) => r.ingredient_id), ...c.variants.flatMap((v) => v.recipes.map((r) => r.ingredient_id))].filter(Boolean))]);

  // 2) completed invoices containing a matching product: is there a movement for that invoice?
  const items = await p.sales_quick_sale_items.findMany({
    where: { sale: { status: 'completed', sale_date: { gte: since } }, OR: [{ cafe_product_id: { in: cafeProducts.map((c) => c.id) } }, { name: { in: cafeProducts.map((c) => c.name) } }, ...terms.map((t) => ({ name: { contains: t } }))] },
    select: { id: true, name: true, quantity: true, cafe_product_id: true, cafe_variant_id: true, inventory_product_id: true,
      sale: { select: { sale_number: true, sale_date: true, sale_time: true, sale_type: true, inventory_posted: true, shift_session_id: true, cashier_id: true } } },
    orderBy: { id: 'asc' },
  });
  const saleNumbers = [...new Set(items.map((i) => i.sale.sale_number))];
  const movements = saleNumbers.length ? await p.inv_movements.findMany({
    where: { doc_ref: { in: saleNumbers }, doc_type: { in: ['sale', 'cafe_sale', 'cafe_sale_edit'] }, product_id: { in: [...stockIds] } },
    select: { doc_ref: true, product_id: true, quantity: true },
  }) : [];
  const movedBySale = new Map();
  for (const m of movements) { const arr = movedBySale.get(m.doc_ref) ?? []; arr.push(m); movedBySale.set(m.doc_ref, arr); }
  const notDeducted = items.filter((i) => !(movedBySale.get(i.sale.sale_number) ?? []).length).map((i) => ({
    sale: i.sale.sale_number, date: `${i.sale.sale_date} ${i.sale.sale_time}`, type: i.sale.sale_type, cashier: i.sale.cashier_id, item: i.name, qty: Number(i.quantity),
    cafeProductId: i.cafe_product_id, linkedToStock: i.cafe_product_id ? linkedIds.has(i.cafe_product_id) : false, inventoryPosted: i.sale.inventory_posted,
  }));
  const reason = (r) => !r.inventoryPosted ? 'الفاتورة في وضع كاشير فقط (بدون مخزون)' : !r.linkedToStock ? 'منتج الكافيه غير مربوط بأي صنف مخزون' : 'مربوط لكن لا توجد حركة — يحتاج مراجعة';
  process.stdout.write(`${JSON.stringify({
    since, searchTerms: terms,
    inventoryProducts,
    cafeProducts: products,
    invoicesChecked: saleNumbers.length, itemsChecked: items.length,
    itemsWithoutDeduction: notDeducted.length,
    withoutDeduction: notDeducted.map((r) => ({ ...r, why: reason(r) })),
  }, null, 2)}\n`);
}
main().catch((e) => { console.error('STOPPED:', e.message); process.exitCode = 1; }).finally(() => p.$disconnect());
