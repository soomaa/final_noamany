import { REPORT_KEYS } from '@/lib/routes';

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

export type RequestTypeKey =
  | 'leave'
  | 'permission'
  | 'advance'
  | 'loan'
  | 'allowance'
  | 'salary-certificate'
  | 'resignation'
  | 'transfer'
  | 'promotion'
  | 'data-change';

const REQUEST_TYPE_META: Record<RequestTypeKey, { path: string; printable?: boolean }> = {
  leave: { path: '/requests/new/leave' },
  permission: { path: '/requests/new/permission' },
  advance: { path: '/requests/new/advance' },
  loan: { path: '/requests/new/loan' },
  allowance: { path: '/requests/new/allowance' },
  'salary-certificate': { path: '/requests/new/salary-certificate', printable: true },
  resignation: { path: '/requests/new/resignation' },
  transfer: { path: '/requests/new/transfer' },
  promotion: { path: '/requests/new/promotion' },
  'data-change': { path: '/requests/new/data-change' },
};

export function getRequestTypes(t: TFunction) {
  return (Object.keys(REQUEST_TYPE_META) as RequestTypeKey[]).map((key) => ({
    key,
    label: t(`constants.requests.${key}`),
    path: REQUEST_TYPE_META[key].path,
    printable: REQUEST_TYPE_META[key].printable,
  }));
}

export function getRequestTypeMap(t: TFunction) {
  const types = getRequestTypes(t);
  return Object.fromEntries(types.map((item) => [item.key, item])) as Record<
    RequestTypeKey,
    (typeof types)[number]
  >;
}

export function getRequestType(t: TFunction, key: RequestTypeKey) {
  return getRequestTypeMap(t)[key];
}

export const REQUEST_TYPE_KEYS = Object.keys(REQUEST_TYPE_META) as RequestTypeKey[];

export function getAlertTypes(t: TFunction) {
  const keys = ['contractExpiring', 'residencyExpiring', 'insuranceExpiring', 'probationEnding', 'birthdays'] as const;
  return keys.map((key) => ({
    key,
    label: t(`constants.alerts.${key}`),
    icon: key === 'contractExpiring' ? 'contract' : key === 'residencyExpiring' ? 'iqama' : key === 'insuranceExpiring' ? 'insurance' : key === 'probationEnding' ? 'probation' : 'birthday',
  }));
}

export function getPayrollComponents(t: TFunction) {
  const items = [
    { key: 'basic', category: 'earning' },
    { key: 'housing', category: 'allowance' },
    { key: 'transport', category: 'allowance' },
    { key: 'phone', category: 'allowance' },
    { key: 'food', category: 'allowance' },
    { key: 'risk', category: 'allowance' },
    { key: 'rewards', category: 'earning' },
    { key: 'commissions', category: 'earning' },
    { key: 'incentives', category: 'earning' },
    { key: 'deductions', category: 'deduction' },
    { key: 'advances', category: 'deduction' },
    { key: 'penalties', category: 'deduction' },
    { key: 'insurance', category: 'deduction' },
    { key: 'tax', category: 'deduction' },
    { key: 'loans', category: 'deduction' },
  ] as const;
  return items.map((item) => ({ ...item, label: t(`constants.payrollComponents.${item.key}`) }));
}

export function getAttendanceChannels(t: TFunction) {
  const keys = ['device', 'app', 'gps', 'qr', 'nfc', 'face'] as const;
  return keys.map((key) => ({ key, label: t(`constants.attendanceChannels.${key}`) }));
}

export function getAttendanceRules(t: TFunction) {
  const keys = ['late', 'early_leave', 'absence', 'overtime', 'weekly_rest', 'holidays', 'flexible_hours'] as const;
  return keys.map((key) => ({ key, label: t(`constants.attendanceRules.${key}`) }));
}

export function getSourceLabel(t: TFunction, key: string): string {
  const map: Record<string, string> = {
    device: t('constants.sources.device'),
    app: t('constants.sources.app'),
    gps: 'GPS',
    qr: 'QR',
    nfc: 'NFC',
    face: 'Face',
  };
  return map[key] ?? key;
}

export function getReportKeys(t: TFunction) {
  return REPORT_KEYS.map((r) => ({
    key: r.key,
    title: t(`constants.reports.${r.key}`),
    group: t(`constants.reportGroups.${r.group}`),
  }));
}

export function getStatusTabs(t: TFunction, variant: 'default' | 'permissions' | 'tasks' = 'default') {
  const base = [
    { value: '', label: t('tabs.all') },
    { value: 'incoming', label: t('tabs.incoming') },
    { value: 'approved', label: t('tabs.approved') },
    { value: 'rejected', label: t('tabs.rejected') },
  ];
  if (variant === 'permissions') return [...base, { value: 'outgoing', label: t('tabs.outgoing') }];
  if (variant === 'tasks') return [{ value: '', label: t('tabs.allStatuses') }, ...base.slice(1)];
  return [...base, { value: 'pending', label: t('tabs.pending') }];
}

export function getWeekdays(t: TFunction) {
  return [
    t('weekdays.sunday'),
    t('weekdays.monday'),
    t('weekdays.tuesday'),
    t('weekdays.wednesday'),
    t('weekdays.thursday'),
    t('weekdays.friday'),
    t('weekdays.saturday'),
  ];
}
