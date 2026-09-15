export type TargetReportTab = 'subscriptions' | 'private' | 'sales' | 'sessions';

export const TARGET_REPORT_TABS: ReadonlyArray<{
  value: TargetReportTab;
  label: string;
}> = [
  { value: 'subscriptions', label: 'الاشتراكات' },
  { value: 'private', label: 'البرايفت' },
  { value: 'sales', label: 'المبيعات' },
  { value: 'sessions', label: 'الحصص' },
];

export function targetReportTabFromSearch(value: string | null): TargetReportTab {
  return TARGET_REPORT_TABS.some((tab) => tab.value === value)
    ? value as TargetReportTab
    : 'subscriptions';
}

export interface TargetReportFilters {
  tab: TargetReportTab;
  month: string;
  personId: string;
  branchId: string;
  gender: 'all' | 'male' | 'female';
  page: number;
  pageSize: number;
}

export function buildTargetReportParams(filters: TargetReportFilters) {
  return {
    tab: filters.tab,
    month: filters.month,
    ...(filters.personId !== 'all' ? { personId: Number(filters.personId) } : {}),
    ...(filters.branchId !== 'all' ? { branchId: Number(filters.branchId) } : {}),
    ...(filters.gender !== 'all' ? { gender: filters.gender } : {}),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function buildTargetPeopleParams(
  filters: Pick<TargetReportFilters, 'branchId' | 'gender'>,
) {
  return {
    ...(filters.branchId !== 'all' ? { branchId: Number(filters.branchId) } : {}),
    ...(filters.gender !== 'all' ? { gender: filters.gender } : {}),
  };
}
