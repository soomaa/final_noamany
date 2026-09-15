/* eslint-disable no-console */
/**
 * Noamany production HR cleanup.
 *
 * Default mode is PREVIEW ONLY. The cleanup:
 *   - removes the fake employee roster and employee-owned HR transactions;
 *   - removes every staff user except `admin` and username `Mahmoud` (full name "محمود");
 *   - removes members, subscriptions, attendance, and their operational history;
 *   - preserves job titles, packages/prices, and every cafe/POS/inventory/procurement row.
 *
 * Preview:
 *   npm run db:prepare:production
 *
 * Execute after taking and verifying a database backup:
 *   PRODUCTION_CLEANUP_ACK=DELETE_HR_KEEP_CAFE \
 *     npm run db:prepare:production -- --confirm-production-cleanup
 *
 * If a kept account cannot be resolved uniquely, use its explicit database id:
 *   --admin-user-id=1 --mahmoud-user-id=42
 */
import { Prisma, PrismaClient } from '@prisma/client';

type SqlClient = PrismaClient | Prisma.TransactionClient;

const prisma = new PrismaClient();
const CONFIRM_FLAG = '--confirm-production-cleanup';
const REQUIRED_ACK = 'DELETE_HR_KEEP_CAFE';

/**
 * Employee-owned business rows only. Structural/reference data such as job titles,
 * departments, leave types, attendance rules, banks, and settings is deliberately absent.
 */
const EMPLOYEE_DATA_TABLES = [
  'tbl_hdoor_emps_history',
  'tbl_hdoor_emps',
  'tbl_emp_hdoor',
  'tbl_hdoor_dawms_emps',
  'hr_emp_dwam_details',
  'hr_emp_dwam',
  'emp_attendance',
  'tbl_emps_hours_edafi',
  'tbl_emps_shef_edafi',
  'hr_emp_agazat_dayes',
  'hr_all_agzat_attaches',
  'hr_all_agzat_history',
  'hr_all_agzat_orders',
  'hr_all_ozonat_attaches',
  'hr_all_ozonat_history',
  'hr_all_ozonat_tamayoz',
  'hr_all_ozonat_orders',
  'hr_mandate_orders_history',
  'hr_mandate_orders',
  'hr_solaf_files_ta3gel',
  'hr_solaf_files',
  'hr_solaf_ta3gel',
  'hr_solaf_tagel',
  'hr_solaf_quest',
  'hr_solaf',
  'hr_solaf_emp_hesbat',
  'hr_mosayer_attechment',
  'hr_mosayer_egraat',
  'hr_mosayer_details',
  'hr_mosayer_history',
  'hr_mosayer',
  'hr_mosayer_tamenat_attaches',
  'hr_mosayer_tamenat_egraat',
  'hr_mosayer_tamenat_details',
  'hr_mosayer_tamenat_history',
  'hr_mosayer_tamenat',
  'tbl_zeyada_rateb',
  'hr_lawyeh_files_seens',
  'hr_lawyeh_files',
  'hr_ta3mem_attaches',
  'hr_ta3mem_details',
  'hr_ta3mem',
  'hr_ta3mem_msg_attaches',
  'hr_ta3mem_msg_details',
  'hr_ta3mem_msg',
  'hr_ta3mem_personal_msg_details',
  'hr_ta3mem_personal_msg',
  'hr_enzarat_files',
  'hr_enzarat_history',
  'hr_enzarat',
  'hr_gezaat',
  'hr_mokafat_details',
  'hr_mokafat',
  'hr_talabat_orders',
  'hr_requests',
  'job_request_orders',
  'hr_job_request_details',
  'hr_job_request',
  'hr_ta3en_moaqt_evaluation_details',
  'hr_ta3en_moaqt_evaluation_points',
  'hr_ta3en_moaqt_evaluation',
  'emp_custody',
  'tbl_takrer_yawmi_details',
  'tbl_takrer_yawmi_bnod',
  'tbl_takrer_yawmi',
  'hr_dialy_reports',
  'hr_ansheta_files',
  'hr_ansheta',
  'hr_mobadrat',
  'hr_mosalat_mokalfat',
  'hr_mosalat',
  'tbl_emp_zeyarat',
  'tbl_mohmat_3mal',
  'hr_locations_visits',
  'hr_entdab_history',
  'hr_entdab',
  'hr_disclaimers',
  'hr_tayi_qyed',
  'emp_files',
  'hr_finance_employes',
  'bank_employes_details',
  'contract_employe',
  'finance_employes',
  'employees_branches',
  'tbl_employees',
  'employees',
] as const;

