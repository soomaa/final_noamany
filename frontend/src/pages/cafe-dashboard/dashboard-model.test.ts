import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveInsights,
  paymentBreakdown,
  periodRange,
  productRanking,
  normalizeBranchOptions,
  type DashboardSummary,
} from './dashboard-model.ts';

test('period presets use the local calendar and include the selected day', () => {
  assert.deepEqual(periodRange('today', '2026-08-26'), { startDate: '2026-08-26', endDate: '2026-08-26' });
  assert.deepEqual(periodRange('7d', '2026-08-26'), { startDate: '2026-08-20', endDate: '2026-08-26' });
  assert.deepEqual(periodRange('30d', '2026-08-26'), { startDate: '2026-07-28', endDate: '2026-08-26' });
  assert.deepEqual(periodRange('month', '2026-08-26'), { startDate: '2026-08-01', endDate: '2026-08-26' });
});

test('payment breakdown is percentage-safe when the period has no payments', () => {
  assert.deepEqual(paymentBreakdown([{ method: 'cash', amount: 0 }]), [
    { method: 'cash', amount: 0, percentage: 0 },
  ]);
  assert.deepEqual(paymentBreakdown([
    { method: 'cash', amount: 600 },
    { method: 'card', amount: 400 },
  ]), [
    { method: 'cash', amount: 600, percentage: 60 },
    { method: 'card', amount: 400, percentage: 40 },
  ]);
});

test('branch options preserve accessible branches with a localized fallback name', () => {
  assert.deepEqual(normalizeBranchOptions([
    { id: 2, name: 'الزمالك' },
    { id: 7, name: null },
  ], (id) => `فرع #${id}`), [
    { id: 2, name: 'الزمالك' },
    { id: 7, name: 'فرع #7' },
  ]);
});

test('product ranking sorts by revenue and reports each visible share', () => {
  assert.deepEqual(productRanking([
    { name: 'Espresso', quantity: 3, revenue: 300, cost: 90 },
    { name: 'Latte', quantity: 5, revenue: 700, cost: 250 },
  ]), [
    { name: 'Latte', quantity: 5, revenue: 700, cost: 250, rank: 1, percentage: 70 },
    { name: 'Espresso', quantity: 3, revenue: 300, cost: 90, rank: 2, percentage: 30 },
  ]);
});

test('insights expose only facts derived from the dashboard payload', () => {
  const data: DashboardSummary = {
    updatedAt: '2026-08-26T08:00:00.000Z',
    period: { startDate: '2026-08-01', endDate: '2026-08-26', previousStartDate: '2026-07-06', previousEndDate: '2026-07-31' },
    outcomes: { netSales: 10000, orders: 100, averageTicket: 100, grossProfit: 4000, grossMargin: 40, salesChange: 12.5 },
    operations: { openShift: { id: 1, sessionDate: '2026-08-26' }, cashVariance: -50, expectedCash: 1000, actualCash: 950, wasteCost: 200, wasteQuantity: 4, lowStockCount: 3 },
    trend: [],
    topProducts: [{ name: 'Latte', quantity: 20, revenue: 2500, cost: 1000 }],
    paymentMix: [],
    attention: { lowStock: [], highWaste: [], shiftVariance: [] },
  };

  assert.deepEqual(deriveInsights(data).map(({ key, value }) => ({ key, value })), [
    { key: 'sales-change', value: 12.5 },
    { key: 'waste-ratio', value: 2 },
    { key: 'cash-variance', value: -50 },
    { key: 'top-product-share', value: 25 },
  ]);
});
