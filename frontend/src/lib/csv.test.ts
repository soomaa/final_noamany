import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, toCsv } from './csv.ts';

test('neutralizes spreadsheet formulas even when prefixed by whitespace or control characters', () => {
  for (const value of ['=2+2', '+cmd', '-10', '@SUM(1,2)', '  =HYPERLINK("https://bad")', '\t@SUM(1,2)', '\r=1+1']) {
    assert.match(csvCell(value), /^"'/, `expected ${JSON.stringify(value)} to be neutralized`);
  }
});

test('quotes every cell and preserves Arabic, commas, quotes and line breaks', () => {
  const csv = toCsv([
    ['الاسم', 'الملاحظة'],
    ['عضو, جديد', 'قال "ممتاز"\nثم غادر'],
  ]);

  assert.equal(csv, '"الاسم","الملاحظة"\r\n"عضو, جديد","قال ""ممتاز""\nثم غادر"');
});
