/* eslint-disable no-console */
import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const CONFIRM_FLAG = '--confirm-payroll-demo-cleanup';
const REQUIRED_ACK = 'DELETE_ONLY_KNOWN_PAYROLL_DEMO';

const DEMO_RUN_SQL = `(
  (mosayer_rkm = 3001 AND mosayer_month = 5 AND mosayer_year = 2026)
  OR (mosayer_rkm = 3002 AND mosayer_month = 6 AND mosayer_year = 2026)
  OR (mosayer_rkm = 3003 AND mosayer_month = 7 AND mosayer_year = 2026)
)`;

const DEMO_INSURANCE_RUN_SQL = `(
  (mosayer_rkm = 4001 AND mosayer_month = 6 AND mosayer_year = 2026)
  OR (mosayer_rkm = 4002 AND mosayer_month = 7 AND mosayer_year = 2026)
)`;

const DEMO_SALARY_SCALE_SQL = `(
  (TRIM(mo2hel) = 'ثانوي' AND TRIM(martba) = 'المرتبة الأولى'
    AND TRIM(dawam_type) = 'كامل' AND salary_start = 4000 AND year_bonus_value = 200)
  OR (TRIM(mo2hel) = 'دبلوم' AND TRIM(martba) = 'المرتبة الثانية'
    AND TRIM(dawam_type) = 'كامل' AND salary_start = 5500 AND year_bonus_value = 300)
  OR (TRIM(mo2hel) = 'بكالوريوس' AND TRIM(martba) = 'المرتبة الثالثة'
    AND TRIM(dawam_type) = 'كامل' AND salary_start = 7000 AND year_bonus_value = 400)
  OR (TRIM(mo2hel) = 'بكالوريوس' AND TRIM(martba) = 'المرتبة الرابعة'
    AND TRIM(dawam_type) = 'كامل' AND salary_start = 9000 AND year_bonus_value = 500)
  OR (TRIM(mo2hel) = 'ماجستير' AND TRIM(martba) = 'المرتبة الخامسة'
    AND TRIM(dawam_type) = 'كامل' AND salary_start = 12000 AND year_bonus_value = 700)
  OR (TRIM(mo2hel) = 'بكالوريوس' AND TRIM(martba) = 'دوام جزئي'
    AND TRIM(dawam_type) = 'جزئي' AND salary_start = 3500 AND year_bonus_value = 150)
)`;

const EXCLUSIVE_DEMO_COMPONENT_TITLES = [
  'بدل نقل',
  'بدل هاتف',
  'حافز أداء',
  'خصم تأمينات',
  'خصم سلفة',
  'خصم غياب',
  'خصم تأخير',
  'خصم جزاءات',
] as const;

const SHARED_COMPONENT_TITLES = ['بدل سكن', 'بدل طبيعة عمل'] as const;

function sqlList(values: readonly string[]) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

function demoComponentSql(includeShared: boolean) {
  const titles = includeShared
    ? [...EXCLUSIVE_DEMO_COMPONENT_TITLES, ...SHARED_COMPONENT_TITLES]
    : EXCLUSIVE_DEMO_COMPONENT_TITLES;
  return `defined_type_title IN ('allowances', 'deduction') AND defined_title IN (${sqlList(titles)})`;
}

function serializable(rows: Array<Record<string, unknown>>) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'bigint' ? value.toString() : value,
      ]),
    ),
  );
}

async function query(db: Db, sql: string) {
  return serializable(await db.$queryRawUnsafe<Array<Record<string, unknown>>>(sql));
}

async function scalarCount(db: Db, sql: string) {
  const rows = await query(db, `SELECT COUNT(*) total FROM (${sql}) target_rows`);
  return Number(rows[0]?.total ?? 0);
}

async function hasFullDemoRunCluster(db: Db) {
  return (await scalarCount(db, `SELECT id FROM hr_mosayer WHERE ${DEMO_RUN_SQL}`)) === 3;
}

async function protectedFingerprint(db: Db) {
  return {
    users: await query(db, `
      SELECT COUNT(*) total, COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', user_id,
        COALESCE(username, ''), COALESCE(name, ''), COALESCE(emp_code, '')))), 0) checksum
      FROM users
    `),
    employees: await query(db, `
      SELECT COUNT(*) total, COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id,
        COALESCE(emp_code, ''), COALESCE(employee, ''), COALESCE(basic_salary, '')))), 0) checksum
      FROM employees
    `),
    importedPayrollRuns: await query(db, `
      SELECT COUNT(*) total, COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id,
        COALESCE(mosayer_rkm, ''), COALESCE(mosayer_month, ''), COALESCE(mosayer_year, ''),
        COALESCE(egmali_safi, '')))), 0) checksum
      FROM hr_mosayer WHERE NOT ${DEMO_RUN_SQL}
    `),
    importedSalaryScale: await query(db, `
      SELECT COUNT(*) total, COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id,
        COALESCE(mo2hel, ''), COALESCE(martba, ''), COALESCE(dawam_type, ''),
        COALESCE(salary_start, ''), COALESCE(year_bonus_value, '')))), 0) checksum
      FROM hr_salary_doors WHERE NOT ${DEMO_SALARY_SCALE_SQL}
    `),
    members: await query(db, 'SELECT COUNT(*) total FROM club_members'),
    cafeProducts: await query(db, 'SELECT COUNT(*) total FROM cafe_products'),
  };
}

