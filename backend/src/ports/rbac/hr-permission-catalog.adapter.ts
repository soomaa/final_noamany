import { Injectable } from '@nestjs/common';
import { PermissionCatalogAdapter, PermissionCatalogResource } from './permission-catalog.adapter';

export const PORTABLE_HR_ACTIONS = [
  'view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print',
  'audit', 'configure', 'execute',
] as const;

type ResourceDefinition = readonly [
  key: string,
  actions: readonly string[],
  routes?: readonly string[],
];

const MODULES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['admin', 'الإعدادات والإدارة', 'Administration', '/settings/forms'],
  ['affairs', 'شؤون العاملين', 'Employee affairs', '/hr/action-screen'],
  ['attendance', 'الحضور والانصراف', 'Attendance', '/attendance'],
  ['employees', 'الموظفون', 'Employees', '/employees'],
  ['finance', 'المستحقات والاستقطاعات', 'Employee finance', '/loans'],
  ['leaves', 'الإجازات والطلبات', 'Leave and requests', '/leaves'],
  ['org', 'الهيكل التنظيمي', 'Organisation', '/org/branches'],
  ['payroll', 'الرواتب', 'Payroll', '/payroll/runs'],
  ['reports', 'التقارير', 'Reports', '/reports'],
  ['termination', 'إنهاء الخدمة', 'Termination', '/termination/clearance'],
];

/** Every literal required by portable controllers plus every authenticated UI route. */
const RESOURCES: readonly ResourceDefinition[] = [
  ['admin.business-audit', ['view'], ['/settings/business-audit']],
  ['admin.company', ['update', 'view']],
  ['admin.forms', ['create', 'delete', 'update', 'view'], ['/settings/forms']],
  ['admin.insurance', ['delete', 'update', 'view'], ['/settings/insurance']],
  ['admin.app-users', ['create', 'delete', 'update', 'view']],
  ['admin.push', ['configure']],
  ['admin.users', ['create', 'delete', 'update', 'view'], ['/settings/users']],
  ['affairs.action_screen', ['create', 'delete', 'update', 'view'], ['/hr/action-screen']],
  ['affairs.activities', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/hr/activities']],
  ['affairs.circulars', ['create', 'delete', 'update', 'view'], ['/hr/circulars']],
  ['affairs.custody', ['create', 'delete', 'update', 'view'], ['/hr/custody']],
  ['affairs.daily_reports', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/hr/daily-reports']],
  ['affairs.evaluations', ['create', 'delete', 'view'], ['/hr/evaluations']],
  ['affairs.initiatives', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/hr/initiatives']],
  ['affairs.job_requests', ['approve', 'create', 'delete', 'update', 'view'], ['/hr/job-requests']],
  ['affairs.legal_files', ['create', 'delete', 'update', 'view'], ['/hr/legal-files']],
  ['affairs.messages', ['create', 'delete', 'view'], ['/hr/messages']],
  ['affairs.site_visits', ['create', 'delete', 'update', 'view'], ['/sites/visits']],
  ['affairs.tasks', ['create', 'delete', 'update', 'view'], ['/hr/tasks']],
  ['affairs.warnings', ['create', 'delete', 'update', 'view'], ['/hr/warnings']],
  ['attendance.board', ['update', 'view'], ['/attendance']],
  ['attendance.devices', ['configure', 'create', 'delete', 'execute', 'view'], ['/attendance/devices']],
  ['attendance.rules', ['configure', 'view'], ['/attendance/rules']],
  ['attendance.settings', ['configure', 'create', 'delete', 'update', 'view'], ['/attendance/settings']],
  ['employees.documents', ['create', 'delete', 'view'], ['/documents']],
  ['employees.list', ['create', 'delete', 'update', 'view'], ['/employees', '/employees/new', '/employees/:id', '/employees/:id/edit']],
  ['employees.new', ['create']],
  ['employees.weekly_leaves', ['create', 'delete', 'update', 'view'], ['/employees/weekly-leaves']],
  ['finance.loan_settings', ['configure', 'create', 'delete', 'update', 'view'], ['/loans/settings']],
  ['finance.loans', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/loans']],
  ['finance.penalties', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/penalties']],
  ['finance.penalties_bylaw', ['create', 'delete', 'update', 'view'], ['/penalties/bylaw']],
  ['finance.rewards', ['approve', 'create', 'delete', 'reject', 'update', 'view'], ['/rewards']],
  ['leaves.balances', ['configure', 'view'], ['/leaves/balances']],
  ['leaves.list', ['approve', 'create', 'reject', 'update', 'view'], ['/leaves', '/leaves/new']],
  ['leaves.missions', ['approve', 'create', 'delete', 'reject', 'view'], ['/missions']],
  ['leaves.permissions', ['approve', 'create', 'reject', 'update', 'view'], ['/permissions']],
  ['leaves.requests', ['approve', 'create', 'reject', 'view'], ['/requests', '/requests/new/:type', '/requests/:id']],
  ['leaves.types', ['create', 'delete', 'update', 'view'], ['/leaves/types']],
  ['org.branches', ['create', 'delete', 'update', 'view'], ['/org/branches']],
  ['org.departments', ['create', 'delete', 'update', 'view'], ['/org/departments', '/org/job-titles']],
  ['payroll.final_settlements', ['approve', 'create', 'execute', 'view'], ['/payroll/final-settlements']],
  ['payroll.pay_components', ['create', 'delete', 'update', 'view'], ['/settings/pay-components']],
  ['payroll.runs', ['create', 'delete', 'execute', 'view'], ['/payroll/runs', '/payroll/runs/:id', '/payroll/runs/:id/slip/:empId']],
  ['payroll.salary_scale', ['create', 'delete', 'update', 'view'], ['/payroll/salary-scale']],
  ['payroll.setup', ['update', 'view'], ['/payroll/setup']],
  ['reports.hub', ['view'], ['/reports', '/reports/:key']],
  ['termination.archive', ['create', 'delete', 'update', 'view'], ['/termination/archive']],
  ['termination.clearance', ['create', 'delete', 'update', 'view'], ['/termination/clearance']],
];

const PORTABLE_HR_RESOURCE_KEYS = new Set<string>([
  ...MODULES.map(([key]) => key),
  ...RESOURCES.map(([key]) => key),
]);

/** True only for resources owned by the portable HR package. */
export const isPortableHrResourceKey = (resourceKey: string): boolean =>
  PORTABLE_HR_RESOURCE_KEYS.has(resourceKey);

function humanize(key: string): string {
  const leaf = key.split('.').at(-1) ?? key;
  return leaf.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

@Injectable()
export class HrPermissionCatalogAdapter implements PermissionCatalogAdapter {
  resources(): PermissionCatalogResource[] {
    return [
      ...MODULES.map(([key, nameAr, nameEn, route]) => ({
        key, parentKey: null, actions: [...PORTABLE_HR_ACTIONS], nameAr, nameEn,
        route, routes: [route], type: 'module' as const,
      })),
      ...RESOURCES.map(([key, actions, routes]) => ({
        key, parentKey: key.split('.')[0], actions: [...actions],
        nameAr: humanize(key), nameEn: humanize(key), route: routes?.[0],
        routes: routes ? [...routes] : undefined, type: 'page' as const,
      })),
    ];
  }
}