const PROTECTED_TABLE_PREFIXES = ['cafe_', 'sales_', 'inv_', 'prc_'] as const;
const PROTECTED_PACKAGE_TABLES = [
  'club_membership_types',
  'club_subscription_types',
  'club_subscription_type_branches',
  'club_subscription_type_classes',
  'club_locker_subscription_types',
] as const;

/** Tables containing member/subscription rows only; catalog/package tables are never included. */
const MEMBER_DATA_TABLES = [
  'am_member_notifications',
  'club_attendance',
  'club_subscription_waivers',
  'club_subscription_refunds',
  'club_subscription_freezes',
  'club_subscription_transfers',
  'club_class_enrollments',
  'club_class_waitlist',
  'club_member_progress',
  'club_physical_assessments',
  'club_inbody_measurements',
  'club_member_group_members',
  'club_subscriptions',
  'club_members',
] as const;

interface PublicUserRow {
  user_id: number;
  username: string | null;
  name: string | null;
  level: number | null;
  emp_code: number | null;
}

function normalizeArabicName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s\u00A0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim()
    .toLowerCase();
}

function flagId(name: string): number | null {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid --${name}; expected a positive integer`);
  }
  return id;
}

function resolveKeptUsers(users: PublicUserRow[]) {
  const adminOverride = flagId('admin-user-id');
  const mahmoudOverride = flagId('mahmoud-user-id');
  const adminCandidates = adminOverride
    ? users.filter((user) => user.user_id === adminOverride)
    : users.filter((user) => user.username?.trim().toLowerCase() === 'admin');
  const mahmoudName = normalizeArabicName('محمود');
  const mahmoudCandidates = mahmoudOverride
    ? users.filter((user) => user.user_id === mahmoudOverride)
    : users.filter(
        (user) =>
          user.username?.trim().toLowerCase() === 'mahmoud' &&
          normalizeArabicName(user.name) === mahmoudName,
      );

  const errors: string[] = [];
  if (adminCandidates.length !== 1) {
    errors.push(`Expected exactly one admin account; found ${adminCandidates.length}`);
  }
  if (mahmoudCandidates.length !== 1) {
    errors.push(
      `Expected exactly one account with username Mahmoud and full name محمود; found ${mahmoudCandidates.length}`,
    );
  }

  const keepIds = [...new Set([...adminCandidates, ...mahmoudCandidates].map((user) => user.user_id))];
  if (keepIds.length !== 2 && errors.length === 0) {
    errors.push('Admin and Mahmoud must be two different accounts');
  }

  return { adminCandidates, mahmoudCandidates, keepIds, errors };
}

async function databaseTableNames(client: SqlClient): Promise<string[]> {
  const rows = await client.$queryRaw<Array<{ tableName: string }>>(Prisma.sql`
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((row) => row.tableName);
}

async function tableCount(client: SqlClient, table: string): Promise<number> {
  const escaped = table.replace(/`/g, '``');
  const rows = await client.$queryRawUnsafe<Array<{ total: bigint | number }>>(
    `SELECT COUNT(*) AS total FROM \`${escaped}\``,
  );
  return Number(rows[0]?.total ?? 0);
}

async function tableCounts(client: SqlClient, tables: readonly string[]) {
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = await tableCount(client, table);
  return result;
}

