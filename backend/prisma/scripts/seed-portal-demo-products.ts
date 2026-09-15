import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const image = 'assets/product-placeholder-premium.png';

const products = [
  ['واي بروتين كلاسيك', 'Classic Whey Protein', 1450, 1650, 24, true],
  ['كرياتين مونوهيدرات', 'Creatine Monohydrate', 850, 1000, 32, true],
  ['إل كارنتين سائل', 'L-Carnitine Liquid', 720, 850, 18, true],
  ['أوميجا 3', 'Omega 3', 480, null, 40, true],
  ['مالتي فيتامين سبورت', 'Sport Multivitamin', 560, 650, 28, true],
  ['بروتين بار شوكولاتة', 'Chocolate Protein Bar', 95, null, 80, false],
  ['شيكر النعماني', 'Noamany Shaker', 180, 220, 35, false],
  ['قفازات جيم برو', 'Gym Pro Gloves', 390, 450, 20, false],
  ['حزام رفع الأثقال', 'Weightlifting Belt', 650, null, 15, false],
  ['منشفة رياضية', 'Sports Towel', 150, null, 50, false],
] as const;

async function main() {
  let category = await prisma.categories.findFirst({ where: { name: 'منتجات تجريبية' } });
  if (!category) {
    category = await prisma.categories.create({
      data: { name: 'منتجات تجريبية', icon_class: 'flask', display_order: 999 },
    });
  }

  for (const [name, nameEn, price, oldPrice, stock, featured] of products) {
    const data = {
      category_id: category.id,
      name,
      name_en: nameEn,
      current_stock: stock,
      image,
      description: `منتج تجريبي لعرض شكل المتجر فقط: ${name}.`,
      short_description: 'منتج تجريبي لعرض المتجر.',
      specifications: JSON.stringify({ demo: true }),
      price,
      old_price: oldPrice,
      stock_status: 'in_stock' as const,
      is_featured: featured ? 1 : 0,
      is_new: featured ? 1 : 0,
      display_order: products.findIndex(([title]) => title === name) + 1,
      selected_badge: null,
    };
    const existing = await prisma.products.findFirst({ where: { name } });
    if (existing) await prisma.products.update({ where: { id: existing.id }, data });
    else await prisma.products.create({ data });
  }

  console.log(`Seeded ${products.length} demo portal products in category ${category.id}.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
