/* eslint-disable no-console */
/**
 * Lossless legacy import after the original dump has been restored into a
 * separate database on the same MySQL server.
 *
 * Raw rows stay immutable in that archive database. This script creates
 * explicit old-ID -> new-ID mappings and materializes only semantically safe
 * representations in the current app tables. Every step is transactional and
 * idempotent; it never deletes or updates an existing operational record.
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type CountRow = { n: bigint | number };
type IdRow = { id: number };

const target = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value))
    throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${value.replace(/`/g, "``")}\``;
}

function literal(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function databaseName(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!name) throw new Error("DATABASE_URL has no database name");
  return name;
}

async function execute(
  tx: Prisma.TransactionClient,
  sql: string,
): Promise<number> {
  return tx.$executeRawUnsafe(sql);
}

async function one<T>(
  client: PrismaClient | Prisma.TransactionClient,
  sql: string,
): Promise<T> {
  const rows = await client.$queryRawUnsafe<T[]>(sql);
  if (rows.length !== 1)
    throw new Error(`Expected exactly one row, received ${rows.length}`);
  return rows[0];
}

async function step(
  label: string,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const started = Date.now();
  console.log(`==> ${label}`);
  await target.$transaction(
    async (tx) => {
      await execute(tx, "SET time_zone = '+00:00'");
      await execute(tx, "SET collation_connection = 'utf8mb4_unicode_ci'");
      await execute(tx, "SET SESSION group_concat_max_len = 1048576");
      await work(tx);
    },
    { maxWait: 30_000, timeout: 1_800_000 },
  );
  console.log(`    ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

async function main(): Promise<void> {
  const targetUrl = required("DATABASE_URL");
  const targetDatabase = databaseName(targetUrl);
  const sourceDatabase = required("LEGACY_DATABASE");
  const sourceKey = required("LEGACY_SOURCE_KEY");
  const dumpSha256 = required("LEGACY_DUMP_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(dumpSha256))
    throw new Error("LEGACY_DUMP_SHA256 must be 64 hex characters");
  if (sourceKey.length > 191)
    throw new Error("LEGACY_SOURCE_KEY must be at most 191 characters");
  if (sourceDatabase === targetDatabase)
    throw new Error("Legacy and target databases must be different");

  const src = identifier(sourceDatabase);
  const key = literal(sourceKey);
  const sha = literal(dumpSha256);
  const sourceDbValue = literal(sourceDatabase);

  const sourceTableCount = await one<CountRow>(
    target,
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=${sourceDbValue} AND table_type='BASE TABLE'`,
  );
  if (Number(sourceTableCount.n) < 248) {
    throw new Error(
      `Legacy archive is incomplete: expected at least 248 tables, found ${sourceTableCount.n}`,
    );
  }

  await target.$executeRawUnsafe(`
    INSERT INTO legacy_import_runs
      (source_key, source_database, dump_sha256, status, source_table_count, source_row_count, started_at)
    VALUES (${key}, ${sourceDbValue}, ${sha}, 'running', ${Number(sourceTableCount.n)}, 0, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      source_database=VALUES(source_database),
      source_table_count=VALUES(source_table_count),
      status=IF(status='complete','complete','running')
  `);
  const run = await one<IdRow>(
    target,
    `SELECT id FROM legacy_import_runs WHERE source_key=${key} AND dump_sha256=${sha}`,
  );
  const runId = run.id;
  console.log(`=== Legacy canonical import: run ${runId} ===`);
  console.log(`Source: ${sourceKey} (${sourceDatabase})`);

  const mappingFilter = (
    legacyTable: string,
    targetTable: string,
    alias = "lm",
  ) => `
    LEFT JOIN legacy_record_mappings ${alias}
      ON ${alias}.source_key=${key}
     AND ${alias}.legacy_table=${literal(legacyTable)}
     AND ${alias}.legacy_id=CAST(s.id AS CHAR)
     AND ${alias}.target_table=${literal(targetTable)}
    WHERE ${alias}.id IS NULL`;

  await step("subscription type catalog", async (tx) => {
    await execute(
      tx,
      "SET @legacy_type_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_subscription_types)",
    );
    await execute(
      tx,
      `
      INSERT INTO club_subscription_types
        (id,name,branch_id,apply_to_all_branches,price,days,is_part_of_target,
         invitations_count,inbody_count,is_special_offer,is_for_students,show_in_app,
         notify_customers,notify_on_expiry,wallet_points,offer_validity,
         is_linked_to_sessions,sessions_count,allow_multiple_daily_entries,
         is_linked_to_freeze,freeze_days,includes_spa,spa_count,is_active,created_at,updated_at)
      SELECT @legacy_type_base+s.type_id,
        LEFT(COALESCE(NULLIF(TRIM(s.title),''),CONCAT('Legacy package ',s.type_id)),150),
        bm.new_branch_id,IF(s.branch_id_fk IS NULL,1,0),COALESCE(s.price,0),GREATEST(COALESCE(s.num_days,0),1),
        s.target=1,s.invitations_count,s.inbody_count,s.special_offer=1,s.student=1,
        s.app_display=1,s.app_notify=1,s.end_notify=1,s.points,
        IF(s.expire_num_days>0,CAST(s.expire_num_days AS CHAR),NULL),
        s.related_to_hesas=1,s.hesas_nums_days_num,0,s.stopped=1,s.stopped_days_num,
        s.spa=1,s.spa_days_num,s.active='yes',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.tbl_subscription_settings s
      LEFT JOIN legacy_branch_mappings bm
        ON bm.source_key=${key} AND bm.legacy_id=s.branch_id_fk
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_settings'
       AND lm.legacy_id=CAST(s.type_id AS CHAR) AND lm.target_table='club_subscription_types'
      WHERE lm.id IS NULL
    `,
    );
    await execute(
      tx,
      `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'tbl_subscription_settings',CAST(s.type_id AS CHAR),
             'club_subscription_types',@legacy_type_base+s.type_id,'mapped'
      FROM ${src}.tbl_subscription_settings s
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_settings'
       AND lm.legacy_id=CAST(s.type_id AS CHAR) AND lm.target_table='club_subscription_types'
      WHERE lm.id IS NULL
    `,
    );
  });

  await step(
    "50,486 members and orphan relationship placeholders",
    async (tx) => {
      await execute(
        tx,
        "SET @legacy_member_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_members)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_members
        (id,member_code,name,phone,email,gender,card_number,date_of_birth,address,marital_status,
         job_title,profile_picture,branch_id,notes,is_active,is_deleted,created_by,created_at,updated_at)
      SELECT @legacy_member_base+s.mem_id,
        LEFT(s.m_code,30),LEFT(s.name,200),
        CASE
          WHEN LENGTH(TRIM(s.phone))>20 THEN NULL
          WHEN s.phone_rank>1 THEN NULL
          WHEN EXISTS(SELECT 1 FROM club_members cm WHERE cm.phone=TRIM(s.phone)) THEN NULL
          ELSE NULLIF(TRIM(s.phone),'')
        END,
        LEFT(NULLIF(TRIM(s.email),''),150),IF(s.gender='F','female','male'),
        LEFT(CAST(s.m_card AS CHAR),30),
        CASE
          WHEN s.birth_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN s.birth_date
          WHEN s.birth_date REGEXP '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN DATE_FORMAT(STR_TO_DATE(s.birth_date,'%d-%m-%Y'),'%Y-%m-%d')
          WHEN s.birth_date REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN DATE_FORMAT(STR_TO_DATE(s.birth_date,'%d/%m/%Y'),'%Y-%m-%d')
          WHEN s.birth_date REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.birth_date AS UNSIGNED)),'%Y-%m-%d')
          ELSE NULL
        END,
        NULLIF(TRIM(s.address),''),s.marital_status,LEFT(NULLIF(TRIM(s.job_title),''),120),
        LEFT(NULLIF(NULLIF(TRIM(s.image),'default.png'),''),255),bm.new_branch_id,
        JSON_OBJECT('legacy_table','tbl_members','legacy_id',s.mem_id,'original_phone',s.phone,
          'nationality',s.nationality,'company_name',s.company_name,'height',s.m_length,
          'weight',s.m_weight,'fat_percent',s.fat_percent,'membership_file',s.membership_file),
        s.active='yes' AND s.blocked='no',0,um.new_user_id,
        COALESCE(s.created,CURRENT_TIMESTAMP(3)),COALESCE(s.updated,s.created,CURRENT_TIMESTAMP(3))
      FROM (
        SELECT m.*,ROW_NUMBER() OVER(PARTITION BY TRIM(m.phone) ORDER BY m.mem_id) phone_rank
        FROM ${src}.tbl_members m
      ) s
      JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.branch_id_fk
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.user_id
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_members'
       AND lm.legacy_id=CAST(s.mem_id AS CHAR) AND lm.target_table='club_members'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_members',CAST(s.mem_id AS CHAR),'club_members',
             @legacy_member_base+s.mem_id,'mapped',JSON_OBJECT('member_code',s.m_code)
      FROM ${src}.tbl_members s
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_members'
       AND lm.legacy_id=CAST(s.mem_id AS CHAR) AND lm.target_table='club_members'
      WHERE lm.id IS NULL
    `,
      );

      await execute(
        tx,
        "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_orphan_members",
      );
      await execute(
        tx,
        `
      CREATE TEMPORARY TABLE tmp_legacy_orphan_members AS
      SELECT DISTINCT missing_id FROM (
        SELECT s.mem_id_fk missing_id FROM ${src}.tbl_subscription_members s
        LEFT JOIN ${src}.tbl_members m ON m.mem_id=s.mem_id_fk
        WHERE s.mem_id_fk IS NOT NULL AND m.mem_id IS NULL
        UNION
        SELECT h.member_id FROM ${src}.tbl_hdoor_classes h
        LEFT JOIN ${src}.tbl_members m ON m.mem_id=h.member_id
        WHERE h.member_id IS NOT NULL AND m.mem_id IS NULL
        UNION
        SELECT i.mem_id_fk FROM ${src}.tbl_inbody i
        LEFT JOIN ${src}.tbl_members m ON m.mem_id=i.mem_id_fk
        WHERE i.mem_id_fk IS NOT NULL AND m.mem_id IS NULL
        UNION
        SELECT -1 WHERE EXISTS(SELECT 1 FROM ${src}.tbl_inbody i WHERE i.mem_id_fk IS NULL)
      ) x
    `,
      );
      await execute(
        tx,
        "ALTER TABLE tmp_legacy_orphan_members ADD PRIMARY KEY (missing_id)",
      );
      await execute(
        tx,
        "SET @orphan_member_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_members)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_members
        (id,member_code,name,gender,branch_id,notes,is_active,is_deleted,created_at,updated_at)
      SELECT @orphan_member_base+ROW_NUMBER() OVER(ORDER BY o.missing_id),
        CONCAT('ORPH-L',o.missing_id),CONCAT('Legacy orphan member ',o.missing_id),'male',
        (SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key}),
        CONCAT('Placeholder required by orphaned legacy relationships. Missing tbl_members.mem_id=',o.missing_id),
        0,1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM tmp_legacy_orphan_members o
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='legacy_orphan_members'
       AND lm.legacy_id=CAST(o.missing_id AS CHAR) AND lm.target_table='club_members'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'legacy_orphan_members',CAST(o.missing_id AS CHAR),'club_members',cm.id,
        'placeholder',JSON_OBJECT('reason','referenced source member is missing')
      FROM tmp_legacy_orphan_members o
      JOIN club_members cm ON cm.member_code=CONCAT('ORPH-L',o.missing_id)
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='legacy_orphan_members'
       AND lm.legacy_id=CAST(o.missing_id AS CHAR) AND lm.target_table='club_members'
      WHERE lm.id IS NULL
    `,
      );
    },
  );

  await step("34,044 subscriptions", async (tx) => {
    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_subscriptions t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
        AND lm.target_table='club_subscriptions' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_sub_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_subscriptions)",
    );
    await execute(
      tx,
      `
      INSERT INTO club_subscriptions
        (id,subscription_number,registration_date,branch_id,member_id,customer_name,
         subscription_type_id,subscription_type,subscription_start_date,subscription_end_date,
         subscription_value,discount_enabled,discount_value,paid_amount,remaining_amount,
         employee_id,payment_method,receipt_number,status,is_special,is_linked_to_sessions,
         sessions_count,created_by,created_at,updated_at)
      SELECT @legacy_sub_base+s.subs_id,CONCAT('LEG-S-',s.subs_id),
        DATE_FORMAT(FROM_UNIXTIME(CAST(s.date_add AS SIGNED)),'%Y-%m-%d'),
        COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})),
        COALESCE(mm.target_id,om.target_id),LEFT(COALESCE(m.name,CONCAT('Legacy member ',s.mem_id_fk)),200),
        tm.target_id,LEFT(st.title,150),
        DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)),'%Y-%m-%d'),
        CASE WHEN CAST(s.to_date AS SIGNED)>0 THEN DATE_FORMAT(FROM_UNIXTIME(CAST(s.to_date AS SIGNED)),'%Y-%m-%d')
             ELSE DATE_FORMAT(FROM_UNIXTIME(CAST(s.from_date AS SIGNED)),'%Y-%m-%d') END,
        COALESCE(s.price,0),COALESCE(s.discount_value,0)>0 OR COALESCE(s.discount_percent,0)>0,
        COALESCE(s.discount_value,0),COALESCE(s.paid,0),COALESCE(s.remain,0),em.new_employee_id,
        CASE s.pay_method WHEN 2 THEN 'card' ELSE 'cash' END,
        LEFT(CAST(s.rkm_esal AS CHAR),30),
        CASE WHEN s.stopped_subscription=1 THEN 'frozen'
             WHEN CAST(s.from_date AS SIGNED)>UNIX_TIMESTAMP(UTC_DATE()) THEN 'upcoming'
             WHEN CAST(s.to_date AS SIGNED)<UNIX_TIMESTAMP(UTC_DATE()) THEN 'expired' ELSE 'active' END,
        s.private=1,COALESCE(st.related_to_hesas,0)=1,st.hesas_nums_days_num,um.new_user_id,
        COALESCE(s.created_at,CURRENT_TIMESTAMP(3)),COALESCE(s.updated_at,s.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_subscription_members s
      LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.branch_id_fk
      LEFT JOIN ${src}.tbl_members m ON m.mem_id=s.mem_id_fk
      LEFT JOIN ${src}.tbl_subscription_settings st ON st.type_id=s.subscription_type_fk
      LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
       AND mm.legacy_id=CAST(s.mem_id_fk AS CHAR) AND mm.target_table='club_members'
      LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_members'
       AND om.legacy_id=CAST(s.mem_id_fk AS CHAR) AND om.target_table='club_members'
      LEFT JOIN legacy_record_mappings tm ON tm.source_key=${key} AND tm.legacy_table='tbl_subscription_settings'
       AND tm.legacy_id=CAST(s.subscription_type_fk AS CHAR) AND tm.target_table='club_subscription_types'
      LEFT JOIN legacy_employee_mappings em ON em.source_key=${key} AND em.legacy_id=s.emp_id_fk
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.user_id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
       AND lm.legacy_id=CAST(s.subs_id AS CHAR) AND lm.target_table='club_subscriptions'
      WHERE lm.id IS NULL
    `,
    );
    await execute(
      tx,
      `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'tbl_subscription_members',CAST(s.subs_id AS CHAR),'club_subscriptions',
             @legacy_sub_base+s.subs_id,'mapped'
      FROM ${src}.tbl_subscription_members s
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
       AND lm.legacy_id=CAST(s.subs_id AS CHAR) AND lm.target_table='club_subscriptions'
      WHERE lm.id IS NULL
    `,
    );
  });

  await step(
    "33,071 subscription receipts and payment-method ledger rows",
    async (tx) => {
      // The legacy application stored the initial collection directly on
      // tbl_subscription_members (paid, rkm_esal and pay_method).  Receipt numbers
      // restart per branch, so they are not globally unique.  The current ledger
      // requires a unique receipt_number; use the immutable subscription id as the
      // canonical key and retain the original receipt number in the audit details.
      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_receipts t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
        AND lm.target_table='club_receipts' AND t.id IS NULL`,
      );
      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_receipt_payments t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
        AND lm.target_table='club_receipt_payments' AND t.id IS NULL`,
      );

      await execute(
        tx,
        `
      INSERT INTO club_receipts
        (receipt_number,subscription_id,member_id,member_name,branch_id,amount,type,
         payment_method,receipt_date,status,description,created_by,created_at,updated_at)
      SELECT CONCAT('LEG-SUB-',s.subs_id),cs.id,cs.member_id,
        LEFT(COALESCE(NULLIF(cs.customer_name,''),CONCAT('Legacy member ',s.mem_id_fk)),200),
        cs.branch_id,s.paid,'اشتراك',CASE s.pay_method WHEN 2 THEN 'card' ELSE 'cash' END,
        cs.registration_date,'مدفوعة',
        JSON_OBJECT(
          'legacy_table','tbl_subscription_members',
          'legacy_subscription_id',s.subs_id,
          'legacy_receipt_number',s.rkm_esal,
          'legacy_pay_method',s.pay_method
        ),
        cs.created_by,COALESCE(s.created_at,CURRENT_TIMESTAMP(3)),
        COALESCE(s.updated_at,s.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_subscription_members s
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(s.subs_id AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN club_subscriptions cs ON cs.id=sm.target_id
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
       AND lm.legacy_id=CAST(s.subs_id AS CHAR) AND lm.target_table='club_receipts'
      LEFT JOIN club_receipts existing ON existing.receipt_number=CONCAT('LEG-SUB-',s.subs_id)
      WHERE s.paid>0 AND lm.id IS NULL AND existing.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_subscription_members',CAST(s.subs_id AS CHAR),
        'club_receipts',r.id,'mapped',
        JSON_OBJECT(
          'legacy_receipt_number',s.rkm_esal,
          'legacy_pay_method',s.pay_method,
          'canonical_receipt_number',r.receipt_number
        )
      FROM ${src}.tbl_subscription_members s
      JOIN club_receipts r ON r.receipt_number=CONCAT('LEG-SUB-',s.subs_id)
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_members'
       AND lm.legacy_id=CAST(s.subs_id AS CHAR) AND lm.target_table='club_receipts'
      WHERE s.paid>0 AND lm.id IS NULL
    `,
      );

      await execute(
        tx,
        `
      INSERT INTO club_receipt_payments (receipt_id,method,amount,created_at)
      SELECT rm.target_id,CASE s.pay_method WHEN 2 THEN 'card' ELSE 'cash' END,s.paid,
        COALESCE(s.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_subscription_members s
      JOIN legacy_record_mappings rm
        ON rm.source_key=${key} AND rm.legacy_table='tbl_subscription_members'
       AND rm.legacy_id=CAST(s.subs_id AS CHAR) AND rm.target_table='club_receipts'
      LEFT JOIN club_receipt_payments p ON p.receipt_id=rm.target_id
      WHERE s.paid>0 AND p.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_subscription_members',CAST(s.subs_id AS CHAR),
        'club_receipt_payments',p.id,'mapped',
        JSON_OBJECT('legacy_pay_method',s.pay_method,'canonical_method',p.method)
      FROM ${src}.tbl_subscription_members s
      JOIN legacy_record_mappings rm
        ON rm.source_key=${key} AND rm.legacy_table='tbl_subscription_members'
       AND rm.legacy_id=CAST(s.subs_id AS CHAR) AND rm.target_table='club_receipts'
      JOIN club_receipt_payments p ON p.receipt_id=rm.target_id
      LEFT JOIN legacy_record_mappings pm
        ON pm.source_key=${key} AND pm.legacy_table='tbl_subscription_members'
       AND pm.legacy_id=CAST(s.subs_id AS CHAR) AND pm.target_table='club_receipt_payments'
      WHERE s.paid>0 AND pm.id IS NULL
    `,
      );
    },
  );

  await step(
    "subscription freeze, refund and member-transfer history",
    async (tx) => {
      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_subscription_freezes t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_stopped_subscription'
        AND lm.target_table='club_subscription_freezes' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_freeze_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_subscription_freezes)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_subscription_freezes
        (id,subscription_id,freeze_start_date,freeze_end_date,planned_days,actual_days,
         original_end_date,reason,is_active,branch_id,created_by,created_at,updated_at)
      SELECT @legacy_freeze_base+f.stop_id,sm.target_id,
        DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_from AS UNSIGNED)),'%Y-%m-%d'),
        DATE_FORMAT(FROM_UNIXTIME(CAST(f.stop_to AS UNSIGNED)),'%Y-%m-%d'),
        GREATEST(COALESCE(f.stoped_days_writen,0),0),GREATEST(COALESCE(f.stoped_days_writen,0),0),
        cs.subscription_end_date,NULLIF(TRIM(f.stopped_reason),''),
        s.stopped_subscription=1 AND f.stop_id=(
          SELECT MAX(f2.stop_id) FROM ${src}.tbl_stopped_subscription f2
          WHERE f2.subscription_id_fk=f.subscription_id_fk
        ),
        cs.branch_id,um.new_user_id,
        COALESCE(FROM_UNIXTIME(CAST(f.date_added AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3)),
        COALESCE(FROM_UNIXTIME(CAST(f.date_added AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_stopped_subscription f
      JOIN ${src}.tbl_subscription_members s ON s.subs_id=f.subscription_id_fk
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(f.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN club_subscriptions cs ON cs.id=sm.target_id
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=f.user_id
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_stopped_subscription'
       AND lm.legacy_id=CAST(f.stop_id AS CHAR) AND lm.target_table='club_subscription_freezes'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'tbl_stopped_subscription',CAST(f.stop_id AS CHAR),
        'club_subscription_freezes',@legacy_freeze_base+f.stop_id,'mapped'
      FROM ${src}.tbl_stopped_subscription f
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(f.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_stopped_subscription'
       AND lm.legacy_id=CAST(f.stop_id AS CHAR) AND lm.target_table='club_subscription_freezes'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_stopped_subscription',CAST(f.stop_id AS CHAR),
        'legacy_archive',NULL,'archived_only',
        JSON_OBJECT('reason','referenced legacy subscription is missing','subscription_id',f.subscription_id_fk)
      FROM ${src}.tbl_stopped_subscription f
      LEFT JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(f.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_stopped_subscription'
       AND lm.legacy_id=CAST(f.stop_id AS CHAR) AND lm.target_table='legacy_archive'
      WHERE sm.id IS NULL AND lm.id IS NULL
    `,
      );

      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_subscription_refunds t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_subscription_hadback'
        AND lm.target_table='club_subscription_refunds' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_refund_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_subscription_refunds)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_subscription_refunds
        (id,subscription_id,member_id,customer_name,subscription_type,original_start_date,
         original_end_date,stop_date,remaining_days,original_value,daily_rate,refund_amount,
         invoice_number,refund_date,reason,notes,status,branch_id,created_by,created_at)
      SELECT @legacy_refund_base+h.id,cs.id,cs.member_id,cs.customer_name,cs.subscription_type,
        cs.subscription_start_date,cs.subscription_end_date,h.hadback_date,
        GREATEST(DATEDIFF(cs.subscription_end_date,h.hadback_date),0),cs.subscription_value,
        CASE WHEN DATEDIFF(cs.subscription_end_date,cs.subscription_start_date)+1>0
          THEN cs.subscription_value/(DATEDIFF(cs.subscription_end_date,cs.subscription_start_date)+1)
          ELSE 0 END,
        h.hadback_value,CONCAT('LEG-REF-',h.id),h.hadback_date,NULLIF(TRIM(h.notes),''),
        JSON_OBJECT('legacy_hadback_type',h.hadback_type,'legacy_subscription_id',h.subs_id_fk),
        'completed',COALESCE(bm.new_branch_id,cs.branch_id),um.new_user_id,
        COALESCE(FROM_UNIXTIME(CAST(h.date AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_subscription_hadback h
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(h.subs_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN club_subscriptions cs ON cs.id=sm.target_id
      LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=h.branch_id_fk
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=h.publisher
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_hadback'
       AND lm.legacy_id=CAST(h.id AS CHAR) AND lm.target_table='club_subscription_refunds'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'tbl_subscription_hadback',CAST(h.id AS CHAR),
        'club_subscription_refunds',@legacy_refund_base+h.id,'mapped'
      FROM ${src}.tbl_subscription_hadback h
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_subscription_hadback'
       AND lm.legacy_id=CAST(h.id AS CHAR) AND lm.target_table='club_subscription_refunds'
      WHERE lm.id IS NULL
    `,
      );

      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm
      LEFT JOIN club_subscription_transfers t ON t.id=lm.target_id
      WHERE lm.source_key=${key} AND lm.legacy_table='tbl_transformation'
        AND lm.target_table='club_subscription_transfers' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_transfer_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_subscription_transfers)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_subscription_transfers
        (id,subscription_id,member_id,customer_name,from_subscription_type,to_subscription_type,
         from_start_date,from_end_date,to_start_date,to_end_date,from_value,to_value,
         transfer_date,reason,branch_id,created_by,created_at)
      SELECT @legacy_transfer_base+t.id,cs.id,COALESCE(mm.target_id,cs.member_id),
        LEFT(COALESCE(m.name,t.to_member,cs.customer_name),200),cs.subscription_type,
        LEFT(COALESCE(st.title,cs.subscription_type),150),cs.subscription_start_date,
        cs.subscription_end_date,cs.subscription_start_date,cs.subscription_end_date,
        cs.subscription_value,cs.subscription_value,t.date,
        CONCAT('Legacy member transfer: ',t.from_member,' -> ',t.to_member,
          IF(NULLIF(TRIM(t.tahwel_reason),'') IS NULL,'',CONCAT('; reason=',t.tahwel_reason))),
        COALESCE(bm.new_branch_id,cs.branch_id),um.new_user_id,
        COALESCE(FROM_UNIXTIME(CAST(t.date_s AS UNSIGNED)),cs.created_at,CURRENT_TIMESTAMP(3))
      FROM ${src}.tbl_transformation t
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(t.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      JOIN club_subscriptions cs ON cs.id=sm.target_id
      LEFT JOIN ${src}.tbl_members m ON BINARY m.m_code=BINARY t.to_member
      LEFT JOIN legacy_record_mappings mm
        ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
       AND mm.legacy_id=CAST(m.mem_id AS CHAR) AND mm.target_table='club_members'
      LEFT JOIN ${src}.tbl_subscription_settings st ON st.type_id=t.eshtrak_type
      LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=t.branch_id_fk
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=t.publisher
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_transformation'
       AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='club_subscription_transfers'
      WHERE t.type='subscription' AND lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
      SELECT ${runId},${key},'tbl_transformation',CAST(t.id AS CHAR),
        'club_subscription_transfers',@legacy_transfer_base+t.id,'mapped'
      FROM ${src}.tbl_transformation t
      JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(t.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_transformation'
       AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='club_subscription_transfers'
      WHERE t.type='subscription' AND lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_transformation',CAST(t.id AS CHAR),
        'legacy_archive',NULL,'archived_only',
        JSON_OBJECT('reason','referenced legacy subscription is missing','subscription_id',t.subscription_id_fk)
      FROM ${src}.tbl_transformation t
      LEFT JOIN legacy_record_mappings sm
        ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(t.subscription_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
      LEFT JOIN legacy_record_mappings lm
        ON lm.source_key=${key} AND lm.legacy_table='tbl_transformation'
       AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='legacy_archive'
      WHERE t.type='subscription' AND sm.id IS NULL AND lm.id IS NULL
    `,
      );
    },
  );

  await step(
    "226,765 gym attendance rows; other service entries archived by type",
    async (tx) => {
      await execute(
        tx,
        "SET @legacy_att_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_attendance)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_attendance
        (id,member_id,member_code,member_name,subscription_id,subscription_type,branch_id,
         check_in_time,attendance_date,status,notes,created_by,created_at)
      SELECT @legacy_att_base+h.hodoor_id,COALESCE(mm.target_id,om.target_id),
        LEFT(COALESCE(m.m_code,h.member_code,CONCAT('ORPH-L',h.member_id)),30),
        LEFT(COALESCE(m.name,CONCAT('Legacy member ',h.member_id)),200),sm.target_id,LEFT(st.title,150),
        bm.new_branch_id,
        TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED))),COALESCE(h.hdoor_time_24,'00:00:00')),
        DATE_FORMAT(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED)),'%Y-%m-%d'),'checked_in',
        CONCAT('Imported from tbl_hdoor_classes.hodoor_id=',h.hodoor_id),um.new_user_id,
        TIMESTAMP(DATE(FROM_UNIXTIME(CAST(h.hdoor_date_s AS SIGNED))),COALESCE(h.hdoor_time_24,'00:00:00'))
      FROM ${src}.tbl_hdoor_classes h
      LEFT JOIN ${src}.tbl_members m ON m.mem_id=h.member_id
      JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=h.branch_id_fk
      LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
       AND mm.legacy_id=CAST(h.member_id AS CHAR) AND mm.target_table='club_members'
      LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_members'
       AND om.legacy_id=CAST(h.member_id AS CHAR) AND om.target_table='club_members'
      LEFT JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
       AND sm.legacy_id=CAST(h.subs_id AS CHAR) AND sm.target_table='club_subscriptions'
      LEFT JOIN ${src}.tbl_subscription_settings st ON st.type_id=h.subscription_type_fk
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=h.user_id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_hdoor_classes'
       AND lm.legacy_id=CAST(h.hodoor_id AS CHAR) AND lm.target_table='club_attendance'
      WHERE h.type='eshtrak' AND lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_hdoor_classes',CAST(h.hodoor_id AS CHAR),'club_attendance',
        @legacy_att_base+h.hodoor_id,'mapped',JSON_OBJECT('legacy_type',h.type)
      FROM ${src}.tbl_hdoor_classes h
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_hdoor_classes'
       AND lm.legacy_id=CAST(h.hodoor_id AS CHAR) AND lm.target_table='club_attendance'
      WHERE h.type='eshtrak' AND lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `
      INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
      SELECT ${runId},${key},'tbl_hdoor_classes',CAST(h.hodoor_id AS CHAR),'legacy_archive',NULL,
        'archived_only',JSON_OBJECT('legacy_type',COALESCE(h.type,''),'reason','no faithful canonical attendance target')
      FROM ${src}.tbl_hdoor_classes h
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_hdoor_classes'
       AND lm.legacy_id=CAST(h.hodoor_id AS CHAR) AND lm.target_table='legacy_archive'
      WHERE COALESCE(h.type,'')<>'eshtrak' AND lm.id IS NULL
    `,
      );
    },
  );

  await step(
    "lockers, locker types and 492 locker subscriptions",
    async (tx) => {
      await execute(
        tx,
        "SET @legacy_locker_type_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_locker_subscription_types)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_locker_subscription_types
        (id,name,meta_value,mta_value,days,has_stop,stop_days,is_target_based,is_active,created_at,updated_at)
      SELECT @legacy_locker_type_base+t.id,LEFT(t.title,150),COALESCE(MAX(v.value),0),COALESCE(MAX(v.value),0),
        GREATEST(t.num_days_of_locker,1),t.stopped>0,NULLIF(t.num_dayes,0),t.target=1,1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.tbl_locker_types t LEFT JOIN ${src}.tbl_locker_types_values v ON v.locker_type_id_fk=t.id
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_locker_types'
       AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='club_locker_subscription_types'
      WHERE lm.id IS NULL GROUP BY t.id,t.title,t.num_days_of_locker,t.stopped,t.num_dayes,t.target
    `,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'tbl_locker_types',CAST(t.id AS CHAR),'club_locker_subscription_types',@legacy_locker_type_base+t.id
      FROM ${src}.tbl_locker_types t LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='tbl_locker_types' AND lm.legacy_id=CAST(t.id AS CHAR) AND lm.target_table='club_locker_subscription_types'
      WHERE lm.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_locker_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_lockers)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_lockers (id,locker_number,main_branch_id,sub_branch_id,is_available,created_at,updated_at)
      SELECT @legacy_locker_base+n.id,CAST(n.title AS CHAR),bm.new_branch_id,bm.new_branch_id,1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
      FROM ${src}.tbl_locker_number n JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=n.branch_id_fk
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_locker_number'
       AND lm.legacy_id=CAST(n.id AS CHAR) AND lm.target_table='club_lockers' WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'tbl_locker_number',CAST(n.id AS CHAR),'club_lockers',@legacy_locker_base+n.id
      FROM ${src}.tbl_locker_number n LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='tbl_locker_number' AND lm.legacy_id=CAST(n.id AS CHAR) AND lm.target_table='club_lockers'
      WHERE lm.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_locker_sub_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_locker_subscriptions)",
      );
      await execute(
        tx,
        `
      INSERT INTO club_locker_subscriptions
        (id,subscription_number,main_branch_id,sub_branch_id,member_id,customer_name,
         subscription_type_id,subscription_days,subscription_start_date,subscription_end_date,
         subscription_value,discount_enabled,discount_value,paid_amount,locker_id,payment_method,
         gender,recommended_employee_id,receipt_number,status,created_by,created_at,updated_at)
      SELECT @legacy_locker_sub_base+s.id,CONCAT('LEG-L-',s.id),bm.new_branch_id,bm.new_branch_id,mm.target_id,
        LEFT(m.name,200),tm.target_id,t.num_days_of_locker,
        LEFT(s.from_date,10),LEFT(s.to_date,10),s.locker_cost,
        COALESCE(s.discount_value,0)>0,COALESCE(s.discount_value,0),COALESCE(s.paid,0),lmkr.target_id,
        CASE s.pay_method WHEN 2 THEN 'card' ELSE 'cash' END,IF(s.male_or_female=0,'female','male'),
        em.new_employee_id,LEFT(CAST(s.rkm_esal AS CHAR),30),
        CASE WHEN LEFT(s.from_date,10)>UTC_DATE() THEN 'upcoming'
             WHEN LEFT(s.to_date,10)<UTC_DATE() THEN 'expired' ELSE 'active' END,
        um.new_user_id,TIMESTAMP(DATE(FROM_UNIXTIME(CAST(s.date AS SIGNED))),COALESCE(s.time,'00:00:00')),
        TIMESTAMP(DATE(FROM_UNIXTIME(CAST(s.date AS SIGNED))),COALESCE(s.time,'00:00:00'))
      FROM ${src}.tbl_locker_subscription s
      JOIN ${src}.tbl_members m ON m.m_code=s.member_code
      JOIN ${src}.tbl_locker_types t ON t.id=s.subscription_type
      JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.sub_branch_id_fk
      JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members' AND mm.legacy_id=CAST(m.mem_id AS CHAR) AND mm.target_table='club_members'
      JOIN legacy_record_mappings tm ON tm.source_key=${key} AND tm.legacy_table='tbl_locker_types' AND tm.legacy_id=CAST(s.subscription_type AS CHAR) AND tm.target_table='club_locker_subscription_types'
      JOIN legacy_record_mappings lmkr ON lmkr.source_key=${key} AND lmkr.legacy_table='tbl_locker_number' AND lmkr.legacy_id=CAST(s.number_locker_id_fk AS CHAR) AND lmkr.target_table='club_lockers'
      LEFT JOIN legacy_employee_mappings em ON em.source_key=${key} AND em.legacy_id=s.captain_id
      LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.publisher
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_locker_subscription' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='club_locker_subscriptions'
      WHERE lm.id IS NULL
    `,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'tbl_locker_subscription',CAST(s.id AS CHAR),'club_locker_subscriptions',@legacy_locker_sub_base+s.id
      FROM ${src}.tbl_locker_subscription s LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='tbl_locker_subscription' AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='club_locker_subscriptions'
      WHERE lm.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE club_lockers l SET is_available=NOT EXISTS(
      SELECT 1 FROM club_locker_subscriptions s WHERE s.locker_id=l.id AND s.status='active')
      WHERE EXISTS(SELECT 1 FROM legacy_record_mappings m WHERE m.source_key=${key} AND m.target_table='club_lockers' AND m.target_id=l.id)`,
      );
    },
  );

  await step("3,955 InBody measurements", async (tx) => {
    await execute(
      tx,
      "SET @legacy_inbody_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_inbody_measurements)",
    );
    await execute(
      tx,
      `
      INSERT INTO club_inbody_measurements
        (id,member_id,measurement_date,weight,notes,report_url,file_url,created_at,updated_at)
      SELECT @legacy_inbody_base+i.id,COALESCE(mm.target_id,om.target_id),LEFT(i.day_date,10),
        MAX(CASE WHEN d.item_n='الوزن' AND d.from_t REGEXP '^[0-9]+([.][0-9]+)?$' THEN CAST(d.from_t AS DECIMAL(6,2)) END),
        CONCAT('Legacy InBody ',i.id,IF(COUNT(d.id)>0,CONCAT(' | ',GROUP_CONCAT(CONCAT(d.item_n,': ',d.from_t,IF(NULLIF(d.to_t,'') IS NULL,'',CONCAT(' -> ',d.to_t))) ORDER BY d.id SEPARATOR ' | ')),'')),
        LEFT(NULLIF(i.image_path,''),500),LEFT(NULLIF(i.image,''),255),i.created,COALESCE(i.updated,i.created)
      FROM ${src}.tbl_inbody i
      LEFT JOIN ${src}.tbl_inbody_details d ON d.inbody_id_fk=i.id
      LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members' AND mm.legacy_id=CAST(i.mem_id_fk AS CHAR) AND mm.target_table='club_members'
      LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_members' AND om.legacy_id=CAST(COALESCE(i.mem_id_fk,-1) AS CHAR) AND om.target_table='club_members'
      LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_inbody' AND lm.legacy_id=CAST(i.id AS CHAR) AND lm.target_table='club_inbody_measurements'
      WHERE lm.id IS NULL
      GROUP BY i.id,i.mem_id_fk,i.day_date,i.image_path,i.image,i.created,i.updated,mm.target_id,om.target_id
    `,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings (run_id,source_key,legacy_table,legacy_id,target_table,target_id)
      SELECT ${runId},${key},'tbl_inbody',CAST(i.id AS CHAR),'club_inbody_measurements',@legacy_inbody_base+i.id
      FROM ${src}.tbl_inbody i LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key}
       AND lm.legacy_table='tbl_inbody' AND lm.legacy_id=CAST(i.id AS CHAR) AND lm.target_table='club_inbody_measurements'
      WHERE lm.id IS NULL`,
    );
  });

  // Inventory, Cafe/POS and procurement are intentionally implemented in a
  // second script so the high-volume club history can be validated first.
  console.log(
    "Core club import finished. Run migrate-legacy-commerce.ts next.",
  );
}

main()
  .catch(async (error) => {
    console.error(
      "Legacy core import failed; the active step was rolled back.",
    );
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await target.$disconnect();
  });
