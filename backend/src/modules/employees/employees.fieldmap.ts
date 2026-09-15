/**
 * Maps the React employee-form field names → real `employees` table columns.
 * This map is also the write whitelist: only listed columns can be set from the form.
 */
export const FIELD_MAP: Record<string, string> = {
  edara_id_fk: 'edara_id',
  qsm_id_fk: 'qsm_id',
  emp_code: 'emp_code',
  emp_name: 'employee',
  direct_manager_fk: 'manger',
  branch_id_fk: 'branch_id_fk',
  emp_type: 'emp_type',
  birth_date: 'birth_date_m',
  birthdate: 'birth_date',
  age: 'age',
  gender: 'gender',
  nationality_fk: 'nationality',
  deyana_fk: 'deyana',
  jwal: 'phone',
  card_num: 'card_num',
  card_esdar_date: 'card_esdar_date',
  card_enhaa_date: 'card_enhaa_date',
  address: 'adress',
  emp_sign: 'emp_sign',
  personal_photo: 'personal_photo',
  emp_code_gym: 'emp_code_gym',
  birth_img: 'birth_img',
  qualification_img: 'qualification_img',
  phesh_genai: 'phesh_genai',
  shahadt_jaish: 'shahadt_jaish',
  military_service: 'military_service',
  e3fa_reason: 'e3fa_reason',
  employee_qualification: 'employee_qualification',
  previous_experience: 'previous_experience',
  skills: 'skills',
  languages: 'languages',
  national_status_fk: 'marital_status',
  other_jwal: 'another_phone',
  tahwela_rkm: 'tahwela_rkm',
  type_card: 'type_card',
  gehat_esdar: 'dest_card',
  esdar_date: 'esdar_date_m',
  end_date: 'end_date_m',
  rokhsa_mihani: 'rokhsa_mihani',
  person_img: 'person_img',
  city: 'city_id_fk',
  hai_id_fk: 'hai_id_fk',
  street_name: 'street_name',
  national_address: 'national_address',
  adress_other: 'adress_other',
  email: 'email',
  snap_chat: 'snap_chat',
  twiter: 'twiter',
  mosma_wazefy_n: 'mosma_wazefy_n',
  mosma_wazefy_code: 'mosma_wazefy_code',
  job_title_id_fk: 'mosma_wazefy_code',
  employment_type: 'employment_type',
  contract: 'contract',
  start_work_date_m: 'start_work_date_m',
  test_num_month: 'test_num_month',
  end_contract_date_m: 'end_contract_date_m',
  end_test_date_m: 'end_test_date_m',
  end_service_date_m: 'end_service_date_m',
  end_service_date: 'end_date', // legacy update_employee_job: post('end_date') → employees.end_date
  employee_type: 'employee_type',
  basic_salary: 'basic_salary',
  // Job-data tab fields (legacy update_employee_job / insert_manage_emp)
  degree_id: 'degree_id',
  cat_manager_id_fk: 'cat_manager_id_fk',
  cat_mosayer_id_fk: 'cat_mosayer_id_fk',
  work_maktb: 'work_maktb',
  reason: 'reason',
  administration: 'administration',
  department: 'department',
  show_in_mosayer: 'show_in_mosayer',
  show_in_tamen: 'show_in_tamen',
  insurance_number: 'insurance_number',
  type_tamin: 'type_tamin',
  tamin_rkm: 'tamin_rkm',
  tamin_mosama_wazefy: 'tamin_mosama_wazefy',
  start_tamin_date_m: 'start_tamin_date_m',
  tamin_date_m: 'tamin_date_m',
  tamin_rateb: 'tamin_rateb',
  tamin_hesa_emp: 'tamin_hesa_emp',
  tamin_hesa_oner: 'tamin_hesa_oner',
  type_tamin__medicine: 'type_tamin__medicine',
  tamin_company: 'tamin_company',
  tamin_medicine_num: 'tamin_medicine_num',
  polica_num: 'polica_num',
  tamin_type: 'tamin_type',
};

const INT_COLS = new Set([
  'edara_id',
  'qsm_id',
  'emp_code',
  'branch_id_fk',
  'emp_type',
  'age',
  'gender',
  'tahwela_rkm',
  'city_id_fk',
  'hai_id_fk',
  'test_num_month',
  'employee_type',
  'tamin_rkm',
  'marital_status',
  'emp_code_gym',
  'card_num',
  'mosma_wazefy_code',
  'cat_mosayer_id_fk',
  'insurance_number',
  'administration',
]);
const DECIMAL_COLS = new Set(['basic_salary', 'tamin_rateb', 'tamin_hesa_emp', 'tamin_hesa_oner']);
const YESNO_COLS = new Set([
  'birth_img',
  'qualification_img',
  'phesh_genai',
  'shahadt_jaish',
  'military_service',
  'person_img',
  'rokhsa_mihani',
  'show_in_mosayer',
  'show_in_tamen',
]);

function normalizeYesNo(v: unknown): 'yes' | 'no' {
  const s = String(v ?? '').toLowerCase();
  return s === 'yes' || s === '1' || s === 'true' ? 'yes' : 'no';
}

/** Coerce a form value to the right type for its DB column. */
export function coerce(col: string, value: unknown): unknown {
  if (YESNO_COLS.has(col)) return normalizeYesNo(value);
  const raw = value == null ? '' : String(value).trim();
  if (raw === '') return INT_COLS.has(col) || DECIMAL_COLS.has(col) ? null : null;
  if (INT_COLS.has(col)) {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (DECIMAL_COLS.has(col)) {
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
  return raw;
}

/** Build a Prisma `data` object from a form payload (forward map + coercion). */
export function formToData(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [formKey, col] of Object.entries(FIELD_MAP)) {
    // The visible field is canonical; a hidden legacy alias must not overwrite it.
    if (formKey === 'birthdate' && 'birth_date' in body) continue;
    if (formKey in body) data[col] = coerce(col, body[formKey]);
  }
  if ('birth_date' in body) {
    const birthDate = coerce('birth_date_m', body.birth_date);
    data.birth_date_m = birthDate;
    data.birth_date = birthDate;
  }
  return data;
}

/** Reverse map a DB row to the form's field names (for the edit form's defaultValues). */
export function rowToForm(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [formKey, col] of Object.entries(FIELD_MAP)) {
    const v = row[col];
    out[formKey] = v == null ? '' : String(v);
  }
  // Imported rows may store the Gregorian date only in the legacy column.
  if (!out.birth_date && out.birthdate) out.birth_date = out.birthdate;
  return out;
}
