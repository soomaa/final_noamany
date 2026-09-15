import assert from 'node:assert/strict';
import test from 'node:test';

const model = await import('./sales-workspace-model.ts').catch(() => ({} as Record<string, unknown>));

test('sales portal reads the four daily metrics from the real nested API response', () => {
  const buildSalesPortalMetrics = (model as {
    buildSalesPortalMetrics?: (value: { performance: Record<string, number> }) => Array<{ key: string; value: number }>;
  }).buildSalesPortalMetrics;

  const actual = buildSalesPortalMetrics?.({
    performance: {
      assignedLeads: 18,
      overdueLeads: 4,
      conversionRate: 22.5,
      closedDeals: 7,
      actualRevenue: 19000,
      commissionDue: 800,
    },
  }) ?? null;

  assert.deepEqual(actual, [
    { key: 'assignedLeads', value: 18 },
    { key: 'overdueLeads', value: 4 },
    { key: 'conversionRate', value: 22.5 },
    { key: 'closedDeals', value: 7 },
  ]);
});

test('invalid sales workspace tabs fall back to today', () => {
  const normalizeSalesWorkspaceTab = (model as {
    normalizeSalesWorkspaceTab?: (value: string | null | undefined) => string;
  }).normalizeSalesWorkspaceTab;

  assert.equal(normalizeSalesWorkspaceTab?.('leads'), 'leads');
  assert.equal(normalizeSalesWorkspaceTab?.('reminders'), 'reminders');
  assert.equal(normalizeSalesWorkspaceTab?.('anything-else'), 'today');
  assert.equal(normalizeSalesWorkspaceTab?.(undefined), 'today');
});

test('lead stages follow the operational pipeline and map all to an empty API filter', () => {
  const leadPipelineStages = (model as { leadPipelineStages?: Array<{ key: string; status: string }> }).leadPipelineStages;
  const leadStageFilterValue = (model as { leadStageFilterValue?: (key: string) => string }).leadStageFilterValue;

  assert.deepEqual(leadPipelineStages, [
    { key: 'all', status: '' },
    { key: 'new', status: 'new' },
    { key: 'inProgress', status: 'in_progress' },
    { key: 'followLater', status: 'follow_later' },
    { key: 'qualified', status: 'qualified' },
    { key: 'converted', status: 'converted' },
    { key: 'lost', status: 'lost' },
  ]);
  assert.equal(leadStageFilterValue?.('all'), '');
  assert.equal(leadStageFilterValue?.('qualified'), 'qualified');
  assert.equal(leadStageFilterValue?.('invalid'), '');
});

test('sales specialists can only review and update assigned leads', () => {
  const capabilities = (model as {
    salesPortalCapabilities?: Record<string, boolean>;
  }).salesPortalCapabilities;

  assert.deepEqual(capabilities, {
    createLead: false,
    createMember: false,
    createSubscription: false,
    updateAssignedLead: true,
  });
});

test('sales outcomes never expose reception-owned qualification states', () => {
  const leadDecisionStatuses = (model as {
    leadDecisionStatuses?: Array<{ key: string; status: string }>;
  }).leadDecisionStatuses;

  assert.deepEqual(leadDecisionStatuses, [
    { key: 'new', status: 'new' },
    { key: 'inProgress', status: 'in_progress' },
    { key: 'followLater', status: 'follow_later' },
    { key: 'lost', status: 'lost' },
  ]);
});

test('call activity fields become required only after the customer answers', () => {
  const validateSalesLeadActivity = (model as {
    validateSalesLeadActivity?: (value: Record<string, unknown>) => string | null;
  }).validateSalesLeadActivity;

  assert.equal(validateSalesLeadActivity?.({
    activityType: 'call',
    answered: false,
    note: '',
    interests: '',
    status: 'in_progress',
  }), null);
  assert.equal(validateSalesLeadActivity?.({
    activityType: 'call',
    answered: true,
    note: '',
    interests: '',
    status: 'in_progress',
  }), 'notes_required');
  assert.equal(validateSalesLeadActivity?.({
    activityType: 'meeting',
    note: 'تمت المقابلة',
    interests: 'باقة سنوية',
    status: 'follow_later',
    nextFollowUpAt: '',
  }), 'next_follow_up_required');
});

