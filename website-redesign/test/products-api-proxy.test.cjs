const assert = require('node:assert/strict');
const test = require('node:test');

test('forwards the local products request to the backend', async () => {
  const response = await fetch('http://127.0.0.1:5173/api/public/portal/products');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.items));
  assert.ok(payload.items.length > 0, 'the catalog should return available products');
});
