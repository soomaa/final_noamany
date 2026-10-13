const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ordinary subscriptions can be assigned to an employee while the logged-in user remains the creator', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/club/subscriptions.tsx'), 'utf8');

  assert.match(source, /const \{ data: subscriptionEmployees = \[\] \} = useQuery/);
  assert.match(source, /subscriptionKind === 'package' \? Number\(form\.employeeId\) \|\| undefined/);
  assert.match(source, /subscriptionKind === 'package' \? \(/);
  assert.match(source, /<FieldWrapper label="الموظف">/);
  assert.match(source, /subscriptionKind === 'private' \? \(/);
  assert.match(source, /<FieldWrapper label="الكابتن" required>/);
  assert.ok(
    source.indexOf("const [subscriptionKind, setSubscriptionKind]") < source.indexOf('const { data: subscriptionEmployees = [] } = useQuery'),
    'the employee query must be declared after subscriptionKind is initialized',
  );
});