export async function previewPayrollDemoData(db: Db) {
  const fullDemoRunCluster = await hasFullDemoRunCluster(db);
  const componentSql = demoComponentSql(fullDemoRunCluster);
  return {
    fullDemoRunCluster,
    targets: {
      payrollRuns: await scalarCount(db, `SELECT id FROM hr_mosayer WHERE ${DEMO_RUN_SQL}`),
      payrollRunDetails: await scalarCount(db, `
        SELECT id FROM hr_mosayer_details
        WHERE mosayer_rkm_fk IN (
          SELECT mosayer_rkm FROM hr_mosayer WHERE ${DEMO_RUN_SQL}
        )
      `),
      insuranceRuns: await scalarCount(db, `
        SELECT id FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL}
      `),
      salaryScaleRows: await scalarCount(db, `
        SELECT id FROM hr_salary_doors WHERE ${DEMO_SALARY_SCALE_SQL}
      `),
      payComponents: await scalarCount(db, `
        SELECT defined_id FROM all_defined_setting WHERE ${componentSql}
      `),
      payrollMonths: fullDemoRunCluster
        ? await scalarCount(db, `
            SELECT id FROM hr_mosayer_months
            WHERE (month = 5 AND year = 2026)
               OR (month = 6 AND year = 2026)
               OR (month = 7 AND year = 2026)
          `)
        : 0,
    },
    protected: await protectedFingerprint(db),
  };
}

export async function clearPayrollDemoData(db: PrismaClient, verbose = true) {
  const before = await previewPayrollDemoData(db);
  const componentSql = demoComponentSql(before.fullDemoRunCluster);
  const protectedBefore = await protectedFingerprint(db);

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_attechment
      WHERE mosayer_rkm_fk IN (SELECT mosayer_rkm FROM hr_mosayer WHERE ${DEMO_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_egraat
      WHERE mosayer_rkm_fk IN (SELECT mosayer_rkm FROM hr_mosayer WHERE ${DEMO_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_details
      WHERE mosayer_rkm_fk IN (SELECT mosayer_rkm FROM hr_mosayer WHERE ${DEMO_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_history
      WHERE mosayer_rkm_fk IN (SELECT mosayer_rkm FROM hr_mosayer WHERE ${DEMO_RUN_SQL})
         OR mosayer_id_fk IN (SELECT id FROM hr_mosayer WHERE ${DEMO_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`DELETE FROM hr_mosayer WHERE ${DEMO_RUN_SQL}`);

    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_tamenat_attaches
      WHERE talb_id_fk IN (SELECT id FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_tamenat_history
      WHERE talab_id_fk IN (SELECT id FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL})
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_tamenat_egraat
      WHERE mosayer_rkm_fk IN (
        SELECT mosayer_rkm FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL}
      )
    `);
    await tx.$executeRawUnsafe(`
      DELETE FROM hr_mosayer_tamenat_details
      WHERE mosayer_rkm_fk IN (
        SELECT mosayer_rkm FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL}
      )
    `);
    await tx.$executeRawUnsafe(`DELETE FROM hr_mosayer_tamenat WHERE ${DEMO_INSURANCE_RUN_SQL}`);

    await tx.$executeRawUnsafe(`DELETE FROM hr_salary_doors WHERE ${DEMO_SALARY_SCALE_SQL}`);
    await tx.$executeRawUnsafe(`DELETE FROM all_defined_setting WHERE ${componentSql}`);

    if (before.fullDemoRunCluster) {
      await tx.$executeRawUnsafe(`
        DELETE FROM hr_mosayer_months
        WHERE (month = 5 AND year = 2026)
           OR (month = 6 AND year = 2026)
           OR (month = 7 AND year = 2026)
      `);
      await tx.$executeRawUnsafe(`
        DELETE FROM hr_mosayer_fe2at
        WHERE (id = 1 AND title = 'دوام كامل' AND tarteb = 1 AND color = '#2ecc71')
           OR (id = 2 AND title = 'دوام جزئي' AND tarteb = 2 AND color = '#f39c12')
           OR (id = 3 AND title = 'بالساعة' AND tarteb = 3 AND color = '#3498db')
      `);
      await tx.$executeRawUnsafe(`
        DELETE FROM hr_mosayer_sysat
        WHERE title = 'الإعداد' AND rateb_asasy = '1' AND badal_sakn = '1'
          AND badal_mowaslat = '1' AND badal_etsal = '1' AND badal_e3asha = '1'
          AND badal_tabe3a_amal = '1' AND badal_edafi = '1' AND badal_taklef = '1'
      `);
    }

    const protectedAfter = await protectedFingerprint(tx);
    if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) {
      throw new Error('Safety check failed: imported payroll or protected business data changed; cleanup rolled back');
    }
  }, { maxWait: 20_000, timeout: 120_000 });

  const result = { before, after: await previewPayrollDemoData(db) };
  if (verbose) console.log(JSON.stringify({ mode: 'completed', ...result }, null, 2));
  return result;
}

async function main() {
  const db = new PrismaClient();
  try {
    const preview = await previewPayrollDemoData(db);
    console.log(JSON.stringify({ mode: 'preview', ...preview }, null, 2));
    if (!process.argv.includes(CONFIRM_FLAG)) {
      console.log('\nNo data was changed. This was preview mode only.');
      console.log(`To execute: PAYROLL_DEMO_CLEANUP_ACK=${REQUIRED_ACK} npm run db:clear:payroll-demo -- ${CONFIRM_FLAG}`);
      return;
    }
    if (process.env.PAYROLL_DEMO_CLEANUP_ACK !== REQUIRED_ACK) {
      throw new Error(`Refusing cleanup. Set PAYROLL_DEMO_CLEANUP_ACK=${REQUIRED_ACK}`);
    }
    await clearPayrollDemoData(db);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
