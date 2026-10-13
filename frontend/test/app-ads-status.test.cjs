const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '../src/pages/app-management/content-pages.tsx');

test('ads form exposes a status control and creates ads as active by default', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const adsSection = source.slice(source.indexOf('export function AppAdsPage()'));

  assert.match(adsSection, /emptyForm=\{[^}]*isActive: true/);
  assert.match(adsSection, /Label>\{ui\('الحالة'\)\}<\/Label>/);
  assert.match(adsSection, /value=\{form\.isActive \? 'active' : 'inactive'\}/);
  assert.match(adsSection, /isActive: value === 'active'/);
  assert.match(adsSection, /isActive: !!form\.isActive/);
});