async function cafeTableCounts(client: SqlClient, allTables?: string[]) {
  const names = allTables ?? (await databaseTableNames(client));
  const protectedNames = names.filter((table) =>
    PROTECTED_TABLE_PREFIXES.some((prefix) => table.startsWith(prefix)),
  );
  return tableCounts(client, protectedNames);
}

async function jobTitleSnapshot(client: SqlClient) {
  return client.department_jobs.findMany({
    select: {
      id: true,
      name: true,
      from_id_fk: true,
      status: true,
      in_order: true,
      dep_code: true,
      edara_id: true,
      is_trainer: true,
    },
    orderBy: { id: 'asc' },
  });
}

async function packageSnapshot(client: SqlClient) {
  return {
    membershipTypes: await client.club_membership_types.findMany({ orderBy: { id: 'asc' } }),
    subscriptionTypes: await client.club_subscription_types.findMany({ orderBy: { id: 'asc' } }),
    subscriptionBranches: await client.club_subscription_type_branches.findMany({
      orderBy: { id: 'asc' },
    }),
    subscriptionClasses: await client.club_subscription_type_classes.findMany({
      orderBy: [{ subscription_type_id: 'asc' }, { class_type_id: 'asc' }],
    }),
    lockerTypes: await client.club_locker_subscription_types.findMany({ orderBy: { id: 'asc' } }),
  };
}

