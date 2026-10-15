import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReceptionScanUrl,
  createPersistentScanRequest,
  pathOwnsItsOwnScanner,
  PERSISTENT_SCANNER_STORAGE_KEY,
  readPersistentScannerOpen,
} from './persistent-scanner-model';

test('creates a unique in-app scan request and preserves the scanner payload', () => {
  assert.deepEqual(createPersistentScanRequest(' A000513 ', 7), {
    id: 8,
    code: 'A000513',
  });
  assert.equal(createPersistentScanRequest('   ', 7), null);
});

test('builds a reception handoff that preserves leading zeroes and escapes opaque codes', () => {
  assert.equal(buildReceptionScanUrl(' 0246999 '), '/club/reception?scan=0246999');
  assert.equal(buildReceptionScanUrl(' A/12 '), '/club/reception?scan=A%2F12');
  assert.equal(buildReceptionScanUrl('   '), null);
});

test('persists scanner state only for an explicit ONE80 open value', () => {
  assert.equal(PERSISTENT_SCANNER_STORAGE_KEY, 'one80.reception.scanner.open');
  assert.equal(readPersistentScannerOpen('1'), true);
  assert.equal(readPersistentScannerOpen('0'), false);
  assert.equal(readPersistentScannerOpen(null), false);
});

test('leaves specialized event and kiosk scanners in control of their routes', () => {
  for (const pathname of ['/club/events/checkin', '/live/checkin', '/live/kiosk', '/live/guest']) {
    assert.equal(pathOwnsItsOwnScanner(pathname), true, pathname);
  }
  assert.equal(pathOwnsItsOwnScanner('/sales-portal'), false);
  assert.equal(pathOwnsItsOwnScanner('/club/reception'), false);
});
