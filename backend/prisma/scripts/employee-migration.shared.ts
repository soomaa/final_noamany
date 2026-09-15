import { Prisma, PrismaClient, YesNo } from '@prisma/client';

export interface LegacyEmployee {
  id: number;
  emp_code: number;
  employee: string;
  card_num: string;
  phone: number;
  branch_id_fk: number;
  gender: number;
  adress: string;
  nationality: number;
  deyana: number;
  job_title: string;
  employee_type: number;
  date_ar: string;
  date_s: string;
  personal_photo: string;
  publisher: number;
  type: number | null;
  edara_id: number;
  edara_n: string;
  employee_qualification_fk: number;
  employee_qualification: string;
  contract: string;
  end_contract_date: string;
  test_num_month: number;
  end_test_date: string;
  type_tamin: string;
  start_work_date: string;
}

export interface EmployeeTransformContext {
  branchByLegacyId: Map<number, number>;
  genderByLegacyId: Map<number, number>;
  jobByName: Map<string, number>;
  departmentByName: Map<string, number>;
}

export interface TransformedEmployee {
  data: Prisma.employeesUncheckedCreateInput;
  warnings: string[];
}

const NATIONALITY_BY_LEGACY_ID = new Map<number, string>([
  [54, 'مصري'],
  [55, 'سعودي'],
]);
const RELIGION_BY_LEGACY_ID = new Map<number, string>([
  [56, 'مسلم'],
  [57, 'مسيحي'],
]);
export const GENDER_TITLE_BY_LEGACY_ID = new Map<number, string>([
  [52, 'ذكر'],
  [53, 'أنثى'],
]);

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function databaseName(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!name) throw new Error('Database URL does not contain a database name');
  return name;
}

export function resolveLegacyUrl(targetUrl: string): string {
  const legacyDatabase = process.env.LEGACY_DATABASE?.trim();
  if (legacyDatabase) {
    if (!/^[A-Za-z0-9_$-]+$/.test(legacyDatabase)) {
      throw new Error('LEGACY_DATABASE contains unsupported characters');
    }
    const parsed = new URL(targetUrl);
    parsed.pathname = `/${legacyDatabase}`;
    return parsed.toString();
  }
  const explicit = process.env.OLD_DATABASE_URL?.trim();
  if (explicit) return explicit;
  throw new Error('Set LEGACY_DATABASE, or set OLD_DATABASE_URL to the old database URL');
}

