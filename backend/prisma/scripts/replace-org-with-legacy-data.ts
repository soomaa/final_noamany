/* eslint-disable no-console */
/**
 * Replace demo organization data with the verified rows extracted from:
 *   D:\asmaa\noamany_old\noamanycenter_hr.sql (2026-08-17 server export)
 *
 * Source mapping confirmed from the legacy application code:
 * - Departments/sections: hr_edarat_aqsam
 * - Job titles: all_defined_setting WHERE defined_type = 4
 *
 * Preview (default, read-only):
 *   npm run db:replace:org-legacy
 *
 * Execute only after reviewing the preview:
 *   ORG_REPLACEMENT_ACK=REPLACE_DEMO_ORG_WITH_LEGACY \
 *     npm run db:replace:org-legacy -- --confirm-org-replacement
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { syncAllJobTitleRoles } from '../../src/modules/rbac/job-title-role.util';

const prisma = new PrismaClient();
const CONFIRM_FLAG = '--confirm-org-replacement';
const CLEAR_INVALID_EMPLOYEE_REFS_FLAG = '--clear-invalid-employee-org-references';
const REQUIRED_ACK = 'REPLACE_DEMO_ORG_WITH_LEGACY';

const LEGACY_DEPARTMENTS = [
  { id: 10, title_id: 0, title_code: null, title: 'الادارة المالية', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 11, title_id: 0, title_code: null, title: 'ادارة الموارد البشرية', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 14, title_id: 0, title_code: null, title: 'الادارة التنفيذية', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 17, title_id: 0, title_code: null, title: 'قسم حسابات ومخازن ومشتريات', from_id_fk: 10, trteeb: null, from_code: 0, to_code: 0 },
  { id: 18, title_id: 0, title_code: null, title: 'القبض والتوظيف', from_id_fk: 11, trteeb: null, from_code: 0, to_code: 0 },
  { id: 23, title_id: 0, title_code: null, title: 'مديرين الاداره ومديرين الفروع', from_id_fk: 14, trteeb: null, from_code: 0, to_code: 0 },
  { id: 25, title_id: 0, title_code: null, title: 'كباتن', from_id_fk: 29, trteeb: null, from_code: 0, to_code: 0 },
  { id: 28, title_id: 0, title_code: null, title: 'الاستقبال', from_id_fk: 30, trteeb: null, from_code: 0, to_code: 0 },
  { id: 29, title_id: 0, title_code: null, title: 'اداره الكباتن', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 30, title_id: 0, title_code: null, title: 'اداره الريسيبشن', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 31, title_id: 0, title_code: null, title: 'اداره الخدمات', from_id_fk: 0, trteeb: null, from_code: 0, to_code: 0 },
  { id: 32, title_id: 0, title_code: null, title: 'hk', from_id_fk: 31, trteeb: null, from_code: 0, to_code: 0 },
] as const;

const LEGACY_JOB_TITLES = [
  { id: 25, name: 'المدير العام (ceo)', from_id_fk: 0, status: 0, in_order: '1', dep_code: 25, edara_id: null, is_trainer: false },
  { id: 32, name: 'مدير الاداره الرجالي', from_id_fk: 0, status: 0, in_order: '2', dep_code: 32, edara_id: null, is_trainer: false },
  { id: 36, name: 'مدير الاداره الحريمي', from_id_fk: 0, status: 0, in_order: '3', dep_code: 36, edara_id: null, is_trainer: false },
  { id: 38, name: 'مدير الجوده', from_id_fk: 0, status: 0, in_order: '4', dep_code: 38, edara_id: null, is_trainer: false },
  { id: 42, name: 'مديرة قسم الحسابات', from_id_fk: 0, status: 0, in_order: '5', dep_code: 42, edara_id: null, is_trainer: false },
  { id: 44, name: 'مسئولة الموارد البشرية', from_id_fk: 0, status: 0, in_order: '6', dep_code: 44, edara_id: null, is_trainer: false },
  { id: 48, name: 'كابتن', from_id_fk: 0, status: 0, in_order: '7', dep_code: 48, edara_id: null, is_trainer: true },
  { id: 59, name: 'مسئول ريسيبشن', from_id_fk: 0, status: 0, in_order: '8', dep_code: 59, edara_id: null, is_trainer: false },
  { id: 70, name: 'موظف ريسيبشن', from_id_fk: 0, status: 0, in_order: '9', dep_code: 70, edara_id: null, is_trainer: false },
  { id: 71, name: 'عامل خدمات', from_id_fk: 0, status: 0, in_order: '10', dep_code: 71, edara_id: null, is_trainer: false },
  { id: 72, name: 'موظف بار', from_id_fk: 0, status: 0, in_order: '11', dep_code: 72, edara_id: null, is_trainer: false },
  { id: 73, name: 'مدير فرع', from_id_fk: 0, status: 0, in_order: '12', dep_code: 73, edara_id: null, is_trainer: false },
] as const;

function normalize(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function currentSnapshot() {
  const [departments, jobTitles, relations, employees] = await Promise.all([
    prisma.hr_edarat_aqsam.findMany({ orderBy: { id: 'asc' } }),
    prisma.department_jobs.findMany({ orderBy: { id: 'asc' } }),
    prisma.department_job_relations.findMany({ orderBy: { id: 'asc' } }),
    prisma.employees.findMany({
      select: {
        id: true,
        emp_code: true,
        employee: true,
        edara_id: true,
        edara_n: true,
        qsm_id: true,
        qsm_n: true,
        mosma_wazefy_code: true,
        mosma_wazefy_n: true,
      },
      orderBy: { id: 'asc' },
    }),
  ]);
  return { departments, jobTitles, relations, employees };
}

function employeeReferenceMismatches(snapshot: Awaited<ReturnType<typeof currentSnapshot>>) {
  const departments = new Map<number, string>(LEGACY_DEPARTMENTS.map((row) => [row.id, row.title]));
  const jobs = new Map<number, string>(LEGACY_JOB_TITLES.map((row) => [row.id, row.name]));
  const mismatches: Array<{ employeeId: number; message: string }> = [];

  for (const employee of snapshot.employees) {
    const label = `${employee.id}/${employee.emp_code ?? '—'} ${employee.employee ?? ''}`.trim();
    if (employee.edara_id != null) {
      const targetName = departments.get(employee.edara_id);
      if (!targetName || normalize(targetName) !== normalize(employee.edara_n)) {
        mismatches.push({ employeeId: employee.id, message: `${label}: الإدارة الحالية لن تطابق البيانات الجديدة` });
      }
    }
    if (employee.qsm_id != null) {
      const targetName = departments.get(employee.qsm_id);
      if (!targetName || normalize(targetName) !== normalize(employee.qsm_n)) {
        mismatches.push({ employeeId: employee.id, message: `${label}: القسم الحالي لن يطابق البيانات الجديدة` });
      }
    }
    if (employee.mosma_wazefy_code != null) {
      const targetName = jobs.get(employee.mosma_wazefy_code);
      if (!targetName || normalize(targetName) !== normalize(employee.mosma_wazefy_n)) {
        mismatches.push({ employeeId: employee.id, message: `${label}: المسمى الوظيفي الحالي لن يطابق البيانات الجديدة` });
      }
    }
  }
  return mismatches;
}

async function writeBackup(snapshot: Awaited<ReturnType<typeof currentSnapshot>>) {
  const backupDir = path.resolve(process.cwd(), 'backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `org-before-legacy-replacement-${stamp}.json`);
  await writeFile(filename, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', flag: 'wx' });
  return filename;
}

async function main() {
  const snapshot = await currentSnapshot();
  const mismatches = employeeReferenceMismatches(snapshot);
  const blockers = mismatches.map((row) => row.message);
  const preview = {
    mode: 'preview',
    current: {
      departments: snapshot.departments.map((row) => ({ id: row.id, title: row.title, parentId: row.from_id_fk })),
      jobTitles: snapshot.jobTitles.map((row) => ({ id: row.id, name: row.name })),
      employees: snapshot.employees.length,
    },
    replacement: {
      departments: LEGACY_DEPARTMENTS.filter((row) => row.from_id_fk === 0).length,
      sections: LEGACY_DEPARTMENTS.filter((row) => row.from_id_fk !== 0).length,
      jobTitles: LEGACY_JOB_TITLES.length,
    },
    blockers,
  };
  console.log(JSON.stringify(preview, null, 2));

  const confirmed = process.argv.includes(CONFIRM_FLAG);
  if (!confirmed) {
    console.log('\nPreview only. No database rows were changed.');
    return;
  }
  if (process.env.ORG_REPLACEMENT_ACK !== REQUIRED_ACK) {
    throw new Error(`Set ORG_REPLACEMENT_ACK=${REQUIRED_ACK} before confirmed execution`);
  }
  const clearInvalidEmployeeRefs = process.argv.includes(CLEAR_INVALID_EMPLOYEE_REFS_FLAG);
  if (blockers.length > 0 && !clearInvalidEmployeeRefs) {
    throw new Error(`Replacement blocked: ${blockers.length} employee reference(s) require review`);
  }

  const backupFile = await writeBackup(snapshot);
  console.log(`Safety backup written: ${backupFile}`);

  await prisma.$transaction(async (tx) => {
    if (mismatches.length > 0) {
      const employeeIds = [...new Set(mismatches.map((row) => row.employeeId))];
      await tx.employees.updateMany({
        where: { id: { in: employeeIds } },
        data: {
          edara_id: null,
          edara_n: null,
          qsm_id: null,
          qsm_n: null,
          mosma_wazefy_code: null,
          mosma_wazefy_n: null,
        },
      });
    }
    await tx.department_job_relations.deleteMany();
    await tx.department_jobs.deleteMany();
    await tx.hr_edarat_aqsam.deleteMany();
    await tx.hr_edarat_aqsam.createMany({ data: LEGACY_DEPARTMENTS.map((row) => ({ ...row })) });
    await tx.department_jobs.createMany({ data: LEGACY_JOB_TITLES.map((row) => ({ ...row })) });
  });

  await syncAllJobTitleRoles(prisma);
  const [departmentCount, jobTitleCount] = await Promise.all([
    prisma.hr_edarat_aqsam.count(),
    prisma.department_jobs.count(),
  ]);
  if (departmentCount !== LEGACY_DEPARTMENTS.length || jobTitleCount !== LEGACY_JOB_TITLES.length) {
    throw new Error(`Post-check failed: departments=${departmentCount}, jobTitles=${jobTitleCount}`);
  }
  console.log(`Replacement complete: 6 departments, 6 sections, ${jobTitleCount} job titles.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
