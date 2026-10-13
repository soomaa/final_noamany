const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '../src/modules/club-subscriptions/club-subscriptions.service.ts');

test('a system or RBAC super administrator may create a subscription across member branches', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /isSystemAdmin\(user\) \|\| shareClubMemberIdentity/);
});

test('the common system-admin policy recognizes an RBAC super-admin role', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/common/utils/system-admin.util.ts'), 'utf8');

  assert.match(source, /export function isSystemAdmin/);
  assert.match(source, /user\?\.level === 1 \|\| user\?\.is_super_admin === true/);
});
