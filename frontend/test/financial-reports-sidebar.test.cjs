const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('financial reports sidebar exposes daily closing and target report', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/nav.ts'), 'utf8');
  const group = source.match(/id: 'financial-reports',[\s\S]*?items: \[([\s\S]*?)\],\r?\n\s*\},/);

  assert.ok(group, 'financial reports sidebar group must exist');
  assert.match(group[1], /\{ to: FR\.dailyClosing \}/);
  assert.match(group[1], /\{ to: FR\.targetReport \}/);
});

test('financial reports have Arabic and English sidebar translations', () => {
  const ar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/locales/ar.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/locales/en.json'), 'utf8'));

  assert.equal(ar.nav.routes['/reports/finance/daily-closing'], 'التقفيل اليومي');
  assert.equal(ar.nav.routes['/reports/finance/target'], 'تقرير التارجت');
  assert.equal(en.nav.routes['/reports/finance/daily-closing'], 'Daily Closing');
  assert.equal(en.nav.routes['/reports/finance/target'], 'Target Report');
});

test('daily closing and target report Arabic UI text is mapped to English', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/reports/finance/daily-closing-target.tsx'), 'utf8');
  const uiMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/locales/ui-map.json'), 'utf8'));
  const labels = [...source.matchAll(/ui\('([^']+)'\)/g)].map((match) => match[1]);

  for (const label of new Set(labels)) {
    assert.ok(uiMap[label], `missing English translation for: ${label}`);
  }
});

test('target report employee filter provides an in-list live search', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/reports/finance/daily-closing-target.tsx'), 'utf8');

  assert.match(source, /import \{ Combobox \} from '@\/components\/common\/combobox';/);
  assert.match(source, /const employeeOptions = useMemo/);
  assert.match(source, /<Combobox[\s\S]*?options=\{employeeOptions\}[\s\S]*?searchPlaceholder=\{ui\('بحث باسم الموظف/);
});
