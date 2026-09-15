/* eslint-disable no-console */
/**
 * Semantic materialization for legacy datasets whose table names changed in
 * the rebuilt app. The raw archive remains immutable; every source row gets a
 * stable mapping and every step is transactional and safe to rerun.
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type IdRow = { id: number };
type EmployeeColumnRow = {
  column_name: string;
  target_type: string;
  target_length: bigint | number | null;
};

const EMPLOYEE_REFERENCE_COLUMNS: Array<[string, string]> = [
  ["emp_badlat_discount_details", "emp_id"],
  ["emp_evaluation", "emp_id"],
  ["emp_files", "emp_id"],
  ["employees_branches", "emp_id_fk"],
  ["hr_all_agzat_orders", "emp_id_fk"],
  ["hr_all_ozonat_orders", "emp_id_fk"],
  ["hr_disclaimers", "emp_id_fk"],
  ["hr_disclaimers", "responsible_emp_id"],
  ["hr_emp_dwam", "emp_id"],
  ["hr_emp_dwam_details", "emp_id"],
  ["hr_entdab", "emp_id_fk"],
  ["hr_finance_employes", "emp_id"],
  ["hr_mosayer", "emp_id_fk"],
  ["hr_mosayer_details", "emp_id"],
  ["hr_mosayer_egraat", "emp_id"],
  ["hr_mosayer_tamenat", "emp_id_fk"],
  ["hr_mosayer_tamenat_details", "emp_id"],
  ["hr_mosayer_tamenat_egraat", "emp_id"],
  ["hr_solaf", "emp_id_fk"],
  ["hr_solaf_emp_hesbat", "emp_id"],
  ["hr_solaf_ta3gel", "emp_id_fk"],
  ["hr_solaf_tagel", "emp_id_fk"],
  ["hr_tayi_qyed", "emp_id"],
];

const target = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  if (!name) throw new Error("DATABASE_URL has no database name");
  return name;
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value))
    throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${value}\``;
}

function literal(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

async function execute(
  tx: Prisma.TransactionClient,
  sql: string,
): Promise<number> {
  return tx.$executeRawUnsafe(sql);
}

async function one<T>(sql: string): Promise<T> {
  const rows = await target.$queryRawUnsafe<T[]>(sql);
  if (rows.length !== 1)
    throw new Error(`Expected one row, received ${rows.length}`);
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
      await execute(tx, "SET time_zone='+00:00'");
      await execute(tx, "SET collation_connection='utf8mb4_unicode_ci'");
      await work(tx);
    },
    { maxWait: 30_000, timeout: 1_800_000 },
  );
  console.log(`    ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

async function main(): Promise<void> {
  const targetDatabase = databaseName(required("DATABASE_URL"));
  const sourceDatabase = required("LEGACY_DATABASE");
  const sourceKey = required("LEGACY_SOURCE_KEY");
  const dumpSha = required("LEGACY_DUMP_SHA256").toLowerCase();
  if (sourceDatabase === targetDatabase)
    throw new Error("Legacy and target databases must differ");
  if (!/^[a-f0-9]{64}$/.test(dumpSha))
    throw new Error("LEGACY_DUMP_SHA256 must be 64 hex characters");

  const src = identifier(sourceDatabase);
  const key = literal(sourceKey);
  const run = await one<IdRow>(
    `SELECT id FROM legacy_import_runs WHERE source_key=${key} AND dump_sha256=${literal(dumpSha)}`,
  );
  const runId = run.id;
  console.log(`=== Legacy secondary semantic import: run ${runId} ===`);

  const employeeColumns = await target.$queryRawUnsafe<EmployeeColumnRow[]>(`
    SELECT s.column_name AS column_name,t.data_type AS target_type,
      t.character_maximum_length AS target_length
    FROM information_schema.columns s
    JOIN information_schema.columns t ON t.table_schema=${literal(targetDatabase)}
     AND t.table_name='employees' AND t.column_name=s.column_name
    WHERE s.table_schema=${literal(sourceDatabase)} AND s.table_name='employees'
     AND s.column_name<>'id'
    ORDER BY s.ordinal_position
  `);
  const employeeTargetColumns = employeeColumns.map((row) =>
    identifier(row.column_name),
  );
  const employeeSelectColumns = employeeColumns.map((row) => {
    const column = identifier(row.column_name);
    if (row.column_name === "emp_code") {
      return `CASE WHEN TRIM(s.${column}) REGEXP '^-?[0-9]+$' THEN CAST(s.${column} AS SIGNED) ELSE NULL END`;
    }
    const length = Number(row.target_length ?? 0);
    if (["char", "varchar", "enum"].includes(row.target_type) && length > 0) {
      return `LEFT(s.${column},${length})`;
    }
    return `s.${column}`;
  });

  await step(
    "authoritative HR employees and employee-linked HR history",
    async (tx) => {
      await execute(
        tx,
        `DELETE lm FROM legacy_record_mappings lm LEFT JOIN employees t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.legacy_table='employees'
        AND lm.target_table='employees' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_hr_employee_base=(SELECT COALESCE(MAX(id),0)+1000 FROM employees)",
      );
      await execute(
        tx,
        `INSERT INTO employees
        (id,${employeeTargetColumns.join(",")},demo_card,shahadt_jaish,tamin_rkm,khedma_year)
       SELECT @legacy_hr_employee_base+s.id,${employeeSelectColumns.join(",")},
        LEFT(COALESCE(NULLIF(CAST(s.card_num AS CHAR),''),CONCAT('LEGHR-',s.id)),15),'no',0,0
       FROM ${src}.employees s
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='employees'
        AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='employees'
       WHERE lm.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'employees',CAST(s.id AS CHAR),'employees',@legacy_hr_employee_base+s.id,'mapped',
        JSON_OBJECT('source_emp_code',s.emp_code,'source_show_in_taqeem',s.show_in_taqeem,
          'source_personal_photo_path',s.personal_photo_path)
       FROM ${src}.employees s
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='employees'
        AND lm.legacy_id=CAST(s.id AS CHAR) AND lm.target_table='employees'
       WHERE lm.id IS NULL`,
      );

      for (const [table, column] of EMPLOYEE_REFERENCE_COLUMNS) {
        const primaryColumns = await tx.$queryRawUnsafe<
          Array<{ column_name: string }>
        >(`
        SELECT k.column_name AS column_name
        FROM information_schema.table_constraints c
        JOIN information_schema.key_column_usage k ON k.constraint_schema=c.constraint_schema
         AND k.table_name=c.table_name AND k.constraint_name=c.constraint_name
        WHERE c.constraint_schema=${literal(targetDatabase)} AND c.table_name=${literal(table)}
         AND c.constraint_type='PRIMARY KEY'
        ORDER BY k.ordinal_position
      `);
        if (primaryColumns.length === 0) continue;
        const join = primaryColumns
          .map(
            (row) =>
              `t.${identifier(row.column_name)}=s.${identifier(row.column_name)}`,
          )
          .join(" AND ");
        await execute(
          tx,
          `UPDATE ${identifier(table)} t JOIN ${src}.${identifier(table)} s ON ${join}
         JOIN legacy_record_mappings em ON em.source_key=${key} AND em.legacy_table='employees'
          AND em.legacy_id=CAST(s.${identifier(column)} AS CHAR) AND em.target_table='employees'
         SET t.${identifier(column)}=em.target_id
         WHERE NOT (t.${identifier(column)}<=>em.target_id)`,
        );
      }

      await execute(
        tx,
        `UPDATE legacy_table_reconciliations SET mapped_rows=(
         SELECT COUNT(*) FROM legacy_record_mappings m WHERE m.source_key=${key}
          AND m.legacy_table='employees' AND m.target_table='employees'),
       notes='Materialized into the canonical employees roster; HR references remapped; raw table retained in archive.',
       checked_at=CURRENT_TIMESTAMP(3)
       WHERE run_id=${runId} AND source_table='employees'`,
      );
    },
  );

  await step("mobile-app profile, ads, news and offers", async (tx) => {
    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_about_app t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_about_app' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_about_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_about_app)",
    );
    await execute(
      tx,
      `INSERT INTO am_about_app
        (id,app_name,description,contact_email,contact_phone,website,privacy_policy,created_at,updated_at)
       SELECT @legacy_about_base+a.app_id,
        LEFT(COALESCE(NULLIF(TRIM(a.app_name),''),'Ana Noamany'),255),a.about_app,
        LEFT(NULLIF(TRIM(c.email),''),255),LEFT(NULLIF(TRIM(COALESCE(c.hp,c.telepon)),''),50),
        LEFT(NULLIF(TRIM(c.website),''),255),a.privacy_policy,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_app_info a
       LEFT JOIN ${src}.conf_company_data c ON c.id_config=(SELECT MIN(id_config) FROM ${src}.conf_company_data)
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_app_info'
        AND lm.legacy_id=CAST(a.app_id AS CHAR) AND lm.target_table='am_about_app'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_app_info',CAST(a.app_id AS CHAR),'am_about_app',
        @legacy_about_base+a.app_id,'mapped',JSON_OBJECT('legacy_app_logo',a.app_logo)
       FROM ${src}.tbl_app_info a
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_app_info'
        AND lm.legacy_id=CAST(a.app_id AS CHAR) AND lm.target_table='am_about_app'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_ads t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_ads' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_ad_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_ads)",
    );
    await execute(
      tx,
      `INSERT INTO am_ads
        (id,title,description,image_url,start_date,end_date,is_active,created_at,updated_at)
       SELECT @legacy_ad_base+a.id,LEFT(COALESCE(NULLIF(TRIM(a.title),''),CONCAT('Legacy ad ',a.id)),255),
        a.details,LEFT(NULLIF(TRIM(a.image_path),''),500),LEFT(a.from_date,10),LEFT(a.to_date,10),
        CASE WHEN a.from_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
               AND a.to_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN UTC_DATE() BETWEEN a.from_date AND a.to_date ELSE 1 END,
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_ads a
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_ads'
        AND lm.legacy_id=CAST(a.id AS CHAR) AND lm.target_table='am_ads'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_ads',CAST(a.id AS CHAR),'am_ads',@legacy_ad_base+a.id,'mapped'
       FROM ${src}.tbl_ads a
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_ads'
        AND lm.legacy_id=CAST(a.id AS CHAR) AND lm.target_table='am_ads'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN club_trainers t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.legacy_table='tbl_captains'
        AND lm.target_table='club_trainers' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_club_trainer_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_trainers)",
    );
    await execute(
      tx,
      `INSERT INTO club_trainers
        (id,name,specialization,bio,image_url,rating_avg,is_active,is_deleted,created_at,updated_at)
       SELECT @legacy_club_trainer_base+c.id,
        LEFT(COALESCE(NULLIF(TRIM(c.name),''),CONCAT('Legacy trainer ',c.id)),200),
        LEFT(NULLIF(TRIM(SUBSTRING_INDEX(REPLACE(c.about,'\\r',''),'\\n',-1)),''),200),
        c.about,LEFT(NULLIF(TRIM(c.main_image),''),255),0,1,0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_captains c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_captains'
        AND lm.legacy_id=CAST(c.id AS CHAR) AND lm.target_table='club_trainers'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_captains',CAST(c.id AS CHAR),'club_trainers',
        @legacy_club_trainer_base+c.id,'mapped',JSON_OBJECT('employee_link','not inferred; names use a different alphabet')
       FROM ${src}.tbl_captains c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_captains'
        AND lm.legacy_id=CAST(c.id AS CHAR) AND lm.target_table='club_trainers'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_news t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_news' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_news_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_news)",
    );
    await execute(
      tx,
      `INSERT INTO am_news
        (id,title,content,publish_date,image_url,is_published,created_at,updated_at)
       SELECT @legacy_news_base+n.news_id,
        LEFT(COALESCE(NULLIF(TRIM(n.news_title_ar),''),NULLIF(TRIM(n.news_title),''),CONCAT('Legacy news ',n.news_id)),255),
        COALESCE(NULLIF(TRIM(n.details_ar),''),NULLIF(TRIM(n.details),''),''),LEFT(n.news_date,10),
        LEFT(NULLIF(TRIM(n.image),''),500),n.status='activ',n.created,COALESCE(n.updated,n.created)
       FROM ${src}.tbl_news n
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_news'
        AND lm.legacy_id=CAST(n.news_id AS CHAR) AND lm.target_table='am_news'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_news',CAST(n.news_id AS CHAR),'am_news',@legacy_news_base+n.news_id,'mapped'
       FROM ${src}.tbl_news n
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_news'
        AND lm.legacy_id=CAST(n.news_id AS CHAR) AND lm.target_table='am_news'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_offers t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_offers' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_offer_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_offers)",
    );
    await execute(
      tx,
      `INSERT INTO am_offers
        (id,title,description,image_url,discount,start_date,end_date,is_active,created_at,updated_at)
       SELECT @legacy_offer_base+o.offer_id,LEFT(COALESCE(NULLIF(TRIM(o.offer_name),''),CONCAT('Legacy offer ',o.offer_id)),255),
        CONCAT_WS('\n',NULLIF(TRIM(o.sub_title),''),NULLIF(TRIM(o.offer_details),'')),
        LEFT(NULLIF(TRIM(o.image),''),500),o.offer_value,LEFT(o.from_date,10),LEFT(o.to_date,10),
        o.status='activ',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_offers o
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_offers'
        AND lm.legacy_id=CAST(o.offer_id AS CHAR) AND lm.target_table='am_offers'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_offers',CAST(o.offer_id AS CHAR),'am_offers',@legacy_offer_base+o.offer_id,'mapped'
       FROM ${src}.tbl_offers o
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_offers'
        AND lm.legacy_id=CAST(o.offer_id AS CHAR) AND lm.target_table='am_offers'
       WHERE lm.id IS NULL`,
    );
  });

  await step("mobile-app trainers and exercises", async (tx) => {
    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_trainers t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_trainers' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_trainer_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_trainers)",
    );
    await execute(
      tx,
      `INSERT INTO am_trainers
        (id,name,bio,image_url,is_active,created_at,updated_at)
       SELECT @legacy_trainer_base+c.id,LEFT(COALESCE(NULLIF(TRIM(c.name),''),CONCAT('Legacy trainer ',c.id)),255),
        c.about,LEFT(NULLIF(TRIM(c.main_image),''),500),1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_captains c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_captains'
        AND lm.legacy_id=CAST(c.id AS CHAR) AND lm.target_table='am_trainers'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_captains',CAST(c.id AS CHAR),'am_trainers',@legacy_trainer_base+c.id,'mapped'
       FROM ${src}.tbl_captains c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_captains'
        AND lm.legacy_id=CAST(c.id AS CHAR) AND lm.target_table='am_trainers'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_exercise_categories t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_exercise_categories' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_exercise_category_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_exercise_categories)",
    );
    await execute(
      tx,
      `INSERT INTO am_exercise_categories (id,name,is_active,created_at,updated_at)
       SELECT @legacy_exercise_category_base+c.cat_id,
        LEFT(COALESCE(NULLIF(TRIM(c.cat_name),''),CONCAT('Legacy category ',c.cat_id)),255),1,
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_tmaren_cats c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren_cats'
        AND lm.legacy_id=CAST(c.cat_id AS CHAR) AND lm.target_table='am_exercise_categories'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_tmaren_cats',CAST(c.cat_id AS CHAR),'am_exercise_categories',
        @legacy_exercise_category_base+c.cat_id,'mapped'
       FROM ${src}.tbl_tmaren_cats c
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren_cats'
        AND lm.legacy_id=CAST(c.cat_id AS CHAR) AND lm.target_table='am_exercise_categories'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_exercises t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_exercises' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_exercise_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_exercises)",
    );
    await execute(
      tx,
      `INSERT INTO am_exercises
        (id,name,category_id,description,instructions,difficulty,image_url,is_active,created_at,updated_at)
       SELECT @legacy_exercise_base+e.id,
        LEFT(COALESCE(NULLIF(TRIM(e.title),''),CONCAT('Legacy exercise ',e.id)),255),cm.target_id,
        NULLIF(TRIM(e.tamren_for),''),
        CONCAT_WS('\n',NULLIF(TRIM(e.instructions),''),
          CONCAT('المجموعات: ',e.magmo3at,' | التكرارات: ',e.tkrar,' | الراحة بالثواني: ',e.rest_in_sec),
          CASE WHEN imgs.all_images IS NULL THEN NULL ELSE CONCAT('صور التمرين القديمة: ',imgs.all_images) END),
        CASE WHEN e.tamren_for LIKE '%مبتد%' THEN 'easy'
             WHEN e.tamren_for LIKE '%محترف%' THEN 'hard' ELSE 'medium' END,
        LEFT(imgs.first_image,500),1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_tmaren e
       JOIN legacy_record_mappings cm ON cm.source_key=${key} AND cm.legacy_table='tbl_tmaren_cats'
        AND cm.legacy_id=CAST(e.cat_id_fk AS CHAR) AND cm.target_table='am_exercise_categories'
       LEFT JOIN (
         SELECT tamren_id_fk,MIN(COALESCE(NULLIF(image_path,''),NULLIF(image,''))) first_image,
          GROUP_CONCAT(COALESCE(NULLIF(image_path,''),NULLIF(image,'')) ORDER BY img_id SEPARATOR ', ') all_images
         FROM ${src}.tbl_tmaren_images GROUP BY tamren_id_fk
       ) imgs ON imgs.tamren_id_fk=e.id
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren'
        AND lm.legacy_id=CAST(e.id AS CHAR) AND lm.target_table='am_exercises'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_tmaren',CAST(e.id AS CHAR),'am_exercises',@legacy_exercise_base+e.id,'mapped'
       FROM ${src}.tbl_tmaren e
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren'
        AND lm.legacy_id=CAST(e.id AS CHAR) AND lm.target_table='am_exercises'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_tmaren_images',CAST(i.img_id AS CHAR),'am_exercises',em.target_id,'embedded',
        JSON_OBJECT('image',i.image,'image_path',i.image_path)
       FROM ${src}.tbl_tmaren_images i
       JOIN legacy_record_mappings em ON em.source_key=${key} AND em.legacy_table='tbl_tmaren'
        AND em.legacy_id=CAST(i.tamren_id_fk AS CHAR) AND em.target_table='am_exercises'
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren_images'
        AND lm.legacy_id=CAST(i.img_id AS CHAR) AND lm.target_table='am_exercises'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_tmaren_images',CAST(i.img_id AS CHAR),'legacy_archive',NULL,'archived_only',
        JSON_OBJECT('reason','referenced legacy exercise is missing','legacy_exercise_id',i.tamren_id_fk,
          'image',i.image,'image_path',i.image_path)
       FROM ${src}.tbl_tmaren_images i
       LEFT JOIN ${src}.tbl_tmaren e ON e.id=i.tamren_id_fk
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_tmaren_images'
        AND lm.legacy_id=CAST(i.img_id AS CHAR) AND lm.target_table='legacy_archive'
       WHERE e.id IS NULL AND lm.id IS NULL`,
    );
  });

  await step("2,960 member invitations", async (tx) => {
    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN am_invitations t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='am_invitations' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_invitation_base=(SELECT COALESCE(MAX(id),0)+1000 FROM am_invitations)",
    );
    await execute(
      tx,
      `INSERT INTO am_invitations
        (id,invitation_code,recipient_name,recipient_phone,inviter_member_id,sent_date,status,
         accepted_date,rejected_date,attendance_date,branch_id,created_at,updated_at)
       SELECT @legacy_invitation_base+i.inv_id,CONCAT('LEG-INV-',i.inv_id),
        LEFT(COALESCE(NULLIF(TRIM(i.person_name),''),CONCAT('Legacy invitee ',i.inv_id)),255),
        LEFT(NULLIF(TRIM(i.phone),''),50),mm.target_id,
        COALESCE(STR_TO_DATE(CONCAT(i.inv_date,' ',UPPER(i.inv_time)),'%Y-%m-%d %h:%i %p'),
                 STR_TO_DATE(i.inv_date,'%Y-%m-%d'),CURRENT_TIMESTAMP(3)),
        CASE WHEN NULLIF(TRIM(i.hdoor_date),'') IS NOT NULL THEN 'attended'
             WHEN i.inv_action='accepted' THEN 'accepted'
             WHEN i.inv_action='refused' THEN 'rejected' ELSE 'pending' END,
        CASE WHEN i.inv_action='accepted' THEN
          COALESCE(STR_TO_DATE(CONCAT(i.act_date,' ',UPPER(i.act_time)),'%Y-%m-%d %h:%i %p'),
                   STR_TO_DATE(i.act_date,'%Y-%m-%d')) END,
        CASE WHEN i.inv_action='refused' THEN
          COALESCE(STR_TO_DATE(CONCAT(i.act_date,' ',UPPER(i.act_time)),'%Y-%m-%d %h:%i %p'),
                   STR_TO_DATE(i.act_date,'%Y-%m-%d')) END,
        CASE WHEN NULLIF(TRIM(i.hdoor_date),'') IS NOT NULL THEN
          COALESCE(STR_TO_DATE(CONCAT(i.hdoor_date,' ',UPPER(COALESCE(i.hdoor_time,''))),'%Y-%m-%d %h:%i %p'),
                   STR_TO_DATE(i.hdoor_date,'%Y-%m-%d')) END,
        bm.new_branch_id,
        COALESCE(STR_TO_DATE(CONCAT(i.inv_date,' ',UPPER(i.inv_time)),'%Y-%m-%d %h:%i %p'),
                 STR_TO_DATE(i.inv_date,'%Y-%m-%d'),CURRENT_TIMESTAMP(3)),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_invitations i
       LEFT JOIN ${src}.tbl_members m ON m.mem_id=i.mem_id
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(i.mem_id AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=m.branch_id_fk
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_invitations'
        AND lm.legacy_id=CAST(i.inv_id AS CHAR) AND lm.target_table='am_invitations'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_invitations',CAST(i.inv_id AS CHAR),'am_invitations',
        @legacy_invitation_base+i.inv_id,'mapped',
        JSON_OBJECT('legacy_member_id',i.mem_id,'legacy_action',i.inv_action)
       FROM ${src}.tbl_invitations i
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_invitations'
        AND lm.legacy_id=CAST(i.inv_id AS CHAR) AND lm.target_table='am_invitations'
       WHERE lm.id IS NULL`,
    );
  });

  await step("6,952 operational expense bills", async (tx) => {
    await execute(
      tx,
      `INSERT INTO fin_expense_categories (name,is_active,is_system,created_at,updated_at)
       SELECT LEFT(TRIM(b.name),60),1,0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.expense_bnod b
       WHERE NULLIF(TRIM(b.name),'') IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM fin_expense_categories c WHERE TRIM(c.name)=TRIM(b.name))`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'expense_bnod',CAST(b.band_id AS CHAR),'fin_expense_categories',c.id,'mapped'
       FROM ${src}.expense_bnod b
       JOIN fin_expense_categories c ON TRIM(c.name)=TRIM(b.name)
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='expense_bnod'
        AND lm.legacy_id=CAST(b.band_id AS CHAR) AND lm.target_table='fin_expense_categories'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN fin_expenses t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='fin_expenses' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_expense_base=(SELECT COALESCE(MAX(id),0)+1000 FROM fin_expenses)",
    );
    await execute(
      tx,
      `INSERT INTO fin_expenses
        (id,expense_number,expense_date,category,amount,tax_amount,total_amount,payment_method,
         payment_status,approval_status,approved_by,approved_at,description,invoice_number,branch_id,
         attachments,notes,created_by,is_deleted,created_at,updated_at)
       SELECT @legacy_expense_base+e.bill_id,CONCAT('LEG-EXP-',e.bill_id),LEFT(e.bill_date,10),
        LEFT(COALESCE(NULLIF(TRIM(b.name),''),'مصروف قديم غير مصنف'),60),e.value,0,e.value,'نقدي',
        'مدفوع','معتمد',um.new_user_id,e.created,NULLIF(TRIM(e.notes),''),LEFT(CAST(e.bill_rkm AS CHAR),100),
        bm.new_branch_id,CASE WHEN NULLIF(TRIM(e.image),'') IS NULL THEN NULL ELSE JSON_ARRAY(e.image) END,
        CONCAT('Legacy bill_id=',e.bill_id,'; type=',COALESCE(e.type,0),'; ratio=',COALESCE(e.bill_ratio,0),
          '; main_value=',COALESCE(e.main_value,0),'; percentage=',COALESCE(e.nesba,0),
          '; parent_id=',COALESCE(e.parent_id,0)),um.new_user_id,0,e.created,COALESCE(e.updated,e.created)
       FROM ${src}.tbl_expense_bills e
       LEFT JOIN ${src}.expense_bnod b ON b.band_id=e.band_id
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=e.branch_id_fk
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=e.user_id
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_expense_bills'
        AND lm.legacy_id=CAST(e.bill_id AS CHAR) AND lm.target_table='fin_expenses'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_expense_bills',CAST(e.bill_id AS CHAR),'fin_expenses',
        @legacy_expense_base+e.bill_id,'mapped',JSON_OBJECT('legacy_receipt_number',e.bill_rkm,'legacy_branch_id',e.branch_id_fk)
       FROM ${src}.tbl_expense_bills e
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_expense_bills'
        AND lm.legacy_id=CAST(e.bill_id AS CHAR) AND lm.target_table='fin_expenses'
       WHERE lm.id IS NULL`,
    );
  });

  await step("371 warehouse transfers and 1,276 transfer items", async (tx) => {
    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN inv_transactions t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='inv_transactions' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_transfer_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_transactions)",
    );
    await execute(
      tx,
      `INSERT INTO inv_transactions
        (id,reference,txn_type,status,txn_date,source_warehouse_id,target_warehouse_id,branch_id,total_amount,
         notes,reason,created_by,approved_by,approved_at,is_deleted,created_at,updated_at)
       SELECT @legacy_transfer_base+h.id,CONCAT('LEG-TRF-',h.id),'transfer','approved',
        COALESCE(STR_TO_DATE(CONCAT(h.order_date_ar,' ',UPPER(h.order_time)),'%Y-%m-%d %h:%i %p'),
                 STR_TO_DATE(h.order_date_ar,'%Y-%m-%d'),FROM_UNIXTIME(h.order_date)),
        sw.target_id,tw.target_id,w.branch_id,0,
        CONCAT('Legacy transfer number ',COALESCE(h.rkm,h.id),' | ',COALESCE(h.from_storage_n,''),' -> ',
          COALESCE(h.to_storage_n,''),' | publisher: ',COALESCE(h.publisher_name,'')),NULLIF(TRIM(h.reason),''),
        um.new_user_id,um.new_user_id,
        COALESCE(STR_TO_DATE(CONCAT(h.order_date_ar,' ',UPPER(h.order_time)),'%Y-%m-%d %h:%i %p'),
                 STR_TO_DATE(h.order_date_ar,'%Y-%m-%d'),FROM_UNIXTIME(h.order_date)),0,
        COALESCE(STR_TO_DATE(CONCAT(h.order_date_ar,' ',UPPER(h.order_time)),'%Y-%m-%d %h:%i %p'),
                 STR_TO_DATE(h.order_date_ar,'%Y-%m-%d'),FROM_UNIXTIME(h.order_date)),CURRENT_TIMESTAMP(3)
       FROM ${src}.store_tahwelat h
       JOIN legacy_record_mappings sw ON sw.source_key=${key} AND sw.legacy_table='store_branch_settings'
        AND sw.legacy_id=CAST(h.from_storage AS CHAR) AND sw.target_table='inv_warehouses'
       JOIN legacy_record_mappings tw ON tw.source_key=${key} AND tw.legacy_table='store_branch_settings'
        AND tw.legacy_id=CAST(h.to_storage AS CHAR) AND tw.target_table='inv_warehouses'
       JOIN inv_warehouses w ON w.id=tw.target_id
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key}
        AND um.legacy_id=CASE WHEN h.publisher REGEXP '^[0-9]+$' THEN CAST(h.publisher AS UNSIGNED) ELSE -1 END
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_tahwelat'
        AND lm.legacy_id=CAST(h.id AS CHAR) AND lm.target_table='inv_transactions'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'store_tahwelat',CAST(h.id AS CHAR),'inv_transactions',
        @legacy_transfer_base+h.id,'mapped',JSON_OBJECT('legacy_transfer_number',h.rkm)
       FROM ${src}.store_tahwelat h
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_tahwelat'
        AND lm.legacy_id=CAST(h.id AS CHAR) AND lm.target_table='inv_transactions'
       WHERE lm.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE lm FROM legacy_record_mappings lm LEFT JOIN inv_transaction_items t ON t.id=lm.target_id
       WHERE lm.source_key=${key} AND lm.target_table='inv_transaction_items' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_transfer_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_transaction_items)",
    );
    await execute(
      tx,
      `INSERT INTO inv_transaction_items
        (id,transaction_id,product_id,item_code,item_name,quantity,unit,price,total,notes)
       SELECT @legacy_transfer_item_base+i.id,hm.target_id,COALESCE(pm.target_id,op.target_id),
        LEFT(CAST(i.sanf_code AS CHAR),50),LEFT(COALESCE(NULLIF(TRIM(i.sanf_n),''),CONCAT('Legacy item ',i.sanf_id)),255),
        i.amount_send,NULL,0,0,CONCAT('Legacy available quantity before transfer: ',COALESCE(i.amount_motah,0))
       FROM ${src}.store_tahwelat_asnaf i
       JOIN (
         SELECT rkm,from_storage,to_storage,MIN(id) legacy_header_id
         FROM ${src}.store_tahwelat GROUP BY rkm,from_storage,to_storage
       ) h ON h.rkm=i.rkm_fk AND h.from_storage=i.from_storage AND h.to_storage=i.to_storage
       JOIN legacy_record_mappings hm ON hm.source_key=${key} AND hm.legacy_table='store_tahwelat'
        AND hm.legacy_id=CAST(h.legacy_header_id AS CHAR) AND hm.target_table='inv_transactions'
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(i.sanf_id AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products'
        AND op.legacy_id=CONCAT('id:',i.sanf_id) AND op.target_table='inv_products'
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_tahwelat_asnaf'
        AND lm.legacy_id=CAST(i.id AS CHAR) AND lm.target_table='inv_transaction_items'
       WHERE lm.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'store_tahwelat_asnaf',CAST(i.id AS CHAR),'inv_transaction_items',
        @legacy_transfer_item_base+i.id,'mapped',JSON_OBJECT('legacy_transfer_number',i.rkm_fk,'legacy_product_id',i.sanf_id)
       FROM ${src}.store_tahwelat_asnaf i
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_tahwelat_asnaf'
        AND lm.legacy_id=CAST(i.id AS CHAR) AND lm.target_table='inv_transaction_items'
       WHERE lm.id IS NULL`,
    );
  });

  await step("semantic reconciliation rows", async (tx) => {
    const mappings = [
      ["tbl_app_info", "am_about_app"],
      ["tbl_ads", "am_ads"],
      ["tbl_news", "am_news"],
      ["tbl_offers", "am_offers"],
      ["tbl_captains", "am_trainers"],
      ["tbl_tmaren_cats", "am_exercise_categories"],
      ["tbl_tmaren", "am_exercises"],
      ["tbl_invitations", "am_invitations"],
      ["expense_bnod", "fin_expense_categories"],
      ["tbl_expense_bills", "fin_expenses"],
      ["store_tahwelat", "inv_transactions"],
      ["store_tahwelat_asnaf", "inv_transaction_items"],
    ] as const;
    for (const [sourceTable, targetTable] of mappings) {
      await execute(
        tx,
        `DELETE FROM legacy_table_reconciliations WHERE run_id=${runId} AND source_table=${literal(sourceTable)}`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_table_reconciliations
          (run_id,source_table,target_table,source_rows,mapped_rows,archived_rows,error_rows,notes,checked_at)
         SELECT ${runId},${literal(sourceTable)},${literal(targetTable)},s.n,m.n,s.n,s.n-m.n,
          'Semantically materialized in the renamed app table; exact raw rows remain in the immutable archive.',
          CURRENT_TIMESTAMP(3)
         FROM (SELECT COUNT(*) n FROM ${src}.${identifier(sourceTable)}) s
         CROSS JOIN (SELECT COUNT(*) n FROM legacy_record_mappings WHERE source_key=${key}
          AND legacy_table=${literal(sourceTable)} AND target_table=${literal(targetTable)}) m`,
      );
    }
    await execute(
      tx,
      `DELETE FROM legacy_table_reconciliations WHERE run_id=${runId} AND source_table='tbl_tmaren_images'`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_table_reconciliations
        (run_id,source_table,target_table,source_rows,mapped_rows,archived_rows,error_rows,notes,checked_at)
       SELECT ${runId},'tbl_tmaren_images','am_exercises/legacy_archive',s.n,m.n,s.n,0,
        CONCAT(m.embedded,' image(s) embedded in exercises; ',m.archived_only,
          ' orphan image(s) retained exactly because the referenced legacy exercise is missing.'),CURRENT_TIMESTAMP(3)
       FROM (SELECT COUNT(*) n FROM ${src}.tbl_tmaren_images) s
       CROSS JOIN (SELECT COUNT(*) n,SUM(target_table='am_exercises') embedded,
          SUM(target_table='legacy_archive') archived_only
        FROM legacy_record_mappings WHERE source_key=${key} AND legacy_table='tbl_tmaren_images'
         AND target_table IN ('am_exercises','legacy_archive')) m`,
    );
  });

  console.log("Legacy secondary semantic import finished.");
}

main()
  .catch((error) => {
    console.error(
      "Legacy secondary semantic import failed; the active step was rolled back.",
    );
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => target.$disconnect());
