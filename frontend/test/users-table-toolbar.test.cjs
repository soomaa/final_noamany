const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '../src/pages/users/manage.tsx');

test('users page keeps search and status filtering inside the table toolbar only', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const shell = source.slice(source.indexOf('<ListPageShell'), source.indexOf('<DataTable'));

  assert.doesNotMatch(shell, /searchPlaceholder=/);
  assert.match(source, /params\.filters\.status/);
  assert.match(source, /toolbar=\{/);
  assert.match(source, /<SelectItem value="active">\{ui\('نشط'\)\}<\/SelectItem>/);
  assert.match(source, /<SelectItem value="inactive">\{ui\('غير نشط'\)\}<\/SelectItem>/);
});

test('users page shows total, active, and inactive counters above the table', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /title: ui\('المستخدمون'\)/);
  assert.match(source, /title: ui\('نشطون'\)/);
  assert.match(source, /title: ui\('غير نشطين'\)/);
  assert.match(source, /users\.filter\(\(user\) => user\.approved === 1\)\.length/);
  assert.match(source, /users\.filter\(\(user\) => user\.approved !== 1\)\.length/);
});
