/**
 * Mirrors Solaf_requests_model::get_had_solfa_new (loan ceiling / حد السلفة).
 *
 * Legacy formula:
 *   sum_ofbadlat = ( SUM of enabled badalat values )
 *                  * ( aqsa_moda_sadad / 100 )
 *                  * ( had_adna )
 *   return round(sum_ofbadlat)
 *
 * Each badal is taken from hr_finance_employes, summed by (emp_id, badl_code),
 * and only added when its corresponding flag in hr_solaf_main_setting == 1.
 *
 * badl_code mapping (legacy):
 *   rateb_asasy  -> 100   (flag: rateb_asasy)
 *   bdl_sakn     -> 101   (flag: bdl_sakn)
 *   bdl_mowaslat -> 102   (flag: bdl_mowaslat)
 *   bdl_amal     -> 103   (flag: bdl_amal)      "تبعيات عمل"
 *   bdl_taklef   -> 104   (flag: bdl_taklef)    "تكليف"
 *   bdl_ma3esha  -> 105   (flag: bdl_ma3esha)   "إعانة معيشة"
 *   bdl_jwal     -> 106   (flag: bdl_jwal)      "اتصال"
 */

export interface LoanMainSetting {
  aqsa_moda_sadad: number | null;
  had_adna: number | null;
  rateb_asasy: number;
  bdl_sakn: number;
  bdl_mowaslat: number;
  bdl_jwal: number;
  bdl_amal: number;
  bdl_taklef: number;
  bdl_ma3esha: number;
}

/** badl_code -> setting-flag key, in legacy order. */
export const LOAN_BADAL_CODES: ReadonlyArray<{ code: number; flag: keyof LoanMainSetting }> = [
  { code: 100, flag: 'rateb_asasy' },
  { code: 101, flag: 'bdl_sakn' },
  { code: 102, flag: 'bdl_mowaslat' },
  { code: 103, flag: 'bdl_amal' },
  { code: 104, flag: 'bdl_taklef' },
  { code: 105, flag: 'bdl_ma3esha' },
  { code: 106, flag: 'bdl_jwal' },
];

/**
 * @param setting   hr_solaf_main_setting row (id=1)
 * @param sumByCode map of badl_code -> summed `value` for the employee
 */
export function computeLoanCeiling(
  setting: LoanMainSetting | null | undefined,
  sumByCode: Map<number, number>,
): number {
  if (!setting) return 0;
  const aqsa = setting.aqsa_moda_sadad ?? 0;
  const hadAdna = setting.had_adna ?? 0;

  let sumOfBadalat = 0;
  for (const { code, flag } of LOAN_BADAL_CODES) {
    if (Number(setting[flag]) === 1) {
      sumOfBadalat += sumByCode.get(code) ?? 0;
    }
  }

  const ceiling = sumOfBadalat * (aqsa / 100) * hadAdna;
  return Math.round(ceiling);
}
