const { test } = require('node:test');
const assert = require('node:assert/strict');
test('subtracts exactly 58 large and 77 small from current balances', () => {
  const { plan } = require('./settle-one80-water-shortage.cjs');
  assert.deepEqual(plan([{product_id:36,current_stock:'891'},{product_id:38,current_stock:'1340'}]).map(x=>x.after), [833,1263]);
  assert.deepEqual(plan([{product_id:36,current_stock:'880'},{product_id:38,current_stock:'1300'}]).map(x=>x.after), [822,1223]);
});
test('rejects missing or insufficient balances', () => {
  const { plan } = require('./settle-one80-water-shortage.cjs');
  assert.throws(()=>plan([]));
  assert.throws(()=>plan([{product_id:36,current_stock:57},{product_id:38,current_stock:100}]));
});
