import assert from 'node:assert/strict';
import test from 'node:test';
import { isMaskedValue, isPristineMaskedValue } from './masked-value.ts';

test('recognises a value the API masked', () => {
  assert.equal(isMaskedValue('**********78'), true);
  assert.equal(isMaskedValue('**************'), true);
});

test('a real number is not masked', () => {
  assert.equal(isMaskedValue('201012345678'), false);
  assert.equal(isMaskedValue('0501234567'), false);
  assert.equal(isMaskedValue('CARD-100044'), false);
});

test('absent and empty values are not masked', () => {
  assert.equal(isMaskedValue(null), false);
  assert.equal(isMaskedValue(undefined), false);
  assert.equal(isMaskedValue(''), false);
});

test('tells a masked value as sent from one a user half-edited', () => {
  assert.equal(isPristineMaskedValue('*********78'), true);
  assert.equal(isPristineMaskedValue('*****'), true);
  assert.equal(isPristineMaskedValue('0100****78'), false);
  assert.equal(isPristineMaskedValue('*****1234'), false);
  assert.equal(isPristineMaskedValue('01012345678'), false);
});
