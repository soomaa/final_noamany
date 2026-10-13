const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('subscription discount options use one five-column row on desktop', () => {
  const componentPath = path.resolve(__dirname, '../src/components/club/subscription-discount-fields.tsx');
  const component = fs.readFileSync(componentPath, 'utf8');

  assert.match(component, /className="grid gap-2 sm:grid-cols-5"/);
});
