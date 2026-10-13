const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('discount-code list provides edit and confirmed delete actions', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/club/points-discounts-management.tsx'),
    'utf8',
  );

  assert.match(source, /api\.put\(`\/club-discount-codes\/\$\{id\}`/);
  assert.match(source, /api\.delete\(`\/club-discount-codes\/\$\{id\}`/);
  assert.match(source, /confirm\(\{ title: 'تأكيد الحذف'/);
  assert.match(source, /<TableView headers=\{\['الكود', 'نسبة الخصم', 'الإجراء'\]\}/);
  assert.match(source, />تعديل<\/Button>/);
  assert.match(source, />حذف<\/Button>/);
});
