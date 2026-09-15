/* eslint-disable no-console */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

type NameRow = { table_name: string };
type DatabaseRow = { database_name: string };
type CountRow = { n: bigint | number; total?: bigint | number | null };
type IdRow = { id: number };
type ReconciliationRow = {
  source_table: string;
  target_table: string;
  source_rows: bigint | number;
  mapped_rows: bigint | number;
  archived_rows: bigint | number;
  error_rows: bigint | number;
  notes: string | null;
};
type MappingSummaryRow = {
  source_table: string;
  target_tables: string;
  mapped_rows: bigint | number;
};

const prisma = new PrismaClient();
const EXPECTED_SHA =
  "944504425ff3d955d68bb7eb2c140e1394ebd38de507bde3730263c9dd51e8b0";
const EXPECTED_TABLES = 248;
const EXPECTED_ROWS = 884_601;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function safe(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value))
    throw new Error(`Unsafe database identifier: ${value}`);
  return value;
}
function q(value: string): string {
  return `\`${value}\``;
}
function lit(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}
async function query<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}
async function scalar(sql: string): Promise<number> {
  const result = await query<CountRow>(sql);
  return Number(result[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const source = safe(required("LEGACY_DATABASE"));
  const key = required("LEGACY_SOURCE_KEY");
  const sha = required("LEGACY_DUMP_SHA256").toLowerCase();
  // CAST() expressions inherit the connection collation. Normalize it before
  // comparing identifiers across the legacy and rebuilt databases.
  await prisma.$executeRawUnsafe(
    "SET collation_connection='utf8mb4_unicode_ci'",
  );
  await prisma.$executeRawUnsafe("SET time_zone='+00:00'");
  if (sha !== EXPECTED_SHA) throw new Error(`Unexpected dump checksum: ${sha}`);
  const runRows = await query<IdRow>(
    `SELECT id FROM legacy_import_runs WHERE source_key=${lit(key)} AND dump_sha256=${lit(sha)}`,
  );
  if (runRows.length !== 1) throw new Error("Legacy import run is missing");
  const runId = runRows[0].id;
  const errors: string[] = [];

  const sourceTables = await query<NameRow>(
    `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema=${lit(source)} AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  let sourceRows = 0;
  const tableCounts: Record<string, number> = {};
  for (const row of sourceTables) {
    const n = await scalar(
      `SELECT COUNT(*) n FROM ${q(source)}.${q(row.table_name)}`,
    );
    tableCounts[row.table_name] = n;
    sourceRows += n;
  }
  if (sourceTables.length !== EXPECTED_TABLES)
    errors.push(
      `archive tables: expected ${EXPECTED_TABLES}, found ${sourceTables.length}`,
    );
  if (sourceRows !== EXPECTED_ROWS)
    errors.push(`archive rows: expected ${EXPECTED_ROWS}, found ${sourceRows}`);

  // information_schema.table_rows is only an estimate for InnoDB. Count every
  // app table exactly so an empty operational screen cannot hide behind stale
  // metadata after a bulk import.
  const databaseRows = await query<DatabaseRow>(
    "SELECT DATABASE() AS database_name",
  );
  const targetDatabase = databaseRows[0]?.database_name;
  if (!targetDatabase) throw new Error("No target database is selected");
  const targetTables = await query<NameRow>(
    `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema=${lit(targetDatabase)} AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  const targetTableCounts: Record<string, number> = {};
  for (const row of targetTables) {
    targetTableCounts[row.table_name] = await scalar(
      `SELECT COUNT(*) n FROM ${q(targetDatabase)}.${q(row.table_name)}`,
    );
  }
  const emptyTargetTables = targetTables
    .map((row) => row.table_name)
    .filter((table) => targetTableCounts[table] === 0);
  const emptyTargetsWithNonemptySameNameSource = emptyTargetTables
    .filter((table) => (tableCounts[table] ?? 0) > 0)
    .map((table) => ({ table, source_rows: tableCounts[table] }));
  const intentionalEmptyCompatibilityTables = [
    {
      table: "tbl_employees",
      source_rows: tableCounts.tbl_employees,
      canonical_target: "employees",
      mapped_rows: await scalar(
        `SELECT COUNT(*) n FROM legacy_employee_mappings WHERE source_key=${lit(key)}`,
      ),
      reason:
        "The rebuilt app uses employees; tbl_employees is retained only as an unused compatibility model.",
    },
  ].filter((row) => row.source_rows > 0 && targetTableCounts[row.table] === 0);
  const intentionalEmptyNames = new Set(
    intentionalEmptyCompatibilityTables.map((row) => row.table),
  );
  const unresolvedEmptyTargetsWithNonemptySameNameSource =
    emptyTargetsWithNonemptySameNameSource.filter(
      (row) => !intentionalEmptyNames.has(row.table),
    );
  if (unresolvedEmptyTargetsWithNonemptySameNameSource.length > 0) {
    errors.push(
      `unresolved empty app tables with nonempty same-name legacy sources: ${unresolvedEmptyTargetsWithNonemptySameNameSource.map((row) => `${row.table} (${row.source_rows})`).join(", ")}`,
    );
  }

  const paidSubscriptionRows = await scalar(
    `SELECT COUNT(*) n FROM ${q(source)}.tbl_subscription_members WHERE paid>0`,
  );
  const nonzeroExpenseBillRows = await scalar(
    `SELECT COUNT(*) n FROM ${q(source)}.tbl_expense_bills WHERE COALESCE(value,0)<>0`,
  );
  const nonzeroDisbursementRows = await scalar(
    `SELECT COUNT(*) n FROM ${q(source)}.finance_sarf_order WHERE COALESCE(total_value,0)<>0`,
  );
  const canonicalFreezeRows = await scalar(
    `SELECT COUNT(*) n FROM ${q(source)}.tbl_stopped_subscription f JOIN ${q(source)}.tbl_subscription_members s ON s.subs_id=f.subscription_id_fk`,
  );
  const canonicalTransferRows = await scalar(
    `SELECT COUNT(*) n FROM ${q(source)}.tbl_transformation t JOIN ${q(source)}.tbl_subscription_members s ON s.subs_id=t.subscription_id_fk WHERE t.type='subscription'`,
  );
  const legacyCountSessions = await scalar(
    `SELECT COUNT(*) n FROM (
      SELECT TRIM(storage_id_fk),num_invent,invent_date FROM ${q(source)}.store_inventory_table
      GROUP BY TRIM(storage_id_fk),num_invent,invent_date
    ) x`,
  );
  const legacyMediaRows = await scalar(
    `SELECT SUM(n) n FROM (
      SELECT COUNT(*) n FROM ${q(source)}.tbl_members WHERE TRIM(CAST(image AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.tbl_members_imgs WHERE TRIM(CAST(image AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.employees WHERE TRIM(CAST(personal_photo AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.employees WHERE TRIM(CAST(personal_photo_path AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.tbl_employees WHERE TRIM(CAST(personal_photo AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.emp_files WHERE TRIM(CAST(emp_file AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.tbl_inbody WHERE TRIM(CAST(image AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.tbl_inbody WHERE TRIM(CAST(image_path AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.finance_sarf_order WHERE TRIM(CAST(bank_attachment AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.finance_sarf_order WHERE TRIM(CAST(file_downloded AS CHAR)) NOT IN ('','0','no','yes')
      UNION ALL SELECT COUNT(*) FROM ${q(source)}.finance_sarf_order_attachments WHERE TRIM(CAST(attachment AS CHAR)) NOT IN ('','0','no','yes')
    ) x`,
  );

  const checks: Array<{ label: string; actualSql: string; expected: number }> =
    [
      {
        label: "branch mappings",
        actualSql: `SELECT COUNT(*) n FROM legacy_branch_mappings WHERE source_key=${lit(key)}`,
        expected: 5,
      },
      {
        label: "employee mappings",
        actualSql: `SELECT COUNT(*) n FROM legacy_employee_mappings WHERE source_key=${lit(key)}`,
        expected: tableCounts.tbl_employees,
      },
      {
        label: "authoritative HR employee mappings",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='employees' AND target_table='employees'`,
        expected: tableCounts.employees,
      },
      {
        label: "user mappings",
        actualSql: `SELECT COUNT(*) n FROM legacy_user_mappings WHERE source_key=${lit(key)}`,
        expected: tableCounts.users,
      },
      {
        label: "subscription types",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_settings' AND target_table='club_subscription_types'`,
        expected: tableCounts.tbl_subscription_settings,
      },
      {
        label: "members",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_members' AND target_table='club_members'`,
        expected: tableCounts.tbl_members,
      },
      {
        label: "subscriptions",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_members' AND target_table='club_subscriptions'`,
        expected: tableCounts.tbl_subscription_members,
      },
      {
        label: "subscription receipts",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_members' AND target_table='club_receipts'`,
        expected: paidSubscriptionRows,
      },
      {
        label: "subscription receipt payment methods",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_members' AND target_table='club_receipt_payments'`,
        expected: paidSubscriptionRows,
      },
      {
        label: "subscription finance revenues",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_members' AND target_table='fin_revenues'`,
        expected: paidSubscriptionRows,
      },
      {
        label: "subscription accounting journals",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_members' AND target_table='acc_journal_entries'`,
        expected: paidSubscriptionRows,
      },
      {
        label: "subscription freeze history accounted",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_stopped_subscription' AND target_table IN ('club_subscription_freezes','legacy_archive')`,
        expected: tableCounts.tbl_stopped_subscription,
      },
      {
        label: "subscription freezes mapped",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_stopped_subscription' AND target_table='club_subscription_freezes'`,
        expected: canonicalFreezeRows,
      },
      {
        label: "subscription refunds mapped",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_subscription_hadback' AND target_table='club_subscription_refunds'`,
        expected: tableCounts.tbl_subscription_hadback,
      },
      {
        label: "subscription member transfers accounted",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_transformation' AND target_table IN ('club_subscription_transfers','legacy_archive')`,
        expected: tableCounts.tbl_transformation,
      },
      {
        label: "subscription member transfers mapped",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_transformation' AND target_table='club_subscription_transfers'`,
        expected: canonicalTransferRows,
      },
      {
        label: "attendance/service history accounted",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_hdoor_classes'`,
        expected: tableCounts.tbl_hdoor_classes,
      },
      {
        label: "gym attendance mapped",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_hdoor_classes' AND target_table='club_attendance'`,
        expected: 226_765,
      },
      {
        label: "typed service history archived",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_hdoor_classes' AND target_table='legacy_archive'`,
        expected: 17_520,
      },
      {
        label: "locker types",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_locker_types'`,
        expected: tableCounts.tbl_locker_types,
      },
      {
        label: "lockers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_locker_number'`,
        expected: tableCounts.tbl_locker_number,
      },
      {
        label: "locker subscriptions",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_locker_subscription'`,
        expected: tableCounts.tbl_locker_subscription,
      },
      {
        label: "InBody measurements",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_inbody'`,
        expected: tableCounts.tbl_inbody,
      },
      {
        label: "inventory products",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_item' AND target_table='inv_products'`,
        expected: tableCounts.store_item,
      },
      {
        label: "Cafe catalog products",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_item' AND target_table='cafe_products'`,
        expected: tableCounts.store_item,
      },
      {
        label: "Cafe orphan catalog placeholders",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='legacy_orphan_products' AND target_table='cafe_products'`,
        expected: await scalar(
          `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='legacy_orphan_products' AND target_table='inv_products'`,
        ),
      },
      {
        label: "Cafe invoices",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_sales_fatora' AND target_table='sales_quick_sales'`,
        expected: tableCounts.bar_sales_fatora,
      },
      {
        label: "Cafe payments",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_sales_fatora' AND target_table='sales_pos_payments'`,
        expected: tableCounts.bar_sales_fatora,
      },
      {
        label: "Cafe finance revenues",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_sales_fatora' AND target_table='fin_revenues'`,
        expected: tableCounts.bar_sales_fatora,
      },
      {
        label: "Cafe accounting journals",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_sales_fatora' AND target_table='acc_journal_entries'`,
        expected: tableCounts.bar_sales_fatora,
      },
      {
        label: "Cafe invoice lines",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_sales'`,
        expected: tableCounts.bar_sales,
      },
      {
        label: "inventory count rows",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='bar_inventory_table'`,
        expected: tableCounts.bar_inventory_table,
      },
      {
        label: "suppliers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_other_suppliers'`,
        expected: tableCounts.store_other_suppliers,
      },
      {
        label: "main purchase invoices",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_purchases_fatora'`,
        expected: tableCounts.store_purchases_fatora,
      },
      {
        label: "main purchase lines",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_purchases'`,
        expected: tableCounts.store_purchases,
      },
      {
        label: "other purchase invoices",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_purchases_other_fatora'`,
        expected: tableCounts.store_purchases_other_fatora,
      },
      {
        label: "other purchase lines accounted",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_purchases_others'`,
        expected: tableCounts.store_purchases_others,
      },
      {
        label: "mobile app profile",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_app_info' AND target_table='am_about_app'`,
        expected: tableCounts.tbl_app_info,
      },
      {
        label: "mobile app ads",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_ads' AND target_table='am_ads'`,
        expected: tableCounts.tbl_ads,
      },
      {
        label: "mobile app news",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_news' AND target_table='am_news'`,
        expected: tableCounts.tbl_news,
      },
      {
        label: "mobile app offers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_offers' AND target_table='am_offers'`,
        expected: tableCounts.tbl_offers,
      },
      {
        label: "mobile app trainers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_captains' AND target_table='am_trainers'`,
        expected: tableCounts.tbl_captains,
      },
      {
        label: "operational club trainers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_captains' AND target_table='club_trainers'`,
        expected: tableCounts.tbl_captains,
      },
      {
        label: "mobile app exercise categories",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_tmaren_cats' AND target_table='am_exercise_categories'`,
        expected: tableCounts.tbl_tmaren_cats,
      },
      {
        label: "mobile app exercises",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_tmaren' AND target_table='am_exercises'`,
        expected: tableCounts.tbl_tmaren,
      },
      {
        label: "mobile app exercise images accounted",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_tmaren_images' AND target_table IN ('am_exercises','legacy_archive')`,
        expected: tableCounts.tbl_tmaren_images,
      },
      {
        label: "mobile app exercise images embedded",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_tmaren_images' AND target_table='am_exercises'`,
        expected: await scalar(
          `SELECT COUNT(*) n FROM ${q(source)}.tbl_tmaren_images i JOIN ${q(source)}.tbl_tmaren e ON e.id=i.tamren_id_fk`,
        ),
      },
      {
        label: "mobile app invitations",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_invitations' AND target_table='am_invitations'`,
        expected: tableCounts.tbl_invitations,
      },
      {
        label: "expense categories",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='expense_bnod' AND target_table='fin_expense_categories'`,
        expected: tableCounts.expense_bnod,
      },
      {
        label: "operational expenses",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_expense_bills' AND target_table='fin_expenses'`,
        expected: tableCounts.tbl_expense_bills,
      },
      {
        label: "operational expense accounting journals",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_expense_bills' AND target_table='acc_journal_entries'`,
        expected: nonzeroExpenseBillRows,
      },
      {
        label: "inventory transfers",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_tahwelat' AND target_table='inv_transactions'`,
        expected: tableCounts.store_tahwelat,
      },
      {
        label: "inventory transfer items",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_tahwelat_asnaf' AND target_table='inv_transaction_items'`,
        expected: tableCounts.store_tahwelat_asnaf,
      },
      {
        label: "HR city catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='cities' AND target_table='cities'`,
        expected: tableCounts.cities,
      },
      {
        label: "HR bank catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='banks' AND target_table='banks'`,
        expected: tableCounts.banks,
      },
      {
        label: "HR organization catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='hr_edarat_aqsam' AND target_table='hr_edarat_aqsam'`,
        expected: tableCounts.hr_edarat_aqsam,
      },
      {
        label: "HR job catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='department_jobs' AND target_table='department_jobs'`,
        expected: tableCounts.department_jobs,
      },
      {
        label: "HR employee settings catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='employees_settings' AND target_table='employees_settings'`,
        expected: tableCounts.employees_settings,
      },
      {
        label: "HR definition catalog",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='all_defined_setting' AND target_table='all_defined_setting'`,
        expected: tableCounts.all_defined_setting,
      },
      {
        label: "HR shift templates",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='always_setting' AND target_table='hr_shift_templates'`,
        expected: tableCounts.always_setting,
      },
      {
        label: "HR work schedules",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='hr_emp_dwam' AND target_table='hr_emp_dwam'`,
        expected: tableCounts.hr_emp_dwam,
      },
      {
        label: "member gallery images",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_members_imgs' AND target_table='club_member_images'`,
        expected: tableCounts.tbl_members_imgs,
      },
      {
        label: "member point history",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_points_history' AND target_table='club_member_point_transactions'`,
        expected: tableCounts.tbl_points_history,
      },
      {
        label: "member redeemed-point history",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_points_exhausted_history' AND target_table='club_member_point_transactions'`,
        expected: tableCounts.tbl_points_exhausted_history,
      },
      {
        label: "member direct contacts",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_member_contacts' AND target_table='club_member_contact_logs'`,
        expected: tableCounts.tbl_member_contacts,
      },
      {
        label: "member subscription contacts",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_member_contacts_sub' AND target_table='club_member_contact_logs'`,
        expected: tableCounts.tbl_member_contacts_sub,
      },
      {
        label: "member block history",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_members_blocked' AND target_table='club_members'`,
        expected: tableCounts.tbl_members_blocked,
      },
      {
        label: "locker inventory history",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='tbl_locker_inventory' AND target_table='club_locker_inventory_logs'`,
        expected: tableCounts.tbl_locker_inventory,
      },
      {
        label: "legacy chart of accounts",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='dalel' AND target_table='acc_accounts'`,
        expected: tableCounts.dalel,
      },
      {
        label: "disbursement orders",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='finance_sarf_order' AND target_table='fin_disbursement_orders'`,
        expected: tableCounts.finance_sarf_order,
      },
      {
        label: "visible disbursement expenses",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='finance_sarf_order' AND target_table='fin_expenses'`,
        expected: tableCounts.finance_sarf_order,
      },
      {
        label: "disbursement accounting journals",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='finance_sarf_order' AND target_table='acc_journal_entries'`,
        expected: nonzeroDisbursementRows,
      },
      {
        label: "disbursement order details",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='finance_sarf_order_details' AND target_table='fin_disbursement_order_details'`,
        expected: tableCounts.finance_sarf_order_details,
      },
      {
        label: "disbursement attachments",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='finance_sarf_order_attachments' AND target_table='fin_disbursement_order_attachments'`,
        expected: tableCounts.finance_sarf_order_attachments,
      },
      {
        label: "legacy storage warehouses",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_other_storage' AND target_table='inv_warehouses'`,
        expected: tableCounts.store_other_storage,
      },
      {
        label: "legacy stock-count sessions",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_inventory_sessions' AND target_table='inv_count_sessions'`,
        expected: legacyCountSessions,
      },
      {
        label: "legacy stock-count rows",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_inventory_table' AND target_table='inv_count_items'`,
        expected: tableCounts.store_inventory_table,
      },
      {
        label: "legacy product price history",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_all_items_prices' AND target_table='inv_product_price_history'`,
        expected: tableCounts.store_all_items_prices,
      },
      {
        label: "opening-stock audit snapshots",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_start_other_fatora' AND target_table='inv_legacy_opening_stock_snapshots'`,
        expected: tableCounts.store_start_other_fatora,
      },
      {
        label: "opening-stock audit lines",
        actualSql: `SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${lit(key)} AND legacy_table='store_start_other_items' AND target_table='inv_legacy_opening_stock_lines'`,
        expected: tableCounts.store_start_other_items,
      },
      {
        label: "legacy media references cataloged",
        actualSql: `SELECT COUNT(*) n FROM legacy_media_references WHERE source_key=${lit(key)}`,
        expected: legacyMediaRows,
      },
      {
        label: "table reconciliation rows",
        actualSql: `SELECT COUNT(*) n FROM legacy_table_reconciliations WHERE run_id=${runId}`,
        expected: EXPECTED_TABLES,
      },
    ];

  const results: Array<{
    label: string;
    expected: number;
    actual: number;
    ok: boolean;
  }> = [];
  for (const check of checks) {
    const actual = await scalar(check.actualSql);
    const ok = actual === check.expected;
    results.push({ label: check.label, expected: check.expected, actual, ok });
    if (!ok)
      errors.push(
        `${check.label}: expected ${check.expected}, found ${actual}`,
      );
  }

  const integrityChecks = [
    [
      "proven demo financial rows still present",
      `SELECT
        (SELECT COUNT(*) FROM acc_journal_entries
         WHERE (entry_no REGEXP '^JE-A-202607(11|18|21|22|23)-')
            OR (entry_no LIKE 'JE-2026-%' AND reference IN
              ('OPEN-2026','SUB-2026-03','POS-2026-04','PAY-2026-04','SUB-2026-05',
               'EXP-2026-05','PO-2026-06','SUB-2026-06','PAY-SUP-2026-06',
               'EXP-2026-06','DRAFT-2026-07')))
        + (SELECT COUNT(*) FROM fin_revenues
           WHERE (customer_name='اختبار مالي محلي'
             AND source_ref IN ('BKP-2026-000001','BKR-2026-000001'))
              OR (revenue_number REGEXP '^REV-2026-[0-9]{4}$'
                AND source_ref REGEXP '^REF-[0-9]+$')) n`,
    ],
    [
      "dangling legacy finance revenue mappings",
      `SELECT COUNT(*) n FROM legacy_record_mappings m
       LEFT JOIN fin_revenues r ON r.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='fin_revenues'
        AND r.id IS NULL`,
    ],
    [
      "dangling legacy accounting journal mappings",
      `SELECT COUNT(*) n FROM legacy_record_mappings m
       LEFT JOIN acc_journal_entries e ON e.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='acc_journal_entries'
        AND e.id IS NULL`,
    ],
    [
      "legacy accounting journal imbalance or header mismatch",
      `SELECT COUNT(*) n FROM (
        SELECT e.id,e.total_debit,e.total_credit,COUNT(l.id) line_count,
         COALESCE(SUM(l.debit),0) line_debit,COALESCE(SUM(l.credit),0) line_credit
        FROM acc_journal_entries e
        LEFT JOIN acc_journal_entry_lines l ON l.entry_id=e.id
        WHERE e.source_module='legacy_import'
        GROUP BY e.id,e.total_debit,e.total_credit
        HAVING line_count<2 OR total_debit<>total_credit OR line_debit<>line_credit
          OR total_debit<>line_debit OR total_credit<>line_credit
      ) bad`,
    ],
    [
      "legacy accounting lines with missing accounts",
      `SELECT COUNT(*) n FROM acc_journal_entry_lines l
       JOIN acc_journal_entries e ON e.id=l.entry_id
       LEFT JOIN acc_accounts a ON a.id=l.account_id
       WHERE e.source_module='legacy_import' AND a.id IS NULL`,
    ],
    [
      "legacy subscription finance revenue mismatch",
      `SELECT COUNT(*) n FROM legacy_record_mappings rm
       JOIN club_receipts r ON r.id=rm.target_id
       JOIN legacy_record_mappings fm ON fm.source_key=rm.source_key
        AND fm.legacy_table=rm.legacy_table AND fm.legacy_id=rm.legacy_id
        AND fm.target_table='fin_revenues'
       JOIN fin_revenues f ON f.id=fm.target_id
       WHERE rm.source_key=${lit(key)} AND rm.legacy_table='tbl_subscription_members'
        AND rm.target_table='club_receipts' AND r.amount>0
        AND (f.amount<>r.amount OR f.total_amount<>r.amount OR f.branch_id<>r.branch_id
          OR f.source_module<>'legacy_subscription' OR f.source_ref<>rm.legacy_id)`,
    ],
    [
      "legacy Cafe finance revenue mismatch",
      `SELECT COUNT(*) n FROM legacy_record_mappings sm
       JOIN sales_quick_sales s ON s.id=sm.target_id
       JOIN legacy_record_mappings fm ON fm.source_key=sm.source_key
        AND fm.legacy_table=sm.legacy_table AND fm.legacy_id=sm.legacy_id
        AND fm.target_table='fin_revenues'
       JOIN fin_revenues f ON f.id=fm.target_id
       WHERE sm.source_key=${lit(key)} AND sm.legacy_table='bar_sales_fatora'
        AND sm.target_table='sales_quick_sales' AND s.status='completed'
        AND (f.amount<>s.subtotal OR f.tax_amount<>s.tax_amount
          OR f.discount_amount<>s.discount_amount OR f.total_amount<>s.total_amount
          OR f.branch_id<>s.branch_id OR f.source_module<>'legacy_cafe_sale'
          OR f.source_ref<>sm.legacy_id)`,
    ],
    [
      "legacy expense journal amount mismatch",
      `SELECT COUNT(*) n FROM legacy_record_mappings xm
       JOIN fin_expenses x ON x.id=xm.target_id
       JOIN legacy_record_mappings jm ON jm.source_key=xm.source_key
        AND jm.legacy_table=xm.legacy_table AND jm.legacy_id=xm.legacy_id
        AND jm.target_table='acc_journal_entries'
       JOIN acc_journal_entries e ON e.id=jm.target_id
       WHERE xm.source_key=${lit(key)} AND xm.target_table='fin_expenses'
        AND xm.legacy_table IN ('tbl_expense_bills','finance_sarf_order')
        AND x.is_deleted=0 AND x.total_amount<>0
        AND (e.total_debit<>ABS(x.total_amount) OR e.total_credit<>ABS(x.total_amount)
          OR e.source_module<>'legacy_import')`,
    ],
    [
      "duplicate canonical member phones",
      `SELECT COUNT(*) n FROM (SELECT phone FROM club_members WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*)>1) x`,
    ],
    [
      "dangling authoritative HR employee mappings",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN employees t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.legacy_table='employees'
        AND m.target_table='employees' AND t.id IS NULL`,
    ],
    [
      "authoritative HR employee value mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.employees s
       JOIN legacy_record_mappings m ON m.source_key=${lit(key)} AND m.legacy_table='employees'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='employees'
       JOIN employees t ON t.id=m.target_id
       LEFT JOIN legacy_record_mappings city ON city.source_key=${lit(key)} AND city.legacy_table='cities'
        AND city.legacy_id=CAST(s.city_id_fk AS CHAR) AND city.target_table='cities'
       LEFT JOIN legacy_record_mappings org ON org.source_key=${lit(key)} AND org.legacy_table='hr_edarat_aqsam'
        AND org.legacy_id=CAST(s.edara_id AS CHAR) AND org.target_table='hr_edarat_aqsam'
       LEFT JOIN legacy_record_mappings section ON section.source_key=${lit(key)} AND section.legacy_table='hr_edarat_aqsam'
        AND section.legacy_id=CAST(s.qsm_id AS CHAR) AND section.target_table='hr_edarat_aqsam'
       WHERE NOT (BINARY t.employee<=>BINARY LEFT(s.employee,200))
        OR NOT (t.emp_code<=>CASE WHEN TRIM(s.emp_code) REGEXP '^-?[0-9]+$' THEN CAST(s.emp_code AS SIGNED) ELSE NULL END)
        OR NOT (t.card_num<=>s.card_num) OR NOT (BINARY t.phone<=>BINARY s.phone)
        OR NOT (BINARY t.email<=>BINARY s.email) OR NOT (t.mosma_wazefy_code<=>s.mosma_wazefy_code)
        OR NOT (t.city_id_fk<=>COALESCE(city.target_id,s.city_id_fk))
        OR NOT (t.edara_id<=>COALESCE(org.target_id,s.edara_id))
        OR NOT (t.qsm_id<=>COALESCE(section.target_id,s.qsm_id)) OR NOT (t.leave_emp<=>s.leave_emp)`,
    ],
    [
      "dangling newly materialized HR mappings",
      `SELECT COUNT(*) n FROM (
        SELECT m.id FROM legacy_record_mappings m LEFT JOIN cities t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='cities' AND m.target_table='cities' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN banks t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='banks' AND m.target_table='banks' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN hr_edarat_aqsam t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='hr_edarat_aqsam' AND m.target_table='hr_edarat_aqsam' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN department_jobs t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='department_jobs' AND m.target_table='department_jobs' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN employees_settings t ON t.id_setting=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='employees_settings' AND m.target_table='employees_settings' AND t.id_setting IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN all_defined_setting t ON t.defined_id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='all_defined_setting' AND m.target_table='all_defined_setting' AND t.defined_id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN hr_shift_templates t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='always_setting' AND m.target_table='hr_shift_templates' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN hr_emp_dwam t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.legacy_table='hr_emp_dwam' AND m.target_table='hr_emp_dwam' AND t.id IS NULL
      ) x`,
    ],
    [
      "legacy HR schedule value or employee mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.hr_emp_dwam s
       JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='hr_emp_dwam'
        AND sm.legacy_id=CAST(s.id AS CHAR) AND sm.target_table='hr_emp_dwam'
       JOIN hr_emp_dwam t ON t.id=sm.target_id
       LEFT JOIN legacy_record_mappings em ON em.source_key=${lit(key)} AND em.legacy_table='employees'
        AND em.legacy_id=CAST(s.emp_id AS CHAR) AND em.target_table='employees'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${lit(key)} AND om.legacy_table='legacy_orphan_hr_employees'
        AND om.legacy_id=CAST(s.emp_id AS CHAR) AND om.target_table='employees'
       LEFT JOIN employees e ON e.id=t.emp_id
       WHERE e.id IS NULL OR NOT (t.emp_id<=>COALESCE(em.target_id,om.target_id))
        OR NOT (t.always_id_fk<=>s.always_id_fk) OR NOT (BINARY t.attend_time<=>BINARY s.attend_time)
        OR NOT (BINARY t.leave_time<=>BINARY s.leave_time)`,
    ],
    [
      "legacy member image relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_members_imgs s
       JOIN legacy_record_mappings im ON im.source_key=${lit(key)} AND im.legacy_table='tbl_members_imgs'
        AND im.legacy_id=CAST(s.img_id AS CHAR) AND im.target_table='club_member_images'
       JOIN club_member_images t ON t.id=im.target_id
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${lit(key)} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(s.member_id_fk AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${lit(key)} AND om.legacy_table='legacy_orphan_members'
        AND om.legacy_id=CAST(s.member_id_fk AS CHAR) AND om.target_table='club_members'
       WHERE NOT (t.member_id<=>COALESCE(mm.target_id,om.target_id))
        OR NOT (BINARY t.image_path<=>BINARY LEFT(NULLIF(TRIM(s.image),''),500))`,
    ],
    [
      "legacy member points value or relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_points_history s
       JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='tbl_points_history'
        AND pm.legacy_id=CAST(s.id AS CHAR) AND pm.target_table='club_member_point_transactions'
       JOIN club_member_point_transactions t ON t.id=pm.target_id
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${lit(key)} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(s.member_id AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${lit(key)} AND om.legacy_table='legacy_orphan_members'
        AND om.legacy_id=CAST(s.member_id AS CHAR) AND om.target_table='club_members'
       LEFT JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='tbl_subscription_members'
        AND sm.legacy_id=CAST(s.sub_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
       WHERE NOT (t.member_id<=>COALESCE(mm.target_id,om.target_id)) OR t.points<>COALESCE(s.points,0)
        OR NOT (t.subscription_id<=>sm.target_id)
        OR t.transaction_type<>CASE WHEN LOWER(TRIM(s.type))='increase' THEN 'earn' ELSE 'redeem' END`,
    ],
    [
      "legacy redeemed-points value or relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_points_exhausted_history s
       JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='tbl_points_exhausted_history'
        AND pm.legacy_id=CAST(s.id AS CHAR) AND pm.target_table='club_member_point_transactions'
       JOIN club_member_point_transactions t ON t.id=pm.target_id
       LEFT JOIN ${q(source)}.tbl_members lm ON lm.m_code=s.member_code
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${lit(key)} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(lm.mem_id AS CHAR) AND mm.target_table='club_members'
       WHERE NOT (t.member_id<=>mm.target_id) OR t.points<>COALESCE(s.points,0)
        OR t.transaction_type<>'redeem'`,
    ],
    [
      "legacy blocked-member reason mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_members_blocked b
       JOIN legacy_record_mappings mm ON mm.source_key=${lit(key)} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(b.mem_id_fk AS CHAR) AND mm.target_table='club_members'
       JOIN club_members t ON t.id=mm.target_id
       WHERE t.is_active<>0 OR COALESCE(t.notes,'') NOT LIKE CONCAT('%[legacy-block:',b.id,']%')
        OR COALESCE(t.notes,'') NOT LIKE CONCAT('%',b.reason,'%')`,
    ],
    [
      "legacy locker count relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_locker_inventory s
       JOIN legacy_record_mappings im ON im.source_key=${lit(key)} AND im.legacy_table='tbl_locker_inventory'
        AND im.legacy_id=CAST(s.id AS CHAR) AND im.target_table='club_locker_inventory_logs'
       JOIN club_locker_inventory_logs t ON t.id=im.target_id
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${lit(key)} AND lm.legacy_table='tbl_locker_number'
        AND lm.legacy_id=CAST(s.locker_id_fk AS CHAR) AND lm.target_table='club_lockers'
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${lit(key)} AND bm.legacy_id=s.sub_branch_id_fk
       WHERE NOT (t.locker_id<=>lm.target_id) OR NOT (t.branch_id<=>bm.new_branch_id)
        OR NOT (t.inventory_number<=>s.num_invent)`,
    ],
    [
      "legacy chart of accounts hierarchy mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.dalel s
       JOIN legacy_record_mappings am ON am.source_key=${lit(key)} AND am.legacy_table='dalel'
        AND am.legacy_id=CAST(s.id AS CHAR) AND am.target_table='acc_accounts'
       JOIN acc_accounts t ON t.id=am.target_id
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='dalel'
        AND pm.legacy_id=CAST(s.parent AS CHAR) AND pm.target_table='acc_accounts'
       WHERE t.code<>CONCAT('LEG-',LEFT(CAST(s.code AS CHAR),46)) OR BINARY t.name<>BINARY LEFT(s.name,255)
        OR NOT (t.parent_id<=>pm.target_id)`,
    ],
    [
      "legacy disbursement order mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.finance_sarf_order s
       JOIN legacy_record_mappings om ON om.source_key=${lit(key)} AND om.legacy_table='finance_sarf_order'
        AND om.legacy_id=CAST(s.id AS CHAR) AND om.target_table='fin_disbursement_orders'
       JOIN fin_disbursement_orders t ON t.id=om.target_id
       WHERE NOT (t.order_number<=>s.sarf_num) OR t.total_amount<>COALESCE(s.total_value,0)
        OR NOT (BINARY t.description<=>BINARY s.about)`,
    ],
    [
      "legacy disbursement detail relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.finance_sarf_order_details s
       JOIN legacy_record_mappings dm ON dm.source_key=${lit(key)} AND dm.legacy_table='finance_sarf_order_details'
        AND dm.legacy_id=CAST(s.id AS CHAR) AND dm.target_table='fin_disbursement_order_details'
       JOIN fin_disbursement_order_details t ON t.id=dm.target_id
       JOIN ${q(source)}.finance_sarf_order o ON o.sarf_num=s.sarf_num_fk
       JOIN legacy_record_mappings om ON om.source_key=${lit(key)} AND om.legacy_table='finance_sarf_order'
        AND om.legacy_id=CAST(o.id AS CHAR) AND om.target_table='fin_disbursement_orders'
       WHERE t.order_id<>om.target_id OR t.amount<>COALESCE(s.value,0)`,
    ],
    [
      "legacy disbursement header/detail total mismatch",
      `SELECT COUNT(*) n FROM (
        SELECT o.id,o.total_value,COALESCE(SUM(d.value),0) detail_total
        FROM ${q(source)}.finance_sarf_order o
        LEFT JOIN ${q(source)}.finance_sarf_order_details d ON d.sarf_num_fk=o.sarf_num
        GROUP BY o.id,o.total_value HAVING total_value<>detail_total
      ) x`,
    ],
    [
      "legacy stock-count value or relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.store_inventory_table s
       JOIN legacy_record_mappings im ON im.source_key=${lit(key)} AND im.legacy_table='store_inventory_table'
        AND im.legacy_id=CAST(s.id AS CHAR) AND im.target_table='inv_count_items'
       JOIN inv_count_items t ON t.id=im.target_id
       JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='store_inventory_sessions'
        AND sm.legacy_id=CONCAT(TRIM(s.storage_id_fk),'|',s.num_invent,'|',s.invent_date)
        AND sm.target_table='inv_count_sessions'
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(s.item_id_fk AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_record_mappings op ON op.source_key=${lit(key)} AND op.legacy_table='legacy_orphan_products'
        AND op.legacy_id=CONCAT('id:',s.item_id_fk) AND op.target_table='inv_products'
       WHERE t.session_id<>sm.target_id OR t.product_id<>COALESCE(pm.target_id,op.target_id)
        OR t.system_quantity<>COALESCE(s.available_amount,0) OR t.counted_quantity<>COALESCE(s.amount,0)`,
    ],
    [
      "legacy opening-stock orphan relationships",
      `SELECT COUNT(*) n FROM inv_legacy_opening_stock_lines l
       JOIN legacy_record_mappings m ON m.source_key=${lit(key)} AND m.legacy_table='store_start_other_items'
        AND m.target_table='inv_legacy_opening_stock_lines' AND m.target_id=l.id
       LEFT JOIN inv_legacy_opening_stock_snapshots h ON h.id=l.snapshot_id
       WHERE h.id IS NULL`,
    ],
    [
      "legacy opening-stock line value mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.store_start_other_items s
       JOIN legacy_record_mappings lm ON lm.source_key=${lit(key)} AND lm.legacy_table='store_start_other_items'
        AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='inv_legacy_opening_stock_lines'
       JOIN inv_legacy_opening_stock_lines t ON t.id=lm.target_id
       WHERE NOT (t.available_quantity<=>CAST(NULLIF(TRIM(s.available_amount),'') AS DECIMAL(19,3)))
        OR NOT (t.unit_cost<=>CAST(NULLIF(TRIM(s.one_buy_cost),'') AS DECIMAL(19,2)))
        OR NOT (t.quantity<=>CAST(NULLIF(TRIM(s.amount),'') AS DECIMAL(19,3)))`,
    ],
    [
      "dangling legacy media targets",
      `SELECT COUNT(*) n FROM legacy_media_references WHERE source_key=${lit(key)} AND target_id IS NULL`,
    ],
    [
      "dangling mapped Cafe catalog products",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN cafe_products t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='cafe_products' AND t.id IS NULL`,
    ],
    [
      "legacy Cafe catalog value or relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.store_item s
       JOIN legacy_record_mappings cm ON cm.source_key=${lit(key)} AND cm.legacy_table='store_item'
        AND cm.legacy_id=CAST(s.id AS CHAR) AND cm.target_table='cafe_products'
       JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(s.id AS CHAR) AND pm.target_table='inv_products'
       JOIN cafe_products t ON t.id=cm.target_id
       WHERE t.inventory_product_id<>pm.target_id OR BINARY t.name<>BINARY LEFT(s.name,200)
        OR t.sell_price<>COALESCE(s.sale_price,s.customer_price_sale,0)
        OR BINARY t.product_type<>BINARY CASE WHEN s.sanf_type='0' OR s.sanf_type_gym=9 THEN 'internal' ELSE 'ready' END`,
    ],
    [
      "legacy Cafe sale line catalog relationship mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.bar_sales s
       JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='bar_sales'
        AND sm.legacy_id=CAST(s.id AS CHAR) AND sm.target_table='sales_quick_sale_items'
       JOIN sales_quick_sale_items t ON t.id=sm.target_id
       LEFT JOIN legacy_record_mappings cm ON cm.source_key=${lit(key)} AND cm.legacy_table='store_item'
        AND cm.legacy_id=CAST(s.item_id AS CHAR) AND cm.target_table='cafe_products'
       LEFT JOIN legacy_record_mappings oc ON oc.source_key=${lit(key)} AND oc.legacy_table='legacy_orphan_products'
        AND oc.legacy_id=CONCAT('id:',s.item_id) AND oc.target_table='cafe_products'
       WHERE COALESCE(cm.target_id,oc.target_id) IS NULL
        OR NOT (t.cafe_product_id<=>COALESCE(cm.target_id,oc.target_id))`,
    ],
    [
      "dangling operational trainer mappings",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_trainers t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.legacy_table='tbl_captains'
        AND m.target_table='club_trainers' AND t.id IS NULL`,
    ],
    [
      "legacy operational trainer value mismatch",
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_captains s
       JOIN legacy_record_mappings m ON m.source_key=${lit(key)} AND m.legacy_table='tbl_captains'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_trainers'
       JOIN club_trainers t ON t.id=m.target_id
       WHERE BINARY t.name<>BINARY LEFT(COALESCE(NULLIF(TRIM(s.name),''),CONCAT('Legacy trainer ',s.id)),200)
        OR NOT (BINARY t.bio<=>BINARY s.about)
        OR NOT (BINARY t.image_url<=>BINARY LEFT(NULLIF(TRIM(s.main_image),''),255))`,
    ],
    [
      "dangling mapped members",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_members t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_members' AND t.id IS NULL`,
    ],
    [
      "dangling mapped subscriptions",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_subscriptions t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_subscriptions' AND t.id IS NULL`,
    ],
    [
      "dangling mapped subscription receipts",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_receipts t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_receipts' AND t.id IS NULL`,
    ],
    [
      "dangling mapped subscription receipt payments",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_receipt_payments t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_receipt_payments' AND t.id IS NULL`,
    ],
    [
      "legacy subscription receipt value or relationship mismatch",
      `SELECT COUNT(*) n
      FROM ${q(source)}.tbl_subscription_members s
      JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(s.subs_id AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN legacy_record_mappings rm ON rm.source_key=${lit(key)} AND rm.legacy_table='tbl_subscription_members'
       AND rm.legacy_id=CAST(s.subs_id AS CHAR) AND rm.target_table='club_receipts'
      JOIN club_subscriptions cs ON cs.id=sm.target_id
      JOIN club_receipts r ON r.id=rm.target_id
      WHERE s.paid>0 AND (r.subscription_id<>cs.id OR NOT (r.member_id<=>cs.member_id)
        OR r.branch_id<>cs.branch_id OR r.amount<>s.paid
        OR r.payment_method<>(CASE s.pay_method WHEN 2 THEN 'card' ELSE 'cash' END))`,
    ],
    [
      "legacy subscription receipt split mismatch",
      `SELECT COUNT(*) n FROM (
      SELECT r.id,r.amount,COALESCE(SUM(p.amount),0) paid
      FROM legacy_record_mappings rm
      JOIN club_receipts r ON r.id=rm.target_id
      LEFT JOIN club_receipt_payments p ON p.receipt_id=r.id
      WHERE rm.source_key=${lit(key)} AND rm.legacy_table='tbl_subscription_members'
        AND rm.target_table='club_receipts'
      GROUP BY r.id,r.amount HAVING paid<>r.amount
    ) x`,
    ],
    [
      "dangling mapped subscription freezes",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_subscription_freezes t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_subscription_freezes' AND t.id IS NULL`,
    ],
    [
      "dangling mapped subscription refunds",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_subscription_refunds t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_subscription_refunds' AND t.id IS NULL`,
    ],
    [
      "dangling mapped subscription transfers",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_subscription_transfers t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_subscription_transfers' AND t.id IS NULL`,
    ],
    [
      "legacy subscription freeze value or relationship mismatch",
      `SELECT COUNT(*) n
      FROM ${q(source)}.tbl_stopped_subscription f
      JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(f.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN legacy_record_mappings fm ON fm.source_key=${lit(key)} AND fm.legacy_table='tbl_stopped_subscription'
       AND fm.legacy_id=CAST(f.stop_id AS CHAR) AND fm.target_table='club_subscription_freezes'
      JOIN club_subscription_freezes x ON x.id=fm.target_id
      WHERE x.subscription_id<>sm.target_id OR x.planned_days<>GREATEST(COALESCE(f.stoped_days_writen,0),0)
       OR x.freeze_start_date<>DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_from AS UNSIGNED)),'%Y-%m-%d')
       OR x.freeze_end_date<>DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_to AS UNSIGNED)),'%Y-%m-%d')`,
    ],
    [
      "legacy subscription refund value or relationship mismatch",
      `SELECT COUNT(*) n
      FROM ${q(source)}.tbl_subscription_hadback h
      JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(h.subs_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN legacy_record_mappings rm ON rm.source_key=${lit(key)} AND rm.legacy_table='tbl_subscription_hadback'
       AND rm.legacy_id=CAST(h.id AS CHAR) AND rm.target_table='club_subscription_refunds'
      JOIN club_subscription_refunds r ON r.id=rm.target_id
      WHERE r.subscription_id<>sm.target_id OR r.refund_amount<>h.hadback_value
       OR r.refund_date<>h.hadback_date OR r.invoice_number<>CONCAT('LEG-REF-',h.id)`,
    ],
    [
      "legacy subscription transfer relationship mismatch",
      `SELECT COUNT(*) n
      FROM ${q(source)}.tbl_transformation t
      JOIN legacy_record_mappings sm ON sm.source_key=${lit(key)} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(t.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN legacy_record_mappings tm ON tm.source_key=${lit(key)} AND tm.legacy_table='tbl_transformation'
       AND tm.legacy_id=CAST(t.id AS CHAR) AND tm.target_table='club_subscription_transfers'
      JOIN club_subscription_transfers x ON x.id=tm.target_id
      WHERE x.subscription_id<>sm.target_id OR x.transfer_date<>t.date`,
    ],
    [
      "dangling mapped attendance",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN club_attendance t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='club_attendance' AND t.id IS NULL`,
    ],
    [
      "dangling mapped sales",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN sales_quick_sales t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='sales_quick_sales' AND t.id IS NULL`,
    ],
    [
      "dangling mapped sale lines",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN sales_quick_sale_items t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='sales_quick_sale_items' AND t.id IS NULL`,
    ],
    [
      "dangling mapped count rows",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN inv_count_items t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='inv_count_items' AND t.id IS NULL`,
    ],
    [
      "dangling mapped purchase invoices",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN prc_purchase_invoices t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='prc_purchase_invoices' AND t.id IS NULL`,
    ],
    [
      "dangling mapped purchase lines",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN prc_purchase_invoice_items t ON t.id=m.target_id WHERE m.source_key=${lit(key)} AND m.target_table='prc_purchase_invoice_items' AND t.id IS NULL`,
    ],
    [
      "dangling mapped mobile app records",
      `SELECT COUNT(*) n FROM (
        SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_about_app t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_about_app' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_ads t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_ads' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_news t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_news' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_offers t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_offers' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_trainers t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_trainers' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_exercise_categories t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_exercise_categories' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_exercises t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_exercises' AND t.id IS NULL
        UNION ALL SELECT m.id FROM legacy_record_mappings m LEFT JOIN am_invitations t ON t.id=m.target_id
         WHERE m.source_key=${lit(key)} AND m.target_table='am_invitations' AND t.id IS NULL
      ) x`,
    ],
    [
      "legacy invitation status or relationship mismatch",
      `SELECT COUNT(*) n
       FROM ${q(source)}.tbl_invitations i
       JOIN legacy_record_mappings im ON im.source_key=${lit(key)} AND im.legacy_table='tbl_invitations'
        AND im.legacy_id=CAST(i.inv_id AS CHAR) AND im.target_table='am_invitations'
       JOIN am_invitations a ON a.id=im.target_id
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${lit(key)} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(i.mem_id AS CHAR) AND mm.target_table='club_members'
       WHERE NOT (a.inviter_member_id<=>mm.target_id)
        OR a.status<>CASE WHEN NULLIF(TRIM(i.hdoor_date),'') IS NOT NULL THEN 'attended'
                         WHEN i.inv_action='accepted' THEN 'accepted'
                         WHEN i.inv_action='refused' THEN 'rejected' ELSE 'pending' END`,
    ],
    [
      "legacy exercise category relationship mismatch",
      `SELECT COUNT(*) n
       FROM ${q(source)}.tbl_tmaren e
       JOIN legacy_record_mappings em ON em.source_key=${lit(key)} AND em.legacy_table='tbl_tmaren'
        AND em.legacy_id=CAST(e.id AS CHAR) AND em.target_table='am_exercises'
       JOIN legacy_record_mappings cm ON cm.source_key=${lit(key)} AND cm.legacy_table='tbl_tmaren_cats'
        AND cm.legacy_id=CAST(e.cat_id_fk AS CHAR) AND cm.target_table='am_exercise_categories'
       JOIN am_exercises t ON t.id=em.target_id
       WHERE t.category_id<>cm.target_id`,
    ],
    [
      "dangling mapped expenses",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN fin_expenses t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='fin_expenses' AND t.id IS NULL`,
    ],
    [
      "legacy expense value or relationship mismatch",
      `SELECT COUNT(*) n
       FROM ${q(source)}.tbl_expense_bills e
       JOIN legacy_record_mappings em ON em.source_key=${lit(key)} AND em.legacy_table='tbl_expense_bills'
        AND em.legacy_id=CAST(e.bill_id AS CHAR) AND em.target_table='fin_expenses'
       JOIN fin_expenses t ON t.id=em.target_id
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${lit(key)} AND bm.legacy_id=e.branch_id_fk
       WHERE t.amount<>e.value OR t.total_amount<>e.value OR t.expense_date<>LEFT(e.bill_date,10)
        OR NOT (t.branch_id<=>bm.new_branch_id) OR t.expense_number<>CONCAT('LEG-EXP-',e.bill_id)`,
    ],
    [
      "legacy expense total mismatch",
      `SELECT COUNT(*) n FROM (
        SELECT (SELECT COALESCE(SUM(value),0) FROM ${q(source)}.tbl_expense_bills) source_total,
               (SELECT COALESCE(SUM(t.total_amount),0) FROM legacy_record_mappings m
                 JOIN fin_expenses t ON t.id=m.target_id WHERE m.source_key=${lit(key)}
                  AND m.legacy_table='tbl_expense_bills' AND m.target_table='fin_expenses') target_total
      ) x WHERE source_total<>target_total`,
    ],
    [
      "dangling mapped inventory transfers",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN inv_transactions t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='inv_transactions' AND t.id IS NULL`,
    ],
    [
      "dangling mapped inventory transfer items",
      `SELECT COUNT(*) n FROM legacy_record_mappings m LEFT JOIN inv_transaction_items t ON t.id=m.target_id
       WHERE m.source_key=${lit(key)} AND m.target_table='inv_transaction_items' AND t.id IS NULL`,
    ],
    [
      "legacy inventory transfer relationship mismatch",
      `SELECT COUNT(*) n
       FROM ${q(source)}.store_tahwelat h
       JOIN legacy_record_mappings hm ON hm.source_key=${lit(key)} AND hm.legacy_table='store_tahwelat'
        AND hm.legacy_id=CAST(h.id AS CHAR) AND hm.target_table='inv_transactions'
       JOIN inv_transactions t ON t.id=hm.target_id
       JOIN legacy_record_mappings sw ON sw.source_key=${lit(key)} AND sw.legacy_table='store_branch_settings'
        AND sw.legacy_id=CAST(h.from_storage AS CHAR) AND sw.target_table='inv_warehouses'
       JOIN legacy_record_mappings tw ON tw.source_key=${lit(key)} AND tw.legacy_table='store_branch_settings'
        AND tw.legacy_id=CAST(h.to_storage AS CHAR) AND tw.target_table='inv_warehouses'
       WHERE t.txn_type<>'transfer' OR t.status<>'approved'
        OR t.source_warehouse_id<>sw.target_id OR t.target_warehouse_id<>tw.target_id`,
    ],
    [
      "legacy inventory transfer item mismatch",
      `SELECT COUNT(*) n
       FROM ${q(source)}.store_tahwelat_asnaf i
       JOIN (
         SELECT rkm,from_storage,to_storage,MIN(id) legacy_header_id
         FROM ${q(source)}.store_tahwelat GROUP BY rkm,from_storage,to_storage
       ) h ON h.rkm=i.rkm_fk AND h.from_storage=i.from_storage AND h.to_storage=i.to_storage
       JOIN legacy_record_mappings hm ON hm.source_key=${lit(key)} AND hm.legacy_table='store_tahwelat'
        AND hm.legacy_id=CAST(h.legacy_header_id AS CHAR) AND hm.target_table='inv_transactions'
       JOIN legacy_record_mappings im ON im.source_key=${lit(key)} AND im.legacy_table='store_tahwelat_asnaf'
        AND im.legacy_id=CAST(i.id AS CHAR) AND im.target_table='inv_transaction_items'
       JOIN inv_transaction_items t ON t.id=im.target_id
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${lit(key)} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(i.sanf_id AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_record_mappings op ON op.source_key=${lit(key)} AND op.legacy_table='legacy_orphan_products'
        AND op.legacy_id=CONCAT('id:',i.sanf_id) AND op.target_table='inv_products'
       WHERE t.transaction_id<>hm.target_id OR t.quantity<>i.amount_send
        OR t.product_id<>COALESCE(pm.target_id,op.target_id)`,
    ],
    [
      "canonical attendance missing member",
      "SELECT COUNT(*) n FROM club_attendance a LEFT JOIN club_members m ON m.id=a.member_id WHERE m.id IS NULL",
    ],
  ] as const;
  const integrity: Array<{ label: string; errors: number; ok: boolean }> = [];
  for (const [label, sql] of integrityChecks) {
    const n = await scalar(sql);
    integrity.push({ label, errors: n, ok: n === 0 });
    if (n !== 0) errors.push(`${label}: ${n}`);
  }

  const reconciledArchiveRows = await scalar(
    `SELECT COALESCE(SUM(archived_rows),0) n FROM legacy_table_reconciliations WHERE run_id=${runId}`,
  );
  if (reconciledArchiveRows !== EXPECTED_ROWS)
    errors.push(
      `reconciled archive rows: expected ${EXPECTED_ROWS}, found ${reconciledArchiveRows}`,
    );
  const rawReconciliationRows = await query<ReconciliationRow>(`
    SELECT source_table,target_table,source_rows,mapped_rows,archived_rows,error_rows,notes
    FROM legacy_table_reconciliations WHERE run_id=${runId} ORDER BY source_table,target_table
  `);
  // The shared-table pass records coverage by same-name tables. Canonical
  // migrations often rename or merge a legacy table, so enrich the final
  // report from the immutable record mappings instead of falsely reporting
  // those rows as archive-only. Keep this projection read-only: changing the
  // reconciliation key would make a later idempotent import create duplicates.
  const mappingSummaries = await query<MappingSummaryRow>(`
    SELECT legacy_table AS source_table,
      GROUP_CONCAT(DISTINCT target_table ORDER BY target_table SEPARATOR ', ') AS target_tables,
      COUNT(DISTINCT legacy_id) AS mapped_rows
    FROM legacy_record_mappings
    WHERE source_key=${lit(key)}
    GROUP BY legacy_table
  `);
  const effectiveMappings = new Map(
    mappingSummaries.map((row) => [
      row.source_table,
      {
        targetTable: row.target_tables,
        mappedRows: Number(row.mapped_rows),
      },
    ]),
  );
  effectiveMappings.set("tbl_branches", {
    targetTable: "tbl_branches",
    mappedRows: await scalar(
      `SELECT COUNT(*) n FROM legacy_branch_mappings WHERE source_key=${lit(key)}`,
    ),
  });
  effectiveMappings.set("tbl_employees", {
    targetTable: "employees",
    mappedRows: await scalar(
      `SELECT COUNT(*) n FROM legacy_employee_mappings WHERE source_key=${lit(key)}`,
    ),
  });
  effectiveMappings.set("users", {
    targetTable: "users",
    mappedRows: await scalar(
      `SELECT COUNT(*) n FROM legacy_user_mappings WHERE source_key=${lit(key)}`,
    ),
  });
  effectiveMappings.set("tbl_inbody_details", {
    targetTable: "club_inbody_measurements (embedded detail history)",
    mappedRows: await scalar(
      `SELECT COUNT(*) n FROM ${q(source)}.tbl_inbody_details d
       JOIN ${q(source)}.tbl_inbody i ON i.id=d.inbody_id_fk
       JOIN legacy_record_mappings m ON m.source_key=${lit(key)}
        AND m.legacy_table='tbl_inbody' AND m.legacy_id=CAST(i.id AS CHAR)
        AND m.target_table='club_inbody_measurements'`,
    ),
  });
  const reconciliationRows = rawReconciliationRows.map((row) => {
    const canonical = effectiveMappings.get(row.source_table);
    const recorded = Number(row.mapped_rows);
    if (!canonical || canonical.mappedRows < recorded) return row;
    const sourceRowsForTable = Number(row.source_rows);
    const mappedRows = Math.min(sourceRowsForTable, canonical.mappedRows);
    return {
      ...row,
      target_table: canonical.targetTable,
      mapped_rows: mappedRows,
      notes:
        mappedRows === sourceRowsForTable
          ? "All source rows reconciled through canonical target mapping(s); raw archive retained."
          : `${mappedRows} source rows reconciled through canonical target mapping(s); all source rows retained in the raw archive.`,
    };
  });
  const reconciliationSummary = reconciliationRows.reduce(
    (summary, row) => {
      const sourceCount = Number(row.source_rows);
      const mappedCount = Math.min(sourceCount, Number(row.mapped_rows));
      summary.canonical_or_compatible_rows += mappedCount;
      if (sourceCount === 0 || mappedCount >= sourceCount)
        summary.fully_reconciled_tables += 1;
      else if (mappedCount === 0) summary.archive_only_tables += 1;
      else summary.partially_reconciled_tables += 1;
      return summary;
    },
    {
      canonical_or_compatible_rows: 0,
      fully_reconciled_tables: 0,
      partially_reconciled_tables: 0,
      archive_only_tables: 0,
    },
  );
  const archiveOnlyRows = reconciliationRows.reduce(
    (total, row) =>
      total + Math.max(0, Number(row.source_rows) - Number(row.mapped_rows)),
    0,
  );

  const report = {
    generated_at: new Date().toISOString(),
    status: errors.length === 0 ? "complete" : "failed",
    dump_sha256: sha,
    source_database: source,
    target_database: targetDatabase,
    source_tables: sourceTables.length,
    source_rows: sourceRows,
    table_counts: tableCounts,
    target_tables: targetTables.length,
    target_table_counts: targetTableCounts,
    empty_target_tables: emptyTargetTables,
    empty_target_tables_with_nonempty_same_name_source:
      emptyTargetsWithNonemptySameNameSource,
    intentional_empty_compatibility_tables: intentionalEmptyCompatibilityTables,
    unresolved_empty_target_tables_with_nonempty_same_name_source:
      unresolvedEmptyTargetsWithNonemptySameNameSource,
    reconciled_archive_rows: reconciledArchiveRows,
    reconciliation_summary: {
      ...reconciliationSummary,
      archive_only_rows: archiveOnlyRows,
    },
    table_reconciliations: reconciliationRows.map((row) => ({
      ...row,
      source_rows: Number(row.source_rows),
      mapped_rows: Number(row.mapped_rows),
      archived_rows: Number(row.archived_rows),
      error_rows: Number(row.error_rows),
    })),
    canonical_checks: results,
    integrity_checks: integrity,
    errors,
  };

  const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
  if (reportArg) {
    const path = resolve(reportArg.slice("--report=".length));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Report: ${path}`);
  }
  console.log(JSON.stringify(report, null, 2));

  await prisma.$executeRawUnsafe(`UPDATE legacy_import_runs SET status=${lit(report.status)},source_table_count=${sourceTables.length},
    source_row_count=${sourceRows},completed_at=${errors.length === 0 ? "CURRENT_TIMESTAMP(3)" : "NULL"},notes=${lit(errors.length ? errors.join("\n") : "All archive, mapping and relationship checks passed.")}
    WHERE id=${runId}`);
  if (errors.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
