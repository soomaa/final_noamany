import { uiStatic } from '@/lib/ui-static';
export type SalesWorkspaceTab = 'today' | 'leads' | 'renewals' | 'results' | 'reminders';

export const salesPortalRoutes: Record<SalesWorkspaceTab, string> = {
  today: '/sales-portal',
  leads: '/sales-portal/leads',
  renewals: '/sales-portal/renewals',
  results: '/sales-portal/results',
  reminders: '/sales-portal/reminders',
};

export const salesPortalCapabilities = {
  createLead: false,
  createMember: false,
  createSubscription: false,
  updateAssignedLead: true,
} as const;

export interface SalesPortalMetricSource {
  assignedLeads: number;
  overdueLeads: number;
  conversionRate: number;
  closedDeals: number;
}

export type SalesPortalMetricKey = keyof SalesPortalMetricSource;

export function buildSalesPortalMetrics(source: SalesPortalMetricSource) {
  return [
    { key: 'assignedLeads' as const, value: source.assignedLeads },
    { key: 'overdueLeads' as const, value: source.overdueLeads },
    { key: 'conversionRate' as const, value: source.conversionRate },
    { key: 'closedDeals' as const, value: source.closedDeals },
  ];
}

export function normalizeSalesWorkspaceTab(value: string | null | undefined): SalesWorkspaceTab {
  return value === 'leads' || value === 'renewals' || value === 'results' || value === 'reminders'
    ? value
    : 'today';
}

export function sortSalesRenewalRows<T extends { daysRemaining: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aExpired = a.daysRemaining < 0;
    const bExpired = b.daysRemaining < 0;
    if (aExpired !== bExpired) return aExpired ? -1 : 1;
    return aExpired ? b.daysRemaining - a.daysRemaining : a.daysRemaining - b.daysRemaining;
  });
}

export const leadPipelineStages = [
  { key: 'all', status: '' },
  { key: 'new', status: 'new' },
  { key: 'inProgress', status: 'in_progress' },
  { key: 'followLater', status: 'follow_later' },
  { key: 'qualified', status: 'qualified' },
  { key: 'converted', status: 'converted' },
  { key: 'lost', status: 'lost' },
] as const;

export const leadDecisionStatuses = leadPipelineStages.filter((stage) =>
  stage.status === 'new'
  || stage.status === 'in_progress'
  || stage.status === 'follow_later'
  || stage.status === 'lost');

export const salesLeadActivityOptions = [
  { type: 'call', label: uiStatic('نتيجة الاتصال') },
  { type: 'conversation', label: uiStatic('نتيجة المحادثة') },
  { type: 'meeting', label: uiStatic('نتيجة المقابلة الشخصية') },
] as const;

export type SalesLeadActivityType = (typeof salesLeadActivityOptions)[number]['type'];

export interface SalesLeadActivityDraft {
  activityType: SalesLeadActivityType;
  answered?: boolean;
  note?: string;
  interests?: string;
  status: string;
  nextFollowUpAt?: string;
}

export type SalesLeadActivityValidationError =
  | 'answer_required'
  | 'notes_required'
  | 'next_follow_up_required';

export function validateSalesLeadActivity(
  draft: SalesLeadActivityDraft,
): SalesLeadActivityValidationError | null {
  if (draft.activityType === 'call' && draft.answered == null) return 'answer_required';
  const requiresNotes = draft.activityType !== 'call' || draft.answered === true;
  if (requiresNotes && (draft.note?.trim().length ?? 0) < 2) return 'notes_required';
  if (draft.status === 'follow_later' && !draft.nextFollowUpAt?.trim()) {
    return 'next_follow_up_required';
  }
  return null;
}

export type LeadPipelineStageKey = (typeof leadPipelineStages)[number]['key'];

export function leadStageFilterValue(key: string): string {
  return leadPipelineStages.find((stage) => stage.key === key)?.status ?? '';
}

export function followUpStatusForLead(status: string): string {
  return status === 'new' ? 'in_progress' : status;
}

export function salesWorkspaceTabFromPath(pathname: string): SalesWorkspaceTab {
  if (pathname === salesPortalRoutes.leads) return 'leads';
  if (pathname === salesPortalRoutes.renewals) return 'renewals';
  if (pathname === salesPortalRoutes.results) return 'results';
  if (pathname === salesPortalRoutes.reminders) return 'reminders';
  return 'today';
}
