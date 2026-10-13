/**
 * seed-e2e.ts - Idempotent E2E test-data seeder.
 *
 * Usage:
 *   npx ts-node -P tsconfig.json prisma/seed-e2e.ts
 *
 * Guarantees:
 *  - Safe to run multiple times (upsert / find-or-create, never drops data).
 *  - Never touches production rows -- all test users have the prefix "e2e_".
 *  - Does NOT run migrations; assumes schema is already up-to-date.
 *  - Discovers real branch IDs dynamically -- no hardcoded IDs 1 or 2.
 *  - Writes test/e2e-config.json so the spec can read the chosen branch IDs.
 *
 * Test accounts created (password: Test@1234 for all):
 *  e2e_hr_manager        -> role: hr_manager,       branchA, level: 5
 *  e2e_branch_mgr_b1     -> role: branch_manager,   branchA, level: 5
 *  e2e_branch_mgr_b2     -> role: branch_manager,   branchB, level: 5
 *  e2e_employee          -> role: employee,          branchA, level: 5
 *
 * Why $executeRaw for INSERT:
 *  Prisma 5 silently strips @id @default(autoincrement()) fields from INSERT
 *  statements even when you pass them explicitly in create(). The real MySQL
 *  table lacks AUTO_INCREMENT on user_id (schema drift), so Prisma's omission
 *  causes a P2011 null-constraint error. $executeRaw bypasses this entirely.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const db = new PrismaClient();

const PASSWORD = 'Test@1234';
const BCRYPT_ROUNDS = 10;

interface TestAccount {
  username: string;
  name: string;
  roleKey: string;
  branchSlot: 'A' | 'B';
  level: number;
}

const ACCOUNT_TEMPLATES: TestAccount[] = [
  { username: 'e2e_hr_manager',    name: 'E2E HR Manager',        roleKey: 'hr_manager',     branchSlot: 'A', level: 5 },
  { username: 'e2e_branch_mgr_b1', name: 'E2E Branch Manager B1', roleKey: 'branch_manager', branchSlot: 'A', level: 5 },
  { username: 'e2e_branch_mgr_b2', name: 'E2E Branch Manager B2', roleKey: 'branch_manager', branchSlot: 'B', level: 5 },
  { username: 'e2e_employee',       name: 'E2E Employee',          roleKey: 'employee',        branchSlot: 'A', level: 5 },
];

async function main() {
  console.log('Seed-e2e starting...');

  const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  // 1. Discover real branches
  const allBranches = await db.tbl_branches.findMany({
    orderBy: { branch_id: 'asc' },
    select: { branch_id: true, branch_name: true },
  });

  if (allBranches.length < 2) {
    throw new Error(
      `Need at least 2 branches in tbl_branches, found ${allBranches.length}. ` +
      'Please ensure at least two branches exist before running the E2E seed.',
    );
  }

  const branchA = allBranches[0];
  const branchB = allBranches[1];

  console.log(`  [OK] Branch A: id=${branchA.branch_id} name="${branchA.branch_name}"`);
  console.log(`  [OK] Branch B: id=${branchB.branch_id} name="${branchB.branch_name}"`);

  // Write config file so the E2E spec can read the chosen IDs
  const configPath = path.join(process.cwd(), 'test', 'e2e-config.json');
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(
    configPath,
    JSON.stringify({ branchA: branchA.branch_id, branchB: branchB.branch_id }, null, 2),
  );
  console.log(`  [OK] Wrote test/e2e-config.json (branchA=${branchA.branch_id}, branchB=${branchB.branch_id})`);

  // 2. Verify roles exist
  const roleKeys = [...new Set(ACCOUNT_TEMPLATES.map((a) => a.roleKey))];
  const roles = await db.rbac_roles.findMany({
    where: { key: { in: roleKeys } },
    select: { id: true, key: true },
  });
  const roleMap = Object.fromEntries(roles.map((r) => [r.key, r.id]));

  for (const key of roleKeys) {
    if (!roleMap[key]) {
      throw new Error(
        `Role "${key}" not found in rbac_roles. Run "npx ts-node prisma/seed-rbac.ts" first.`,
      );
    }
  }
  console.log('  [OK] Roles confirmed:', roleKeys.join(', '));

  // 3. Resolve accounts with real branch IDs
  const ACCOUNTS = ACCOUNT_TEMPLATES.map((acc) => ({
    ...acc,
    branchId: acc.branchSlot === 'A' ? branchA.branch_id : branchB.branch_id,
  }));

  // 4. Get current max user_id via raw SQL for manual ID assignment
  // The real MySQL users table lacks AUTO_INCREMENT on user_id (schema drift).
  // Prisma 5 strips @id @default(autoincrement()) from create() data even when
  // explicitly passed, so we use $executeRaw for INSERT to bypass this.
  const maxRows = await db.$queryRaw<Array<{ max_id: number | null }>>`
    SELECT MAX(user_id) AS max_id FROM users
  `;
  let nextId: number = (Number(maxRows[0]?.max_id) || 0) + 1;
  console.log(`  [OK] Next user_id to use: ${nextId}`);

  // 5. Upsert test users
  for (const acc of ACCOUNTS) {
    const existing = await db.users.findFirst({
      where: { username: acc.username },
      select: { user_id: true },
    });

    let userId: number;

    if (existing) {
      // Update password, approved, AND branch so reruns are fully idempotent
      await db.users.update({
        where: { user_id: existing.user_id },
        data: {
          password: hash,
          approved: 1,
          branch_id_fk: acc.branchId,
          x_y_z: null,
          app_pass: null,
          pass_demo: null,
          user_pass: null,
        },
      });
      userId = existing.user_id;
      console.log(`  [~] Updated: ${acc.username} (id=${userId}, branch=${acc.branchId})`);
    } else {
      // Raw INSERT with explicit user_id -- bypasses Prisma's autoincrement stripping
      const newId = nextId++;
      const uname = acc.username;
      const uname_display = acc.name;
      const ubranch = acc.branchId;
      const ulevel = acc.level;
      await db.$executeRaw`
        INSERT INTO users
          (user_id, username, name, password, approved, level, branch_id_fk, device_token)
        VALUES
          (${newId}, ${uname}, ${uname_display}, ${hash}, 1, ${ulevel}, ${ubranch}, '')
      `;
      userId = newId;
      console.log(`  [+] Created: ${acc.username} (id=${userId}, branch=${acc.branchId})`);
    }

    // 6. Upsert role assignment
    const roleId = roleMap[acc.roleKey];
    const existingRole = await db.rbac_user_roles.findFirst({
      where: { user_id: userId, role_id: roleId },
    });
    if (!existingRole) {
      await db.rbac_user_roles.create({ data: { user_id: userId, role_id: roleId } });
      console.log(`       [+] Assigned role "${acc.roleKey}" to ${acc.username}`);
    } else {
      console.log(`       [OK] Role "${acc.roleKey}" already assigned to ${acc.username}`);
    }
  }

  // 7. Report
  console.log('\nE2E seed complete. Test accounts:');
  console.log('  Username              Role             Branch  Password');
  console.log('  -------------------------------------------------------');
  for (const acc of ACCOUNTS) {
    console.log(
      `  ${acc.username.padEnd(22)}${acc.roleKey.padEnd(17)}${String(acc.branchId).padEnd(8)}${PASSWORD}`,
    );
  }
  console.log('\n  Run "npx ts-node prisma/seed-e2e.ts" again any time to reset passwords.');
}

main()
  .catch((e) => {
    console.error('[FAIL] Seed failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
