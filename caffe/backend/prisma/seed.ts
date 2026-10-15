/* eslint-disable no-console */
/**
 * Ordera cafe seed orchestrator.
 *
 * Order: foundation → RBAC → gym-sales inventory base → POS → accounting → cafe products
 * (HR / club seeds intentionally omitted.)
 *
 * Full reset + seed:   npm run db:reseed
 * Re-seed:             npm run db:seed
 */
import { prisma } from './seed/_shared';
import { seedFoundation } from './seed/00-foundation';
import { seedRbac } from './seed-rbac';
import { seedGymSales } from './seed/30-gymsales';
import { seedPosAdmin } from './seed/35-pos-admin';
import { seedAccountingApp } from './seed/40-accounting-app';
import { seedCafe } from './seed/50-cafe';
import { seedReferenceCatalogs } from './seed/05-reference-catalogs';

async function seedRbacExtras() {
  console.log('▶ RBAC extras (cafe)…');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_role_scopes`');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_user_exceptions`');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');

  const roleByKey = new Map(
    (await prisma.rbac_roles.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );
  const resByKey = new Map(
    (await prisma.rbac_resources.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );

  const bm = roleByKey.get('branch_manager');
  if (bm) {
    for (const res of ['gym-sales', 'accounting']) {
      const resource_id = resByKey.get(res);
      if (!resource_id) continue;
      await prisma.rbac_role_scopes
        .create({ data: { role_id: bm, resource_id, scope: 'branch' as any } })
        .catch(() => undefined);
    }
  }
  console.log('✔ RBAC extras done');
}

async function main() {
  const t0 = Date.now();
  console.log('=== Ordera cafe seed ===');

  await seedFoundation();

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_user_roles`');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
  await seedRbac();
  await seedRbacExtras();

  await seedGymSales();
  await seedPosAdmin();
  await seedAccountingApp();
  await seedCafe();
  await seedReferenceCatalogs();

  // Keep cafe demo catalog by default (unlike main app which clears it).
  const clearDemo = process.env.ORDERA_CLEAR_CAFE_DEMO === '1';
  if (clearDemo) {
    const { clearFakeFitnessCafeData } = await import('./scripts/clear-fake-fitness-cafe-data');
    await clearFakeFitnessCafeData(prisma);
    console.log('⚠ Cleared cafe demo data (ORDERA_CLEAR_CAFE_DEMO=1)');
  } else {
    console.log('✔ Cafe demo products kept (set ORDERA_CLEAR_CAFE_DEMO=1 to clear)');
  }

  console.log(`=== Ordera seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
