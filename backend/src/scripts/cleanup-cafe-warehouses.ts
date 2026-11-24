/* eslint-disable no-console */
/**
 * One-off cleanup of the café stores/bars list (approved by Fatma, 2026-11-19).
 *
 * The old system really used 5 places: the bars البر الشرقي / الجلاء / طنطا up / طنطا down, and
 * «طنطا» (no sales since April 2025) as Tanta's stock room. The migration added 7 more. This script:
 *   1. moves any stock in the duplicate «بار البر الشرقى» into «بار البر الشرقي» with a normal,
 *      approved transfer (same code path as the transfers screen, so movements are recorded);
 *   2. points the store («store_warehouse_id») of Tanta / Tanta up / Tanta down at «بار طنطا»
 *      (where Tanta's stock is) instead of the empty legacy «مخزن طنطا»;
 *   3. renames «بار طنطا» to «مخزن طنطا» and the empty legacy one to «مخزن طنطا (قديم)»;
 *   4. deactivates (never deletes) the empty legacy stores مخزن شبين الكوم / مخزن طنطا /
 *      مخزن شارع البحر, the E2E test store and the emptied duplicate bar.
 * «مخزن الجلاء» and «مخزن البر الشرقي» are left as they are (waiting on Fatma's decision).
 *
 * A store is only deactivated when it holds no stock, has no open inventory document, no POS
 * device and no active sale/store setting points at it — otherwise it is reported and skipped.
 * Every step is idempotent, so the script can be re-run.
 *
 * Dry run (default, changes nothing):  node dist/scripts/cleanup-cafe-warehouses.js
 * Apply:                               node dist/scripts/cleanup-cafe-warehouses.js --apply [--user <users.user_id>]
 */
import { Prisma, PrismaClient } from '@prisma/client';
import type { JwtUser } from '../common/types/jwt-user';

const APPLY = process.argv.includes('--apply');
const userArg = process.argv.indexOf('--user');
const USER_ID = userArg > 0 ? Number(process.argv[userArg + 1]) : null;

const CODES = {
  barTanta: 'LEG-WH-3',
  barSharqi: 'LEG-WH-4',
  storeShebin: 'LEG-STORAGE-1',
  storeTanta: 'LEG-STORAGE-4',
  storeBahr: 'LEG-STORAGE-5',
  e2e: 'E2E-CAFE-WH',
} as const;
const STORE_KEY = { category: 'stock', setting_key: 'store_warehouse_id' } as const;
const SALE_KEY = { category: 'stock', setting_key: 'sale_warehouse_id' } as const;
const TANTA_STORE_NAME = 'مخزن طنطا';
const OLD_TANTA_STORE_NAME = 'مخزن طنطا (قديم)';

/** Arabic name compare that ignores ى/ي, ة/ه, أ/إ/آ and spacing (catches «البر الشرقى»). */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, '')
    .trim();
}

type Warehouse = { id: number; warehouse_code: string; name_ar: string; branch_id: number; status: string };

