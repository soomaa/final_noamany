import assert from 'node:assert/strict';
import test from 'node:test';
import { payrollActionPermission, payrollActions, payrollPeriodLabel, payrollStatusLabels } from './payroll-model.ts';

test('finance approval advances only the current HR stage and never skips bank confirmation', () => {
  assert.deepEqual(payrollActions('reviewing', 'approval'), ['approve']);
  assert.deepEqual(payrollActions('approved', 'approval'), ['post']);
  assert.deepEqual(payrollActions('posted', 'approval'), ['bank']);
  assert.deepEqual(payrollActions('bank_prepared', 'approval'), ['bank-sync']);
  assert.deepEqual(payrollActions('completed', 'approval'), []);
  assert.deepEqual(payrollActions('banked', 'approval'), []);
  assert.notEqual(payrollStatusLabels.posted, payrollStatusLabels.completed);
});
test('preparation cannot recompute an approved, posted, or paid salary run', () => {
  for (const status of ['approved', 'posted', 'bank_prepared', 'banked', 'completed'] as const) assert.deepEqual(payrollActions(status, 'preparation'), []);
  assert.deepEqual(payrollActions('computed', 'preparation'), ['compute', 'submit']);
});
test('new monthly salaries use calendar boundaries and actual month lengths', () => {
  assert.equal(payrollPeriodLabel('2026-01'), '2026-01-01 — 2026-01-31');
  assert.equal(payrollPeriodLabel('2026-09'), '2026-09-01 — 2026-09-30');
  assert.equal(payrollPeriodLabel('2024-02'), '2024-02-01 — 2024-02-29');
  assert.equal(payrollPeriodLabel('2026-03'), '2026-03-01 — 2026-03-31');
  assert.equal(payrollPeriodLabel('2026-13'), '');
});
test('approval and execution retain separate HR permissions', () => {
  assert.equal(payrollActionPermission('approve'), 'payroll.runs:approve');
  for (const action of ['compute', 'submit', 'post', 'bank', 'bank-sync'] as const) assert.equal(payrollActionPermission(action), 'payroll.runs:execute');
});
