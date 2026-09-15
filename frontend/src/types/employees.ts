export interface EmployeeListItem {
  id: number;
  emp_code: number;
  employee: string;
  edara_n: string | null;
  qsm_n: string | null;
  phone: string | null;
  card_num: string | null;
  mosma_wazefy_n: string | null;
  employment_type: string | null;
  employee_type: 0 | 1 | 2;
  personal_photo: string | null;
  branch_id_fk: number | null;
  gender: number | null;
}

export interface FinanceData {
  basic_salary: string;
  rows: FinanceRowApi[];
}

export interface FinanceRowApi {
  id: string;
  badl_type: '1' | '2';
  badl_discount_id_fk: string;
  value: string;
  method_to_count: 'fixed' | 'percent' | 'days';
  specific_period: boolean;
  date_from: string;
  date_to: string;
  insurance_affect: boolean;
}

export interface DwamData {
  id?: number;
  shiftId: string;
  shiftName?: string;
  branchId: string;
  hdoorFromTime: string;
  hdoorToTime: string;
  hdoorKhasmFrom: string;
  ensrafFromTime: string;
  ensrafToTime: string;
  ensrafKhasmFrom: string;
  shift_type: string;
  schedule: { day: number; enabled: boolean; startTime: string; endTime: string }[];
  assignments: Array<{
    id: number;
    shiftId: string;
    shiftName?: string;
    branchId: string;
    branchName?: string;
    hdoorFromTime: string;
    hdoorToTime: string;
    hdoorKhasmFrom: string;
    ensrafFromTime: string;
    ensrafToTime: string;
    ensrafKhasmFrom: string;
  }>;
}

export interface EmployeeInsurance {
  tamin_rkm: number | null;
  type_tamin: string | null;
  tamin_mosama_wazefy: string | null;
  tamin_rateb: string | null;
  tamin_hesa_emp: string | null;
  tamin_hesa_oner: string | null;
  tamin_company: string | null;
  type_tamin__medicine: string | null;
  tamin_medicine_num: string | null;
  polica_num: string | null;
  start_tamin_date_m: string | null;
  tamin_date_m: string | null;
}

export interface EmployeeDocumentFile {
  id: number;
  title: string;
  emp_file: string;
  have_date: number;
  from_date: string | null;
  to_date: string | null;
  tanbih_fk: number | null;
  period: number | null;
}

export interface EmployeeBankRow {
  id: number;
  bank_id_fk: number;
  bank_account_num: string;
  emp_bank_name: string | null;
  approved_for_sarf: number;
  bank_id_fk_image: string | null;
}

export interface EmployeeContract {
  id: number;
  num_days_in_month: string;
  hours_work: string;
  hour_value: string;
  work_period_id_fk: string;
  contract_nature: number;
  job_type: string;
  pay_method_id_fk: string;
  bank_id_fk: string;
  bank_code: string;
  bank_account_num: string;
  year_vacation_num: string;
  year_vacation_period: string;
  casual_vacation_num: string;
  travel_ticket: string;
  travel_type_fk: string;
  travel_period: string;
  reward_end_work: number;
  vacation_previous_balance: number;
  vacation_start_m: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LookupItem {
  id: number;
  title: string;
}

export interface EmployeeFormData {
  emp_code: string;
  emp_name: string;
  direct_manager_fk: string;
  branch_id_fk: string;
  emp_type: string;
  job_title_id_fk: string;
  employment_type: string;
  addToSystem?: boolean;
  systemUsername?: string;
  systemPassword?: string;
  birth_date: string;
  age: string;
  gender: string;
  nationality_fk: string;
  deyana_fk: string;
  jwal: string;
  card_num: string;
  card_esdar_date: string;
  card_enhaa_date: string;
  address: string;
  emp_sign: string;
  emp_code_gym: string;
  birth_img: string;
  qualification_img: string;
  phesh_genai: string;
  shahadt_jaish: string;
  military_service: string;
  e3fa_reason: string;
  employee_qualification: string;
  // Section 2 — OLD personal/identity
  national_status_fk: string;
  birthdate: string;
  other_jwal: string;
  tahwela_rkm: string;
  type_card: string;
  gehat_esdar: string;
  esdar_date: string;
  end_date: string;
  city: string;
  hai_id_fk: string;
  street_name: string;
  national_address: string;
  adress_other: string;
  email: string;
  snap_chat: string;
  twiter: string;
}
