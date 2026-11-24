import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceptionScanUrl, pathOwnsItsOwnScanner } from './camera-scan-route.ts';

test('builds a safe reception URL that preserves leading zeroes in the scanned code', () => {
  assert.equal(buildReceptionScanUrl('0246999'), '/club/reception?scan=0246999');
  assert.equal(buildReceptionScanUrl(' A/12 '), '/club/reception?scan=A%2F12');
});

test('pages with their own scanner keep the scan', () => {
  assert.equal(pathOwnsItsOwnScanner('/club/reception'), true);
  assert.equal(pathOwnsItsOwnScanner('/club/attendance'), true);
  assert.equal(pathOwnsItsOwnScanner('/club/events/4/live/checkin'), true);
  assert.equal(pathOwnsItsOwnScanner('/club/members'), false);
  assert.equal(pathOwnsItsOwnScanner('/club/reception/quick-services'), false);
  assert.equal(pathOwnsItsOwnScanner('/'), false);
});
