export interface GlobalSettings {
  id: number;
  instituteName: string | null;
  instituteEmail: string | null;
  address: string | null;
  mobile: string | null;
  logo: string | null;
  currency: string | null;
  currencySymbol: string | null;
  timezone: string | null;
  footerText: string | null;
  alertDaysContract: number | null;
  alertDaysResidency: number | null;
}

/** Raw conf_company_data row from GET /settings/company */
export interface CompanyRaw {
  id_config?: number;
  nameweb?: string | null;
  abbreviation_name?: string | null;
  telepon?: string | null;
  hp?: string | null;
  email?: string | null;
  address?: string | null;
}
