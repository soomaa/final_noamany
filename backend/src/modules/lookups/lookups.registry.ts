/**
 * Lookup registry — verified against the seeded data.
 * employees_settings.type and all_defined_setting.defined_type codes were read
 * directly from the DB (not guessed):
 *   1=الجنس 2=الجنسية 3=الديانة 4=الحالة الاجتماعية 5=نوع الهوية 6=جهات إصدار الهوية
 *   7=شركات التأمين 8=فئات التأمين 9=الدوامات 10=العقود 11=أجهزة البصمة 12=مكاتب العمل
 *   13=أنواع تذاكر السفر 14=الدرجات العلمية 15=المؤهل العلمي 20=الغرض من الانتداب
 *   all_defined_setting: 1=allowances 2=deduction 3=type_contract 4=job_role
 */
export type LookupSource = 'employees_settings' | 'all_defined_setting' | 'banks' | 'cities' | 'hai';

export interface LookupDef {
  source: LookupSource;
  /** employees_settings.type */
  type?: number;
  /** all_defined_setting.defined_type */
  definedType?: number;
  /** label written into type_name / defined_type_title on create */
  typeName?: string;
  label: string;
  /**
   * True when the catalog rows are parented to another row (hai → city).
   * Such lookups accept/return a `parentId` (cities.from_id_fk) and the
   * list endpoint can be filtered by `?parent=<id>` (legacy get_hai/{city}).
   */
  parented?: boolean;
}

const es = (type: number, label: string): LookupDef => ({ source: 'employees_settings', type, typeName: label, label });
const def = (definedType: number, typeName: string, label: string): LookupDef => ({
  source: 'all_defined_setting',
  definedType,
  typeName,
  label,
});

export const LOOKUPS: Record<string, LookupDef> = {
  gender: es(1, 'الجنس'),
  nationality: es(2, 'الجنسية'),
  religion: es(3, 'الديانة'),
  social_status: es(4, 'الحالة الاجتماعية'),
  id_type: es(5, 'نوع الهوية'),
  id_issuer: es(6, 'جهات إصدار الهوية'),
  insurance_company: es(7, 'شركات التأمين'),
  insurance_category: es(8, 'فئات التأمين'),
  shift: es(9, 'الدوامات'),
  contract: es(10, 'العقود'),
  fingerprint_device: es(11, 'أجهزة البصمة'),
  labor_office: es(12, 'مكاتب العمل'),
  travel_ticket: es(13, 'أنواع تذاكر السفر'),
  degree: es(14, 'الدرجات العلمية'),
  qualification: es(15, 'المؤهل العلمي'),
  attachment: es(16, 'المرفقات'),
  cost_center: es(17, 'مراكز التكلفة'),
  emp_status_reason: es(18, 'أسباب حالات الموظفين'),
  insurance_coverage: es(19, 'أنواع التغطية التأمينية'),
  mission_purpose: es(20, 'الغرض من الانتداب'),
  blood_type: es(21, 'فصائل الدم'),
  allowance: def(1, 'allowances', 'البدلات والاستحقاقات'),
  deduction: def(2, 'deduction', 'الاستقطاعات'),
  contract_type: def(3, 'type_contract', 'أنواع العقود'),
  job_role: def(4, 'job_role', 'المسميات الوظيفية'),
  banks: { source: 'banks', label: 'البنوك' },
  // Address catalogs (legacy Employee_settings::cities / hai, table `cities`).
  // cities = rows with from_id_fk = 0; hai (الأحياء) = rows parented to a city.
  cities: { source: 'cities', label: 'المدن' },
  hai: { source: 'hai', label: 'الأحياء', parented: true },
};
