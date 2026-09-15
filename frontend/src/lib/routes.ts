/**
 * Maps legacy CodeIgniter `pages.page_link` to routes in the new app.
 * More specific patterns are checked first.
 */
export function resolveRoute(legacyLink: string | null | undefined): string {
  if (!legacyLink || legacyLink === '#') return '#';
  const link = legacyLink.toLowerCase();

  const mappings: [string[], string][] = [
    // Permissions — specific status routes first
    [['all_ozonat/wared'], '/permissions?mode=wared'],
    [['all_ozonat/accept'], '/permissions?mode=accept'],
    [['all_ozonat/reject'], '/permissions?mode=reject'],
    [['request_ozonat_data'], '/permissions?mode=tracking'],
    [['all_ozonat', 'ezn_order'], '/permissions'],

    // Leaves — specific status routes first
    [['all_agazat/wared'], '/leaves?mode=wared'],
    [['all_agazat/accept'], '/leaves?mode=accept'],
    [['all_agazat/reject'], '/leaves?mode=reject'],
    [['request_vacation_data'], '/leaves?mode=tracking'],
    [['vacation/all_agazat', 'all_agazat/vacation'], '/leaves'],

    // Loans — specific status routes first
    [['all_solaf/wared'], '/loans?status=incoming'],
    [['all_solaf/accept'], '/loans?status=approved'],
    [['all_solaf/reject'], '/loans?status=rejected'],
    [['solaf/all_solaf'], '/loans'],
    [['add_setting_solf', 'solaf_setting'], '/loans/settings'],

    // Attendance period reports
    [['get_basma_report'], '/reports/attendance-daily'],
    [['absence_report'], '/reports/attendance-absence'],
    [['get_late_report'], '/reports/attendance-late'],
    [['tabdel_sheft_report'], '/reports/attendance-shift'],
    [['get_hours_edafi_report'], '/reports/attendance-overtime'],

    // HR settings — specific screens
    [['salaries_setting_data', 'salaries_setting'], '/payroll/salary-scale'],
    [['get_agzat_dayes_data'], '/employees/weekly-leaves'],
    [['job_setting', 'forms_settings'], '/settings/forms'],
    [['egraat_emp_data'], '/hr/action-screen'],
    [['egraat_settings/settings', 'add_setting'], '/hr/gym-rates'],
    [['evaluation_employee', 'add_taqeem'], '/hr/evaluations'],
    [['custody_new', 'custody'], '/hr/custody'],
    [['ehtyag_request', 'job_request', 'talb_tawzef'], '/hr/job-requests'],

    // Sites & missions
    [['mohmt_3mal', 'add_mohmt_3mal'], '/missions'],
    [['site_zeyarat', 'sites_zeyarat'], '/sites/visits'],

    // Termination & HR comms
    [['disclaimer_data', 'disclaimer/'], '/termination/clearance'],
    [['constraint_data', 'collapseconstraint'], '/termination/archive'],
    [['ta3mem_c'], '/hr/circulars'],
    [['/enzar', 'enzar/'], '/hr/warnings'],

    // Employees — specific screens first
    [['employee_data_new', 'add_employee'], '/employees/new'],
    [['employee_data_active'], '/employees?status=1'],
    [['employee_data_notactive'], '/employees?status=2'],
    [['employees_data', 'employee_data'], '/employees'],

    // HR settings (general)
    [['employee_settings', 'setting_new'], '/settings/pay-components'],
    [['egraat_settings'], '/hr/gym-rates'],

    // Attendance / shifts
    [['dwam_settings', 'add_dwam_setting'], '/attendance/settings'],
    [['hdoor_rule', 'attendance_rule'], '/attendance/rules'],
    [['zkteco', 'device', 'hdoor_device'], '/attendance/devices'],
    [['attendance', 'hdoor', 'basma'], '/attendance'],

    // Leaves settings
    [['holiday_setting', 'holidays_setting'], '/leaves/types'],

    // Missions (legacy)
    [['mamoria'], '/missions'],

    // Rewards / penalties
    [['all_mokafat', 'mokafa'], '/rewards'],
    [['all_gazaat', 'gazaat', 'penalty', 'jaza'], '/penalties'],

    // Payroll
    [['period_zeyzda'], '/payroll/increases/report'],
    [['add_zeyzda', 'zeyzda_rateb'], '/payroll/increases'],
    [['employee_salaries', 'payroll', 'salary', 'mosayer'], '/payroll/runs'],
    [['payroll_setup', 'salary_setup'], '/payroll/setup'],

    // Documents / requests / notifications
    [['document', 'mostnad', 'emp_file'], '/documents'],
    [['request', 'talabat'], '/requests'],
    [['notification', 'tanbih'], '/notifications'],

    // Org / users / company
    [['dashboard'], '/dashboard'],
    [['config_company', 'company'], '/company'],
    [['user', 'users'], '/users'],
    [['branch'], '/org/branches'],
    [['edara', 'department', 'hr_edarat'], '/org/departments'],
    [['pay_component', 'badlat', 'emp_badlat'], '/settings/pay-components'],
    [['leave'], '/leaves'],
    [['mission'], '/missions'],
    [['loan', 'solaf', 'advance'], '/loans'],
    [['reward'], '/rewards'],
    [['report', 'taqrir'], '/reports'],
    [['profile'], '/profile'],

    // Broad HR fallback (after specific routes)
    [['human_resources/human_resources'], '/employees'],
    [['human_resources'], '/employees'],
  ];

  for (const [keys, route] of mappings) {
    if (keys.some((k) => link.includes(k))) return route;
  }

  return `/m/${encodeURIComponent(legacyLink)}`;
}

export function isPlaceholder(route: string): boolean {
  return route.startsWith('/m/');
}

/** Report keys for /reports/:key */
export const REPORT_KEYS = [
  { key: 'employees-list', group: 'employees' },
  { key: 'employees-data', group: 'employees' },
  { key: 'employees-new', group: 'employees' },
  { key: 'employees-expiring', group: 'employees' },
  { key: 'employees-resigned', group: 'employees' },
  { key: 'attendance-daily', group: 'attendance' },
  { key: 'attendance-absence', group: 'attendance' },
  { key: 'attendance-late', group: 'attendance' },
  { key: 'attendance-hours', group: 'attendance' },
  { key: 'attendance-overtime', group: 'attendance' },
  { key: 'attendance-shift', group: 'attendance' },
  { key: 'payroll-sheet', group: 'payroll' },
  { key: 'payroll-deductions', group: 'payroll' },
  { key: 'payroll-incentives', group: 'payroll' },
  { key: 'payroll-allowances', group: 'payroll' },
  { key: 'payroll-commissions', group: 'payroll' },
  { key: 'payroll-taxes', group: 'payroll' },
  { key: 'payroll-insurance', group: 'payroll' },
  { key: 'leaves-balance', group: 'leaves' },
  { key: 'leaves-used', group: 'leaves' },
  { key: 'leaves-remaining', group: 'leaves' },
] as const;
