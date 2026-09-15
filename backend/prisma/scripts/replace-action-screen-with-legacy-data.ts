/* eslint-disable no-console */
/**
 * Replace demo action-screen assignments with the verified rows extracted from:
 *   D:\asmaa\noamany_old\noamanycenter_hr.sql (2026-08-17 server export)
 *
 * Preview (read-only):
 *   npm run db:replace:action-screen-legacy
 *
 * Confirmed execution:
 *   ACTION_SCREEN_REPLACEMENT_ACK=REPLACE_DEMO_ACTION_SCREEN_WITH_LEGACY \
 *     npm run db:replace:action-screen-legacy -- --confirm-action-screen-replacement
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM_FLAG = '--confirm-action-screen-replacement';
const REQUIRED_ACK = 'REPLACE_DEMO_ACTION_SCREEN_WITH_LEGACY';

const LEGACY_ACTION_ROWS = [
  { id: 1, job_title_id_fk: 25, job_title_code_fk: 25, job_title_n: 'المدير العام (ceo)', person_type: 1, person_id: 1, person_code: '1', person_name: 'محمد ابراهيم سعد النعماني', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'mohamed elnoamany', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 2, job_title_id_fk: 44, job_title_code_fk: 44, job_title_n: 'مسئولة الموارد البشرية', person_type: 1, person_id: 2, person_code: '2', person_name: 'ندي حازم احمد سبيكه', person_qsm: 'القبض والتوظيف ', person_edara: 'ادارة الموارد البشرية', person_private_name: 'nada hazem', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 3, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 3, person_code: '3', person_name: 'نهاد علي محمود خطاب', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'nehad khattab', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 4, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 13, person_code: '13', person_name: 'ريهام محمد عبد العزيز حبيب', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'rehaam habib', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 5, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 26, person_code: '26', person_name: 'مصطفى اشرف عبد المنعم بيومى ', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'mostafa biomy', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 6, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 45, person_code: '45', person_name: 'روضه سعد نجاح الجندى ', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'rawda saad', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1783544400, date_ar: '2026-07-09', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 7, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 35, person_code: '35', person_name: 'محمد عباس ابراهيم الحبله', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'mohamed abbas', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 8, job_title_id_fk: 73, job_title_code_fk: 73, job_title_n: 'مدير فرع', person_type: 1, person_id: 58, person_code: '58', person_name: 'السيد سيد احمد محمد جاد', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'sayed gad', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 9, job_title_id_fk: 32, job_title_code_fk: 32, job_title_n: 'مدير الاداره الرجالي', person_type: 1, person_id: 59, person_code: '59', person_name: 'خالد مرسي', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'khaled morsy', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 10, job_title_id_fk: 36, job_title_code_fk: 36, job_title_n: 'مدير الاداره الحريمي', person_type: 1, person_id: 60, person_code: '60', person_name: 'مها رجب عطيه', person_qsm: 'مديرين الاداره ومديرين الفروع', person_edara: 'الادارة التنفيذية', person_private_name: 'maha ragb', person_img: ' ', person_suspend: 1, from_date: '2025-10-29', to_date: '', from_date_str: '1761685200', to_date_str: '0', date: 1761685200, date_ar: '2025-10-29', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 13, job_title_id_fk: 59, job_title_code_fk: 59, job_title_n: 'مسئول ريسيبشن', person_type: 1, person_id: 22, person_code: '22', person_name: 'روضه محمد فتحى عبد الرؤوف', person_qsm: 'الاستقبال ', person_edara: 'اداره الريسيبشن', person_private_name: 'rawda mohamed', person_img: ' ', person_suspend: 1, from_date: '2025-11-01', to_date: '', from_date_str: '1761948000', to_date_str: '0', date: 1761948000, date_ar: '2025-11-01', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 14, job_title_id_fk: 59, job_title_code_fk: 59, job_title_n: 'مسئول ريسيبشن', person_type: 1, person_id: 18, person_code: '18', person_name: 'عمر اسامه على قهوه', person_qsm: 'الاستقبال ', person_edara: 'اداره الريسيبشن', person_private_name: 'omar osama', person_img: ' ', person_suspend: 1, from_date: '2025-11-01', to_date: '', from_date_str: '1761948000', to_date_str: '0', date: 1761948000, date_ar: '2025-11-01', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 15, job_title_id_fk: 59, job_title_code_fk: 59, job_title_n: 'مسئول ريسيبشن', person_type: 1, person_id: 46, person_code: '46', person_name: 'ايه وائل محمد صلاح الدين داود', person_qsm: 'الاستقبال ', person_edara: 'اداره الريسيبشن', person_private_name: 'aya wael', person_img: ' ', person_suspend: 1, from_date: '2025-11-01', to_date: '', from_date_str: '1761948000', to_date_str: '0', date: 1761948000, date_ar: '2025-11-01', publisher: 128, publisher_name: 'admin', web_display: 0 },
  { id: 16, job_title_id_fk: 42, job_title_code_fk: 42, job_title_n: 'مديرة قسم الحسابات', person_type: 1, person_id: 2, person_code: '2', person_name: 'ندي حازم احمد سبيكه', person_qsm: 'القبض والتوظيف ', person_edara: 'ادارة الموارد البشرية', person_private_name: 'nada', person_img: ' ', person_suspend: 1, from_date: '2025-11-05', to_date: '', from_date_str: '1762293600', to_date_str: '0', date: 1762293600, date_ar: '2025-11-05', publisher: 128, publisher_name: 'admin', web_display: 0 },
] as const;

function normalize(value: string | null | undefined): string {
  return String(value ?? '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function snapshot() {
  const [actions, employees, jobTitles] = await Promise.all([
    prisma.hr_egraat_emp_setting.findMany({ orderBy: { id: 'asc' } }),
    prisma.employees.findMany({ select: { id: true, emp_code: true, employee: true }, orderBy: { id: 'asc' } }),
    prisma.department_jobs.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
  ]);
  return { actions, employees, jobTitles };
}

function referenceReview(data: Awaited<ReturnType<typeof snapshot>>) {
  const employees = new Map(data.employees.map((row) => [String(row.emp_code), row]));
  const jobs = new Map(data.jobTitles.map((row) => [row.id, row.name]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const row of LEGACY_ACTION_ROWS) {
    const employee = employees.get(row.person_code);
    if (!employee) blockers.push(`الإجراء ${row.id}: الموظف بالكود ${row.person_code} غير موجود`);
    else if (normalize(employee.employee) !== normalize(row.person_name)) warnings.push(`الإجراء ${row.id}: الكود ${row.person_code} مستخدم حاليًا باسم مختلف؛ سيُحفظ السجل التاريخي بدون person_id`);
    const jobName = jobs.get(row.job_title_code_fk);
    if (!jobName) blockers.push(`الإجراء ${row.id}: المسمى رقم ${row.job_title_code_fk} غير موجود`);
    else if (normalize(jobName) !== normalize(row.job_title_n)) blockers.push(`الإجراء ${row.id}: اسم المسمى رقم ${row.job_title_code_fk} مختلف`);
  }
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

function replacementRows(data: Awaited<ReturnType<typeof snapshot>>) {
  const employees = new Map(data.employees.map((row) => [String(row.emp_code), row]));
  return LEGACY_ACTION_ROWS.map((row) => {
    const employee = employees.get(row.person_code);
    const sameEmployee = employee && normalize(employee.employee) === normalize(row.person_name);
    return { ...row, person_id: sameEmployee ? employee.id : null };
  });
}

async function writeBackup(data: Awaited<ReturnType<typeof snapshot>>) {
  const backupDir = path.resolve(process.cwd(), 'backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `action-screen-before-legacy-replacement-${stamp}.json`);
  await writeFile(filename, JSON.stringify(data.actions, null, 2), { encoding: 'utf8', flag: 'wx' });
  return filename;
}

async function main() {
  const data = await snapshot();
  const review = referenceReview(data);
  const blockers = review.blockers;
  console.log(JSON.stringify({
    mode: 'preview',
    currentRows: data.actions.map((row) => ({ id: row.id, personCode: row.person_code, personName: row.person_name, jobTitle: row.job_title_n })),
    replacementRows: LEGACY_ACTION_ROWS.length,
    replacementEmployees: new Set(LEGACY_ACTION_ROWS.map((row) => row.person_code)).size,
    blockers,
    warnings: review.warnings,
  }, null, 2));

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.log('\nPreview only. No database rows were changed.');
    return;
  }
  if (process.env.ACTION_SCREEN_REPLACEMENT_ACK !== REQUIRED_ACK) {
    throw new Error(`Set ACTION_SCREEN_REPLACEMENT_ACK=${REQUIRED_ACK} before confirmed execution`);
  }
  if (blockers.length) throw new Error(`Replacement blocked: ${blockers.length} reference issue(s) require review`);

  const backupFile = await writeBackup(data);
  console.log(`Safety backup written: ${backupFile}`);
  await prisma.$transaction(async (tx) => {
    await tx.hr_egraat_emp_setting.deleteMany();
    await tx.hr_egraat_emp_setting.createMany({ data: replacementRows(data) });
  });
  const count = await prisma.hr_egraat_emp_setting.count();
  if (count !== LEGACY_ACTION_ROWS.length) throw new Error(`Post-check failed: actionRows=${count}`);
  console.log(`Replacement complete: ${count} action-screen rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
