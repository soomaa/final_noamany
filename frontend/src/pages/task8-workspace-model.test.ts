import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomerServiceParams,
  calculateEvaluationTotal,
  compatibleEvaluationTemplates,
  evaluationRoleForTitle,
  lockerInventoryCsv,
  normalizeTask8Tab,
} from './task8-workspace-model.ts';

test('normalizes deep-linked tabs without accepting unrelated values', () => {
  assert.equal(normalizeTask8Tab('reports', ['criteria', 'monthly', 'reports'], 'criteria'), 'reports');
  assert.equal(normalizeTask8Tab('sales', ['criteria', 'monthly', 'reports'], 'criteria'), 'criteria');
});

test('opinion requests preserve shared filters and require an opinion on the server', () => {
  assert.deepEqual(
    buildCustomerServiceParams('opinions', {
      branchId: '3',
      gender: 'female',
      membershipStatus: 'expired',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    }),
    {
      branchId: 3,
      gender: 'female',
      membershipStatus: 'expired',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      hasOpinion: true,
    },
  );
});

test('evaluation totals clamp scores to each criterion maximum', () => {
  assert.deepEqual(calculateEvaluationTotal([
    { id: 1, maxScore: 5 },
    { id: 2, maxScore: 10 },
  ], { 1: '8', 2: '7' }), { total: 12, maximum: 15 });
});

test('monthly evaluation templates are limited to the employee role and authoritative branch', () => {
  assert.equal(evaluationRoleForTitle('مدرب لياقة'), 'trainer');
  assert.equal(evaluationRoleForTitle('موظف استقبال'), 'reception');
  assert.equal(evaluationRoleForTitle('مدير فرع'), 'branch_manager');
  assert.equal(evaluationRoleForTitle('محاسب'), null);
  // Real job titles this client actually uses, not only the formal spelling.
  assert.equal(evaluationRoleForTitle('ريسبشن'), 'reception');
  assert.equal(evaluationRoleForTitle('موظفة ريسبشن'), 'reception');
  assert.equal(evaluationRoleForTitle('مدربة لياقة'), 'trainer');
  assert.equal(evaluationRoleForTitle('مدير عام الفرع'), 'branch_manager');
  assert.equal(evaluationRoleForTitle('مشرف عام'), 'branch_manager');

  const templates = [
    { id: 1, role_key: 'trainer', branch_id: null },
    { id: 2, role_key: 'trainer', branch_id: 3 },
    { id: 3, role_key: 'trainer', branch_id: 4 },
    { id: 4, role_key: 'reception', branch_id: 3 },
  ] as const;
  assert.deepEqual(
    compatibleEvaluationTemplates(templates, { branchId: 3, jobTitle: 'مدرب' }).map((item) => item.id),
    [1, 2],
  );
  assert.deepEqual(compatibleEvaluationTemplates(templates, { branchId: null, jobTitle: 'مدرب' }), []);
});

test('locker review CSV exports Arabic columns and neutralizes spreadsheet formulas', () => {
  const csv = lockerInventoryCsv({
    id: 17,
    inventoryDate: '2026-09-09',
    status: 'approved',
    lines: [{ lockerNumber: '=2+2', expectedStatus: 'available', actualStatus: 'damaged', result: 'يوجد فرق', notes: '+cmd' }],
  });

  assert.match(csv, /^\uFEFFرقم الجلسة,تاريخ الجرد,الحالة/m);
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"'\+cmd"/);
});