test('sales portal keeps its query tabs under the Noamany namespace', () => {
  const salesPortalRoutes = (model as {
    salesPortalRoutes?: Record<string, string>;
  }).salesPortalRoutes;

  assert.deepEqual(salesPortalRoutes, {
    today: '/sales-portal?tab=today',
    leads: '/sales-portal?tab=leads',
    renewals: '/sales-portal?tab=renewals',
    results: '/sales-portal?tab=results',
    reminders: '/sales-portal?tab=reminders',
  });
});

test('renewal rows prioritize expired memberships then the nearest upcoming expiry', () => {
  const sortSalesRenewalRows = (model as {
    sortSalesRenewalRows?: <T extends { daysRemaining: number }>(rows: T[]) => T[];
  }).sortSalesRenewalRows;
  const rows = [
    { id: 1, daysRemaining: 7 },
    { id: 2, daysRemaining: -12 },
    { id: 3, daysRemaining: 2 },
    { id: 4, daysRemaining: -1 },
  ];

  assert.deepEqual(sortSalesRenewalRows?.(rows).map((row) => row.id), [4, 2, 3, 1]);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3, 4]);
});

test('saving a note never moves a converted lead back to qualified', () => {
  const followUpStatusForLead = (model as {
    followUpStatusForLead?: (status: string) => string;
  }).followUpStatusForLead;

  assert.equal(followUpStatusForLead?.('converted'), 'converted');
  assert.equal(followUpStatusForLead?.('qualified'), 'qualified');
  assert.equal(followUpStatusForLead?.('new'), 'in_progress');
});

test('portal query tabs resolve only from the portal namespace', () => {
  assert.equal((model as {salesWorkspaceTabFromPath: (path: string, search?: string) => string}).salesWorkspaceTabFromPath('/sales-portal', '?tab=renewals'), 'renewals');
  assert.equal((model as {salesWorkspaceTabFromPath: (path: string, search?: string) => string}).salesWorkspaceTabFromPath('/sales-portal/leads'), 'today');
  assert.equal((model as {salesWorkspaceTabFromPath: (path: string, search?: string) => string}).salesWorkspaceTabFromPath('/sales/new', '?tab=renewals'), 'today');
});

test('lead activity drafts stay isolated by customer and inherit a safe status', () => {
  const draftForLead = (model as {
    draftForLead?: (drafts: Record<number, Record<string, unknown>>, lead: { id: number; status: string } | null) => Record<string, unknown>;
  }).draftForLead;
  const first = draftForLead?.({ 12: { note: 'اتصل غدًا', status: 'follow_later' } }, { id: 12, status: 'new' });
  const second = draftForLead?.({ 12: { note: 'اتصل غدًا', status: 'follow_later' } }, { id: 19, status: 'converted' });

  assert.equal(first?.note, 'اتصل غدًا');
  assert.equal(second?.note, '');
  assert.equal(second?.status, 'converted');
});

test('pagination clamps after removing the last row on the last page', () => {
  const clampSalesPage = (model as { clampSalesPage?: (page: number, total: number, pageSize: number) => number }).clampSalesPage;
  assert.equal(clampSalesPage?.(3, 50, 25), 2);
  assert.equal(clampSalesPage?.(1, 0, 25), 1);
});

test('phone links keep only a valid dialable number', () => {
  const toSalesDialLink = (model as { toSalesDialLink?: (phone: string | null | undefined) => string | null }).toSalesDialLink;
  assert.equal(toSalesDialLink?.('+20 (100) 555-0123'), 'tel:+201005550123');
  assert.equal(toSalesDialLink?.('javascript:alert(1)'), null);
});