function sameSnapshot(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function buildPreview(client: PrismaClient) {
  const [users, allTables, employees, jobTitles, packages, members, subscriptions] = await Promise.all([
    client.users.findMany({
      select: { user_id: true, username: true, name: true, level: true, emp_code: true },
      orderBy: { user_id: 'asc' },
    }),
    databaseTableNames(client),
    client.employees.count(),
    jobTitleSnapshot(client),
    packageSnapshot(client),
    client.club_members.count(),
    client.club_subscriptions.count(),
  ]);
  const resolution = resolveKeptUsers(users);
  const existingEmployeeTables = EMPLOYEE_DATA_TABLES.filter((table) => allTables.includes(table));
  const [employeeRows, protectedCafeCounts] = await Promise.all([
    tableCounts(client, existingEmployeeTables),
    cafeTableCounts(client, allTables),
  ]);

  return {
    mode: 'preview',
    employees,
    members,
    subscriptions,
    users: users.length,
    jobTitles: jobTitles.length,
    protectedPackageRows: Object.fromEntries(
      Object.entries(packages).map(([name, rows]) => [name, rows.length]),
    ),
    keep: {
      adminCandidates: resolution.adminCandidates,
      mahmoudCandidates: resolution.mahmoudCandidates,
    },
    removeUsers: users.filter((user) => !resolution.keepIds.includes(user.user_id)),
    employeeRows,
    protectedCafeCounts,
    blockedReasons: resolution.errors,
  };
}

async function executeCleanup(client: PrismaClient) {
  const users = await client.users.findMany({
    select: { user_id: true, username: true, name: true, level: true, emp_code: true },
    orderBy: { user_id: 'asc' },
  });
  const resolution = resolveKeptUsers(users);
  if (resolution.errors.length) {
    throw new Error(resolution.errors.join('; '));
  }

  const targetViolation = EMPLOYEE_DATA_TABLES.find((table) =>
    PROTECTED_TABLE_PREFIXES.some((prefix) => table.startsWith(prefix)),
  );
  if (targetViolation) {
    throw new Error(`Safety violation: protected cafe table ${targetViolation} is in the cleanup list`);
  }
  const packageViolation = MEMBER_DATA_TABLES.find((table) =>
    PROTECTED_PACKAGE_TABLES.includes(table as (typeof PROTECTED_PACKAGE_TABLES)[number]),
  );
  if (packageViolation) {
    throw new Error(`Safety violation: package/price table ${packageViolation} is in the cleanup list`);
  }

  const allTables = await databaseTableNames(client);
  const existingEmployeeTables = EMPLOYEE_DATA_TABLES.filter((table) => allTables.includes(table));
  const removeUserIds = users
    .filter((user) => !resolution.keepIds.includes(user.user_id))
    .map((user) => user.user_id);
  const jobTitlesBefore = await jobTitleSnapshot(client);
  const packagesBefore = await packageSnapshot(client);
  const cafeBefore = await cafeTableCounts(client, allTables);

  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    try {
      const memberAppUsers = await tx.club_members.findMany({
        where: { app_user_id: { not: null } },
        select: { app_user_id: true },
      });
      const memberAppUserIds = memberAppUsers
        .map((row) => row.app_user_id)
        .filter((id): id is number => id !== null);

      // Remove only member-linked/club-subscription operations. Guest bookings and all
      // package, price, cafe, POS, stock and procurement catalogs/transactions stay intact.
      await tx.$executeRawUnsafe(`
        DELETE c FROM club_event_checkins c
        INNER JOIN club_event_registrations r ON r.id = c.registration_id
        WHERE r.member_id IS NOT NULL
      `);
      await tx.$executeRawUnsafe(`
        DELETE p FROM club_event_payments p
        INNER JOIN club_event_registrations r ON r.id = p.registration_id
        WHERE r.member_id IS NOT NULL
      `);
      await tx.$executeRawUnsafe('DELETE FROM club_event_registrations WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe(
        'UPDATE club_event_registrations SET converted_member_id = NULL WHERE converted_member_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM staff_tasks WHERE member_id IS NOT NULL OR subscription_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM club_receipts WHERE member_id IS NOT NULL OR subscription_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM club_spa_invoices WHERE member_id IS NOT NULL OR subscription_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM club_inbody_invoices WHERE member_id IS NOT NULL OR subscription_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe('DELETE FROM club_spa_bookings WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe('DELETE FROM club_hall_bookings WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe('DELETE FROM club_trainer_ratings WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe('DELETE FROM club_survey_responses WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe('DELETE FROM club_workout_programs WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe(
        'UPDATE club_lockers l INNER JOIN club_locker_subscriptions s ON s.locker_id = l.id SET l.is_available = 1 WHERE s.member_id IS NOT NULL',
      );
      await tx.$executeRawUnsafe('DELETE FROM club_locker_subscriptions WHERE member_id IS NOT NULL');
      await tx.$executeRawUnsafe(
        'UPDATE am_invitations SET inviter_member_id = NULL WHERE inviter_member_id IS NOT NULL',
      );
      for (const table of MEMBER_DATA_TABLES) {
        if (allTables.includes(table)) {
          await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
        }
      }
      await tx.club_member_groups.updateMany({ data: { current_members: 0 } });
      await tx.$executeRawUnsafe(`
        UPDATE club_surveys s
        SET s.responses_count = (
          SELECT COUNT(*) FROM club_survey_responses r WHERE r.survey_id = s.id
        )
      `);
      await tx.$executeRawUnsafe(`
        UPDATE club_trainers t
        SET t.rating_avg = COALESCE((
          SELECT AVG(r.rating) FROM club_trainer_ratings r WHERE r.trainer_id = t.id
        ), 0)
      `);
      // Remove demo subscription ledger rows only; source_module='sales' (cafe/POS) is untouched.
      await tx.$executeRawUnsafe(`
        DELETE l FROM acc_journal_entry_lines l
        INNER JOIN acc_journal_entries e ON e.id = l.entry_id
        WHERE e.source_module = 'club'
      `);
      await tx.$executeRawUnsafe("DELETE FROM acc_journal_entries WHERE source_module = 'club'");

      for (const table of existingEmployeeTables) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${table.replace(/`/g, '``')}\``);
      }

      if (removeUserIds.length) {
        await tx.permissions.deleteMany({ where: { user_id: { in: removeUserIds } } });
        await tx.rbac_user_exceptions.deleteMany({ where: { user_id: { in: removeUserIds } } });
        await tx.rbac_user_roles.deleteMany({ where: { user_id: { in: removeUserIds } } });
        await tx.users.deleteMany({ where: { user_id: { in: removeUserIds } } });
      }

      // The employee roster is intentionally empty, so retained login accounts must
      // not keep a dangling users.emp_code pointer.
      await tx.users.updateMany({
        where: { user_id: { in: resolution.keepIds } },
        data: { emp_code: null },
      });
      if (memberAppUserIds.length) {
        await tx.api_users.deleteMany({ where: { user_id: { in: memberAppUserIds } } });
      }

      const [
        employeeCount,
        memberCount,
        subscriptionCount,
        remainingUsers,
        jobTitlesAfter,
        packagesAfter,
        cafeAfter,
      ] = await Promise.all([
        tx.employees.count(),
        tx.club_members.count(),
        tx.club_subscriptions.count(),
        tx.users.findMany({ select: { user_id: true }, orderBy: { user_id: 'asc' } }),
        jobTitleSnapshot(tx),
        packageSnapshot(tx),
        cafeTableCounts(tx, allTables),
      ]);

      if (employeeCount !== 0) {
        throw new Error(`Safety check failed: ${employeeCount} employee rows remain`);
      }
      if (memberCount !== 0 || subscriptionCount !== 0) {
        throw new Error(
          `Safety check failed: ${memberCount} members and ${subscriptionCount} subscriptions remain`,
        );
      }
      if (!sameSnapshot(remainingUsers.map((user) => user.user_id), [...resolution.keepIds].sort((a, b) => a - b))) {
        throw new Error('Safety check failed: remaining user accounts do not match the approved keep list');
      }
      if (!sameSnapshot(jobTitlesAfter, jobTitlesBefore)) {
        throw new Error('Safety check failed: job titles changed');
      }
      if (!sameSnapshot(packagesAfter, packagesBefore)) {
        throw new Error('Safety check failed: packages or prices changed');
      }
      if (!sameSnapshot(cafeAfter, cafeBefore)) {
        throw new Error('Safety check failed: cafe/POS/inventory/procurement row counts changed');
      }
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  }, { maxWait: 10_000, timeout: 120_000 });

  return {
    employees: await client.employees.count(),
    members: await client.club_members.count(),
    subscriptions: await client.club_subscriptions.count(),
    users: await client.users.findMany({
      select: { user_id: true, username: true, name: true, level: true, emp_code: true },
      orderBy: { user_id: 'asc' },
    }),
    jobTitles: (await jobTitleSnapshot(client)).length,
    protectedPackageRows: Object.fromEntries(
      Object.entries(await packageSnapshot(client)).map(([name, rows]) => [name, rows.length]),
    ),
    protectedCafeCounts: await cafeTableCounts(client, allTables),
  };
}

async function main() {
  const preview = await buildPreview(prisma);
  console.log(JSON.stringify(preview, null, 2));

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.log('\nPREVIEW ONLY — no data was changed.');
    console.log(`After a verified backup, re-run with ${CONFIRM_FLAG} and PRODUCTION_CLEANUP_ACK=${REQUIRED_ACK}.`);
    return;
  }
  if (process.env.PRODUCTION_CLEANUP_ACK !== REQUIRED_ACK) {
    throw new Error(`Refusing cleanup: set PRODUCTION_CLEANUP_ACK=${REQUIRED_ACK}`);
  }
  if (preview.blockedReasons.length) {
    throw new Error(`Refusing cleanup: ${preview.blockedReasons.join('; ')}`);
  }

  console.log(
    '\nConfirmed: deleting demo employees/users/members/subscriptions. Cafe data and packages/prices are protected...',
  );
  const result = await executeCleanup(prisma);
  console.log(JSON.stringify({ mode: 'completed', ...result }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export {
  EMPLOYEE_DATA_TABLES,
  MEMBER_DATA_TABLES,
  PROTECTED_PACKAGE_TABLES,
  PROTECTED_TABLE_PREFIXES,
  buildPreview,
  executeCleanup,
  normalizeArabicName,
  resolveKeptUsers,
};
