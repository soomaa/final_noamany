const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '../src/pages/club/points-discounts-management.tsx');

test('earn settings expose edit and confirmed delete actions', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const section = source.slice(source.indexOf("if (path.endsWith('/earn-settings'))"), source.indexOf("if (path.endsWith('/conversion-settings'))"));

  assert.match(section, /earnSave\.mutate\(earn\)/);
  assert.match(section, /earnUpdate\.mutate/);
  assert.match(section, /earnDelete\.mutate/);
  assert.match(section, /headers=\{\['#', 'نوع الإضافة', 'عدد النقاط', 'الإجراء'\]\}/);
  assert.match(section, /تعديل/);
  assert.match(section, /تأكيد الحذف/);
});
