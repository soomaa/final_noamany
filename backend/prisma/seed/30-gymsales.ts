/* eslint-disable no-console */
/**
 * Gym-Sales seed — INVENTORY + PROCUREMENT + SALES (the "gym-sales" area).
 *
 * These three domains are tightly coupled: procurement receives stock into
 * inventory warehouses; POS sales draw down that stock. We seed them coherently
 * in one module so every inventory / procurement / sales page renders real data.
 *
 * Foundation (branches, employees, users) is already seeded — reused via loaders.
 */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2, reseed,
  getBranchIds, getEmployees, getUsers,
  BASE, addDays, ymd, ymdhms, hms,
} from './_shared';

export async function seedGymSales(): Promise<void> {
  console.log('▶ GymSales (inventory + procurement + sales)…');
  reseed(424242);

  // Clear ONLY our tables, CHILDREN FIRST.
  await clearTables([
    // sales children -> parents
    'sales_pos_payments', 'sales_quick_sale_items', 'sales_quick_sales',
    'sales_shift_sessions', 'sales_shifts', 'sales_bookings', 'sales_booking_services',
    // procurement children -> parents
    'prc_supplier_payment_schedules', 'prc_supplier_payments',
    'prc_purchase_invoice_items', 'prc_purchase_invoices',
    'prc_goods_receipt_items', 'prc_goods_receipts',
    'prc_purchase_order_items', 'prc_purchase_orders',
    'prc_quotations', 'prc_rfq_items', 'prc_rfqs',
    'prc_requisition_items', 'prc_requisitions',
    'prc_debit_note_items', 'prc_debit_notes',
    'prc_purchase_return_items', 'prc_purchase_returns',
    'prc_quick_purchase_orders',
    'prc_supplier_invoice_items', 'prc_supplier_invoices',
    'prc_supplier_contracts',
    'prc_procurement_settings', 'prc_payment_terms',
    'prc_supply_regions', 'prc_supplier_categories',
    // inventory children -> parents
    'inv_adjustments', 'inv_count_items', 'inv_count_sessions',
    'inv_transaction_items', 'inv_transactions', 'inv_movements',
    'inv_opening_stocks', 'inv_product_branches', 'inv_stock_balances',
    'inv_service_consumables', 'inv_composite_items', 'inv_composite_products',
    'inv_consumables', 'inv_spare_parts', 'inv_product_storages',
    'inv_products',
    'inv_unit_conversions', 'inv_unit_templates',
    'inv_storages', 'inv_warehouses',
    'inv_suppliers', 'inv_manufacturers', 'inv_brands',
    'inv_categories', 'inv_sub_categories', 'inv_main_categories',
  ]);

  const branchIds = await getBranchIds();
  const employees = await getEmployees();
  const users = await getUsers();
  const userIds = users.map((u) => u.user_id);
  const empNames = employees.map((e) => e.employee).filter(Boolean) as string[];
  const B0 = branchIds[0];

  // ========================================================================
  // 1. INVENTORY CATALOGS
  // ========================================================================

  // ---- main categories ----
  const mainCatDefs = [
    'مكملات غذائية', 'ملابس رياضية', 'معدات رياضية', 'مشروبات وأطعمة', 'إكسسوارات',
  ];
  const mainCats: number[] = [];
  for (const name of mainCatDefs) {
    const r = await prisma.inv_main_categories.create({
      data: { name, description: `فئة ${name}`, is_active: true, is_deleted: false },
    });
    mainCats.push(r.id);
  }

  // ---- sub categories (per main category) ----
  const subCatDefs: Record<number, string[]> = {
    0: ['بروتين', 'أحماض أمينية', 'فيتامينات'],
    1: ['تيشيرتات', 'شورتات', 'أحذية'],
    2: ['أوزان حرة', 'أجهزة كارديو', 'حبال ومقاومة'],
    3: ['مشروبات طاقة', 'وجبات خفيفة'],
    4: ['قفازات', 'أحزمة رفع', 'زجاجات مياه'],
  };
  const subCats: number[] = [];
  for (const [mi, names] of Object.entries(subCatDefs)) {
    for (const name of names) {
      const r = await prisma.inv_sub_categories.create({
        data: {
          name, description: `${name}`, main_category_id: mainCats[Number(mi)],
          is_active: true, is_deleted: false,
        },
      });
      subCats.push(r.id);
    }
  }

  // ---- product categories (flat, used by inv_products.category_id) ----
  const catDefs = [
    ['مكملات غذائية', 'Supplements'],
    ['ملابس رياضية', 'Sportswear'],
    ['معدات رياضية', 'Equipment'],
    ['مشروبات وأطعمة', 'Food & Drinks'],
    ['إكسسوارات', 'Accessories'],
  ];
  const catIds: number[] = [];
  for (const [ar, en] of catDefs) {
    const r = await prisma.inv_categories.create({
      data: { name_ar: ar, name_en: en, is_active: true, is_deleted: false },
    });
    catIds.push(r.id);
  }

  // ---- brands ----
  const brandDefs = [
    ['أوبتيموم نيوتريشن', 'Optimum Nutrition'],
    ['ماي بروتين', 'MyProtein'],
    ['نايكي', 'Nike'],
    ['أديداس', 'Adidas'],
    ['تكنوجيم', 'Technogym'],
    ['ريد بول', 'Red Bull'],
    ['أندر آرمر', 'Under Armour'],
  ];
  const brandIds: number[] = [];
  for (const [ar, en] of brandDefs) {
    const r = await prisma.inv_brands.create({
      data: { name_ar: ar, name_en: en, is_active: true, is_deleted: false },
    });
    brandIds.push(r.id);
  }

  // ---- manufacturers ----
  const mfgDefs = [
    ['شركة الغذاء المتقدم', 'Advanced Nutrition Co.'],
    ['مصنع القاهرةة الحديثة', 'Modern Sports Mfg.'],
    ['تكنوجيم إيطاليا', 'Technogym Italy'],
  ];
  const mfgIds: number[] = [];
  for (const [ar, en] of mfgDefs) {
    const r = await prisma.inv_manufacturers.create({
      data: {
        name_ar: ar, name_en: en, contact_person: pick(empNames),
        email: `info@${en.toLowerCase().replace(/[^a-z]/g, '')}.test`,
        phone: `0112${randInt(100000, 999999)}`, is_active: true, is_deleted: false,
      },
    });
    mfgIds.push(r.id);
  }

  // ---- suppliers (referenced by inv_products AND all procurement docs by .id) ----
  const supplierDefs = [
    ['مؤسسة النخبة للمكملات', 'Elite Supplements Est.'],
    ['شركة القاهرةي للملابس', 'Athletic Apparel Co.'],
    ['المتحدة للمعدات القاهرةية', 'United Sports Equipment'],
    ['موزع المشروبات الوطني', 'National Beverage Dist.'],
    ['مورد الإكسسوارات القاهرةية', 'Sports Accessories Supplier'],
    ['شركة الجودة للتوريدات', 'Quality Supplies Co.'],
  ];
  const supplierIds: number[] = [];
  for (let i = 0; i < supplierDefs.length; i++) {
    const [ar, en] = supplierDefs[i];
    const r = await prisma.inv_suppliers.create({
      data: {
        name_ar: ar, name_en: en,
        email: `sales${i + 1}@supplier.test`,
        phones: {
          create: {
            phone: `0114${randInt(100000, 999999)}`,
            is_primary: true,
            sort_order: 0,
          },
        },
        address: 'القاهرة - المنطقة الصناعية',
        tax_number: `30${randInt(10000000, 99999999)}`,
        contact_person: pick(empNames),
        is_active: true, is_deleted: false,
      },
    });
    supplierIds.push(r.id);
  }

  // ---- warehouses (one main per branch + a couple of sub warehouses) ----
  const warehouses: { id: number; branch_id: number; type: string }[] = [];
  let whSeq = 1;
  for (const b of branchIds) {
    const main = await prisma.inv_warehouses.create({
      data: {
        warehouse_code: `WH-${String(whSeq++).padStart(3, '0')}`,
        name_ar: `المستودع الرئيسي - فرع ${b}`, name_en: `Main Warehouse - Branch ${b}`,
        type: 'main', storage_capacity: randInt(500, 2000), branch_id: b,
        manager_name: pick(empNames), phone: `0115${randInt(100000, 999999)}`,
        address: 'مخزن الفرع', country: 'جمهورية مصر العربية',
        status: 'active', is_deleted: false,
      },
    });
    warehouses.push({ id: main.id, branch_id: b, type: 'main' });
  }
  // a few sub warehouses on the first two branches
  for (const b of branchIds.slice(0, 2)) {
    const sub = await prisma.inv_warehouses.create({
      data: {
        warehouse_code: `WH-${String(whSeq++).padStart(3, '0')}`,
        name_ar: `مستودع فرعي - فرع ${b}`, name_en: `Sub Warehouse - Branch ${b}`,
        type: 'sub', storage_capacity: randInt(100, 500), branch_id: b,
        manager_name: pick(empNames), phone: `0115${randInt(100000, 999999)}`,
        address: 'مخزن فرعي', country: 'جمهورية مصر العربية',
        status: 'active', is_deleted: false,
      },
    });
    warehouses.push({ id: sub.id, branch_id: b, type: 'sub' });
  }
  const mainWarehouses = warehouses.filter((w) => w.type === 'main');

  // ---- storages (physical storage rooms; unique email) ----
  const storages: { id: number; branch_id: number }[] = [];
  let stSeq = 1;
  for (const b of branchIds) {
    const r = await prisma.inv_storages.create({
      data: {
        name: `غرفة تخزين ${stSeq} - فرع ${b}`, branch_id: b,
        email: `storage${stSeq}@noamanycenter.test`, is_deleted: false,
      },
    });
    storages.push({ id: r.id, branch_id: b });
    stSeq++;
  }

  // ---- unit templates + conversions ----
  const unitTplDefs = [
    { name_ar: 'وزن', name_en: 'Weight', code: 'WEIGHT', base_unit: 'g', category: 'weight',
      conv: [['kg', 'g', 1000], ['g', 'mg', 1000]] },
    { name_ar: 'عدد', name_en: 'Count', code: 'COUNT', base_unit: 'pcs', category: 'general',
      conv: [['box', 'pcs', 12], ['dozen', 'pcs', 12]] },
    { name_ar: 'حجم', name_en: 'Volume', code: 'VOLUME', base_unit: 'ml', category: 'volume',
      conv: [['L', 'ml', 1000]] },
  ];
  const unitTplIds: number[] = [];
  for (const t of unitTplDefs) {
    const r = await prisma.inv_unit_templates.create({
      data: {
        name_ar: t.name_ar, name_en: t.name_en, code: t.code, base_unit: t.base_unit,
        category: t.category, usage_count: randInt(0, 20), is_active: true, is_deleted: false,
      },
    });
    unitTplIds.push(r.id);
    let so = 0;
    for (const [from, to, factor] of t.conv) {
      await prisma.inv_unit_conversions.create({
        data: {
          template_id: r.id, from_unit: from as string, to_unit: to as string,
          factor: factor as number, sort_order: so++,
        },
      });
    }
  }

  // ========================================================================
  // 2. PRODUCTS + specialized item tables
  // ========================================================================

  // realistic gym retail/consumable catalog
  type Prod = {
    ar: string; en: string; cat: number; brand: number; cost: number; sell: number;
    unit: string; uom: string;
  };
  const productDefs: Prod[] = [
    // supplements
    { ar: 'واي بروتين 2 كجم', en: 'Whey Protein 2kg', cat: 0, brand: 0, cost: 220, sell: 340, unit: 'WEIGHT', uom: 'kg' },
    { ar: 'واي بروتين آيزوليت', en: 'Whey Isolate 1.8kg', cat: 0, brand: 1, cost: 260, sell: 399, unit: 'WEIGHT', uom: 'kg' },
    { ar: 'كرياتين مونوهيدرات', en: 'Creatine Monohydrate 500g', cat: 0, brand: 0, cost: 70, sell: 120, unit: 'WEIGHT', uom: 'g' },
    { ar: 'أحماض أمينية BCAA', en: 'BCAA 400g', cat: 0, brand: 1, cost: 95, sell: 155, unit: 'WEIGHT', uom: 'g' },
    { ar: 'جلوتامين 300 جرام', en: 'Glutamine 300g', cat: 0, brand: 0, cost: 80, sell: 130, unit: 'WEIGHT', uom: 'g' },
    { ar: 'مالتي فيتامين', en: 'Multivitamin 90 caps', cat: 0, brand: 1, cost: 45, sell: 89, unit: 'COUNT', uom: 'علبة' },
    { ar: 'بري وركاوت', en: 'Pre-Workout 300g', cat: 0, brand: 0, cost: 110, sell: 175, unit: 'WEIGHT', uom: 'g' },
    // apparel
    { ar: 'تيشيرت رياضي', en: 'Training T-Shirt', cat: 1, brand: 2, cost: 55, sell: 110, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'شورت تدريب', en: 'Training Shorts', cat: 1, brand: 3, cost: 60, sell: 120, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'حذاء جري', en: 'Running Shoes', cat: 1, brand: 2, cost: 240, sell: 420, unit: 'COUNT', uom: 'زوج' },
    { ar: 'قميص كمبريشن', en: 'Compression Top', cat: 1, brand: 6, cost: 90, sell: 170, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'جوارب رياضية (3 أزواج)', en: 'Sports Socks 3-pack', cat: 1, brand: 3, cost: 25, sell: 55, unit: 'COUNT', uom: 'عبوة' },
    // equipment
    { ar: 'دمبل 10 كجم', en: 'Dumbbell 10kg', cat: 2, brand: 4, cost: 130, sell: 220, unit: 'WEIGHT', uom: 'قطعة' },
    { ar: 'كرة طبية 5 كجم', en: 'Medicine Ball 5kg', cat: 2, brand: 4, cost: 85, sell: 150, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'حبل مقاومة', en: 'Resistance Band Set', cat: 2, brand: 4, cost: 40, sell: 85, unit: 'COUNT', uom: 'طقم' },
    { ar: 'ماط يوجا', en: 'Yoga Mat', cat: 2, brand: 6, cost: 45, sell: 95, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'حبل قفز', en: 'Speed Jump Rope', cat: 2, brand: 4, cost: 20, sell: 45, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'كيتل بيل 12 كجم', en: 'Kettlebell 12kg', cat: 2, brand: 4, cost: 110, sell: 190, unit: 'WEIGHT', uom: 'قطعة' },
    // food & drinks
    { ar: 'مشروب طاقة 250 مل', en: 'Energy Drink 250ml', cat: 3, brand: 5, cost: 6, sell: 12, unit: 'VOLUME', uom: 'علبة' },
    { ar: 'بروتين بار', en: 'Protein Bar', cat: 3, brand: 0, cost: 8, sell: 18, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'ماء معدني 600 مل', en: 'Mineral Water 600ml', cat: 3, brand: 5, cost: 1, sell: 3, unit: 'VOLUME', uom: 'زجاجة' },
    { ar: 'مشروب بروتين جاهز', en: 'Ready-to-Drink Protein', cat: 3, brand: 1, cost: 10, sell: 22, unit: 'VOLUME', uom: 'علبة' },
    // accessories
    { ar: 'قفازات رفع أثقال', en: 'Lifting Gloves', cat: 4, brand: 6, cost: 35, sell: 75, unit: 'COUNT', uom: 'زوج' },
    { ar: 'حزام رفع أثقال', en: 'Weightlifting Belt', cat: 4, brand: 6, cost: 80, sell: 160, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'زجاجة مياه شيكر', en: 'Shaker Bottle 700ml', cat: 4, brand: 0, cost: 12, sell: 30, unit: 'VOLUME', uom: 'قطعة' },
    { ar: 'حزام معصم', en: 'Wrist Wraps', cat: 4, brand: 6, cost: 22, sell: 50, unit: 'COUNT', uom: 'زوج' },
    { ar: 'رباط ركبة', en: 'Knee Sleeve', cat: 4, brand: 6, cost: 40, sell: 90, unit: 'COUNT', uom: 'قطعة' },
    { ar: 'حقيبة رياضية', en: 'Gym Duffel Bag', cat: 4, brand: 2, cost: 70, sell: 140, unit: 'COUNT', uom: 'قطعة' },
  ];

  const products: {
    id: number; code: string; ar: string; cost: number; sell: number; uom: string; cat: number;
  }[] = [];
  let pSeq = 1;
  for (const p of productDefs) {
    const code = `PRD-${String(pSeq).padStart(4, '0')}`;
    const min = randInt(5, 15), max = randInt(200, 600), rop = randInt(15, 40);
    const r = await prisma.inv_products.create({
      data: {
        product_code: code, name_ar: p.ar, name_en: p.en,
        description: `${p.ar} — منتج عالي الجودة`,
        barcode: `62810${String(pSeq).padStart(7, '0')}`,
        category_id: catIds[p.cat], brand_id: brandIds[p.brand],
        manufacturer_id: pick(mfgIds), supplier_id: pick(supplierIds),
        cost_price: p.cost, selling_price: p.sell, wholesale_price: round2(p.sell * 0.85),
        unit_of_measure: p.uom, unit_template_id: pick(unitTplIds),
        min_stock: min, max_stock: max, reorder_point: rop,
        apply_to_all_branches: chance(0.5),
        status: 'active', is_deleted: false, created_by: pick(userIds),
      },
    });
    products.push({ id: r.id, code, ar: p.ar, cost: p.cost, sell: p.sell, uom: p.uom, cat: p.cat });
    pSeq++;
  }

  // ---- spare parts (for equipment maintenance) ----
  const sparePartDefs = [
    ['كابل جهاز كارديو', 'Cardio Machine Cable', 45],
    ['حزام تشغيل تريدميل', 'Treadmill Belt', 180],
    ['بكرة جهاز كابل', 'Cable Pulley', 60],
    ['وسادة مقعد تمرين', 'Bench Pad', 90],
    ['محرك جهاز إليبتيكال', 'Elliptical Motor', 350],
    ['مسند يد دراجة ثابتة', 'Spin Bike Handle', 40],
  ];
  const sparePartIds: number[] = [];
  let spSeq = 1;
  for (const [ar, en, cost] of sparePartDefs) {
    const r = await prisma.inv_spare_parts.create({
      data: {
        part_code: `SP-${String(spSeq++).padStart(4, '0')}`,
        name_ar: ar as string, name_en: en as string,
        main_category_id: mainCats[2], sub_category_id: subCats[6],
        warehouse_id: pick(mainWarehouses).id, supplier_id: pick(supplierIds), branch_id: B0,
        brand: 'Technogym', part_condition: pick(['new', 'used', 'refurbished'] as const),
        cost_price: cost as number, selling_price: round2((cost as number) * 1.4),
        current_stock: randInt(2, 25), min_stock: randInt(2, 5),
        warranty_period: '12 شهر', status: 'active', is_deleted: false,
      },
    });
    sparePartIds.push(r.id);
  }

  // ---- consumables (cleaning / operational supplies) ----
  const consumableDefs = [
    ['مناديل تعقيم أجهزة', 'Equipment Sanitizing Wipes', 25],
    ['بخاخ مطهر', 'Disinfectant Spray', 18],
    ['مناشف ورقية', 'Paper Towels', 12],
    ['شامبو استحمام', 'Body Shampoo', 30],
    ['أكياس قمامة', 'Trash Bags', 15],
    ['طباشير رفع أثقال', 'Lifting Chalk', 20],
  ];
  const consumableIds: number[] = [];
  let cSeq = 1;
  for (const [ar, en, cost] of consumableDefs) {
    const r = await prisma.inv_consumables.create({
      data: {
        code: `CON-${String(cSeq++).padStart(4, '0')}`,
        name_ar: ar as string, name_en: en as string,
        category_id: catIds[4], warehouse_id: pick(mainWarehouses).id,
        supplier_id: pick(supplierIds), branch_id: B0, brand_id: pick(brandIds),
        unit_template_id: pick(unitTplIds),
        consumption_rate: round2(randInt(1, 10) + rnd2()), unit_cost: cost as number,
        current_stock: randInt(10, 100), min_stock: randInt(5, 15), max_stock: randInt(150, 300),
        is_active: true, is_deleted: false,
      },
    });
    consumableIds.push(r.id);
  }

  // ---- composite products (bundles) + items ----
  const compositeDefs = [
    { name: 'باقة المبتدئين', code: 'CMB-0001', price: 480, parts: 3 },
    { name: 'باقة المكملات', code: 'CMB-0002', price: 620, parts: 3 },
    { name: 'طقم الإكسسوارات', code: 'CMB-0003', price: 250, parts: 4 },
  ];
  for (const cd of compositeDefs) {
    const comp = await prisma.inv_composite_products.create({
      data: {
        name: cd.name, code: cd.code, description: `${cd.name} - عرض موفر`,
        unit: 'طقم', price: cd.price, is_active: true, is_deleted: false,
      },
    });
    const chosen = pickN(products, cd.parts);
    for (const cp of chosen) {
      await prisma.inv_composite_items.create({
        data: { composite_product_id: comp.id, product_id: cp.id, quantity: randInt(1, 2) },
      });
    }
  }

  // ---- service consumables (link club services to consumables) ----
  // service_id references club/gym service ids; we use small integer refs (1..6).
  const serviceConsCount = Math.min(6, consumableIds.length);
  for (let s = 1; s <= serviceConsCount; s++) {
    await prisma.inv_service_consumables.create({
      data: { service_id: s, consumable_id: consumableIds[s - 1], quantity: randInt(1, 3) },
    });
  }

  // ---- product_storages (physical placement) ----
  // unique (storage_id, product_id). Place a subset of products in storages.
  for (const st of storages) {
    const placed = pickN(products, randInt(4, 8));
    for (const p of placed) {
      await prisma.inv_product_storages.create({
        data: { storage_id: st.id, product_id: p.id, quantity: randInt(5, 60) },
      });
    }
  }

  // ---- product_branches (per-branch stock) ----
  // unique (product_id, branch_id).
  for (const p of products) {
    for (const b of branchIds) {
      if (!chance(0.6)) continue;
      await prisma.inv_product_branches.create({
        data: {
          product_id: p.id, branch_id: b,
          stock_quantity: randInt(0, 120), reorder_point: randInt(10, 30),
        },
      });
    }
  }

  // ========================================================================
  // 3. STOCK: opening stock, balances, movements/transactions, counts, adjustments
  // ========================================================================

  // ---- opening stocks (per product, into each branch main warehouse) ----
  // Track running stock per (product, warehouse) so balances stay coherent.
  const stockMap = new Map<string, number>(); // key = `${productId}:${warehouseId}`
  const key = (pid: number, wid: number) => `${pid}:${wid}`;

  for (const mw of mainWarehouses) {
    for (const p of products) {
      if (!chance(0.85)) continue;
      const qty = randInt(20, 200);
      stockMap.set(key(p.id, mw.id), qty);
      await prisma.inv_opening_stocks.create({
        data: {
          opening_stock_date: addDays(BASE, -90),
          item_code: p.code, quantity: qty, unit_cost: p.cost,
          total_cost: round2(qty * p.cost),
          notes: 'رصيد افتتاحي', branch_id: mw.branch_id, warehouse_id: mw.id,
          product_id: p.id, is_deleted: false,
        },
      });
    }
  }

  // ---- movements + transactions ----
  // Create inv_transactions (receipt/issue/count/adjustment) with items and matching movements.
  // Opening movement per opening-stock entry, plus a mix of transactional movements.
  let movementCount = 0;
  const movementDoc = (t: string, n: number) => `${t}-${String(n).padStart(5, '0')}`;

  // 3a. opening-stock movements (direction in)
  let osMoveSeq = 1;
  for (const [k, qty] of stockMap.entries()) {
    const [pidS, widS] = k.split(':');
    const pid = Number(pidS), wid = Number(widS);
    const prod = products.find((p) => p.id === pid)!;
    await prisma.inv_movements.create({
      data: {
        movement_date: addDays(BASE, -90), txn_type: 'receipt', direction: 'in',
        product_id: pid, warehouse_id: wid, quantity: qty, uom: prod.uom,
        unit_cost: prod.cost, balance_after: qty,
        doc_type: 'opening_stock', doc_ref: movementDoc('OS', osMoveSeq++),
        branch_id: warehouses.find((w) => w.id === wid)!.branch_id,
        notes: 'حركة رصيد افتتاحي', created_by: pick(userIds),
      },
    });
    movementCount++;
  }

  // 3b. inventory transactions (draft/approved/rejected mix) with items + movements
  const txnTypes = ['receipt', 'issue', 'transfer', 'count', 'damage', 'adjustment'] as const;
  const txnStatuses = ['draft', 'approved', 'rejected'] as const;
  let txnSeq = 1;
  const createdTxns: number[] = [];
  for (let i = 0; i < 16; i++) {
    const type = pick(txnTypes);
    const status = i < 10 ? 'approved' : pick(txnStatuses); // ensure enough approved
    const mw = pick(mainWarehouses);
    const lineProducts = pickN(products, randInt(2, 4));
    let total = 0;
    const txn = await prisma.inv_transactions.create({
      data: {
        reference: `TXN-2026-${String(txnSeq++).padStart(4, '0')}`,
        txn_type: type, status,
        txn_date: addDays(BASE, -randInt(1, 60)),
        source_warehouse_id: type === 'issue' || type === 'transfer' ? mw.id : null,
        target_warehouse_id: type === 'receipt' || type === 'transfer' ? mw.id : null,
        branch_id: mw.branch_id,
        total_amount: 0,
        notes: `حركة مخزنية - ${type}`,
        reason: type === 'damage' ? 'تلف' : type === 'adjustment' ? 'تسوية' : null,
        created_by: pick(userIds),
        approved_by: status === 'approved' ? pick(userIds) : null,
        approved_at: status === 'approved' ? addDays(BASE, -randInt(1, 30)) : null,
        rejected_by: status === 'rejected' ? pick(userIds) : null,
        rejected_at: status === 'rejected' ? addDays(BASE, -randInt(1, 30)) : null,
        rejection_reason: status === 'rejected' ? 'بيانات غير مكتملة' : null,
        is_deleted: false,
      },
    });
    createdTxns.push(txn.id);
    for (const lp of lineProducts) {
      const qty = randInt(2, 15);
      const price = lp.cost;
      const lineTotal = round2(qty * price);
      total += lineTotal;
      await prisma.inv_transaction_items.create({
        data: {
          transaction_id: txn.id, product_id: lp.id, item_code: lp.code,
          item_name: lp.ar, quantity: qty, unit: lp.uom, price, total: lineTotal,
        },
      });
      // matching movement only for approved transactions
      if (status === 'approved') {
        const dir = type === 'issue' || type === 'damage' ? 'out' : 'in';
        const cur = stockMap.get(key(lp.id, mw.id)) ?? 0;
        const after = dir === 'in' ? cur + qty : Math.max(0, cur - qty);
        stockMap.set(key(lp.id, mw.id), after);
        await prisma.inv_movements.create({
          data: {
            movement_date: txn.approved_at ?? addDays(BASE, -randInt(1, 30)),
            txn_type: type, direction: dir,
            product_id: lp.id, warehouse_id: mw.id, quantity: qty, uom: lp.uom,
            unit_cost: price, balance_after: after,
            doc_type: 'inventory_transaction', doc_ref: txn.reference,
            transaction_id: txn.id, branch_id: mw.branch_id,
            notes: `${type}`, created_by: txn.created_by,
          },
        });
        movementCount++;
      }
    }
    await prisma.inv_transactions.update({
      where: { id: txn.id }, data: { total_amount: round2(total) },
    });
  }

  // ---- count sessions + items + adjustments ----
  let csSeq = 1, adjSeq = 1;
  for (let i = 0; i < 5; i++) {
    const mw = pick(mainWarehouses);
    // spread statuses: draft, in_progress, completed
    const sessStatus = pick(['draft', 'in_progress', 'completed'] as const);
    const session = await prisma.inv_count_sessions.create({
      data: {
        session_number: `CNT-2026-${String(csSeq++).padStart(4, '0')}`,
        warehouse_id: mw.id, branch_id: mw.branch_id, status: sessStatus,
        notes: 'جلسة جرد دورية', created_by: pick(userIds),
      },
    });
    const counted = pickN(products, randInt(4, 8));
    let hasVariance = false;
    for (const cp of counted) {
      const sys = stockMap.get(key(cp.id, mw.id)) ?? randInt(0, 50);
      const cnt = sessStatus === 'draft' ? 0 : sys + (chance(0.4) ? randInt(-3, 3) : 0);
      const variance = round2(cnt - sys);
      if (variance !== 0) hasVariance = true;
      await prisma.inv_count_items.create({
        data: {
          session_id: session.id, product_id: cp.id, item_code: cp.code, item_name: cp.ar,
          category: catDefs[cp.cat][0], system_quantity: sys, counted_quantity: cnt,
          variance, status: sessStatus === 'completed' ? 'counted' : 'pending',
        },
      });
    }
    // completed sessions with variance produce an approved adjustment
    if (sessStatus === 'completed' && hasVariance) {
      await prisma.inv_adjustments.create({
        data: {
          adjustment_number: `ADJ-2026-${String(adjSeq++).padStart(4, '0')}`,
          session_id: session.id, warehouse_id: mw.id, status: 'approved',
          approved_by: pick(empNames), approved_at: addDays(BASE, -randInt(1, 10)),
          notes: 'تسوية فروقات الجرد',
        },
      });
    }
  }
  // a couple of standalone draft adjustments
  for (let i = 0; i < 2; i++) {
    await prisma.inv_adjustments.create({
      data: {
        adjustment_number: `ADJ-2026-${String(adjSeq++).padStart(4, '0')}`,
        warehouse_id: pick(mainWarehouses).id, status: 'draft', notes: 'تسوية قيد المراجعة',
      },
    });
  }

  // ---- stock balances (final, per product/warehouse from stockMap) ----
  // unique (product_id, warehouse_id).
  let balanceCount = 0;
  for (const [k, qty] of stockMap.entries()) {
    const [pidS, widS] = k.split(':');
    const pid = Number(pidS), wid = Number(widS);
    const prod = products.find((p) => p.id === pid)!;
    await prisma.inv_stock_balances.create({
      data: {
        product_id: pid, warehouse_id: wid, current_stock: qty,
        min_stock: prod ? randInt(5, 15) : 5,
        max_stock: randInt(200, 600),
        reorder_point: randInt(15, 40),
        shelf_location: `R${randInt(1, 9)}-S${randInt(1, 20)}`,
      },
    });
    balanceCount++;
  }

  // ========================================================================
  // 4. PROCUREMENT
  // ========================================================================

  // ---- procurement settings (one global + per-branch) ----
  await prisma.prc_procurement_settings.create({
    data: {
      branch_id: null, require_approval: true, approval_threshold: 5000,
      max_order_amount: 200000, require_vendor_evaluation: true, min_quotations: 2,
      enable_inventory_integration: true, enable_three_way_match: true,
      match_tolerance_percent: 2.5, notify_email: true, notify_sms: false, notify_in_system: true,
    },
  });
  for (const b of branchIds.slice(0, 2)) {
    await prisma.prc_procurement_settings.create({
      data: {
        branch_id: b, require_approval: true, approval_threshold: 3000,
        max_order_amount: 100000, min_quotations: 1, match_tolerance_percent: 3,
      },
    });
  }

  // ---- supplier categories ----
  const supCatDefs = [
    ['مكملات غذائية', '#22c55e'], ['ملابس وأحذية', '#3b82f6'],
    ['معدات وأجهزة', '#f59e0b'], ['مشروبات وأطعمة', '#ef4444'], ['خدمات وصيانة', '#8b5cf6'],
  ];
  for (const [name, color] of supCatDefs) {
    await prisma.prc_supplier_categories.create({
      data: { name, description: `موردو ${name}`, color, active: true },
    });
  }

  // ---- supply regions ----
  const regionDefs = [
    ['المنطقة الوسطى', 'القاهرة'], ['المنطقة الغربية', 'جدة'],
    ['المنطقة الشرقية', 'الدمام'], ['المنطقة الجنوبية', 'أبها'],
  ];
  for (const [name, city] of regionDefs) {
    await prisma.prc_supply_regions.create({
      data: {
        name, description: `توريد ${name}`, country: 'جمهورية مصر العربية',
        city, active: true, branches: branchIds.slice(0, 2),
      },
    });
  }

  // ---- payment terms ----
  const termDefs = [
    ['دفع فوري', 0, 'immediate', 0],
    ['صافي 30 يوم', 30, 'net', 0],
    ['صافي 60 يوم', 60, 'net', 0],
    ['خصم 2% خلال 10 أيام', 10, 'discount', 2],
  ];
  for (const [name, days, type, disc] of termDefs) {
    await prisma.prc_payment_terms.create({
      data: {
        name: name as string, days: days as number, type: type as string,
        discount_percentage: disc as number, active: true,
        description: name as string,
      },
    });
  }

  // ---- requisitions + items (statuses: draft/pending/approved) ----
  const deptNames = ['المخزون', 'الصيانة', 'التسويق', 'العمليات', 'المشتريات'];
  const reqStatuses = ['draft', 'pending', 'approved', 'approved', 'approved'];
  const requisitions: { id: number; status: string; branch_id: number }[] = [];
  let reqSeq = 1;
  for (let i = 0; i < 10; i++) {
    const status = reqStatuses[i % reqStatuses.length];
    const b = pick(branchIds);
    const lineItems = pickN(products, randInt(2, 4));
    let est = 0;
    const req = await prisma.prc_requisitions.create({
      data: {
        request_number: `PR-2026-${String(reqSeq++).padStart(4, '0')}`,
        request_type: pick(['purchase', 'restock', 'urgent']),
        requesting_department: pick(deptNames),
        required_date: ymd(addDays(BASE, randInt(3, 30))),
        priority: pick(['low', 'normal', 'high']),
        status, estimated_value: 0, branch_id: b, created_by: pick(userIds),
        approved_by: status === 'approved' ? pick(userIds) : null,
        approved_at: status === 'approved' ? addDays(BASE, -randInt(1, 20)) : null,
        approval_notes: status === 'approved' ? 'تمت الموافقة' : null,
        is_deleted: false,
      },
    });
    for (const li of lineItems) {
      const qty = randInt(10, 50);
      const price = li.cost;
      est += qty * price;
      await prisma.prc_requisition_items.create({
        data: {
          requisition_id: req.id, product_id: li.id, name: li.ar, quantity: qty,
          unit: li.uom, estimated_price: price, specifications: 'حسب المواصفات القياسية',
        },
      });
    }
    await prisma.prc_requisitions.update({
      where: { id: req.id }, data: { estimated_value: round2(est) },
    });
    requisitions.push({ id: req.id, status, branch_id: b });
  }
  const approvedReqs = requisitions.filter((r) => r.status === 'approved');

  // ---- RFQs + items + quotations ----
  const rfqStatuses = ['draft', 'sent', 'quotes_received', 'under_comparison', 'completed'];
  let rfqSeq = 1;
  const rfqs: { id: number; status: string; branch_id: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const status = rfqStatuses[i % rfqStatuses.length];
    const b = pick(branchIds);
    const lineItems = pickN(products, randInt(2, 3));
    let budget = 0;
    const rfq = await prisma.prc_rfqs.create({
      data: {
        rfq_number: `RFQ-2026-${String(rfqSeq++).padStart(4, '0')}`,
        subject: `طلب عرض أسعار - ${pick(['مكملات', 'ملابس', 'معدات', 'مشروبات'])}`,
        requesting_department: pick(deptNames),
        required_date: ymd(addDays(BASE, randInt(5, 25))),
        status, estimated_budget: 0, branch_id: b, created_by: pick(userIds),
        is_deleted: false,
      },
    });
    for (const li of lineItems) {
      const qty = randInt(10, 60);
      budget += qty * li.cost;
      await prisma.prc_rfq_items.create({
        data: {
          rfq_id: rfq.id, product_id: li.id, item_code: li.code, item_name: li.ar,
          quantity: qty, unit: li.uom, estimated_price: li.cost,
        },
      });
    }
    // quotations from a couple of suppliers once quotes are in
    if (['quotes_received', 'under_comparison', 'completed'].includes(status)) {
      const quoteSuppliers = pickN(supplierIds, randInt(2, 3));
      let bestSupplier = quoteSuppliers[0], bestPrice = Infinity;
      for (const sid of quoteSuppliers) {
        const qPrice = round2(budget * (0.9 + rnd2() * 0.3));
        const qStatus = status === 'completed' && sid === quoteSuppliers[0] ? 'accepted' : 'received';
        if (qPrice < bestPrice) { bestPrice = qPrice; bestSupplier = sid; }
        await prisma.prc_quotations.create({
          data: {
            rfq_id: rfq.id, supplier_id: sid, total_price: qPrice,
            delivery_time: `${randInt(3, 14)} أيام`,
            payment_terms: pick(['دفع فوري', 'صافي 30 يوم', 'صافي 60 يوم']),
            received_date: ymd(addDays(BASE, -randInt(1, 15))), status: qStatus,
          },
        });
      }
      await prisma.prc_rfqs.update({
        where: { id: rfq.id },
        data: {
          estimated_budget: round2(budget),
          selected_vendor_id: status === 'completed' ? bestSupplier : null,
          final_price: status === 'completed' ? round2(bestPrice) : null,
        },
      });
    } else {
      await prisma.prc_rfqs.update({
        where: { id: rfq.id }, data: { estimated_budget: round2(budget) },
      });
    }
    rfqs.push({ id: rfq.id, status, branch_id: b });
  }

  // ---- purchase orders + items (statuses draft..completed) ----
  const poStatuses = ['draft', 'sent', 'confirmed', 'in_progress', 'completed'];
  let poSeq = 1;
  const purchaseOrders: {
    id: number; status: string; supplier_id: number; branch_id: number; total: number;
    items: { product_id: number; name: string; qty: number; price: number }[];
  }[] = [];
  for (let i = 0; i < 12; i++) {
    // bias toward completed so downstream GRN/invoice have parents
    const status = i < 7 ? 'completed' : poStatuses[i % poStatuses.length];
    const supplier_id = pick(supplierIds);
    const b = pick(branchIds);
    const reqLink = approvedReqs.length && chance(0.5) ? pick(approvedReqs).id : null;
    const lineItems = pickN(products, randInt(2, 5));
    let total = 0;
    const itemsMeta: { product_id: number; name: string; qty: number; price: number }[] = [];
    const po = await prisma.prc_purchase_orders.create({
      data: {
        po_number: `PO-2026-${String(poSeq++).padStart(4, '0')}`,
        requisition_id: reqLink, supplier_id,
        expected_delivery_date: ymd(addDays(BASE, randInt(3, 20))),
        payment_terms: pick(['دفع فوري', 'صافي 30 يوم', 'صافي 60 يوم']),
        notes: 'أمر شراء', status, total_amount: 0, branch_id: b, created_by: pick(userIds),
        is_deleted: false,
      },
    });
    for (const li of lineItems) {
      const qty = randInt(10, 80);
      const price = li.cost;
      const lineTotal = round2(qty * price);
      total += lineTotal;
      itemsMeta.push({ product_id: li.id, name: li.ar, qty, price });
      await prisma.prc_purchase_order_items.create({
        data: {
          purchase_order_id: po.id, product_id: li.id, name: li.ar, quantity: qty,
          unit: li.uom, price, total: lineTotal,
        },
      });
    }
    await prisma.prc_purchase_orders.update({
      where: { id: po.id }, data: { total_amount: round2(total) },
    });
    purchaseOrders.push({ id: po.id, status, supplier_id, branch_id: b, total: round2(total), items: itemsMeta });
  }
  const completedPOs = purchaseOrders.filter((p) => p.status === 'completed');

  // ---- goods receipts + items (for completed POs) ----
  let grnSeq = 1;
  const goodsReceipts: { id: number; po: typeof completedPOs[number]; status: string }[] = [];
  for (const po of completedPOs) {
    const grnStatus = pick(['completed', 'completed', 'partial'] as const);
    const mw = mainWarehouses.find((w) => w.branch_id === po.branch_id) ?? mainWarehouses[0];
    const grn = await prisma.prc_goods_receipts.create({
      data: {
        grn_number: `GRN-2026-${String(grnSeq++).padStart(4, '0')}`,
        purchase_order_id: po.id, warehouse_id: mw.id, receiver_name: pick(empNames),
        receipt_date: ymd(addDays(BASE, -randInt(1, 15))), notes: 'استلام بضاعة',
        status: grnStatus, stock_posted: true, posted_at: addDays(BASE, -randInt(1, 14)),
        branch_id: po.branch_id, created_by: pick(userIds), is_deleted: false,
      },
    });
    for (const it of po.items) {
      const received = grnStatus === 'partial' ? Math.max(1, Math.floor(it.qty * 0.7)) : it.qty;
      await prisma.prc_goods_receipt_items.create({
        data: {
          goods_receipt_id: grn.id, product_id: it.product_id, name: it.name,
          ordered_qty: it.qty, received_qty: received, unit: 'وحدة',
          rejected: grnStatus === 'partial' && chance(0.3),
        },
      });
      // reflect receipt into stock + movement
      const cur = stockMap.get(key(it.product_id, mw.id)) ?? 0;
      const after = cur + received;
      stockMap.set(key(it.product_id, mw.id), after);
    }
    goodsReceipts.push({ id: grn.id, po, status: grnStatus });
  }

  // ---- purchase invoices + items + payment schedules ----
  const invStatuses = ['بانتظار مطابقة', 'معتمد', 'تحت المراجعة'];
  const matchStatuses = ['تحت المراجعة', 'مطابق', 'غير مطابق', 'بانتظار الموافقة'];
  let piSeq = 1;
  const purchaseInvoices: { id: number; amount: number; supplier_id: number; status: string }[] = [];
  for (let i = 0; i < goodsReceipts.length; i++) {
    const gr = goodsReceipts[i];
    const status = invStatuses[i % invStatuses.length];
    const matching = matchStatuses[i % matchStatuses.length];
    const amount = gr.po.total;
    const pi = await prisma.prc_purchase_invoices.create({
      data: {
        invoice_number: `PINV-2026-${String(piSeq++).padStart(4, '0')}`,
        invoice_date: ymd(addDays(BASE, -randInt(1, 12))),
        supplier_id: gr.po.supplier_id, purchase_order_id: gr.po.id, goods_receipt_id: gr.id,
        due_date: ymd(addDays(BASE, randInt(15, 60))),
        status, matching_status: matching, notes: 'فاتورة مشتريات',
        invoice_amount: amount, branch_id: gr.po.branch_id, is_deleted: false,
      },
    });
    for (const it of gr.po.items) {
      const lineTotal = round2(it.qty * it.price);
      await prisma.prc_purchase_invoice_items.create({
        data: {
          purchase_invoice_id: pi.id, name: it.name, quantity: it.qty, price: it.price,
          total: lineTotal, po_quantity: it.qty, grn_quantity: it.qty, variance: 0,
        },
      });
    }
    // payment schedule (one or two installments)
    const installments = chance(0.5) ? 2 : 1;
    for (let s = 0; s < installments; s++) {
      await prisma.prc_supplier_payment_schedules.create({
        data: {
          purchase_invoice_id: pi.id,
          scheduled_date: ymd(addDays(BASE, 15 + s * 30)),
          amount: round2(amount / installments),
          payment_method: pick(['تحويل بنكي', 'شيك', 'نقدي']),
          status: 'مجدول',
        },
      });
    }
    purchaseInvoices.push({ id: pi.id, amount, supplier_id: gr.po.supplier_id, status });
  }

  // ---- supplier payments (against approved invoices) ----
  let payySeq = 1;
  for (let i = 0; i < Math.min(8, purchaseInvoices.length); i++) {
    const inv = purchaseInvoices[i];
    const paid = i < 5; // first several paid
    await prisma.prc_supplier_payments.create({
      data: {
        payment_number: `PAY-2026-${String(payySeq++).padStart(4, '0')}`,
        supplier_id: inv.supplier_id, invoice_id: null,
        payment_date: ymd(addDays(BASE, -randInt(1, 10))),
        payment_amount: paid ? inv.amount : round2(inv.amount * 0.5),
        original_amount: inv.amount,
        remaining_amount: paid ? 0 : round2(inv.amount * 0.5),
        currency: 'EGP', payment_method: pick(['bank_transfer', 'cash', 'cheque']),
        status: paid ? 'مدفوع' : 'مسودة', notes: 'سداد مورد', created_by: pick(userIds),
        is_deleted: false,
      },
    });
  }

  // ---- supplier contracts ----
  let contractSeq = 1;
  for (let i = 0; i < 5; i++) {
    const sid = supplierIds[i % supplierIds.length];
    const supName = supplierDefs[i % supplierDefs.length][0];
    await prisma.prc_supplier_contracts.create({
      data: {
        contract_number: `CTR-2026-${String(contractSeq++).padStart(4, '0')}`,
        supplier_id: sid, supplier_name: supName,
        start_date: ymd(addDays(BASE, -randInt(60, 180))),
        end_date: ymd(addDays(BASE, randInt(120, 365))),
        contract_type: pick(['توريد سنوي', 'إطاري', 'مشروع']),
        contract_value: round2(randInt(50000, 500000)),
        status: pick(['active', 'active', 'expired']), notes: 'عقد توريد',
        is_deleted: false,
      },
    });
  }

  // ---- supplier invoices (standalone AP invoices) + items ----
  let siSeq = 1;
  for (let i = 0; i < 8; i++) {
    const sid = pick(supplierIds);
    const b = pick(branchIds);
    const lineItems = pickN(products, randInt(2, 4));
    let subtotal = 0;
    const itemsMeta: { product_id: number; name: string; qty: number; price: number }[] = [];
    for (const li of lineItems) {
      const qty = randInt(5, 40);
      subtotal += qty * li.cost;
      itemsMeta.push({ product_id: li.id, name: li.ar, qty, price: li.cost });
    }
    subtotal = round2(subtotal);
    const tax = round2(subtotal * 0.15);
    const disc = chance(0.3) ? round2(subtotal * 0.05) : 0;
    const totalAmt = round2(subtotal + tax - disc);
    const paid = i < 4 ? totalAmt : (chance(0.5) ? round2(totalAmt * 0.5) : 0);
    const si = await prisma.prc_supplier_invoices.create({
      data: {
        invoice_number: `SINV-2026-${String(siSeq++).padStart(4, '0')}`,
        supplier_id: sid, branch_id: b,
        invoice_date: ymd(addDays(BASE, -randInt(1, 30))),
        due_date: ymd(addDays(BASE, randInt(15, 45))),
        subtotal, tax_amount: tax, discount_amount: disc, total_amount: totalAmt,
        paid_amount: paid, remaining_amount: round2(totalAmt - paid),
        currency: 'EGP', status: i < 4 ? 'مدفوع' : 'مسودة', notes: 'فاتورة مورد',
        created_by: pick(userIds), is_deleted: false,
      },
    });
    for (const it of itemsMeta) {
      await prisma.prc_supplier_invoice_items.create({
        data: {
          invoice_id: si.id, product_id: it.product_id, product_name: it.name,
          quantity: it.qty, unit_price: it.price, total_amount: round2(it.qty * it.price),
        },
      });
    }
  }

  // ---- debit notes + items ----
  const dnStatuses = ['مسودة', 'معتمد', 'مرسل للمورد'];
  let dnSeq = 1;
  for (let i = 0; i < 6; i++) {
    const sid = pick(supplierIds);
    const b = pick(branchIds);
    const status = dnStatuses[i % dnStatuses.length];
    const lineItems = pickN(products, randInt(1, 3));
    let amount = 0;
    const dn = await prisma.prc_debit_notes.create({
      data: {
        debit_number: `DN-2026-${String(dnSeq++).padStart(4, '0')}`,
        debit_date: ymd(addDays(BASE, -randInt(1, 20))), supplier_id: sid,
        reason: pick(['بضاعة تالفة', 'نقص في الكمية', 'خطأ في السعر', 'إرجاع جزئي']),
        debit_amount: 0, status,
        approved_by: status !== 'مسودة' ? pick(userIds) : null,
        approved_at: status !== 'مسودة' ? addDays(BASE, -randInt(1, 15)) : null,
        sent_date: status === 'مرسل للمورد' ? addDays(BASE, -randInt(1, 10)) : null,
        notes: 'إشعار مدين', branch_id: b, created_by: pick(userIds), is_deleted: false,
      },
    });
    for (const li of lineItems) {
      const qty = randInt(1, 10);
      const lineAmt = round2(qty * li.cost);
      amount += lineAmt;
      await prisma.prc_debit_note_items.create({
        data: {
          debit_note_id: dn.id, name: li.ar, quantity: qty, unit_price: li.cost, amount: lineAmt,
        },
      });
    }
    await prisma.prc_debit_notes.update({
      where: { id: dn.id }, data: { debit_amount: round2(amount) },
    });
  }

  // ---- purchase returns + items ----
  const prStatuses = ['مسودة', 'معتمد', 'مكتمل'];
  let prSeq = 1;
  for (let i = 0; i < 6; i++) {
    const sid = pick(supplierIds);
    const mw = pick(mainWarehouses);
    const status = prStatuses[i % prStatuses.length];
    const lineItems = pickN(products, randInt(1, 3));
    let total = 0;
    const pr = await prisma.prc_purchase_returns.create({
      data: {
        return_number: `PR-${String(prSeq++).padStart(6, '0')}`,
        supplier_id: sid, warehouse_id: mw.id, branch_id: mw.branch_id, status,
        total_amount: 0, notes: 'مرتجع مشتريات',
        stock_posted: status !== 'مسودة', posted_at: status !== 'مسودة' ? addDays(BASE, -randInt(1, 10)) : null,
        created_by: pick(userIds), is_deleted: false,
      },
    });
    for (const li of lineItems) {
      const qty = randInt(1, 8);
      const lineTotal = round2(qty * li.cost);
      total += lineTotal;
      await prisma.prc_purchase_return_items.create({
        data: {
          purchase_return_id: pr.id, product_id: li.id, product_name: li.ar,
          quantity: qty, unit_price: li.cost, total: lineTotal,
        },
      });
    }
    await prisma.prc_purchase_returns.update({
      where: { id: pr.id }, data: { total_amount: round2(total) },
    });
  }

  // ---- quick purchase orders ----
  const qpoStatuses = ['مسودة', 'مؤكد'];
  let qpoSeq = 1;
  for (let i = 0; i < 8; i++) {
    const sid = pick(supplierIds);
    const mw = pick(mainWarehouses);
    const p = pick(products);
    const status = qpoStatuses[i % qpoStatuses.length];
    const qty = randInt(5, 50);
    const unit_price = p.cost;
    await prisma.prc_quick_purchase_orders.create({
      data: {
        order_number: `QPO-${String(qpoSeq++).padStart(6, '0')}`,
        supplier_id: sid, product_id: p.id, product_name: p.ar,
        quantity: qty, unit_price, total_amount: round2(qty * unit_price),
        warehouse_id: mw.id, branch_id: mw.branch_id, status,
        stock_posted: status === 'مؤكد',
        posted_at: status === 'مؤكد' ? addDays(BASE, -randInt(1, 8)) : null,
        notes: 'أمر شراء سريع', created_by: pick(userIds), is_deleted: false,
      },
    });
  }

  // ========================================================================
  // 5. SALES (shifts, sessions, quick sales, POS payments, bookings)
  // ========================================================================

  // ---- shifts (per branch: morning + evening) ----
  const shiftDefs = [
    { name: 'الوردية الصباحية', start: '08:00:00', end: '16:00:00', color: '#f59e0b' },
    { name: 'الوردية المسائية', start: '16:00:00', end: '23:59:00', color: '#3b82f6' },
  ];
  const shifts: { id: number; branch_id: number; start: string; end: string }[] = [];
  for (const b of branchIds) {
    for (const sd of shiftDefs) {
      const sh = await prisma.sales_shifts.create({
        data: {
          shift_name: `${sd.name} - فرع ${b}`, start_time: sd.start, end_time: sd.end,
          branch_id: b, is_active: true, description: sd.name, color: sd.color,
          created_by: pick(userIds),
        },
      });
      shifts.push({ id: sh.id, branch_id: b, start: sd.start, end: sd.end });
    }
  }

  // ---- shift sessions (open + closed). unique(session_date, shift_id, branch_id) ----
  // For each shift create closed sessions on prior days + one open session today for a subset.
  const sessions: {
    id: number; shift_id: number; branch_id: number; date: string; start: string; end: string;
    status: string;
  }[] = [];
  let sessionIdx = 0;
  for (const sh of shifts) {
    // closed sessions on prior days
    for (let d = 1; d <= 3; d++) {
      const date = ymd(addDays(BASE, -d));
      const user_id = pick(userIds);
      const opening = round2(randInt(200, 800));
      const sess = await prisma.sales_shift_sessions.create({
        data: {
          shift_id: sh.id, branch_id: sh.branch_id, user_id,
          session_date: date, start_time: addDays(BASE, -d), end_time: addDays(BASE, -d),
          expected_start_time: sh.start, expected_end_time: sh.end,
          opening_balance: opening, status: 'closed', closed_by: user_id,
          notes: 'وردية مغلقة', created_by: user_id,
        },
      });
      sessions.push({ id: sess.id, shift_id: sh.id, branch_id: sh.branch_id, date, start: sh.start, end: sh.end, status: 'closed' });
      sessionIdx++;
    }
    // one open session "today" only for the morning shift (avoid too many open)
    if (sh.start === '08:00:00') {
      const date = ymd(BASE);
      const user_id = pick(userIds);
      const sess = await prisma.sales_shift_sessions.create({
        data: {
          shift_id: sh.id, branch_id: sh.branch_id, user_id,
          session_date: date, start_time: BASE,
          expected_start_time: sh.start, expected_end_time: sh.end,
          opening_balance: round2(randInt(300, 700)), status: 'open',
          notes: 'وردية مفتوحة', created_by: user_id,
        },
      });
      sessions.push({ id: sess.id, shift_id: sh.id, branch_id: sh.branch_id, date, start: sh.start, end: sh.end, status: 'open' });
    }
  }

  // ---- quick sales + items + POS payments ----
  const sellable = products; // all products are sellable
  const payMethods = ['cash', 'card', 'wallet', 'transfer', 'mixed'] as const;
  let qsSeq = 1;
  const dailySaleSequences = new Map<string, number>();
  // aggregate per session for totals
  const sessAgg = new Map<number, { sales: number; cash: number; card: number; wallet: number; transfer: number; count: number }>();
  const bump = (sid: number, method: string, amount: number) => {
    const a = sessAgg.get(sid) ?? { sales: 0, cash: 0, card: 0, wallet: 0, transfer: 0, count: 0 };
    a.sales += amount; a.count += 1;
    if (method === 'cash') a.cash += amount;
    else if (method === 'card') a.card += amount;
    else if (method === 'wallet') a.wallet += amount;
    else if (method === 'transfer') a.transfer += amount;
    else { a.cash += round2(amount * 0.5); a.card += round2(amount * 0.5); } // mixed
    sessAgg.set(sid, a);
  };

  for (const sess of sessions) {
    const nSales = sess.status === 'open' ? randInt(2, 5) : randInt(4, 9);
    for (let i = 0; i < nSales; i++) {
      const lineProducts = pickN(sellable, randInt(1, 4));
      let subtotal = 0;
      const itemsMeta: { pid: number; name: string; code: string; price: number; qty: number }[] = [];
      for (const lp of lineProducts) {
        const qty = randInt(1, 3);
        subtotal += lp.sell * qty;
        itemsMeta.push({ pid: lp.id, name: lp.ar, code: lp.code, price: lp.sell, qty });
      }
      subtotal = round2(subtotal);
      const discPct = chance(0.25) ? pick([5, 10]) : 0;
      const discAmt = round2(subtotal * discPct / 100);
      const taxable = subtotal - discAmt;
      const taxPct = 15;
      const taxAmt = round2(taxable * taxPct / 100);
      const total = round2(taxable + taxAmt);
      const method = pick(payMethods);
      const saleStatus = chance(0.9) ? 'completed' : pick(['refunded', 'cancelled'] as const);
      const saleDate = sess.date;
      const hour = sess.start === '08:00:00' ? randInt(8, 15) : randInt(16, 22);
      const saleTime = `${String(hour).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}`;
      const mw = mainWarehouses.find((w) => w.branch_id === sess.branch_id) ?? mainWarehouses[0];
      const dailyKey = `${sess.branch_id}:${saleDate}`;
      const dailyNumber = (dailySaleSequences.get(dailyKey) ?? 0) + 1;
      dailySaleSequences.set(dailyKey, dailyNumber);
      const sale = await prisma.sales_quick_sales.create({
        data: {
          sale_number: `QS-2026-${String(qsSeq++).padStart(6, '0')}`,
          daily_number: dailyNumber,
          customer_name: chance(0.5) ? 'عميل نقدي' : pick(empNames),
          customer_phone: chance(0.4) ? `05${randInt(10000000, 99999999)}` : null,
          branch_id: sess.branch_id, cashier_id: pick(userIds), shift_session_id: sess.id,
          sale_date: saleDate, sale_time: saleTime,
          subtotal, discount_amount: discAmt, discount_percentage: discPct,
          tax_amount: taxAmt, tax_percentage: taxPct, total_amount: total,
          payment_method: method, status: saleStatus,
          loyalty_points_earned: Math.floor(total / 10), receipt_printed: chance(0.8),
          warehouse_id: mw.id, created_by: pick(userIds),
        },
      });
      for (const it of itemsMeta) {
        await prisma.sales_quick_sale_items.create({
          data: {
            quick_sale_id: sale.id, item_type: 'product', product_id: it.pid,
            name: it.name, product_code: it.code, unit_price: it.price,
            quantity: it.qty, line_total: round2(it.price * it.qty),
          },
        });
      }
      // POS payment(s)
      if (method === 'mixed') {
        const half = round2(total / 2);
        await prisma.sales_pos_payments.create({
          data: { quick_sale_id: sale.id, method: 'cash', amount: half, reference: 'نقدي' },
        });
        await prisma.sales_pos_payments.create({
          data: { quick_sale_id: sale.id, method: 'card', amount: round2(total - half), reference: `REF-${randInt(100000, 999999)}` },
        });
      } else {
        await prisma.sales_pos_payments.create({
          data: {
            quick_sale_id: sale.id, method, amount: total,
            reference: method === 'cash' ? 'نقدي' : `REF-${randInt(100000, 999999)}`,
          },
        });
      }
      if (saleStatus === 'completed') bump(sess.id, method, total);
    }
  }

  // update session totals from aggregation
  for (const sess of sessions) {
    const a = sessAgg.get(sess.id) ?? { sales: 0, cash: 0, card: 0, wallet: 0, transfer: 0, count: 0 };
    const opening = 0;
    if (sess.status === 'closed') {
      const expectedClosing = round2(a.cash);
      const closing = round2(expectedClosing + (chance(0.3) ? pick([-5, 5, 10, -10]) : 0));
      await prisma.sales_shift_sessions.update({
        where: { id: sess.id },
        data: {
          total_sales: round2(a.sales), total_cash: round2(a.cash), total_card: round2(a.card),
          total_wallet: round2(a.wallet), total_transfer: round2(a.transfer),
          transactions_count: a.count,
          expected_closing_balance: expectedClosing, closing_balance: closing,
          cash_difference: round2(closing - expectedClosing),
          closing_notes: 'إغلاق الوردية',
          end_time: addDays(new Date(sess.date + 'T00:00:00Z'), 0),
        },
      });
    } else {
      await prisma.sales_shift_sessions.update({
        where: { id: sess.id },
        data: {
          total_sales: round2(a.sales), total_cash: round2(a.cash), total_card: round2(a.card),
          total_wallet: round2(a.wallet), total_transfer: round2(a.transfer),
          transactions_count: a.count,
        },
      });
    }
  }

  // ---- booking services catalog ----
  const bookingServices = [
    { name: 'تدريب شخصي', price: 250 },
    { name: 'حجز صالة', price: 150 },
    { name: 'حصة جماعية', price: 80 },
  ];
  for (let i = 0; i < bookingServices.length; i++) {
    await prisma.sales_booking_services.create({
      data: {
        name: bookingServices[i].name,
        price: bookingServices[i].price,
        branch_id: null,
        is_active: true,
        sort_order: i,
      },
    });
  }

  // ---- bookings (facility / PT bookings) ----
  const bookingStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] as const;
  let bkSeq = 1;
  for (let i = 0; i < 12; i++) {
    const status = bookingStatuses[i % bookingStatuses.length];
    const b = pick(branchIds);
    const price = round2(randInt(100, 500));
    const disc = chance(0.3) ? round2(price * 0.1) : 0;
    const finalAmount = round2(price - disc);
    const paymentStatus = (['confirmed', 'completed', 'in_progress'] as readonly string[]).includes(status)
      ? pick(['paid', 'partial'] as const)
      : 'unpaid';
    const paidAmount = paymentStatus === 'paid'
      ? finalAmount
      : paymentStatus === 'partial'
        ? round2(finalAmount * 0.5)
        : 0;
    const dayOffset = randInt(-5, 10);
    const hour = randInt(9, 21);
    await prisma.sales_bookings.create({
      data: {
        booking_number: `BK-2026-${String(bkSeq++).padStart(6, '0')}`,
        customer_name: pick(empNames), customer_phone: `05${randInt(10000000, 99999999)}`,
        branch_id: b, booking_date: ymd(addDays(BASE, dayOffset)),
        booking_time: `${String(hour).padStart(2, '0')}:00:00`,
        service_id: (i % bookingServices.length) + 1,
        sales_employee_id: chance(0.7) ? pick(userIds) : null,
        status, total_price: price, final_amount: finalAmount,
        payment_status: paymentStatus,
        paid_amount: paidAmount,
        payment_method: paidAmount > 0 ? pick(['cash', 'card', 'wallet', 'transfer'] as const) : null,
        paid_at: paidAmount > 0 ? addDays(BASE, dayOffset) : null,
        notes: pick(['حجز تدريب شخصي', 'حجز صالة', 'حجز حصة جماعية']),
        created_by: pick(userIds),
      },
    });
  }

  // ---- summary log ----
  log('gymsales', `products: ${products.length}, warehouses: ${warehouses.length}, stock balances: ${balanceCount}`);
  log('gymsales', `movements: ${movementCount}, transactions: ${createdTxns.length}`);
  log('gymsales', `POs: ${purchaseOrders.length}, GRNs: ${goodsReceipts.length}, invoices: ${purchaseInvoices.length}`);
  log('gymsales', `shifts: ${shifts.length}, sessions: ${sessions.length}, quick sales: ${qsSeq - 1}`);
  console.log('✔ GymSales done');
}

// small helper: fractional part [0,1) using the shared RNG via round2 pattern
function rnd2(): number {
  // deterministic fractional using randInt
  return randInt(0, 99) / 100;
}

// self-run for standalone testing
if (require.main === module) {
  seedGymSales()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
