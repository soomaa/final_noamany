import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneNational } from './phone-display.ts';

test('shows an Egyptian number the way staff read it', () => {
  assert.equal(phoneNational('201554441578'), '01554441578');
  assert.equal(phoneNational('201007151246'), '01007151246');
});

test('shows other Arab countries in their local form', () => {
  assert.equal(phoneNational('966512345678'), '0512345678');
  assert.equal(phoneNational('971501234567'), '0501234567');
  assert.equal(phoneNational('962791234567'), '0791234567');
});

test('does not mistake a longer dial code for a shorter one', () => {
  // 971 must not be read as 97 + rest.
  assert.equal(phoneNational('971501234567'), '0501234567');
});

test('leaves a number it cannot resolve untouched', () => {
  // Legacy imports and non-Arab numbers: trimming digits on a guess would invent a
  // number that does not exist.
  assert.equal(phoneNational('19735808625'), '19735808625');
  assert.equal(phoneNational('13474589081'), '13474589081');
  assert.equal(phoneNational('30097126'), '30097126');
  assert.equal(phoneNational('552555530'), '552555530');
});

test('leaves an already-local number alone', () => {
  assert.equal(phoneNational('01012345678'), '01012345678');
});

test('handles empty input', () => {
  assert.equal(phoneNational(null), '');
  assert.equal(phoneNational(''), '');
  assert.equal(phoneNational('   '), '');
});
