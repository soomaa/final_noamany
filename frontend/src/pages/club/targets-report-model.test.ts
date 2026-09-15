import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TARGET_REPORT_TABS,
  buildTargetPeopleParams,
  buildTargetReportParams,
  targetReportTabFromSearch,
} from './targets-report-model.ts';

test('the target report exposes one four-tab workspace in the requested order', () => {
  assert.deepEqual(
    TARGET_REPORT_TABS.map(({ value, label }) => ({ value, label })),
    [
      { value: 'subscriptions', label: 'الاشتراكات' },
      { value: 'private', label: 'البرايفت' },
      { value: 'sales', label: 'المبيعات' },
      { value: 'sessions', label: 'الحصص' },
    ],
  );
});

test('shared month, person, branch and gender filters are sent with the active tab', () => {
  assert.deepEqual(
    buildTargetReportParams({
      tab: 'sales',
      month: '2026-09',
      personId: '17',
      branchId: '3',
      gender: 'female',
      page: 2,
      pageSize: 25,
    }),
    {
      tab: 'sales',
      month: '2026-09',
      personId: 17,
      branchId: 3,
      gender: 'female',
      page: 2,
      pageSize: 25,
    },
  );
});

test('all-filter sentinels are omitted rather than becoming invalid identifiers', () => {
  assert.deepEqual(
    buildTargetReportParams({
      tab: 'subscriptions',
      month: '2026-09',
      personId: 'all',
      branchId: 'all',
      gender: 'all',
      page: 1,
      pageSize: 25,
    }),
    {
      tab: 'subscriptions',
      month: '2026-09',
      page: 1,
      pageSize: 25,
    },
  );
});

test('the canonical sales deep link opens the sales tab and rejects unknown tab values', () => {
  assert.equal(targetReportTabFromSearch('sales'), 'sales');
  assert.equal(targetReportTabFromSearch('unknown'), 'subscriptions');
  assert.equal(targetReportTabFromSearch(null), 'subscriptions');
});

test('the people picker is scoped by the selected branch and gender', () => {
  assert.deepEqual(buildTargetPeopleParams({ branchId: '3', gender: 'female' }), {
    branchId: 3,
    gender: 'female',
  });
  assert.deepEqual(buildTargetPeopleParams({ branchId: 'all', gender: 'all' }), {});
});
