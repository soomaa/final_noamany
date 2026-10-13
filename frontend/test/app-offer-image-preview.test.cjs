const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('offer form renders the selected or stored image as a preview', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/app-management/content-pages.tsx'),
    'utf8',
  );

  assert.match(source, /alt=\{ui\('معاينة العرض'\)\}/);
  assert.match(source, /src=\{uploadUrl\(String\(form\.imageUrl\)\) \?\? ''\}/);
});