const log = (line: string) => console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${line}`);

/** Run from the app folder: read its .env (DATABASE_URL) like the app does. */
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });
  } catch {
    // dotenv missing: the check below explains what to do.
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set: run this from the app folder (where .env is).');
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const findByCode = (code: string) => prisma.inv_warehouses.findFirst({
    where: { warehouse_code: code, is_deleted: false },
    select: { id: true, warehouse_code: true, name_ar: true, branch_id: true, status: true },
  }) as Promise<Warehouse | null>;

  const barTanta = await findByCode(CODES.barTanta);
  const barSharqi = await findByCode(CODES.barSharqi);
  if (!barTanta || !barSharqi) throw new Error(`Missing ${CODES.barTanta} or ${CODES.barSharqi}; nothing done.`);

  // The duplicate bar was created by hand, so find it by name, not by code.
  const candidates = await prisma.inv_warehouses.findMany({
    where: { branch_id: barSharqi.branch_id, is_deleted: false, id: { not: barSharqi.id } },
    select: { id: true, warehouse_code: true, name_ar: true, branch_id: true, status: true },
  }) as Warehouse[];
  const duplicates = candidates.filter((w) => normalizeName(w.name_ar) === normalizeName(barSharqi.name_ar));
  log(`duplicates of «${barSharqi.name_ar}» (#${barSharqi.id}): ${duplicates.map((w) => `#${w.id} ${w.warehouse_code}`).join(', ') || 'none'}`);

  // ── 1. Move the duplicate's stock into the real bar ────────────────────────────────────────
  if (duplicates.length) {
    const balances = await prisma.inv_stock_balances.findMany({
      where: { warehouse_id: { in: duplicates.map((w) => w.id) }, current_stock: { not: 0 } },
      select: { warehouse_id: true, product_id: true, current_stock: true, product: { select: { name_ar: true, product_code: true, unit_of_measure: true } } },
    });
    const negative = balances.filter((b) => Number(b.current_stock) < 0);
    if (negative.length) log(`duplicate has ${negative.length} negative balance(s); they stay and block its deactivation`);
    for (const dup of duplicates.filter((w) => w.status === 'active')) {
      const lines = balances.filter((b) => b.warehouse_id === dup.id && Number(b.current_stock) > 0);
      if (!lines.length) continue;
      log(`transfer #${dup.id} → #${barSharqi.id}: ${lines.length} item(s), ${lines.reduce((s, b) => s + Number(b.current_stock), 0)} unit(s)`);
      if (APPLY) await transferWithApp(dup, barSharqi, lines);
    }
  }

  // ── 2. Tanta / up / down are fed by «بار طنطا» ──────────────────────────────────────────────
  const storeTanta = await findByCode(CODES.storeTanta);
  // Production (19 Nov) really uses the legacy stores: مخزن طنطا held 4,070 units. Repointing and
  // renaming a store that holds stock would send Tanta's supplies to the wrong place — refuse.
  if (storeTanta) {
    const held = await prisma.inv_stock_balances.count({ where: { warehouse_id: storeTanta.id, current_stock: { not: 0 } } });
    if (held) throw new Error(`«${storeTanta.name_ar}» (#${storeTanta.id}) holds stock in ${held} item(s): it is a real store here. Nothing changed after step 1.`);
  }
  if (storeTanta) {
    const pointing = await prisma.sales_pos_settings.findMany({
      where: { ...STORE_KEY, is_active: true, setting_value: { in: [String(storeTanta.id), `"${storeTanta.id}"`] } },
      select: { id: true, branch_id: true },
    });
    log(`store setting → #${barTanta.id} for branches: ${pointing.map((p) => p.branch_id).join(', ') || 'none (already done)'}`);
    if (APPLY && pointing.length) {
      await prisma.sales_pos_settings.updateMany({
        where: { id: { in: pointing.map((p) => p.id) } },
        data: { setting_value: String(barTanta.id), ...(USER_ID ? { updated_by: USER_ID } : {}) },
      });
    }
  }

  // ── 3. Names ───────────────────────────────────────────────────────────────────────────────
  if (storeTanta && storeTanta.name_ar !== OLD_TANTA_STORE_NAME) {
    log(`rename #${storeTanta.id} «${storeTanta.name_ar}» → «${OLD_TANTA_STORE_NAME}»`);
    if (APPLY) await prisma.inv_warehouses.update({ where: { id: storeTanta.id }, data: { name_ar: OLD_TANTA_STORE_NAME } });
  }
  if (barTanta.name_ar !== TANTA_STORE_NAME) {
    log(`rename #${barTanta.id} «${barTanta.name_ar}» → «${TANTA_STORE_NAME}»`);
    if (APPLY) await prisma.inv_warehouses.update({ where: { id: barTanta.id }, data: { name_ar: TANTA_STORE_NAME } });
  }

  // ── 4. Deactivate what the old system never used ───────────────────────────────────────────
  const toClose = [
    await findByCode(CODES.storeShebin),
    storeTanta,
    await findByCode(CODES.storeBahr),
    await findByCode(CODES.e2e),
    ...duplicates,
  ].filter((w): w is Warehouse => !!w);
  for (const w of toClose) {
    const fresh = await prisma.inv_warehouses.findUnique({ where: { id: w.id }, select: { status: true, name_ar: true } });
    if (fresh) w.name_ar = fresh.name_ar;
    if (fresh?.status !== 'active') {
      log(`#${w.id} «${w.name_ar}» already inactive`);
      continue;
    }
    const blockers = await blockersFor(prisma, w.id, w.warehouse_code === CODES.e2e);
    if (blockers.length) {
      log(`KEEP #${w.id} «${w.name_ar}»: ${blockers.join('; ')}`);
      continue;
    }
    log(`deactivate #${w.id} «${w.name_ar}»`);
    if (APPLY) await prisma.inv_warehouses.update({ where: { id: w.id }, data: { status: 'inactive' } });
  }

  const active = await prisma.inv_warehouses.findMany({
    where: { status: 'active', is_deleted: false },
    select: { id: true, name_ar: true },
    orderBy: { id: 'asc' },
  });
  log(`active stores/bars ${APPLY ? 'now' : 'today'}: ${active.length} — ${active.map((w) => `#${w.id} ${w.name_ar}`).join(' | ')}`);
  await prisma.$disconnect();
}

/** Reasons a warehouse must stay active. The E2E test store's leftover test stock does not count. */
async function blockersFor(prisma: PrismaClient, id: number, ignoreStock: boolean): Promise<string[]> {
  const out: string[] = [];
  if (!ignoreStock) {
    const stock = await prisma.inv_stock_balances.count({ where: { warehouse_id: id, current_stock: { not: 0 } } });
    if (stock) out.push(`${stock} item(s) still in stock`);
  }
  const openDocs = await prisma.inv_transactions.count({
    where: { is_deleted: false, status: 'draft', OR: [{ source_warehouse_id: id }, { target_warehouse_id: id }] },
  });
  if (openDocs) out.push(`${openDocs} draft inventory document(s)`);
  const counts = await prisma.inv_count_sessions.count({ where: { warehouse_id: id, status: { notIn: ['approved', 'completed', 'cancelled', 'rejected'] } } });
  if (counts) out.push(`${counts} open stock count(s)`);
  const devices = await prisma.sales_pos_devices.count({ where: { warehouse_id: id, is_active: true } });
  if (devices) out.push(`${devices} active POS device(s)`);
  const settings = await prisma.sales_pos_settings.count({
    where: {
      category: 'stock',
      setting_key: { in: [SALE_KEY.setting_key, STORE_KEY.setting_key] },
      is_active: true,
      setting_value: { in: [String(id), `"${id}"`] },
    },
  });
  if (settings) out.push(`${settings} active sale/store setting(s) point at it`);
  return out;
}

/** An approved transfer through InventoryTransactionsService, exactly like the transfers screen. */
async function transferWithApp(
  from: Warehouse,
  to: Warehouse,
  lines: Array<{ product_id: number; current_stock: Prisma.Decimal; product: { name_ar: string; product_code: string; unit_of_measure: string } }>,
) {
  process.env.DISABLE_SCHEDULED_TASKS = 'true';
  // Loaded only when applying, after the env flag, so no cron starts.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../app.module');
  const { InventoryTransactionsService } = require('../modules/inventory/inventory-transactions.service');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = new PrismaClient();
    const actorId = USER_ID ?? (await prisma.users.findFirst({ where: { level: 1 }, orderBy: { user_id: 'asc' }, select: { user_id: true } }))?.user_id;
    await prisma.$disconnect();
    if (!actorId) throw new Error('No system admin user found; pass --user <users.user_id>.');
    const actor = { sub: actorId, level: 1, branch: 0 } as JwtUser;
    const service = app.get(InventoryTransactionsService);
    const created = await service.create({
      reference: `CLEANUP-DUP-${from.id}`,
      txnType: 'transfer',
      txnDate: new Date().toISOString(),
      sourceWarehouseId: from.id,
      targetWarehouseId: to.id,
      branchId: from.branch_id,
      reason: 'دمج البار المكرر في البار الأصلي',
      notes: `تنظيف قائمة المخازن: «${from.name_ar}» مكرر من «${to.name_ar}»`,
      items: lines.map((line) => ({
        productId: line.product_id,
        itemName: line.product.name_ar,
        itemCode: line.product.product_code,
        unit: line.product.unit_of_measure,
        quantity: Number(line.current_stock),
      })),
    }, actor);
    await service.approve(created.id, actor);
    log(`transfer ${`CLEANUP-DUP-${from.id}`} (#${created.id}) approved`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
