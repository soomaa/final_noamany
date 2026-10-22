const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

test('keeps every homepage product-card text row away from both side edges', () => {
  const styles = readFileSync(resolve(__dirname, '..', 'src', 'catalog.css'), 'utf8');

  assert.match(
    styles,
    /\.products-section\s+\.home-product-link\s*>\s*:is\(\.product-meta,\s*h3\)\s*\{[\s\S]*?margin-inline:\s*14px\s*!important;/,
  );
});
