/**
 * Backfill mobile-app accounts for EXISTING gym members.
 *
 * New members created through the web ("Create app account" on) are provisioned
 * automatically. Members that were imported/created before that flow existed have
 * no api_users row and therefore CANNOT log into the mobile app. This script links
 * them: for each eligible club_member it creates (or reuses) an api_users row with
 * the default password 000000 and sets club_members.app_user_id.
 *
 * SAFE BY DEFAULT: runs as a DRY RUN and only prints what it would do.
 * To actually write, pass --commit.
 *
 * Scope (default): active, non-deleted members that have a phone and are not yet linked.
 * Add --all to include inactive members too.
 *
 * Run (dry run):  npx ts-node -r tsconfig-paths/register prisma/scripts/provision-member-app-accounts.ts
 * Run (commit):   npx ts-node -r tsconfig-paths/register prisma/scripts/provision-member-app-accounts.ts --commit
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { MEMBER_DEFAULT_PASSWORD } from '../../src/common/constants/member-auth.constants';
import { normalizePhoneForStorage } from '../../src/modules/club-members/club-member.utils';

async function main() {
  const commit = process.argv.includes('--commit');
  const includeInactive = process.argv.includes('--all');
  const prisma = new PrismaClient();

  const members = await prisma.club_members.findMany({
    where: {
      is_deleted: false,
      app_user_id: null,
      ...(includeInactive ? {} : { is_active: true }),
    },
    select: { id: true, name: true, phone: true, email: true },
  });

  // Pre-hash once — every account shares the same default password.
  const defaultHash = await bcrypt.hash(MEMBER_DEFAULT_PASSWORD, 12);

  let created = 0;
  let reused = 0;
  let skippedNoPhone = 0;
  let skippedTaken = 0;

  for (const m of members) {
    const phone = normalizePhoneForStorage(m.phone ?? '');
    if (!phone) {
      skippedNoPhone++;
      continue;
    }

    const existing = await prisma.api_users.findFirst({ where: { user_phone: phone } });
    if (existing) {
      // Is this app account already tied to a different member?
      const other = await prisma.club_members.findFirst({
        where: { app_user_id: existing.user_id, is_deleted: false },
        select: { id: true },
      });
      if (other && other.id !== m.id) {
        skippedTaken++;
        continue;
      }
      if (commit) {
        await prisma.club_members.update({ where: { id: m.id }, data: { app_user_id: existing.user_id } });
      }
      reused++;
      continue;
    }

    if (commit) {
      const appUser = await prisma.api_users.create({
        data: {
          user_name: m.name,
          user_phone: phone,
          user_email: m.email?.trim() || null,
          user_pass: defaultHash,
          status: 1,
        },
        select: { user_id: true },
      });
      await prisma.club_members.update({ where: { id: m.id }, data: { app_user_id: appUser.user_id } });
    }
    created++;
  }

  console.log(commit ? '=== COMMITTED ===' : '=== DRY RUN (no changes written; pass --commit to apply) ===');
  console.log(`Eligible members scanned: ${members.length}`);
  console.log(`  Would create new app account : ${created}`);
  console.log(`  Would link existing account  : ${reused}`);
  console.log(`  Skipped (no phone)           : ${skippedNoPhone}`);
  console.log(`  Skipped (phone taken by other member): ${skippedTaken}`);
  console.log(`Default password for all: ${MEMBER_DEFAULT_PASSWORD}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
