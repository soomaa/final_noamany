const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('users page creates administrators and employee-linked accounts from one dialog', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/users/manage.tsx'), 'utf8');

  assert.match(source, /إضافة مستخدم جديد/);
  assert.match(source, /api\.post\('\/users', payload\)/);
  assert.match(source, /<SelectItem value="1">\{ui\('مدير على النظام'\)\}<\/SelectItem>/);
  assert.match(source, /<SelectItem value="3">\{ui\('مدير فرع'\)\}<\/SelectItem>/);
  assert.match(source, /<SelectItem value="2">\{ui\('موظف'\)\}<\/SelectItem>/);
  assert.match(source, /level === 1 \? \(/);
  assert.match(source, /الموظف المرتبط/);
});
