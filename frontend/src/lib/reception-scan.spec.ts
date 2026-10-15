import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeReceptionScan,
  isReceptionSearchReady,
  normalizeReceptionScanCode,
  pickReceptionScanHit,
} from './reception-scan';

test('consumes scan once while preserving tablet mode and leading zeroes', () => {
  const params = new URLSearchParams('tablet=1&scan=%200246999%20');

  const result = consumeReceptionScan(params, '');

  assert.equal(result?.code, '0246999');
  assert.equal(result?.nextParams.toString(), 'tablet=1');
  assert.equal(consumeReceptionScan(params, '0246999'), null);
});

test('accepts a single numeric scanner query but not one-letter name noise', () => {
  assert.equal(isReceptionSearchReady('7'), true);
  assert.equal(isReceptionSearchReady('٧'), true);
  assert.equal(isReceptionSearchReady('a'), false);
  assert.equal(isReceptionSearchReady('ali'), true);
});

test('rebuilds a branch letter typed on the Arabic keyboard layout', () => {
  assert.deepEqual(normalizeReceptionScanCode('ش012253', 2), { query: 'A012253', exactCodes: ['A012253'], strict: true });
  assert.equal(normalizeReceptionScanCode('لا012253', 1).query, 'B012253');
  assert.equal(normalizeReceptionScanCode('ﻻ012253', 1).query, 'B012253');
  assert.equal(normalizeReceptionScanCode('a012253', 1).query, 'A012253');
});

test('restores a dropped branch letter from the reception branch', () => {
  assert.equal(normalizeReceptionScanCode('012253؛', 2).query, 'B012253');
  const bare = normalizeReceptionScanCode('012253', 2);
  assert.deepEqual(bare, { query: '012253', exactCodes: ['012253', 'B012253'], strict: false });
  assert.deepEqual(normalizeReceptionScanCode('012253', null).exactCodes, ['012253']);
});

test('leaves ordinary search text and phones alone', () => {
  assert.deepEqual(normalizeReceptionScanCode('منى', 1), { query: 'منى', exactCodes: null, strict: false });
  assert.equal(normalizeReceptionScanCode('01012345678', 1).exactCodes, null);
  assert.equal(normalizeReceptionScanCode('٠١٢٢٥٣', 1).query, '012253');
});

test('opens only the exact member for a rebuilt code', () => {
  const hits = [{ memberCode: 'A0122530' }, { memberCode: 'B012253' }];
  assert.equal(pickReceptionScanHit(hits, hits[0], normalizeReceptionScanCode('لا012253', 1))?.memberCode, 'B012253');
  assert.equal(pickReceptionScanHit([hits[0]], hits[0], normalizeReceptionScanCode('لا012253', 1)), null);
  assert.equal(pickReceptionScanHit([hits[0]], hits[0], normalizeReceptionScanCode('012253', 2))?.memberCode, 'A0122530');
});