export function comparableDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port || '3306'}/${databaseName(url)}`;
}

export function employeeSourceKey(url: string): string {
  const configured =
    process.env.LEGACY_SOURCE_KEY?.trim() || process.env.LEGACY_EMPLOYEE_SOURCE_KEY?.trim();
  if (configured) {
    if (configured.length > 191) throw new Error('LEGACY_SOURCE_KEY must be at most 191 characters');
    return configured;
  }
  const parsed = new URL(url);
  const key = `${parsed.hostname.toLowerCase()}:${parsed.port || '3306'}/${databaseName(url)}`;
  if (key.length > 191) throw new Error('Derived legacy source key is longer than 191 characters');
  return key;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ar-EG')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function cleanText(value: unknown, max: number): string | null {
  const cleaned = String(value ?? '').trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned.slice(0, max) : null;
}

export async function readLegacyEmployees(legacy: PrismaClient): Promise<LegacyEmployee[]> {
  return legacy.$queryRaw<LegacyEmployee[]>`
    SELECT
      id, emp_code, employee, card_num, phone, branch_id_fk, gender, adress,
      nationality, deyana, job_title, employee_type, date_ar, date_s,
      personal_photo, publisher, type, edara_id, edara_n,
      employee_qualification_fk, employee_qualification, contract,
      end_contract_date, test_num_month, end_test_date, type_tamin,
      start_work_date
    FROM tbl_employees
    ORDER BY id ASC
  `;
}

export function validateLegacyEmployees(rows: LegacyEmployee[]): void {
  const ids = new Set<number>();
  const codes = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.id) || row.id <= 0) throw new Error(`Invalid legacy employee ID: ${row.id}`);
    if (ids.has(row.id)) throw new Error(`Duplicate legacy employee ID: ${row.id}`);
    ids.add(row.id);
    if (!Number.isInteger(row.emp_code) || row.emp_code <= 0) {
      throw new Error(`Invalid emp_code for legacy employee ${row.id}: ${row.emp_code}`);
    }
    if (codes.has(row.emp_code)) throw new Error(`Duplicate legacy emp_code: ${row.emp_code}`);
    codes.add(row.emp_code);
    if (!cleanText(row.employee, 200)) throw new Error(`Employee name is empty for legacy ID ${row.id}`);
  }
}

function phoneValue(row: LegacyEmployee, warnings: string[]): string | null {
  const raw = String(row.phone ?? '').trim();
  if (!raw || raw === '0') return null;
  if (raw === '2147483647') {
    warnings.push(`legacy=${row.id}: phone is MySQL INT overflow value 2147483647; stored as NULL`);
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    warnings.push(`legacy=${row.id}: phone is not numeric; stored as NULL`);
    return null;
  }
  return raw.length === 10 && raw.startsWith('1') ? `0${raw}` : raw.slice(0, 20);
}

function bigintCard(value: string): bigint | null {
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function yesNo(value: unknown): YesNo {
  return String(value ?? '').toLowerCase() === 'yes' || String(value) === '1' ? YesNo.yes : YesNo.no;
}

export function transformEmployee(
  row: LegacyEmployee,
  context: EmployeeTransformContext,
): TransformedEmployee {
  const warnings: string[] = [];
  const branchId = context.branchByLegacyId.get(row.branch_id_fk);
  if (!branchId) {
    throw new Error(
      `No branch mapping for legacy employee ${row.id}; legacy branch=${row.branch_id_fk}`,
    );
  }
  const genderId = context.genderByLegacyId.get(row.gender);
  if (!genderId) warnings.push(`legacy=${row.id}: unknown gender lookup ${row.gender}; stored as NULL`);

  const name = cleanText(row.employee, 200);
  if (!name) throw new Error(`Employee name is empty for legacy ID ${row.id}`);
  const jobTitle = cleanText(row.job_title, 50);
  const departmentName = cleanText(row.edara_n, 50);
  const card = String(row.card_num ?? '').trim();
  const photo = cleanText(row.personal_photo, 200);
  const isUploadError = photo?.startsWith('<') || photo?.includes('did not select a file');
  if (isUploadError) warnings.push(`legacy=${row.id}: invalid personal_photo placeholder removed`);
  if (card.length > 15) warnings.push(`legacy=${row.id}: card_num truncated to 15 characters in demo_card`);

  const normalizedJob = jobTitle ? normalizeText(jobTitle) : '';
  const normalizedDepartment = departmentName ? normalizeText(departmentName) : '';
  const mappedDepartment = normalizedDepartment
    ? context.departmentByName.get(normalizedDepartment)
    : undefined;

  return {
    warnings,
    data: {
      emp_code: row.emp_code,
      employee: name,
      branch_id_fk: branchId,
      emp_type: row.gender === 53 ? 2 : 1,
      card_num: bigintCard(card),
      demo_card: card ? card.slice(0, 15) : `LEGACY-${row.id}`.slice(0, 15),
      gender: genderId ?? null,
      status: row.employee_type === 1 ? 1 : 0,
      phone: phoneValue(row, warnings),
      edara_id: mappedDepartment ?? (row.edara_id > 0 ? row.edara_id : null),
      edara_n: departmentName,
      mosma_wazefy_code: normalizedJob ? context.jobByName.get(normalizedJob) ?? null : null,
      mosma_wazefy_n: jobTitle,
      adress: cleanText(row.adress, 100),
      nationality: NATIONALITY_BY_LEGACY_ID.get(row.nationality) ?? (String(row.nationality || '') || null),
      deyana: RELIGION_BY_LEGACY_ID.get(row.deyana) ?? (String(row.deyana || '') || null),
      employee_qualification: cleanText(row.employee_qualification, 100),
      contract: cleanText(row.contract, 100),
      employee_type: row.employee_type > 0 ? row.employee_type : 1,
      type_tamin: cleanText(row.type_tamin, 100),
      start_work_date_m: cleanText(row.start_work_date, 255),
      end_contract_date_m: cleanText(row.end_contract_date, 255),
      test_num_month: row.test_num_month || null,
      end_test_date_m: cleanText(row.end_test_date, 30),
      personal_photo: isUploadError ? null : photo,
      publisher: row.publisher || null,
      date_ar: cleanText(row.date_ar, 50),
      date_s: cleanText(row.date_s, 50),
      shahadt_jaish: yesNo(0),
      tamin_rkm: 0,
      khedma_year: 0,
      age: 0,
      neqat_total: 7000,
    },
  };
}

export async function buildTransformContext(
  target: PrismaClient | Prisma.TransactionClient,
  sourceKey: string,
): Promise<EmployeeTransformContext> {
  const [branchMappings, genderSettings, jobs, departments] = await Promise.all([
    target.legacy_branch_mappings.findMany({
      where: { source_key: sourceKey },
      select: { legacy_id: true, new_branch_id: true },
    }),
    target.employees_settings.findMany({
      where: { type: 1 },
      select: { id_setting: true, title_setting: true },
    }),
    target.department_jobs.findMany({ select: { id: true, name: true } }),
    target.hr_edarat_aqsam.findMany({ select: { id: true, title: true } }),
  ]);
  const genderByLegacyId = new Map<number, number>();
  for (const [legacyId, title] of GENDER_TITLE_BY_LEGACY_ID) {
    const match = genderSettings.find((item) => normalizeText(item.title_setting) === normalizeText(title));
    // If the target lookup catalog is empty, retain the verified legacy IDs
    // (52=ذكر, 53=أنثى) instead of discarding the employee's gender.
    genderByLegacyId.set(legacyId, match?.id_setting ?? legacyId);
  }
  return {
    branchByLegacyId: new Map(branchMappings.map((item) => [item.legacy_id, item.new_branch_id])),
    genderByLegacyId,
    jobByName: new Map(jobs.map((item) => [normalizeText(item.name), item.id])),
    departmentByName: new Map(
      departments.flatMap((item) => item.title ? [[normalizeText(item.title), item.id] as const] : []),
    ),
  };
}
