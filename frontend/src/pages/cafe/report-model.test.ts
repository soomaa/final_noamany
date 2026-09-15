import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCafeReportExportRows, cafeReportCsv } from './report-model.ts';

test('cafe report CSV neutralizes spreadsheet formulas after tabs and whitespace', () => {
  const csv = cafeReportCsv([
    ['القسم', 'القيمة'],
    ['=HYPERLINK("https://bad")', '+cmd'],
    ['\t@SUM(1+1)', '-10'],
  ]);

  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad""\)"/);
  assert.match(csv, /"'\+cmd"/);
  assert.match(csv, /"'\t@SUM\(1\+1\)"/);
  assert.match(csv, /"'-10"/);
});

test('cafe report export follows the visible tab, including management withdrawals', () => {
  const report = {
    protein: { quantity: 2, billed: 100, collected: 80, cost: 20, profit: 60 },
    bar: { quantity: 1, billed: 50, collected: 40, cost: 10, profit: 30 },
    managementWithdrawals: [{
      reference: '=SECRET', date: '2026-09-09', status: 'approved', amount: 25,
      reason: '+private', items: [{ name: '@Water', quantity: 2, cost: 25 }],
    }],
  };

  assert.deepEqual(buildCafeReportExportRows('protein', report), [
    ['القسم', 'الكمية', 'قيمة الفواتير', 'المحصل فعليًا', 'التكلفة', 'الربح'],
    ['Protein', 2, 100, 80, 20, 60],
  ]);
  const management = buildCafeReportExportRows('management_withdrawals', report);
  assert.equal(management.length, 2);
  assert.deepEqual(management[1], ['=SECRET', '2026-09-09', 'approved', 25, '+private', '@Water × 2']);
  const csv = cafeReportCsv(management);
  assert.match(csv, /"'=SECRET"/);
  assert.match(csv, /"'\+private"/);
  assert.match(csv, /"'@Water × 2"/);
});
