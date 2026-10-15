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
  const baseRows = dashboardRows.length
    ? dashboardRows
    : reportRows.map((row) => ({
        salesRepId: row.salesRepId,
        name: row.name,
        financialTarget: row.target,
        actual: row.revenue,
        achievementPct: row.achievementPct,
      }));

  return baseRows.map((row) => {
    const report = reportsById.get(row.salesRepId);
    if (!report) return row;
    return {
      ...row,
      name: report.name || row.name,
      financialTarget: report.target,
      actual: report.revenue,
      achievementPct: report.achievementPct,
      commissionPercent: report.commissionPercent,
      commissionDue: report.commissionDue,
    };
  });
}

export const initialSalesTeamView: SalesTeamViewState = {
  teamKind: 'sales',
  profileMode: 'performance',
  profileId: null,
  adminSection: 'overview',
};

export const salesAdminRoutes: Record<SalesAdminSection, string> = {
  overview: '/club/sales-dashboard',
  team: '/club/sales-reports',
  settings: '/club/sales-settings',
};

export function salesAdminRouteForSection(section: SalesAdminSection): string {
  return salesAdminRoutes[section];
}

export function salesAdminSectionFromPath(pathname: string): SalesAdminSection {
  if (pathname === salesAdminRoutes.team) return 'team';
  if (pathname === salesAdminRoutes.settings) return 'settings';
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

export function applySalesDefaultsIntent<T extends { useDefaults: boolean }>(draft: T, enabled: boolean): T {
  return { ...draft, useDefaults: enabled };
}

export function validateSalesRepDeactivation(input: {
  repId: number;
  ownedWork: number;
  transferToId: number | null;
  activeTargetIds: number[];
}): 'transfer_required' | 'invalid_target' | null {
  if (!input.ownedWork) return null;
  if (input.transferToId == null) return 'transfer_required';
  if (input.transferToId === input.repId || !input.activeTargetIds.includes(input.transferToId)) return 'invalid_target';
  return null;
}
