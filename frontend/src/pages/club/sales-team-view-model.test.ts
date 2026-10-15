import assert from 'node:assert/strict';
import test from 'node:test';
import * as salesTeamModel from './sales-team-view-model.ts';

const {
  changeProfileMode,
  changeTeamKind,
  initialSalesTeamView,
  profileOpenIntent,
} = salesTeamModel;

test('profile mode changes without switching the selected sales/trainers tab', () => {
  const trainers = changeTeamKind(initialSalesTeamView, 'trainers');
  const performance = changeProfileMode(trainers, 'performance');

  assert.equal(performance.teamKind, 'trainers');
  assert.equal(performance.profileMode, 'performance');
  assert.deepEqual(profileOpenIntent(performance, 14), {
    teamKind: 'trainers',
    profileMode: 'performance',
    profileId: 14,
    adminSection: 'overview',
  });
});

test('switching between sales and trainers preserves the chosen profile mode', () => {
  const performance = changeProfileMode(initialSalesTeamView, 'performance');
  const trainers = changeTeamKind(performance, 'trainers');

  assert.equal(trainers.profileMode, 'performance');
  assert.equal(trainers.profileId, null);
});

test('sales admin opens on overview and selects the correct rep profile action per section', () => {
  const changeSalesAdminSection = (salesTeamModel as unknown as {
    changeSalesAdminSection?: (state: typeof initialSalesTeamView, section: string) => typeof initialSalesTeamView;
  }).changeSalesAdminSection;

  assert.equal((initialSalesTeamView as { adminSection?: string }).adminSection, 'overview');
  assert.equal(initialSalesTeamView.profileMode, 'performance');
  assert.ok(changeSalesAdminSection, 'changeSalesAdminSection must be implemented');

  const team = changeSalesAdminSection(initialSalesTeamView, 'team');
  assert.deepEqual(team, {
    teamKind: 'sales',
    profileMode: 'performance',
    profileId: null,
    adminSection: 'team',
  });

  const settings = changeSalesAdminSection(profileOpenIntent(team, 9), 'settings');
  assert.deepEqual(settings, {
    teamKind: 'sales',
    profileMode: 'settings',
    profileId: null,
    adminSection: 'settings',
  });
});

test('sales admin sections resolve to direct management routes', () => {
  const salesAdminRouteForSection = (salesTeamModel as unknown as {
    salesAdminRouteForSection: (section: string) => string;
  }).salesAdminRouteForSection;
  const salesAdminSectionFromPath = (salesTeamModel as unknown as {
    salesAdminSectionFromPath: (path: string) => string;
  }).salesAdminSectionFromPath;

  assert.equal(salesAdminRouteForSection?.('overview'), '/club/sales-dashboard');
  assert.equal(salesAdminRouteForSection?.('team'), '/club/sales-reports');
  assert.equal(salesAdminRouteForSection?.('settings'), '/club/sales-settings');
  assert.equal(salesAdminSectionFromPath?.('/club/sales-settings'), 'settings');
  assert.equal(salesAdminSectionFromPath?.('/unknown'), 'overview');
});

test('admin financial cards use one report source for revenue, target, achievement and commission', () => {
  const mergeSalesAdminPerformance = (salesTeamModel as unknown as {
    mergeSalesAdminPerformance?: (
      dashboard: Array<Record<string, unknown>>,
      reports: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
  }).mergeSalesAdminPerformance;

  const result = mergeSalesAdminPerformance?.([
    {
      salesRepId: 7,
      name: 'مندوب',
      receivedLeads: 12,
      contacted: 8,
      converted: 3,
      financialTarget: 10000,
      actual: 4500,
      achievementPct: 45,
    },
  ], [
    {
      salesRepId: 7,
      name: 'مندوب',
      target: 8000,
      revenue: 6000,
      achievementPct: 75,
      commissionPercent: 5,
      commissionDue: 300,
    },
  ]);

  assert.deepEqual(result, [{
    salesRepId: 7,
    name: 'مندوب',
    receivedLeads: 12,
    contacted: 8,
    converted: 3,
    financialTarget: 8000,
    actual: 6000,
    achievementPct: 75,
    commissionPercent: 5,
    commissionDue: 300,
  }]);
});

test('defaults opt-in disables individual financial fields without discarding their draft', () => {
  const applySalesDefaultsIntent = (salesTeamModel as unknown as {
    applySalesDefaultsIntent?: <T extends Record<string, unknown>>(draft: T, enabled: boolean) => T;
  }).applySalesDefaultsIntent;
  const draft = { useDefaults: false, monthlyTarget: 32000, flatCommissionPercent: 6 };

  assert.deepEqual(applySalesDefaultsIntent?.(draft, true), { ...draft, useDefaults: true });
  assert.deepEqual(applySalesDefaultsIntent?.(draft, false), draft);
});

test('deactivation requires a different active transfer target when owned work remains', () => {
  const validateSalesRepDeactivation = (salesTeamModel as unknown as {
    validateSalesRepDeactivation?: (input: Record<string, unknown>) => string | null;
  }).validateSalesRepDeactivation;

  assert.equal(validateSalesRepDeactivation?.({ repId: 8, ownedWork: 3, transferToId: null, activeTargetIds: [9] }), 'transfer_required');
  assert.equal(validateSalesRepDeactivation?.({ repId: 8, ownedWork: 3, transferToId: 8, activeTargetIds: [8, 9] }), 'invalid_target');
  assert.equal(validateSalesRepDeactivation?.({ repId: 8, ownedWork: 3, transferToId: 9, activeTargetIds: [9] }), null);
  assert.equal(validateSalesRepDeactivation?.({ repId: 8, ownedWork: 0, transferToId: null, activeTargetIds: [] }), null);
});
