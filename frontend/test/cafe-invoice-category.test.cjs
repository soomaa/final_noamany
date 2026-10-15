const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const receiptSource = fs.readFileSync(
  path.resolve(__dirname, '../src/pages/sales/new-receipt.tsx'),
  'utf8',
);
const cafePosSource = fs.readFileSync(
  path.resolve(__dirname, '../src/pages/cafe/pos.tsx'),
  'utf8',
);

test('new receipt requires and sends invoice category and gender', () => {
  assert.match(receiptSource, /if \(!categoryId\).*toast\.error/);
  assert.match(receiptSource, /if \(!gender\).*toast\.error/);
  assert.match(receiptSource, /gender,/);
  assert.match(receiptSource, /cafeCategoryId: Number\(categoryId\)/);
});

test('cafe POS prevents mixed categories and sends header classification', () => {
  assert.match(cafePosSource, /cafeInvoiceLineMatchesCategory\(item\.product, activeCategory\)/);
  assert.match(cafePosSource, /gender,/);
  assert.match(cafePosSource, /cafeCategoryId: Number\(activeCategory\)/);
});
