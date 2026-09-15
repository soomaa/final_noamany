import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REQUIRED_TABLES = [
  'hr_alert_items',
  'hr_alert_items_emps',
  'hr_dwrat_job_orders',
  'hr_egraat_setting_details',
  'hr_ehsayat',
  'hr_interview_degree',
  'hr_interview_degree_adv_disadv',
  'hr_job_orders_offers',
  'hr_main_cat',
  'hr_markz_taklfa_settings',
  'hr_ntaqat_types',
  'hr_persons_job_orders',
  'hr_previous_work_job_orders',
  'hr_qualification_job_orders',
  'hr_skills_job_orders',
  'hr_solaf_ta3gel_months',
  'hr_ta3en_moaqt',
  'hr_ta3mem_personal_msg_attaches',
] as const;

async function main() {
  const databaseRows = await prisma.$queryRaw<Array<{ databaseName: string }>>`SELECT DATABASE() AS databaseName`;
  const databaseName = databaseRows[0]?.databaseName;
  if (!databaseName) throw new Error('No target database is selected');

  const tableRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
  `;
  const available = new Set(tableRows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !available.has(table));
  if (missing.length) throw new Error(`Missing HR legacy tables: ${missing.join(', ')}`);

  const counts: Record<string, number> = {};
  for (const table of REQUIRED_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    counts[table] = Number(rows[0]?.count ?? 0);
  }

  // Exercise the generated Prisma model used by the new administrative-decisions module.
  await prisma.hr_ta3en_moaqt.findMany({ take: 1, orderBy: { id: 'asc' } });

  console.log(JSON.stringify({ databaseName, tables: REQUIRED_TABLES.length, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
