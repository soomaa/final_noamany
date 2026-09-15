/* eslint-disable no-console */
/**
 * Materialize legacy operational history that cannot be represented by the
 * first-pass canonical import. Every step is append-only, transactional and
 * rerunnable through legacy_record_mappings.
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type IdRow = { id: number };

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databaseName(url: string): string {
  const value = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  if (!value) throw new Error("DATABASE_URL has no database name");
  return value;
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
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
  const rows = await prisma.$queryRawUnsafe<T[]>(sql);
  if (rows.length !== 1) {
    throw new Error(`Expected one row, received ${rows.length}`);
  }
  return rows[0];
}

async function step(
  label: string,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const started = Date.now();
  console.log(`==> ${label}`);
  await prisma.$transaction(
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
  if (targetDatabase === sourceDatabase) {
    throw new Error("Legacy and target databases must differ");
  }

  const src = identifier(sourceDatabase);
  const key = literal(sourceKey);
  const run = await one<IdRow>(
    `SELECT id FROM legacy_import_runs WHERE source_key=${key} AND dump_sha256=${literal(dumpSha)}`,
  );
  const runId = run.id;
  console.log(`=== Legacy operational-gap import: run ${runId} ===`);

  await step(
    "HR catalogs, hierarchy and employee reference repair",
    async (tx) => {
      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN cities t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='cities' AND m.target_table='cities' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_city_base=(SELECT COALESCE(MAX(id),0)+1000 FROM cities)",
      );
      await execute(
        tx,
        `INSERT INTO cities (id,name,from_id_fk,in_order)
       SELECT @legacy_city_base+s.id,LEFT(s.name,300),0,s.in_order
       FROM ${src}.cities s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='cities' AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='cities'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'cities',CAST(s.id AS CHAR),'cities',@legacy_city_base+s.id,'mapped'
       FROM ${src}.cities s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='cities' AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='cities'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE cities t
       JOIN legacy_record_mappings self ON self.source_key=${key} AND self.legacy_table='cities'
        AND self.target_table='cities' AND self.target_id=t.id
       JOIN ${src}.cities s ON CAST(s.id AS CHAR)=self.legacy_id
       LEFT JOIN legacy_record_mappings parent ON parent.source_key=${key} AND parent.legacy_table='cities'
        AND parent.legacy_id=CAST(s.from_id_fk AS CHAR) AND parent.target_table='cities'
       SET t.from_id_fk=COALESCE(parent.target_id,0)`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN banks t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='banks' AND m.target_table='banks' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_bank_base=(SELECT COALESCE(MAX(id),0)+1000 FROM banks)",
      );
      await execute(
        tx,
        `INSERT INTO banks (id,bank_name)
       SELECT @legacy_bank_base+s.id,LEFT(s.bank_name,255)
       FROM ${src}.banks s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='banks' AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='banks'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'banks',CAST(s.id AS CHAR),'banks',@legacy_bank_base+s.id,'mapped'
       FROM ${src}.banks s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='banks' AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='banks'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN hr_edarat_aqsam t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='hr_edarat_aqsam'
        AND m.target_table='hr_edarat_aqsam' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_org_base=(SELECT COALESCE(MAX(id),0)+1000 FROM hr_edarat_aqsam)",
      );
      await execute(
        tx,
        `INSERT INTO hr_edarat_aqsam
       (id,title_id,title_code,title,from_id_fk,trteeb,from_code,to_code)
       SELECT @legacy_org_base+s.id,s.title_id,s.title_code,LEFT(s.title,100),0,s.trteeb,0,0
       FROM ${src}.hr_edarat_aqsam s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='hr_edarat_aqsam'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_edarat_aqsam'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'hr_edarat_aqsam',CAST(s.id AS CHAR),'hr_edarat_aqsam',@legacy_org_base+s.id,'mapped'
       FROM ${src}.hr_edarat_aqsam s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='hr_edarat_aqsam'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_edarat_aqsam'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE hr_edarat_aqsam t
       JOIN legacy_record_mappings self ON self.source_key=${key} AND self.legacy_table='hr_edarat_aqsam'
        AND self.target_table='hr_edarat_aqsam' AND self.target_id=t.id
       JOIN ${src}.hr_edarat_aqsam s ON CAST(s.id AS CHAR)=self.legacy_id
       LEFT JOIN legacy_record_mappings parent ON parent.source_key=${key} AND parent.legacy_table='hr_edarat_aqsam'
        AND parent.legacy_id=CAST(s.from_id_fk AS CHAR) AND parent.target_table='hr_edarat_aqsam'
       SET t.from_id_fk=COALESCE(parent.target_id,0)`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN department_jobs t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='department_jobs'
        AND m.target_table='department_jobs' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_job_base=(SELECT COALESCE(MAX(id),0)+1000 FROM department_jobs)",
      );
      await execute(
        tx,
        `INSERT INTO department_jobs (id,name,from_id_fk,status,in_order,dep_code,edara_id,is_trainer)
       SELECT @legacy_job_base+s.id,LEFT(s.name,255),0,s.status,s.in_order,s.dep_code,org.target_id,0
       FROM ${src}.department_jobs s
       LEFT JOIN legacy_record_mappings org ON org.source_key=${key} AND org.legacy_table='hr_edarat_aqsam'
        AND org.legacy_id=CAST(s.edara_id AS CHAR) AND org.target_table='hr_edarat_aqsam'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='department_jobs'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='department_jobs'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'department_jobs',CAST(s.id AS CHAR),'department_jobs',@legacy_job_base+s.id,'mapped'
       FROM ${src}.department_jobs s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='department_jobs'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='department_jobs'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE department_jobs t
       JOIN legacy_record_mappings self ON self.source_key=${key} AND self.legacy_table='department_jobs'
        AND self.target_table='department_jobs' AND self.target_id=t.id
       JOIN ${src}.department_jobs s ON CAST(s.id AS CHAR)=self.legacy_id
       LEFT JOIN legacy_record_mappings parent ON parent.source_key=${key} AND parent.legacy_table='department_jobs'
        AND parent.legacy_id=CAST(s.from_id_fk AS CHAR) AND parent.target_table='department_jobs'
       SET t.from_id_fk=COALESCE(parent.target_id,0)`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN employees_settings t ON t.id_setting=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='employees_settings'
        AND m.target_table='employees_settings' AND t.id_setting IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_emp_setting_base=(SELECT COALESCE(MAX(id_setting),0)+1000 FROM employees_settings)",
      );
      await execute(
        tx,
        `INSERT INTO employees_settings
        (id_setting,title_setting,have_branch,type,type_name,form_id,in_order,color)
       SELECT @legacy_emp_setting_base+s.id_setting,LEFT(s.title_setting,255),s.have_branch,s.type,
        LEFT(s.type_name,255),s.form_id,s.in_order,LEFT(s.color,10)
       FROM ${src}.employees_settings s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='employees_settings'
       AND m.legacy_id=CAST(s.id_setting AS CHAR) AND m.target_table='employees_settings'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'employees_settings',CAST(s.id_setting AS CHAR),'employees_settings',
        @legacy_emp_setting_base+s.id_setting,'mapped'
       FROM ${src}.employees_settings s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='employees_settings'
       AND m.legacy_id=CAST(s.id_setting AS CHAR) AND m.target_table='employees_settings'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN all_defined_setting t ON t.defined_id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='all_defined_setting'
        AND m.target_table='all_defined_setting' AND t.defined_id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_defined_base=(SELECT COALESCE(MAX(defined_id),0)+1000 FROM all_defined_setting)",
      );
      await execute(
        tx,
        `INSERT INTO all_defined_setting
        (defined_id,defined_title,defined_type,defined_type_title,in_order)
       SELECT @legacy_defined_base+s.defined_id,LEFT(s.defined_title,255),s.defined_type,
        LEFT(s.defined_type_title,255),s.in_order
       FROM ${src}.all_defined_setting s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='all_defined_setting'
       AND m.legacy_id=CAST(s.defined_id AS CHAR) AND m.target_table='all_defined_setting'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'all_defined_setting',CAST(s.defined_id AS CHAR),'all_defined_setting',
        @legacy_defined_base+s.defined_id,'mapped'
       FROM ${src}.all_defined_setting s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='all_defined_setting'
       AND m.legacy_id=CAST(s.defined_id AS CHAR) AND m.target_table='all_defined_setting'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `UPDATE employees t
       JOIN legacy_record_mappings em ON em.source_key=${key} AND em.legacy_table='employees'
        AND em.target_table='employees' AND em.target_id=t.id
       JOIN ${src}.employees s ON CAST(s.id AS CHAR)=em.legacy_id
       LEFT JOIN legacy_record_mappings city ON city.source_key=${key} AND city.legacy_table='cities'
        AND city.legacy_id=CAST(s.city_id_fk AS CHAR) AND city.target_table='cities'
       LEFT JOIN legacy_record_mappings org ON org.source_key=${key} AND org.legacy_table='hr_edarat_aqsam'
        AND org.legacy_id=CAST(s.edara_id AS CHAR) AND org.target_table='hr_edarat_aqsam'
       LEFT JOIN legacy_record_mappings section ON section.source_key=${key} AND section.legacy_table='hr_edarat_aqsam'
        AND section.legacy_id=CAST(s.qsm_id AS CHAR) AND section.target_table='hr_edarat_aqsam'
       SET t.city_id_fk=COALESCE(city.target_id,s.city_id_fk),
        t.edara_id=COALESCE(org.target_id,s.edara_id),t.qsm_id=COALESCE(section.target_id,s.qsm_id)`,
      );

      for (const table of [
        "cities",
        "banks",
        "hr_edarat_aqsam",
        "department_jobs",
        "employees_settings",
        "all_defined_setting",
      ]) {
        await execute(
          tx,
          `UPDATE legacy_table_reconciliations SET target_table=${literal(table)},mapped_rows=(
          SELECT COUNT(DISTINCT legacy_id) FROM legacy_record_mappings
          WHERE source_key=${key} AND legacy_table=${literal(table)} AND target_table=${literal(table)}),
         notes='Merged into the live catalog with stable ID remapping; raw archive retained.',checked_at=CURRENT_TIMESTAMP(3)
         WHERE run_id=${runId} AND source_table=${literal(table)}`,
        );
      }
    },
  );

  await step("HR shift templates and all work schedules", async (tx) => {
    await execute(
      tx,
      `DELETE m FROM legacy_record_mappings m LEFT JOIN hr_shift_templates t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='always_setting'
        AND m.target_table='hr_shift_templates' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_shift_base=(SELECT COALESCE(MAX(id),0)+1000 FROM hr_shift_templates)",
    );
    await execute(
      tx,
      `INSERT INTO hr_shift_templates
        (id,source_shift_id,name,attend_time,leave_time,start_enter,end_enter,start_out,end_out,
         late_minutes,leave_early_minutes,color,branch_id,is_active,raw_payload,created_at,updated_at)
       SELECT @legacy_shift_base+s.id,s.id,LEFT(s.name,255),LEFT(s.attend_time,50),LEFT(s.leave_time,50),
        LEFT(s.start_enter,50),LEFT(s.end_enter,50),LEFT(s.start_out,50),LEFT(s.end_out,50),
        s.late_min,s.leave_early_min,LEFT(s.color,20),bm.new_branch_id,s.status<>0,
        JSON_OBJECT('season_num',s.season_num,'season_status',s.season_status,
          'account_day_work',s.account_day_work,'account_time_work',s.account_time_work,
          'status_name',s.status_name),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.always_setting s
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.branch_id_fk
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='always_setting'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_shift_templates'
       WHERE m.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'always_setting',CAST(s.id AS CHAR),'hr_shift_templates',
        @legacy_shift_base+s.id,'mapped'
       FROM ${src}.always_setting s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='always_setting'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_shift_templates'
       WHERE m.id IS NULL`,
    );

    await execute(
      tx,
      `SET @legacy_orphan_hr_emp_base=(SELECT COALESCE(MAX(id),0)+1000 FROM employees)`,
    );
    await execute(
      tx,
      `INSERT INTO employees
        (id,employee,emp_code,demo_card,shahadt_jaish,tamin_rkm,khedma_year,reason,leave_emp)
       SELECT @legacy_orphan_hr_emp_base+x.emp_id,CONCAT('Legacy missing employee #',x.emp_id),NULL,
        LEFT(CONCAT('LEGMISS-',x.emp_id),15),'no',0,0,'Missing parent in legacy HR database',1
       FROM (SELECT DISTINCT d.emp_id FROM ${src}.hr_emp_dwam d
             LEFT JOIN ${src}.employees e ON e.id=d.emp_id WHERE e.id IS NULL) x
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='legacy_orphan_hr_employees'
        AND m.legacy_id=CAST(x.emp_id AS CHAR) AND m.target_table='employees'
       WHERE m.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'legacy_orphan_hr_employees',CAST(x.emp_id AS CHAR),'employees',
        @legacy_orphan_hr_emp_base+x.emp_id,'placeholder',JSON_OBJECT('reason','missing source employees parent')
       FROM (SELECT DISTINCT d.emp_id FROM ${src}.hr_emp_dwam d
             LEFT JOIN ${src}.employees e ON e.id=d.emp_id WHERE e.id IS NULL) x
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='legacy_orphan_hr_employees'
        AND m.legacy_id=CAST(x.emp_id AS CHAR) AND m.target_table='employees'
       WHERE m.id IS NULL`,
    );

    await execute(
      tx,
      `DELETE m FROM legacy_record_mappings m LEFT JOIN hr_emp_dwam t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='hr_emp_dwam'
        AND m.target_table='hr_emp_dwam' AND t.id IS NULL`,
    );
    await execute(
      tx,
      "SET @legacy_schedule_base=(SELECT COALESCE(MAX(id),0)+1000 FROM hr_emp_dwam)",
    );
    await execute(
      tx,
      `INSERT INTO hr_emp_dwam
        (id,emp_id,emp_code,always_id_fk,period_id_fk,attend_time,leave_time,start_enter,end_enter,
         start_out,end_out,from_date,from_date_ar,to_date,to_date_ar,saturday,sunday,monday,tuesday,wednesday,thursday,friday)
       SELECT @legacy_schedule_base+s.id,COALESCE(em.target_id,om.target_id),s.emp_code,s.always_id_fk,s.period_id_fk,
        s.attend_time,s.leave_time,s.start_enter,s.end_enter,s.start_out,s.end_out,s.from_date,s.from_date_ar,
        s.to_date,s.to_date_ar,s.saturday,s.sunday,s.monday,s.tuesday,s.wednesday,s.thursday,s.friday
       FROM ${src}.hr_emp_dwam s
       LEFT JOIN legacy_record_mappings em ON em.source_key=${key} AND em.legacy_table='employees'
        AND em.legacy_id=CAST(s.emp_id AS CHAR) AND em.target_table='employees'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_hr_employees'
        AND om.legacy_id=CAST(s.emp_id AS CHAR) AND om.target_table='employees'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='hr_emp_dwam'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_emp_dwam'
       WHERE m.id IS NULL`,
    );
    await execute(
      tx,
      `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'hr_emp_dwam',CAST(s.id AS CHAR),'hr_emp_dwam',@legacy_schedule_base+s.id,'mapped'
       FROM ${src}.hr_emp_dwam s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='hr_emp_dwam'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='hr_emp_dwam'
       WHERE m.id IS NULL`,
    );
    await execute(
      tx,
      `UPDATE legacy_table_reconciliations SET target_table='hr_shift_templates',mapped_rows=(
        SELECT COUNT(*) FROM legacy_record_mappings WHERE source_key=${key}
         AND legacy_table='always_setting' AND target_table='hr_shift_templates'),
       notes='Materialized as HR shift templates; raw archive retained.',checked_at=CURRENT_TIMESTAMP(3)
       WHERE run_id=${runId} AND source_table='always_setting'`,
    );
    await execute(
      tx,
      `UPDATE legacy_table_reconciliations SET target_table='hr_emp_dwam',mapped_rows=(
        SELECT COUNT(*) FROM legacy_record_mappings WHERE source_key=${key}
         AND legacy_table='hr_emp_dwam' AND target_table='hr_emp_dwam'),
       notes='Merged all work schedules with remapped employees and explicit missing-parent placeholders.',
       checked_at=CURRENT_TIMESTAMP(3) WHERE run_id=${runId} AND source_table='hr_emp_dwam'`,
    );
  });

  await step(
    "member images, points, contacts, blocks and locker counts",
    async (tx) => {
      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN club_member_images t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='tbl_members_imgs'
        AND m.target_table='club_member_images' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_member_image_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_member_images)",
      );
      await execute(
        tx,
        `INSERT INTO club_member_images
        (id,member_id,source_member_id,image_path,captured_at,uploaded_by,created_at)
       SELECT @legacy_member_image_base+s.img_id,COALESCE(mm.target_id,om.target_id),s.member_id_fk,
        LEFT(NULLIF(TRIM(s.image),''),500),s.created,um.new_user_id,COALESCE(s.created,CURRENT_TIMESTAMP(3))
       FROM ${src}.tbl_members_imgs s
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(s.member_id_fk AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_members'
        AND om.legacy_id=CAST(s.member_id_fk AS CHAR) AND om.target_table='club_members'
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.user_id
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='tbl_members_imgs'
        AND m.legacy_id=CAST(s.img_id AS CHAR) AND m.target_table='club_member_images'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_members_imgs',CAST(s.img_id AS CHAR),'club_member_images',
        @legacy_member_image_base+s.img_id,'mapped'
       FROM ${src}.tbl_members_imgs s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_members_imgs'
       AND m.legacy_id=CAST(s.img_id AS CHAR) AND m.target_table='club_member_images'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN club_member_point_transactions t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='tbl_points_history'
        AND m.target_table='club_member_point_transactions' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_points_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_member_point_transactions)",
      );
      await execute(
        tx,
        `INSERT INTO club_member_point_transactions
        (id,member_id,source_member_id,member_code,transaction_type,action_type,action_name,
         subscription_type_id,source_subscription_type_id,subscription_id,source_subscription_id,
         points,occurred_at,expiry_date,expiry_label,created_by,is_deleted,is_active,created_at)
       SELECT @legacy_points_base+s.id,COALESCE(mm.target_id,om.target_id),s.member_id,LEFT(s.member_code,100),
        CASE WHEN LOWER(TRIM(s.type))='increase' THEN 'earn' ELSE 'redeem' END,s.action_type,LEFT(s.action_name,100),
        tm.target_id,s.subscription_type_id_fk,sm.target_id,s.sub_id_fk,COALESCE(s.points,0),
        CASE WHEN CAST(s.time AS CHAR) REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.time AS UNSIGNED))
             WHEN s.date_added REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(LEFT(s.date_added,10),'%Y-%m-%d')
             WHEN CAST(s.date AS CHAR) REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.date AS UNSIGNED)) ELSE NULL END,
        LEFT(s.deadline_date,50),LEFT(s.deadline_date_string,255),um.new_user_id,s.deleted<>0,s.is_active<>0,CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_points_history s
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(s.member_id AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='legacy_orphan_members'
        AND om.legacy_id=CAST(s.member_id AS CHAR) AND om.target_table='club_members'
       LEFT JOIN legacy_record_mappings tm ON tm.source_key=${key} AND tm.legacy_table='tbl_subscription_settings'
        AND tm.legacy_id=CAST(s.subscription_type_id_fk AS CHAR) AND tm.target_table='club_subscription_types'
       LEFT JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
        AND sm.legacy_id=CAST(s.sub_id_fk AS CHAR) AND sm.target_table='club_subscriptions'
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='tbl_points_history'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_point_transactions'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_points_history',CAST(s.id AS CHAR),'club_member_point_transactions',
        @legacy_points_base+s.id,'mapped'
       FROM ${src}.tbl_points_history s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_points_history'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_point_transactions'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN club_member_point_transactions t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='tbl_points_exhausted_history'
        AND m.target_table='club_member_point_transactions' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_redeemed_points_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_member_point_transactions)",
      );
      await execute(
        tx,
        `INSERT INTO club_member_point_transactions
        (id,member_id,source_member_id,member_code,transaction_type,action_name,
         subscription_type_id,source_subscription_type_id,subscription_id,source_subscription_id,
         points,occurred_at,created_by,is_deleted,is_active,created_at)
       SELECT @legacy_redeemed_points_base+s.id,mm.target_id,COALESCE(lm.mem_id,s.member_id),LEFT(s.member_code,100),
        'redeem',LEFT(CONCAT('استبدال نقاط — ',COALESCE(NULLIF(s.sub_type,''),'عملية قديمة')),100),
        tm.target_id,s.subscription_type_id_fk,sm.target_id,NULLIF(s.sub_id_fk,0),COALESCE(s.points,0),
        CASE WHEN CAST(s.time AS CHAR) REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.time AS UNSIGNED))
             WHEN CAST(s.date AS CHAR) REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.date AS UNSIGNED)) ELSE NULL END,
        um.new_user_id,s.deleted<>0,1,CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_points_exhausted_history s
       LEFT JOIN ${src}.tbl_members lm ON lm.m_code=s.member_code
       LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(lm.mem_id AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings tm ON tm.source_key=${key} AND tm.legacy_table='tbl_subscription_settings'
        AND tm.legacy_id=CAST(s.subscription_type_id_fk AS CHAR) AND tm.target_table='club_subscription_types'
       LEFT JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='tbl_subscription_members'
        AND sm.legacy_id=CAST(NULLIF(s.sub_id_fk,0) AS CHAR) AND sm.target_table='club_subscriptions'
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=CAST(s.publisher AS UNSIGNED)
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='tbl_points_exhausted_history'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_point_transactions'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_points_exhausted_history',CAST(s.id AS CHAR),
        'club_member_point_transactions',@legacy_redeemed_points_base+s.id,'mapped'
       FROM ${src}.tbl_points_exhausted_history s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_points_exhausted_history'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_point_transactions'
       WHERE m.id IS NULL`,
      );

      for (const contactTable of [
        "tbl_member_contacts",
        "tbl_member_contacts_sub",
      ]) {
        const contact = identifier(contactTable);
        await execute(
          tx,
          `DELETE m FROM legacy_record_mappings m LEFT JOIN club_member_contact_logs t ON t.id=m.target_id
         WHERE m.source_key=${key} AND m.legacy_table=${literal(contactTable)}
          AND m.target_table='club_member_contact_logs' AND t.id IS NULL`,
        );
        await execute(
          tx,
          "SET @legacy_contact_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_member_contact_logs)",
        );
        await execute(
          tx,
          `INSERT INTO club_member_contact_logs
          (id,member_id,source_member_code,contact_type,contact_date,source_table,created_at)
         SELECT @legacy_contact_base+s.id,mm.target_id,LEFT(s.m_code_fk,50),LEFT(s.contact_type,50),
          s.contact_date,${literal(contactTable)},COALESCE(s.created_at,CURRENT_TIMESTAMP(3))
         FROM ${src}.${contact} s
         LEFT JOIN ${src}.tbl_members lm ON lm.m_code=s.m_code_fk
         LEFT JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
          AND mm.legacy_id=CAST(lm.mem_id AS CHAR) AND mm.target_table='club_members'
         LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table=${literal(contactTable)}
          AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_contact_logs'
         WHERE m.id IS NULL`,
        );
        await execute(
          tx,
          `INSERT INTO legacy_record_mappings
          (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
         SELECT ${runId},${key},${literal(contactTable)},CAST(s.id AS CHAR),'club_member_contact_logs',
          @legacy_contact_base+s.id,'mapped'
         FROM ${src}.${contact} s LEFT JOIN legacy_record_mappings m
          ON m.source_key=${key} AND m.legacy_table=${literal(contactTable)}
         AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_member_contact_logs'
         WHERE m.id IS NULL`,
        );
      }

      await execute(
        tx,
        `UPDATE club_members t
       JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.target_table='club_members' AND mm.target_id=t.id
       JOIN ${src}.tbl_members_blocked b ON CAST(b.mem_id_fk AS CHAR)=mm.legacy_id
       SET t.is_active=0,t.notes=CONCAT_WS('\n',NULLIF(t.notes,''),
        CONCAT('[legacy-block:',b.id,'] ',COALESCE(b.date_ar,''),' ',COALESCE(b.time_add,''),' — ',COALESCE(b.reason,'')))
       WHERE COALESCE(t.notes,'') NOT LIKE CONCAT('%[legacy-block:',b.id,']%')`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'tbl_members_blocked',CAST(b.id AS CHAR),'club_members',mm.target_id,'merged',
        JSON_OBJECT('reason',b.reason,'date',b.date_ar,'time',b.time_add)
       FROM ${src}.tbl_members_blocked b
       JOIN legacy_record_mappings mm ON mm.source_key=${key} AND mm.legacy_table='tbl_members'
        AND mm.legacy_id=CAST(b.mem_id_fk AS CHAR) AND mm.target_table='club_members'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='tbl_members_blocked'
        AND m.legacy_id=CAST(b.id AS CHAR) AND m.target_table='club_members'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN club_locker_inventory_logs t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='tbl_locker_inventory'
        AND m.target_table='club_locker_inventory_logs' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_locker_inventory_base=(SELECT COALESCE(MAX(id),0)+1000 FROM club_locker_inventory_logs)",
      );
      await execute(
        tx,
        `INSERT INTO club_locker_inventory_logs
        (id,locker_id,source_locker_id,locker_type,branch_id,inventory_number,inventory_date,
         employee_id,employee_code,created_by,recorded_at,notes,created_at)
       SELECT @legacy_locker_inventory_base+s.id,lm.target_id,s.locker_id_fk,s.locker_type,bm.new_branch_id,
        s.num_invent,LEFT(s.invent_date,50),em.new_employee_id,s.emp_code,um.new_user_id,
        CASE WHEN CAST(s.date AS CHAR) REGEXP '^[0-9]{9,10}$' THEN FROM_UNIXTIME(CAST(s.date AS UNSIGNED)) ELSE NULL END,
        CONCAT_WS(' | ',NULLIF(s.notes,''),NULLIF(s.publisher,'')),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_locker_inventory s
       LEFT JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='tbl_locker_number'
        AND lm.legacy_id=CAST(s.locker_id_fk AS CHAR) AND lm.target_table='club_lockers'
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=s.sub_branch_id_fk
       LEFT JOIN legacy_employee_mappings em ON em.source_key=${key} AND em.legacy_id=s.employee_id_fk
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.user_id
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='tbl_locker_inventory'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_locker_inventory_logs'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'tbl_locker_inventory',CAST(s.id AS CHAR),'club_locker_inventory_logs',
        @legacy_locker_inventory_base+s.id,'mapped'
       FROM ${src}.tbl_locker_inventory s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_locker_inventory'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='club_locker_inventory_logs'
       WHERE m.id IS NULL`,
      );

      for (const [sourceTable, targetTable] of [
        ["tbl_members_imgs", "club_member_images"],
        ["tbl_points_history", "club_member_point_transactions"],
        ["tbl_points_exhausted_history", "club_member_point_transactions"],
        ["tbl_member_contacts", "club_member_contact_logs"],
        ["tbl_member_contacts_sub", "club_member_contact_logs"],
        ["tbl_members_blocked", "club_members"],
        ["tbl_locker_inventory", "club_locker_inventory_logs"],
      ]) {
        await execute(
          tx,
          `UPDATE legacy_table_reconciliations SET target_table=${literal(targetTable)},mapped_rows=(
          SELECT COUNT(*) FROM legacy_record_mappings WHERE source_key=${key}
           AND legacy_table=${literal(sourceTable)} AND target_table=${literal(targetTable)}),
         notes='Materialized in the live operational history; raw archive retained.',checked_at=CURRENT_TIMESTAMP(3)
         WHERE run_id=${runId} AND source_table=${literal(sourceTable)}`,
        );
      }
    },
  );

  await step(
    "complete chart of accounts and disbursement-order history",
    async (tx) => {
      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN acc_accounts t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='dalel'
        AND m.target_table='acc_accounts' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_account_base=(SELECT COALESCE(MAX(id),0)+1000 FROM acc_accounts)",
      );
      await execute(
        tx,
        `INSERT INTO acc_accounts
        (id,code,name,account_type,normal_balance,parent_id,is_postable,category,description,is_active,created_at,updated_at)
       SELECT @legacy_account_base+s.id,CONCAT('LEG-',LEFT(CAST(s.code AS CHAR),46)),LEFT(s.name,255),
        CASE s.ttype_id WHEN 1 THEN 'asset' WHEN 2 THEN 'liability' WHEN 3 THEN 'revenue'
             WHEN 4 THEN 'expense' ELSE 'equity' END,
        CASE WHEN s.hesab_tabe3a=2 THEN 'credit' ELSE 'debit' END,NULL,
        NOT EXISTS(SELECT 1 FROM ${src}.dalel c WHERE c.parent=s.id),LEFT(CAST(s.ttype AS CHAR),255),
        JSON_OBJECT('legacy_id',s.id,'legacy_code',s.code,'parent',s.parent,'parent_code',s.parent_code,
          'level',s.level,'hesab_no3',s.hesab_no3,'hesab_report',s.hesab_report,
          'last_value',s.last_value,'markz_tklfa',s.markz_tklfa),1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.dalel s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='dalel'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='acc_accounts'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'dalel',CAST(s.id AS CHAR),'acc_accounts',@legacy_account_base+s.id,'mapped',
        JSON_OBJECT('legacy_code',s.code)
       FROM ${src}.dalel s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='dalel'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='acc_accounts'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE acc_accounts t
       JOIN legacy_record_mappings self ON self.source_key=${key} AND self.legacy_table='dalel'
        AND self.target_table='acc_accounts' AND self.target_id=t.id
       JOIN ${src}.dalel s ON CAST(s.id AS CHAR)=self.legacy_id
       LEFT JOIN legacy_record_mappings parent ON parent.source_key=${key} AND parent.legacy_table='dalel'
        AND parent.legacy_id=CAST(s.parent AS CHAR) AND parent.target_table='acc_accounts'
       SET t.parent_id=parent.target_id`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN fin_disbursement_orders t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='finance_sarf_order'
        AND m.target_table='fin_disbursement_orders' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_sarf_base=(SELECT COALESCE(MAX(id),0)+1000 FROM fin_disbursement_orders)",
      );
      await execute(
        tx,
        `INSERT INTO fin_disbursement_orders
        (id,source_order_id,order_number,order_date,order_date_label,disbursement_type,payment_method,
         bank_id,bank_account,total_amount,approved,description,due_date,cashing_date,treasurer_name,
         manager_name,deputy_name,bank_attachment,downloaded_file,created_by,raw_payload,created_at,updated_at)
       SELECT @legacy_sarf_base+s.id,s.id,s.sarf_num,
        CASE WHEN CAST(s.sarf_date AS CHAR) REGEXP '^[0-9]{9,10}$'
             THEN DATE_FORMAT(FROM_UNIXTIME(s.sarf_date),'%Y-%m-%d') ELSE LEFT(s.sarf_date_ar,10) END,
        LEFT(s.sarf_date_ar,255),s.type_sarf,s.method_type,s.bank_id_fk,LEFT(s.bank_account_num,255),
        COALESCE(s.total_value,0),s.approved<>0,s.about,
        CASE WHEN CAST(s.due_date AS CHAR) REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(s.due_date),'%Y-%m-%d') ELSE LEFT(s.due_date,50) END,
        CASE WHEN CAST(s.cashing_date AS CHAR) REGEXP '^[0-9]{9,10}$' THEN DATE_FORMAT(FROM_UNIXTIME(s.cashing_date),'%Y-%m-%d') ELSE LEFT(s.cashing_date,50) END,
        LEFT(s.amin_name,500),LEFT(s.manager_name,500),LEFT(s.naeb_name,500),LEFT(s.bank_attachment,500),
        s.file_downloded,um.new_user_id,
        JSON_OBJECT('month',s.mon_melady,'help_clause',s.bnod_help_fk,'family_type',s.type_family,
          'presence_number',s.presence_number,'presence_session',s.presence_number_galsa,
          'presence_year',s.presence_year,'widow_value',s.value_armal,'orphan_value',s.value_yatem,
          'beneficiary_value',s.value_mostafed,'person_id',s.person_id_fk,'other_person',s.other_person,
          'ancient_number',s.ancient_sarf_num,'family_count',s.num_family,
          'sarf_bank_id',s.sarf_bank_id,'sarf_bank_account',s.sarf_bank_account),
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.publisher
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='finance_sarf_order'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_orders'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'finance_sarf_order',CAST(s.id AS CHAR),'fin_disbursement_orders',
        @legacy_sarf_base+s.id,'mapped'
       FROM ${src}.finance_sarf_order s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_orders'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `INSERT INTO fin_expenses
        (expense_number,expense_date,category,sub_category,amount,tax_amount,total_amount,
         payment_method,payment_status,approval_status,description,vendor,invoice_number,
         attachments,notes,created_by,is_deleted,created_at,updated_at)
       SELECT CONCAT('LEG-SARF-',s.id),
        CASE WHEN CAST(s.sarf_date AS CHAR) REGEXP '^[0-9]{9,10}$'
             THEN DATE_FORMAT(FROM_UNIXTIME(s.sarf_date),'%Y-%m-%d') ELSE LEFT(s.sarf_date_ar,10) END,
        'أوامر صرف تاريخية',LEFT(CONCAT('نوع ',s.type_sarf),100),COALESCE(s.total_value,0),0,COALESCE(s.total_value,0),
        CASE s.method_type WHEN 4 THEN 'تحويل بنكي' WHEN 1 THEN 'نقدي' ELSE CONCAT('وسيلة قديمة ',s.method_type) END,
        CASE WHEN s.approved<>0 THEN 'مدفوع' ELSE 'معلق' END,
        CASE WHEN s.approved<>0 THEN 'معتمد' ELSE 'معلق' END,s.about,LEFT(NULLIF(s.other_person,''),255),
        LEFT(CAST(s.sarf_num AS CHAR),100),
        JSON_ARRAY(JSON_OBJECT('field','bank_attachment','path',s.bank_attachment),
                   JSON_OBJECT('field','file_downloaded','path',s.file_downloded)),
        CONCAT('Legacy finance_sarf_order id=',s.id,'; source order=',s.sarf_num),um.new_user_id,0,
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order s
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.publisher
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='finance_sarf_order'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_expenses'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'finance_sarf_order',CAST(s.id AS CHAR),'fin_expenses',e.id,'mapped',
        JSON_OBJECT('normalized_order_id',om.target_id)
       FROM ${src}.finance_sarf_order s JOIN fin_expenses e ON e.expense_number=CONCAT('LEG-SARF-',s.id)
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='finance_sarf_order'
        AND om.legacy_id=CAST(s.id AS CHAR) AND om.target_table='fin_disbursement_orders'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='finance_sarf_order'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_expenses'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN fin_disbursement_order_details t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='finance_sarf_order_details'
        AND m.target_table='fin_disbursement_order_details' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_sarf_detail_base=(SELECT COALESCE(MAX(id),0)+1000 FROM fin_disbursement_order_details)",
      );
      await execute(
        tx,
        `INSERT INTO fin_disbursement_order_details
        (id,order_id,source_order_number,national_id,file_number,bank_responsible_id,
         bank_responsible_name,bank_account,bank_code,beneficiary_count,mother_count,young_count,
         adult_count,mother_amount,young_amount,adult_amount,amount,raw_payload,created_at)
       SELECT @legacy_sarf_detail_base+s.id,om.target_id,s.sarf_num_fk,LEFT(s.mother_national_num_fk,255),s.file_num,
        LEFT(s.bank_responsible_national_num,255),LEFT(s.bank_responsible_name,500),LEFT(s.bank_account_num,255),
        LEFT(s.bank_code,255),s.all_num,s.mother_num,s.young_num,s.adult_num,s.mother_value,s.young_value,
        s.adult_value,COALESCE(s.value,0),JSON_OBJECT('source_detail_id',s.id),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order_details s
       LEFT JOIN ${src}.finance_sarf_order o ON o.sarf_num=s.sarf_num_fk
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='finance_sarf_order'
        AND om.legacy_id=CAST(o.id AS CHAR) AND om.target_table='fin_disbursement_orders'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='finance_sarf_order_details'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_order_details'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'finance_sarf_order_details',CAST(s.id AS CHAR),'fin_disbursement_order_details',
        @legacy_sarf_detail_base+s.id,'mapped'
       FROM ${src}.finance_sarf_order_details s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order_details'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_order_details'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN fin_disbursement_order_attachments t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='finance_sarf_order_attachments'
        AND m.target_table='fin_disbursement_order_attachments' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_sarf_attachment_base=(SELECT COALESCE(MAX(id),0)+1000 FROM fin_disbursement_order_attachments)",
      );
      await execute(
        tx,
        `INSERT INTO fin_disbursement_order_attachments
        (id,order_id,source_order_number,title,file_path,created_at)
       SELECT @legacy_sarf_attachment_base+s.id,om.target_id,s.sarf_num_fk,LEFT(s.attachment_title,255),
        LEFT(s.attachment,500),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order_attachments s
       LEFT JOIN ${src}.finance_sarf_order o ON o.sarf_num=s.sarf_num_fk
       LEFT JOIN legacy_record_mappings om ON om.source_key=${key} AND om.legacy_table='finance_sarf_order'
        AND om.legacy_id=CAST(o.id AS CHAR) AND om.target_table='fin_disbursement_orders'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='finance_sarf_order_attachments'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_order_attachments'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'finance_sarf_order_attachments',CAST(s.id AS CHAR),
        'fin_disbursement_order_attachments',@legacy_sarf_attachment_base+s.id,'mapped'
       FROM ${src}.finance_sarf_order_attachments s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order_attachments'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_order_attachments'
       WHERE m.id IS NULL`,
      );

      for (const [sourceTable, targetTable] of [
        ["dalel", "acc_accounts"],
        ["finance_sarf_order", "fin_disbursement_orders"],
        ["finance_sarf_order_details", "fin_disbursement_order_details"],
        [
          "finance_sarf_order_attachments",
          "fin_disbursement_order_attachments",
        ],
      ]) {
        await execute(
          tx,
          `UPDATE legacy_table_reconciliations SET target_table=${literal(targetTable)},mapped_rows=(
          SELECT COUNT(*) FROM legacy_record_mappings WHERE source_key=${key}
           AND legacy_table=${literal(sourceTable)} AND target_table=${literal(targetTable)}),
         notes='Fully materialized in the live finance model; raw archive retained.',checked_at=CURRENT_TIMESTAMP(3)
         WHERE run_id=${runId} AND source_table=${literal(sourceTable)}`,
        );
      }
    },
  );

  await step(
    "inventory warehouses, stock counts, price history and opening audit",
    async (tx) => {
      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN inv_warehouses t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='store_other_storage'
        AND m.target_table='inv_warehouses' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_warehouse_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_warehouses)",
      );
      await execute(
        tx,
        `INSERT INTO inv_warehouses
        (id,warehouse_code,name_ar,name_en,type,storage_capacity,branch_id,status,is_deleted,created_at,updated_at)
       SELECT @legacy_warehouse_base+s.id,CONCAT('LEG-STORAGE-',s.id),LEFT(s.title,150),
        CONCAT('Legacy storage ',s.id),'main',1,
        COALESCE(bm.new_branch_id,(SELECT MIN(new_branch_id) FROM legacy_branch_mappings WHERE source_key=${key})),
        'active',0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.store_other_storage s
       LEFT JOIN legacy_branch_mappings bm ON bm.source_key=${key} AND bm.legacy_id=
        CASE WHEN s.title LIKE '%الجلاء%' THEN 5 WHEN s.title LIKE '%بر%شرقي%' THEN 4
             WHEN s.title LIKE '%طنطا%' THEN 3 ELSE 3 END
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_other_storage'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_warehouses'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_other_storage',CAST(s.id AS CHAR),'inv_warehouses',
        @legacy_warehouse_base+s.id,'mapped'
       FROM ${src}.store_other_storage s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='store_other_storage'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_warehouses'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        "DROP TEMPORARY TABLE IF EXISTS tmp_gap_orphan_products",
      );
      await execute(
        tx,
        `CREATE TEMPORARY TABLE tmp_gap_orphan_products AS
       SELECT DISTINCT s.item_id_fk
       FROM ${src}.store_inventory_table s
       LEFT JOIN ${src}.store_item i ON i.id=s.item_id_fk
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='legacy_orphan_products'
        AND m.legacy_id=CONCAT('id:',s.item_id_fk) AND m.target_table='inv_products'
       WHERE i.id IS NULL AND m.id IS NULL`,
      );
      await execute(
        tx,
        "SET @gap_orphan_product_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_products)",
      );
      await execute(
        tx,
        `INSERT INTO inv_products
        (id,product_code,name_ar,description,cost_price,selling_price,unit_of_measure,
         inventory_kind,inventory_section,status,is_deleted,created_at,updated_at)
       SELECT @gap_orphan_product_base+ROW_NUMBER() OVER(ORDER BY item_id_fk),
        CONCAT('LEG-ORPH-id-',item_id_fk),CONCAT('Missing legacy item ',item_id_fk),
        'Inactive placeholder for a stock-count item whose catalog row is absent',0,0,'وحدة',
        'general','general','inactive',1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM tmp_gap_orphan_products`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status,details)
       SELECT ${runId},${key},'legacy_orphan_products',CONCAT('id:',o.item_id_fk),'inv_products',p.id,
        'placeholder',JSON_OBJECT('reason','missing store_item row referenced by store_inventory_table')
       FROM tmp_gap_orphan_products o JOIN inv_products p ON p.product_code=CONCAT('LEG-ORPH-id-',o.item_id_fk)`,
      );

      await execute(
        tx,
        "DROP TEMPORARY TABLE IF EXISTS tmp_legacy_count_sessions",
      );
      await execute(
        tx,
        `CREATE TEMPORARY TABLE tmp_legacy_count_sessions AS
       SELECT CONCAT(x.storage_id_text,'|',x.num_invent,'|',x.invent_date) legacy_id,
        CAST(x.storage_id_text AS UNSIGNED) storage_id,x.num_invent,x.invent_date,x.user_id,x.notes
       FROM (
        SELECT TRIM(storage_id_fk) storage_id_text,num_invent,invent_date,
         MIN(user_id) user_id,MIN(NULLIF(notes,'')) notes
        FROM ${src}.store_inventory_table
        GROUP BY TRIM(storage_id_fk),num_invent,invent_date
       ) x`,
      );
      await execute(
        tx,
        "SET @legacy_count_session_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_count_sessions)",
      );
      await execute(
        tx,
        `INSERT INTO inv_count_sessions
        (id,session_number,warehouse_id,branch_id,status,notes,created_by,created_at,updated_at)
       SELECT @legacy_count_session_base+ROW_NUMBER() OVER(ORDER BY s.legacy_id),
        LEFT(CONCAT('LEG-COUNT-',REPLACE(s.legacy_id,'|','-')),50),wm.target_id,w.branch_id,'approved',
        CONCAT_WS(' | ',s.notes,CONCAT('Imported legacy count ',s.legacy_id)),um.new_user_id,
        CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM tmp_legacy_count_sessions s
       JOIN legacy_record_mappings wm ON wm.source_key=${key} AND wm.legacy_table='store_other_storage'
        AND wm.legacy_id=CAST(s.storage_id AS CHAR) AND wm.target_table='inv_warehouses'
       JOIN inv_warehouses w ON w.id=wm.target_id
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.user_id
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_inventory_sessions'
        AND m.legacy_id=s.legacy_id AND m.target_table='inv_count_sessions'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_inventory_sessions',s.legacy_id,'inv_count_sessions',t.id,'mapped'
       FROM tmp_legacy_count_sessions s
       JOIN inv_count_sessions t ON t.session_number=LEFT(CONCAT('LEG-COUNT-',REPLACE(s.legacy_id,'|','-')),50)
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_inventory_sessions'
        AND m.legacy_id=s.legacy_id AND m.target_table='inv_count_sessions'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN inv_count_items t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='store_inventory_table'
        AND m.target_table='inv_count_items' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_count_item_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_count_items)",
      );
      await execute(
        tx,
        `INSERT INTO inv_count_items
        (id,session_id,product_id,item_code,item_name,category,system_quantity,counted_quantity,
         variance,status,variance_reason,created_at)
       SELECT @legacy_count_item_base+s.id,sm.target_id,COALESCE(pm.target_id,op.target_id),
        LEFT(COALESCE(i.sanf_code,CAST(s.item_id_fk AS CHAR)),50),
        LEFT(COALESCE(i.name,CONCAT('Missing legacy item ',s.item_id_fk)),255),
        CASE s.sanf_type_gym WHEN 7 THEN 'cafe' WHEN 8 THEN 'supplement' ELSE CONCAT('legacy-type-',s.sanf_type_gym) END,
        COALESCE(s.available_amount,0),COALESCE(s.amount,0),COALESCE(s.amount,0)-COALESCE(s.available_amount,0),
        CASE WHEN COALESCE(s.amount,0)=COALESCE(s.available_amount,0) THEN 'matched' ELSE 'variance' END,
        LEFT(CONCAT_WS(' | ',NULLIF(s.notes,''),
          IF(COALESCE(s.deficit_amount,0)<>0,CONCAT('deficit=',s.deficit_amount),NULL),
          IF(COALESCE(s.increase_amount,0)<>0,CONCAT('increase=',s.increase_amount),NULL)),255),CURRENT_TIMESTAMP(3)
       FROM ${src}.store_inventory_table s
       LEFT JOIN ${src}.store_item i ON i.id=s.item_id_fk
       JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='store_inventory_sessions'
        AND sm.legacy_id=CONCAT(TRIM(s.storage_id_fk),'|',s.num_invent,'|',s.invent_date)
        AND sm.target_table='inv_count_sessions'
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(s.item_id_fk AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products'
        AND op.legacy_id=CONCAT('id:',s.item_id_fk) AND op.target_table='inv_products'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_inventory_table'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_count_items'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_inventory_table',CAST(s.id AS CHAR),'inv_count_items',
        @legacy_count_item_base+s.id,'mapped'
       FROM ${src}.store_inventory_table s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='store_inventory_table'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_count_items'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        `INSERT INTO inv_stock_balances
        (product_id,warehouse_id,current_stock,min_stock,max_stock,reorder_point,last_updated,created_at)
       SELECT x.product_id,x.warehouse_id,x.current_stock,0,1000,10,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM (
        SELECT COALESCE(pm.target_id,op.target_id) product_id,wm.target_id warehouse_id,
          COALESCE(s.amount,0) current_stock,
          ROW_NUMBER() OVER(PARTITION BY s.item_id_fk,TRIM(s.storage_id_fk)
            ORDER BY s.invent_date DESC,s.num_invent DESC,s.id DESC) rn
        FROM ${src}.store_inventory_table s
        LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
         AND pm.legacy_id=CAST(s.item_id_fk AS CHAR) AND pm.target_table='inv_products'
        LEFT JOIN legacy_record_mappings op ON op.source_key=${key} AND op.legacy_table='legacy_orphan_products'
         AND op.legacy_id=CONCAT('id:',s.item_id_fk) AND op.target_table='inv_products'
        JOIN legacy_record_mappings wm ON wm.source_key=${key} AND wm.legacy_table='store_other_storage'
         AND wm.legacy_id=TRIM(s.storage_id_fk) AND wm.target_table='inv_warehouses'
       ) x WHERE x.rn=1 AND x.product_id IS NOT NULL
       ON DUPLICATE KEY UPDATE current_stock=VALUES(current_stock),last_updated=CURRENT_TIMESTAMP(3)`,
      );

      await execute(
        tx,
        `DELETE m FROM legacy_record_mappings m LEFT JOIN inv_product_price_history t ON t.id=m.target_id
       WHERE m.source_key=${key} AND m.legacy_table='store_all_items_prices'
        AND m.target_table='inv_product_price_history' AND t.id IS NULL`,
      );
      await execute(
        tx,
        "SET @legacy_price_history_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_product_price_history)",
      );
      await execute(
        tx,
        `INSERT INTO inv_product_price_history
        (id,product_id,source_item_code,source_item_name,old_price,new_price,changed_date,
         changed_time,created_by,publisher_name,created_at)
       SELECT @legacy_price_history_base+s.id,pm.target_id,LEFT(s.sanf_code,50),LEFT(s.sanf_name,100),
        s.old_price,s.new_price,LEFT(s.date_ar,20),LEFT(s.update_time,20),um.new_user_id,LEFT(s.publisher_name,100),
        CURRENT_TIMESTAMP(3)
       FROM ${src}.store_all_items_prices s
       LEFT JOIN (SELECT sanf_code,MIN(id) id FROM ${src}.store_item GROUP BY sanf_code) i ON i.sanf_code=s.sanf_code
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(i.id AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_user_mappings um ON um.source_key=${key} AND um.legacy_id=s.publisher
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_all_items_prices'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_product_price_history'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_all_items_prices',CAST(s.id AS CHAR),'inv_product_price_history',
        @legacy_price_history_base+s.id,'mapped'
       FROM ${src}.store_all_items_prices s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='store_all_items_prices'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_product_price_history'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        "SET @legacy_opening_snapshot_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_legacy_opening_stock_snapshots)",
      );
      await execute(
        tx,
        `INSERT INTO inv_legacy_opening_stock_snapshots
        (id,source_invoice_id,main_branch_id,sub_branch_id,document_number,total_quantity,total_cost,created_at)
       SELECT @legacy_opening_snapshot_base+s.id,s.id,COALESCE(mb.new_branch_id,sb.new_branch_id),sb.new_branch_id,
        LEFT(s.pill_num,50),CAST(NULLIF(TRIM(s.all_amount),'') AS DECIMAL(19,3)),
        CAST(NULLIF(TRIM(s.all_cost),'') AS DECIMAL(19,2)),CURRENT_TIMESTAMP(3)
       FROM ${src}.store_start_other_fatora s
       LEFT JOIN legacy_branch_mappings mb ON mb.source_key=${key} AND mb.legacy_id=s.main_branch
       LEFT JOIN legacy_branch_mappings sb ON sb.source_key=${key} AND sb.legacy_id=s.sub_branch
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_start_other_fatora'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_legacy_opening_stock_snapshots'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_start_other_fatora',CAST(s.id AS CHAR),'inv_legacy_opening_stock_snapshots',
        @legacy_opening_snapshot_base+s.id,'mapped'
       FROM ${src}.store_start_other_fatora s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='store_start_other_fatora'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_legacy_opening_stock_snapshots'
       WHERE m.id IS NULL`,
      );

      await execute(
        tx,
        "SET @legacy_opening_line_base=(SELECT COALESCE(MAX(id),0)+1000 FROM inv_legacy_opening_stock_lines)",
      );
      await execute(
        tx,
        `INSERT INTO inv_legacy_opening_stock_lines
        (id,snapshot_id,source_invoice_id,source_item_code,product_id,available_quantity,
         unit_cost,quantity,line_date,is_old,created_at)
       SELECT @legacy_opening_line_base+s.id,sm.target_id,h.id,LEFT(s.sanf_code,50),pm.target_id,
        CAST(NULLIF(TRIM(s.available_amount),'') AS DECIMAL(19,3)),
        CAST(NULLIF(TRIM(s.one_buy_cost),'') AS DECIMAL(19,2)),
        CAST(NULLIF(TRIM(s.amount),'') AS DECIMAL(19,3)),s.date,s.old<>0,CURRENT_TIMESTAMP(3)
       FROM ${src}.store_start_other_items s
       LEFT JOIN (
        SELECT pill_num,main_branch,sub_branch,MIN(id) id
        FROM ${src}.store_start_other_fatora GROUP BY pill_num,main_branch,sub_branch
       ) h ON h.pill_num=CAST(s.pill AS CHAR) AND h.main_branch=s.main_branch AND h.sub_branch=s.sub_branch
       LEFT JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='store_start_other_fatora'
        AND sm.legacy_id=CAST(h.id AS CHAR) AND sm.target_table='inv_legacy_opening_stock_snapshots'
       LEFT JOIN (SELECT sanf_code,MIN(id) id FROM ${src}.store_item GROUP BY sanf_code) i ON i.sanf_code=s.sanf_code
       LEFT JOIN legacy_record_mappings pm ON pm.source_key=${key} AND pm.legacy_table='store_item'
        AND pm.legacy_id=CAST(i.id AS CHAR) AND pm.target_table='inv_products'
       LEFT JOIN legacy_record_mappings m ON m.source_key=${key} AND m.legacy_table='store_start_other_items'
        AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_legacy_opening_stock_lines'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `INSERT INTO legacy_record_mappings
        (run_id,source_key,legacy_table,legacy_id,target_table,target_id,mapping_status)
       SELECT ${runId},${key},'store_start_other_items',CAST(s.id AS CHAR),'inv_legacy_opening_stock_lines',
        @legacy_opening_line_base+s.id,'mapped'
       FROM ${src}.store_start_other_items s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='store_start_other_items'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='inv_legacy_opening_stock_lines'
       WHERE m.id IS NULL`,
      );
      await execute(
        tx,
        `UPDATE inv_legacy_opening_stock_lines t
       JOIN legacy_record_mappings lm ON lm.source_key=${key} AND lm.legacy_table='store_start_other_items'
        AND lm.target_table='inv_legacy_opening_stock_lines' AND lm.target_id=t.id
       JOIN ${src}.store_start_other_items s ON CAST(s.id AS CHAR)=lm.legacy_id
       JOIN (
        SELECT pill_num,main_branch,sub_branch,MIN(id) id
        FROM ${src}.store_start_other_fatora GROUP BY pill_num,main_branch,sub_branch
       ) h ON h.pill_num=CAST(s.pill AS CHAR) AND h.main_branch=s.main_branch AND h.sub_branch=s.sub_branch
       JOIN legacy_record_mappings sm ON sm.source_key=${key} AND sm.legacy_table='store_start_other_fatora'
        AND sm.legacy_id=CAST(h.id AS CHAR) AND sm.target_table='inv_legacy_opening_stock_snapshots'
       SET t.snapshot_id=sm.target_id,t.source_invoice_id=h.id`,
      );

      for (const [sourceTable, targetTable] of [
        ["store_other_storage", "inv_warehouses"],
        ["store_inventory_table", "inv_count_items"],
        ["store_all_items_prices", "inv_product_price_history"],
        ["store_start_other_fatora", "inv_legacy_opening_stock_snapshots"],
        ["store_start_other_items", "inv_legacy_opening_stock_lines"],
      ]) {
        await execute(
          tx,
          `UPDATE legacy_table_reconciliations SET target_table=${literal(targetTable)},mapped_rows=(
          SELECT COUNT(*) FROM legacy_record_mappings WHERE source_key=${key}
           AND legacy_table=${literal(sourceTable)} AND target_table=${literal(targetTable)}),
         notes='Materialized without double-posting historical opening snapshots; raw archive retained.',
         checked_at=CURRENT_TIMESTAMP(3) WHERE run_id=${runId} AND source_table=${literal(sourceTable)}`,
        );
      }
    },
  );

  await step("catalog every legacy media reference", async (tx) => {
    const mediaStatements = [
      `SELECT ${key},'tbl_members',CAST(s.mem_id AS CHAR),'image',s.image,'club_members',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_members s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_members' AND m.legacy_id=CAST(s.mem_id AS CHAR)
       AND m.target_table='club_members'
       WHERE TRIM(CAST(s.image AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'tbl_members_imgs',CAST(s.img_id AS CHAR),'image',s.image,'club_member_images',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_members_imgs s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_members_imgs' AND m.legacy_id=CAST(s.img_id AS CHAR)
       AND m.target_table='club_member_images'
       WHERE TRIM(CAST(s.image AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'employees',CAST(s.id AS CHAR),'personal_photo',s.personal_photo,'employees',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.employees s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='employees' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='employees'
       WHERE TRIM(CAST(s.personal_photo AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'employees',CAST(s.id AS CHAR),'personal_photo_path',s.personal_photo_path,'employees',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.employees s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='employees' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='employees'
       WHERE TRIM(CAST(s.personal_photo_path AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'tbl_employees',CAST(s.id AS CHAR),'personal_photo',s.personal_photo,'employees',m.new_employee_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_employees s LEFT JOIN legacy_employee_mappings m
        ON m.source_key=${key} AND m.legacy_id=s.id
       WHERE TRIM(CAST(s.personal_photo AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'emp_files',CAST(s.id AS CHAR),'emp_file',s.emp_file,'emp_files',t.id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.emp_files s LEFT JOIN emp_files t ON t.id=s.id
       WHERE TRIM(CAST(s.emp_file AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'tbl_inbody',CAST(s.id AS CHAR),'image',s.image,'club_inbody_measurements',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_inbody s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_inbody' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='club_inbody_measurements'
       WHERE TRIM(CAST(s.image AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'tbl_inbody',CAST(s.id AS CHAR),'image_path',s.image_path,'club_inbody_measurements',m.target_id,
        'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.tbl_inbody s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='tbl_inbody' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='club_inbody_measurements'
       WHERE TRIM(CAST(s.image_path AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'finance_sarf_order',CAST(s.id AS CHAR),'bank_attachment',s.bank_attachment,
        'fin_disbursement_orders',m.target_id,'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='fin_disbursement_orders'
       WHERE TRIM(CAST(s.bank_attachment AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'finance_sarf_order',CAST(s.id AS CHAR),'file_downloded',s.file_downloded,
        'fin_disbursement_orders',m.target_id,'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order' AND m.legacy_id=CAST(s.id AS CHAR)
       AND m.target_table='fin_disbursement_orders'
       WHERE TRIM(CAST(s.file_downloded AS CHAR)) NOT IN ('','0','no','yes')`,
      `SELECT ${key},'finance_sarf_order_attachments',CAST(s.id AS CHAR),'attachment',s.attachment,
        'fin_disbursement_order_attachments',m.target_id,'missing',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)
       FROM ${src}.finance_sarf_order_attachments s LEFT JOIN legacy_record_mappings m
        ON m.source_key=${key} AND m.legacy_table='finance_sarf_order_attachments'
       AND m.legacy_id=CAST(s.id AS CHAR) AND m.target_table='fin_disbursement_order_attachments'
       WHERE TRIM(CAST(s.attachment AS CHAR)) NOT IN ('','0','no','yes')`,
    ];
    for (const selectStatement of mediaStatements) {
      await execute(
        tx,
        `INSERT INTO legacy_media_references
          (source_key,source_table,source_id,source_field,file_path,target_table,target_id,
           availability,checked_at,created_at)
         ${selectStatement}
         ON DUPLICATE KEY UPDATE file_path=VALUES(file_path),target_table=VALUES(target_table),
          target_id=VALUES(target_id),checked_at=CURRENT_TIMESTAMP(3)`,
      );
    }
  });

  console.log("Legacy operational-gap import finished.");
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
