export type SalesWorkspaceTab = 'today' | 'leads' | 'renewals' | 'results' | 'reminders';

export const salesPortalRoutes: Record<SalesWorkspaceTab, string> = {
  today: '/sales-portal?tab=today',
  leads: '/sales-portal?tab=leads',
  renewals: '/sales-portal?tab=renewals',
  results: '/sales-portal?tab=results',
  reminders: '/sales-portal?tab=reminders',
};

export const salesPortalCapabilities = {
  createLead: false,
  createMember: false,
  createSubscription: false,
  updateAssignedLead: true,
} as const;

export interface SalesPortalMetricSource {
  performance: {
    assignedLeads: number;
    overdueLeads: number;
    conversionRate: number;
    closedDeals: number;
  };
}

export type SalesPortalMetricKey = keyof SalesPortalMetricSource['performance'];

export function buildSalesPortalMetrics(source: SalesPortalMetricSource) {
  return [
    { key: 'assignedLeads' as const, value: source.performance.assignedLeads },
    { key: 'overdueLeads' as const, value: source.performance.overdueLeads },
    { key: 'conversionRate' as const, value: source.performance.conversionRate },
    { key: 'closedDeals' as const, value: source.performance.closedDeals },
  ];
}

export function normalizeSalesWorkspaceTab(value: string | null | undefined): SalesWorkspaceTab {
  return value === 'reminders' || value === 'leads' || value === 'renewals' || value === 'results' ? value : 'today';
}

export function sortSalesRenewalRows<T extends { daysRemaining: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aExpired = a.daysRemaining < 0;
    const bExpired = b.daysRemaining < 0;
    if (aExpired !== bExpired) return aExpired ? -1 : 1;
    if (aExpired) return b.daysRemaining - a.daysRemaining;
    return a.daysRemaining - b.daysRemaining;
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
  { type: 'call', label: 'نتيجة الاتصال' },
  { type: 'conversation', label: 'نتيجة المحادثة' },
  { type: 'meeting', label: 'نتيجة المقابلة الشخصية' },
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

export function salesWorkspaceTabFromPath(pathname: string, search = ''): SalesWorkspaceTab {
  if (pathname.replace(/\/+$/, '') !== '/sales-portal') return 'today';
  const tab = new URLSearchParams(search).get('tab');
  if (tab) return normalizeSalesWorkspaceTab(tab);
  return 'today';
}

export interface SalesLeadUiDraft extends SalesLeadActivityDraft {
  answered: boolean | undefined;
  note: string;
  interests: string;
  nextFollowUpAt: string;
  nextCallAt: string;
  dirty: boolean;
}

export function draftForLead(
  drafts: Record<number, Partial<SalesLeadUiDraft>>,
  lead: { id: number; status: string } | null,
): SalesLeadUiDraft {
  const initial: SalesLeadUiDraft = {
    activityType: 'call',
    answered: undefined,
    note: '',
    interests: '',
    status: followUpStatusForLead(lead?.status ?? 'new'),
    nextFollowUpAt: '',
    nextCallAt: '',
    dirty: false,
  };
  if (!lead) return initial;
  return { ...initial, ...drafts[lead.id] };
}

export function clampSalesPage(page: number, total: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
  return Math.min(Math.max(1, page), pages);
}

export function toSalesDialLink(phone: string | null | undefined): string | null {
  const value = phone?.trim() ?? '';
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const normalized = `${value.startsWith('+') ? '+' : ''}${value.replace(/\D/g, '')}`;
  return normalized.replace(/\D/g, '').length >= 5 ? `tel:${normalized}` : null;
}
