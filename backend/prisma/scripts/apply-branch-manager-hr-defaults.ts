/* eslint-disable no-console */
/**
 * One-off: give EXISTING branch-manager job-title roles (مدير/مديرة فرع, مشرف إدارة حريمي/رجالي)
 * the HR cells added on 24 Nov 2026 (leaves / permissions / requests view+approve+reject, extra
 * hours, daily reports, attendance exceptions). Only missing cells are added; custom grants and
 * explicit Denies stay as they are. Safe to re-run (e.g. after the attendance.exceptions resource
 * exists). Restart the API afterwards so cached permissions refresh.
 *
 * Usage: npm run db:apply:branch-manager-hr-defaults
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { applyBranchManagerHrDefaults } from '../../src/modules/rbac/job-title-role.util';

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await applyBranchManagerHrDefaults(prisma);
    console.log(`branch-manager roles: ${result.roles.map((r) => `${r.id} ${r.name}`).join(', ') || '(none)'}`);
    console.log(`cells added: ${result.added}`);
    if (result.missingResources.length) {
      console.log(`not in rbac_resources yet (skipped, re-run later): ${result.missingResources.join(', ')}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
