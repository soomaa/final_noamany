import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// These tables were absent before migration 20260811120000 and were populated
// only by the superseded legacy-data import. Exact-count assertions make this
// cleanup abort if anyone has subsequently created target-native rows.
const IMPORTED_COUNTS = {
  hr_alert_items: 1,
  hr_alert_items_emps: 2,
  hr_dwrat_job_orders: 0,
  hr_egraat_setting_details: 38,
  hr_ehsayat: 6,
  hr_interview_degree: 6,
  hr_interview_degree_adv_disadv: 2,
  hr_job_orders_offers: 0,
  hr_main_cat: 4,
  hr_markz_taklfa_settings: 41,
  hr_ntaqat_types: 5,
  hr_persons_job_orders: 0,
  hr_previous_work_job_orders: 0,
  hr_qualification_job_orders: 0,
  hr_skills_job_orders: 0,
  hr_solaf_ta3gel_months: 44,
  hr_ta3en_moaqt: 2,
  hr_ta3mem_personal_msg_attaches: 0,
} as const;

function identifier(value: string): string {
  if (!/^[a-z0-9_]+$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

async function count(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM ${identifier(table)}`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  for (const [table, expected] of Object.entries(IMPORTED_COUNTS)) {
    const actual = await count(table);
    if (actual !== expected && actual !== 0) {
      throw new Error(
        `${table}: expected ${expected} imported rows but found ${actual}; cleanup aborted without deleting data`,
      );
    }
  }

  const nonEmpty = (
    await Promise.all(
      Object.entries(IMPORTED_COUNTS).map(async ([table, expected]) => ({
        table,
        shouldDelete: expected > 0 && (await count(table)) === expected,
      })),
    )
  )
    .filter((item) => item.shouldDelete)
    .map((item) => item.table);
  await prisma.$transaction(
    nonEmpty.map((table) => prisma.$executeRawUnsafe(`DELETE FROM ${identifier(table)}`)),
  );

  // Re-derive compatibility columns exclusively from target-native relations.
  await prisma.$executeRawUnsafe(`
    UPDATE hr_job_request_details
       SET request_id_fk = COALESCE(job_request_id_fk, 0),
           details = COALESCE(title, '')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE hr_ta3en_moaqt_evaluation_details d
    LEFT JOIN hr_ta3en_moaqt_evaluation e
      ON CAST(d.evaluation_order_id AS UNSIGNED) = e.id
    LEFT JOIN hr_evaluation_setting s
      ON s.title = d.title
       SET d.emp_id_fk = COALESCE(e.emp_id_fk, d.emp_id_fk),
           d.evaluate_id_fk = COALESCE(CAST(s.id AS CHAR), d.evaluate_id_fk),
           d.max_degree = COALESCE(s.degree, d.max_degree)
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE hr_ta3en_moaqt_evaluation_points p
    LEFT JOIN hr_ta3en_moaqt_evaluation e ON p.evaluate_id_fk = e.id
       SET p.emp_id_fk = COALESCE(CAST(e.emp_id_fk AS UNSIGNED), p.emp_id_fk)
  `);

  const after = Object.fromEntries(
    await Promise.all(Object.keys(IMPORTED_COUNTS).map(async (table) => [table, await count(table)])),
  );
  console.log(JSON.stringify({ removedImportedProductionData: true, counts: after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
