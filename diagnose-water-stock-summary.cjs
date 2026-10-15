const path = require('node:path');
const { createRequire } = require('node:module');

const appRoot = path.resolve(process.argv[2] || process.cwd());
const appRequire = createRequire(path.join(appRoot, 'package.json'));
appRequire('dotenv').config({
  path: path.join(appRoot, '.env'),
  override: false,
  quiet: true,
});
const { PrismaClient } = appRequire('@prisma/client');
const prisma = new PrismaClient();

const waterFilter = {
  OR: [
    { name: { contains: 'مياه' } },
    { name: { contains: 'ماء' } },
    { name: { contains: 'water' } },
  ],
};

const number = (value) => Number(value || 0);

(async () => {
  const [settings, cafeProducts, inventoryProducts, sales] = await Promise.all([
    prisma.sales_pos_settings.findMany({
      where: { setting_key: 'inventory_tracking_enabled', is_active: true },
      orderBy: [{ branch_id: 'asc' }, { id: 'asc' }],
      select: { branch_id: true, setting_value: true, updated_at: true },
    }),
    prisma.cafe_products.findMany({
      where: waterFilter,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        product_code: true,
        name: true,
        product_type: true,
        inventory_product_id: true,
        is_active: true,
      },
    }),
    prisma.inv_products.findMany({
      where: {
        OR: [
          { name_ar: { contains: 'مياه' } },
          { name_ar: { contains: 'ماء' } },
          { name_en: { contains: 'water' } },
        ],
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        product_code: true,
        name_ar: true,
        name_en: true,
        status: true,
        is_deleted: true,
      },
    }),
    prisma.sales_quick_sales.findMany({
      where: { items: { some: waterFilter } },
      orderBy: { id: 'desc' },
      take: 200,
      select: {
        id: true,
        sale_number: true,
        sale_type: true,
        status: true,
        branch_id: true,
        sale_date: true,
        sale_time: true,
        inventory_posted: true,
        warehouse_id: true,
        items: {
          where: waterFilter,
          select: {
            name: true,
            quantity: true,
            item_type: true,
            product_id: true,
            cafe_product_id: true,
            inventory_product_id: true,
          },
        },
      },
    }),
  ]);

  const references = sales.map((sale) => sale.sale_number);
  const movements = references.length
    ? await prisma.inv_movements.findMany({
        where: { doc_ref: { in: references } },
        select: {
          doc_ref: true,
          product_id: true,
          direction: true,
          quantity: true,
          doc_type: true,
        },
      })
    : [];
  const inventoryProductIds = inventoryProducts.map((product) => product.id);
  const [balances, countSessions] = inventoryProductIds.length
    ? await Promise.all([
        prisma.inv_stock_balances.findMany({
          where: { product_id: { in: inventoryProductIds } },
          orderBy: [{ product_id: 'asc' }, { warehouse_id: 'asc' }],
          select: {
            product_id: true,
            warehouse_id: true,
            current_stock: true,
          },
        }),
        prisma.inv_count_sessions.findMany({
          where: { items: { some: { product_id: { in: inventoryProductIds } } } },
          orderBy: { id: 'desc' },
          take: 10,
          select: {
            session_number: true,
            branch_id: true,
            warehouse_id: true,
            status: true,
            created_at: true,
            updated_at: true,
            items: {
              where: { product_id: { in: inventoryProductIds } },
              select: {
                product_id: true,
                item_name: true,
                system_quantity: true,
                counted_quantity: true,
                variance: true,
              },
            },
          },
        }),
      ])
    : [[], []];
  const movementsByReference = new Map();
  for (const movement of movements) {
    const rows = movementsByReference.get(movement.doc_ref) || [];
    rows.push(movement);
    movementsByReference.set(movement.doc_ref, rows);
  }

  const evidence = sales.map((sale) => {
    const productIds = new Set(
      sale.items.map((item) => item.inventory_product_id || item.product_id),
    );
    const matchingMovements = (movementsByReference.get(sale.sale_number) || [])
      .filter((movement) => productIds.has(movement.product_id));
    return {
      saleNumber: sale.sale_number,
      date: `${sale.sale_date} ${sale.sale_time}`,
      branchId: sale.branch_id,
      saleType: sale.sale_type,
      status: sale.status,
      inventoryPosted: sale.inventory_posted,
      warehouseId: sale.warehouse_id,
      items: sale.items.map((item) => ({
        name: item.name,
        quantity: number(item.quantity),
        itemType: item.item_type,
        cafeProductId: item.cafe_product_id,
        inventoryProductId: item.inventory_product_id,
        stockProductId: item.inventory_product_id || item.product_id,
      })),
      movementCount: matchingMovements.length,
      stockDelta: matchingMovements.reduce(
        (total, movement) => total + number(movement.quantity),
        0,
      ),
      movementTypes: [...new Set(matchingMovements.map((movement) => movement.doc_type))],
    };
  });
  const completed = evidence.filter((sale) => sale.status === 'completed');
  const missingMovement = completed.filter((sale) => sale.movementCount === 0);
  const bySaleType = Object.fromEntries(
    ['customer', 'employee', 'partner'].map((saleType) => [
      saleType,
      {
        completed: completed.filter((sale) => sale.saleType === saleType).length,
        missingMovement: missingMovement.filter((sale) => sale.saleType === saleType).length,
      },
    ]),
  );

  console.log(JSON.stringify({
    appRoot,
    inventoryTrackingSettings: settings,
    waterProductMapping: { cafeProducts, inventoryProducts },
    currentWaterBalances: balances,
    recentWaterCountSnapshots: countSessions,
    checkedCompletedSales: completed.length,
    completedSalesMissingMovement: missingMovement.length,
    bySaleType,
    latestSales: evidence.slice(0, 20),
    latestMissingMovement: missingMovement.slice(0, 20),
  }, null, 2));
})()
  .finally(() => prisma.$disconnect());
