import { prisma, log } from './_shared';

/**
 * Cafe seed — idempotent. Creates the inventory ingredients (with stock) that cafe
 * recipes consume, then the cafe products (كابتشينو / لاتيه / موكا) with recipes that
 * mirror the spec's worked example (1 cappuccino → 18g coffee, 200ml milk, 10g sugar,
 * 1 cup, 1 lid). Safe to re-run: every entity is found-or-created by natural key.
 *
 * Ingredient unit_of_measure is stored as the recipe unit code ('g'|'ml'|'piece') so the
 * sell endpoint's convertToBaseUnit matches directly (recipeUnit === baseUnit).
 */

const CAFE_CATEGORY_AR = 'مشروبات وأطعمة';
const DEFAULT_WAREHOUSE_ID = 1;
const BIG_STOCK = 50_000; // plenty of stock so POS sells never run short during testing

interface IngredientSpec {
  nameAr: string;
  nameEn: string;
  unit: 'g' | 'ml' | 'piece';
  cost: number;
}

const INGREDIENTS: IngredientSpec[] = [
  { nameAr: 'بن إسبريسو', nameEn: 'Espresso Beans', unit: 'g', cost: 0.15 },
  { nameAr: 'لبن', nameEn: 'Milk', unit: 'ml', cost: 0.01 },
  { nameAr: 'سكر', nameEn: 'Sugar', unit: 'g', cost: 0.005 },
  { nameAr: 'كاكاو', nameEn: 'Cocoa', unit: 'g', cost: 0.05 },
  { nameAr: 'كوب ورقي', nameEn: 'Paper Cup', unit: 'piece', cost: 0.5 },
  { nameAr: 'غطاء كوب', nameEn: 'Cup Lid', unit: 'piece', cost: 0.3 },
];

interface RecipeLine {
  ingredient: string; // nameAr
  quantity: number;
  unit: 'g' | 'ml' | 'kg' | 'L' | 'piece';
}

interface CafeProductSpec {
  name: string;
  sellPrice: number;
  recipe: RecipeLine[];
}

const CAFE_PRODUCTS: CafeProductSpec[] = [
  {
    name: 'كابتشينو',
    sellPrice: 18,
    recipe: [
      { ingredient: 'بن إسبريسو', quantity: 18, unit: 'g' },
      { ingredient: 'لبن', quantity: 200, unit: 'ml' },
      { ingredient: 'سكر', quantity: 10, unit: 'g' },
      { ingredient: 'كوب ورقي', quantity: 1, unit: 'piece' },
      { ingredient: 'غطاء كوب', quantity: 1, unit: 'piece' },
    ],
  },
  {
    name: 'لاتيه',
    sellPrice: 20,
    recipe: [
      { ingredient: 'بن إسبريسو', quantity: 18, unit: 'g' },
      { ingredient: 'لبن', quantity: 250, unit: 'ml' },
      { ingredient: 'سكر', quantity: 10, unit: 'g' },
      { ingredient: 'كوب ورقي', quantity: 1, unit: 'piece' },
      { ingredient: 'غطاء كوب', quantity: 1, unit: 'piece' },
    ],
  },
  {
    name: 'موكا',
    sellPrice: 22,
    recipe: [
      { ingredient: 'بن إسبريسو', quantity: 18, unit: 'g' },
      { ingredient: 'لبن', quantity: 200, unit: 'ml' },
      { ingredient: 'سكر', quantity: 15, unit: 'g' },
      { ingredient: 'كاكاو', quantity: 20, unit: 'g' },
      { ingredient: 'كوب ورقي', quantity: 1, unit: 'piece' },
      { ingredient: 'غطاء كوب', quantity: 1, unit: 'piece' },
    ],
  },
];

async function resolveCafeCategoryId(): Promise<number | null> {
  const cat = await prisma.inv_categories.findFirst({
    where: { name_ar: CAFE_CATEGORY_AR, is_deleted: false },
    select: { id: true },
  });
  return cat?.id ?? null;
}

/** Find-or-create an inventory ingredient and guarantee it has stock in the default warehouse. */
async function ensureIngredient(spec: IngredientSpec, categoryId: number | null): Promise<number> {
  let product = await prisma.inv_products.findFirst({
    where: { name_ar: spec.nameAr, is_deleted: false },
    select: { id: true },
  });
  if (!product) {
    // product_code must be unique — derive a stable slug from the English name.
    const code = `CAFE-ING-${spec.nameEn.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    product = await prisma.inv_products.create({
      data: {
        product_code: code,
        name_ar: spec.nameAr,
        name_en: spec.nameEn,
        category_id: categoryId,
        cost_price: spec.cost,
        selling_price: 0, // ingredients are consumed by recipes, not sold directly
        unit_of_measure: spec.unit,
        is_deleted: false,
      },
      select: { id: true },
    });
  }
  // Ensure a stock row exists in the default warehouse with plenty of stock.
  const balance = await prisma.inv_stock_balances.findFirst({
    where: { product_id: product.id, warehouse_id: DEFAULT_WAREHOUSE_ID },
    select: { id: true, current_stock: true },
  });
  if (!balance) {
    await prisma.inv_stock_balances.create({
      data: { product_id: product.id, warehouse_id: DEFAULT_WAREHOUSE_ID, current_stock: BIG_STOCK },
    });
  } else if (Number(balance.current_stock) < 1000) {
    await prisma.inv_stock_balances.update({ where: { id: balance.id }, data: { current_stock: BIG_STOCK } });
  }
  return product.id;
}

async function nextProductCodeSeq(): Promise<number> {
  const rows = await prisma.$queryRaw<{ maxNum: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(product_code, 4) AS UNSIGNED)) AS maxNum
    FROM cafe_products WHERE product_code LIKE 'CP-%'
  `;
  // MySQL MAX(CAST(... AS UNSIGNED)) comes back as a BigInt via $queryRaw —
  // Number() it before arithmetic, else "Cannot mix BigInt and other types".
  return Number(rows[0]?.maxNum ?? 0) + 1;
}

export async function seedCafe() {
  const categoryId = await resolveCafeCategoryId();

  // 1) Ingredients (with stock) — keyed by nameAr for recipe wiring.
  const ingredientIds = new Map<string, number>();
  for (const ing of INGREDIENTS) {
    ingredientIds.set(ing.nameAr, await ensureIngredient(ing, categoryId));
  }

  // 2) Cafe products + recipes (skip any that already exist by name).
  let created = 0;
  let seq = await nextProductCodeSeq();
  for (const prod of CAFE_PRODUCTS) {
    const exists = await prisma.cafe_products.findFirst({ where: { name: prod.name }, select: { id: true } });
    if (exists) continue;

    const productCode = `CP-${String(seq).padStart(6, '0')}`;
    seq += 1;
    await prisma.cafe_products.create({
      data: {
        product_code: productCode,
        name: prod.name,
        category_id: categoryId,
        sell_price: prod.sellPrice,
        is_active: true,
        recipes: {
          create: prod.recipe.map((r, i) => {
            const ingredientId = ingredientIds.get(r.ingredient);
            if (!ingredientId) throw new Error(`Missing ingredient for recipe: ${r.ingredient}`);
            return { ingredient_id: ingredientId, quantity: r.quantity, unit: r.unit, sort_order: i };
          }),
        },
      },
    });
    created += 1;
  }

  log('cafe', `ingredients: ${INGREDIENTS.length}, cafe products created: ${created} (of ${CAFE_PRODUCTS.length})`);
  console.log('✔ Cafe done');
}

// self-run for standalone testing (idempotent — safe to run against a live DB)
if (require.main === module) {
  seedCafe()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
