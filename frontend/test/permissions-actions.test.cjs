const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('permissions list exposes details, pending edits, and confirmed soft deletion', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/permissions/index.tsx'),
    'utf8',
  );

  assert.match(source, /api\.get<PermissionDetails>\(`\/permissions\/\$\{id\}`\)/);
  assert.match(source, /api\.put\(`\/permissions\/\$\{editing\.id\}`, payload\)/);
  assert.match(source, /api\.delete\(`\/permissions\/\$\{id\}`\)/);
  assert.match(source, /row\.original\.canModify/);
  assert.match(source, /aria-label=\{ui\('التفاصيل'\)\}/);
  assert.match(source, /description: ui\('هل تريد حذف طلب الإذن؟/);
});
