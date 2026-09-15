import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/employee/self-service.tsx', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../src/app/router.tsx', import.meta.url), 'utf8');

assert.match(page, /\/mobile\/evaluations/);
assert.match(page, /\/mobile\/permissions/);
assert.match(page, /\/mobile\/permissions\/available/);
assert.match(page, /`\/mobile\/permissions\/\$\{selectedPermit/);
assert.match(page, /title="أذوناتي"/);
assert.match(page, /query\.isError/);
assert.match(router, /me\/evaluations/);
assert.match(router, /me\/permissions/);

const withdrawal = fs.readFileSync(new URL('../src/pages/cafe/management-withdrawals.tsx', import.meta.url), 'utf8');
assert.match(withdrawal, /inventory-transactions\/management-withdrawals/);
assert.doesNotMatch(withdrawal, /price:\s*Number/);
