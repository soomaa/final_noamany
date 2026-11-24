export type SalesTeamKind = 'sales' | 'trainers';
export type ProfileMode = 'settings' | 'performance';
export type SalesAdminSection = 'overview' | 'team' | 'settings';

export interface SalesTeamViewState {
  teamKind: SalesTeamKind;
  profileMode: ProfileMode;
  profileId: number | null;
  adminSection: SalesAdminSection;
}

interface SalesAdminDashboardRow {
  isActive?: boolean;
  salesRepId: number;
  name: string;
  receivedLeads?: number;
  contacted?: number;
  converted?: number;
  financialTarget: number;
  actual: number;
  achievementPct: number;
  commissionPercent?: number;
  commissionDue?: number;
}

interface SalesAdminReportRow {
  isActive?: boolean;
  periodRevenue?: number;
  periodAchievementPct?: number;
  salesRepId: number;
  name: string;
  target: number;
  revenue: number;
  achievementPct: number;
  commissionPercent: number;
  commissionDue: number;
}

export function mergeSalesAdminPerformance(
  dashboardRows: SalesAdminDashboardRow[],
  reportRows: SalesAdminReportRow[],
): SalesAdminDashboardRow[] {
  const reportsById = new Map(reportRows.map((row) => [row.salesRepId, row]));
  const baseRows: SalesAdminDashboardRow[] = dashboardRows.length
    ? dashboardRows
    : reportRows.map((row) => ({
        salesRepId: row.salesRepId,
        name: row.name,
        financialTarget: row.target,
        actual: row.periodRevenue ?? row.revenue,
        achievementPct: row.periodAchievementPct ?? row.achievementPct,
      }));

  return baseRows.map((row) => {
    const report = reportsById.get(row.salesRepId);
    if (!report) return row;
    return {
      ...row,
      name: report.name || row.name,
      ...(report.isActive == null ? {} : { isActive: report.isActive }),
      financialTarget: report.target,
      actual: report.periodRevenue ?? report.revenue,
      achievementPct: report.periodAchievementPct ?? report.achievementPct,
      commissionPercent: report.commissionPercent,
      commissionDue: report.commissionDue,
    };
  }).sort((a, b) => Number(a.isActive === false) - Number(b.isActive === false));
}

export const initialSalesTeamView: SalesTeamViewState = {
  teamKind: 'sales',
  profileMode: 'performance',
  profileId: null,
  adminSection: 'overview',
};

export const salesAdminRoutes: Record<SalesAdminSection, string> = {
  overview: '/club/sales-reports?tab=overview',
  team: '/club/sales-reports',
  settings: '/club/sales-reports?tab=settings',
};

export function salesAdminRouteForSection(section: SalesAdminSection): string {
  return salesAdminRoutes[section];
}

export function salesAdminSectionFromPath(pathname: string, search = ''): SalesAdminSection {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'team' || tab === 'settings' || tab === 'overview') return tab;
  if (pathname === '/club/sales-settings') return 'settings';
  if (pathname === '/club/sales-reports') return 'team';
  return 'overview';
}

export function changeTeamKind(state: SalesTeamViewState, teamKind: SalesTeamKind): SalesTeamViewState {
  return { ...state, teamKind, profileId: null };
}

export function changeProfileMode(state: SalesTeamViewState, profileMode: ProfileMode): SalesTeamViewState {
  return { ...state, profileMode, profileId: null };
}

export function changeSalesAdminSection(
  state: SalesTeamViewState,
  adminSection: SalesAdminSection,
): SalesTeamViewState {
  return {
    ...state,
    adminSection,
    profileMode: adminSection === 'settings' ? 'settings' : 'performance',
    profileId: null,
  };
}

export function profileOpenIntent(state: SalesTeamViewState, profileId: number): SalesTeamViewState {
  return { ...state, profileId };
}
