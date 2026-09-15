import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReceptionScanUrl,
  buildPersistentScanUrl,
  consumeReceptionScanSearch,
  pathOwnsItsOwnScanner,
  persistentCameraShouldOpen,
  operationalBarcodeRoutePermissionKeys,
  persistentScannerPermissionKeys,
  persistentScannerAllowedPath,
  readPersistentScannerOpen,
} from './persistent-scanner-model.ts';

test('restores an explicitly open scanner across route changes', () => {
  assert.equal(readPersistentScannerOpen('1'), true);
  assert.equal(readPersistentScannerOpen('0'), false);
  assert.equal(readPersistentScannerOpen(null), false);
});

test('builds a safe reception URL that preserves leading zeroes in the scanned code', () => {
  assert.equal(buildReceptionScanUrl('0246999'), '/club/reception?scan=0246999');
  assert.equal(buildReceptionScanUrl(' A/12 '), '/club/reception?scan=A%2F12');
  assert.equal(buildReceptionScanUrl('  '), null);
});

test('routes persistent scans to their operational context without creating another listener', () => {
  assert.equal(buildPersistentScanUrl('0246999', '/club/reception'), '/club/reception?scan=0246999');
  assert.equal(buildPersistentScanUrl('EMP-22', '/attendance'), '/club/members/barcode-management?tab=staff&scan=EMP-22');
  assert.equal(buildPersistentScanUrl('EMP-22', '/club/members/barcode-management', '?tab=staff'), '/club/members/barcode-management?tab=staff&scan=EMP-22');
  assert.equal(buildPersistentScanUrl('M-12', '/club/fitness/classes'), '/club/members/barcode-management?tab=classes&scan=M-12');
  assert.equal(buildPersistentScanUrl('M-12', '/club/subscriptions/special'), '/club/members/barcode-management?tab=classes&scan=M-12');
  assert.equal(buildPersistentScanUrl('M-12', '/sales'), '/sales/new?memberScan=M-12');
  assert.equal(buildPersistentScanUrl('M-12', '/dashboard'), '/club/reception?scan=M-12');
});

test('requires the permission of the real destination rather than reception permission everywhere', () => {
  assert.deepEqual(persistentScannerPermissionKeys('/attendance'), ['attendance:view']);
  assert.deepEqual(persistentScannerPermissionKeys('/club/members/barcode-management', '?tab=staff'), ['attendance:view']);
  assert.deepEqual(persistentScannerPermissionKeys('/club/subscriptions/special'), ['club.fitness:update', 'club.subscriptions.special:update']);
  assert.deepEqual(persistentScannerPermissionKeys('/sales/new'), ['gym-sales.sales.new_receipt:view']);
  assert.deepEqual(persistentScannerPermissionKeys('/dashboard'), ['club.reception:view', 'club.members:view']);
});

test('exposes only operational barcode tabs to the route guard without the barcode-catalog permission', () => {
  assert.deepEqual(operationalBarcodeRoutePermissionKeys('/club/members/barcode-management', '?tab=staff'), ['attendance:view']);
  assert.deepEqual(operationalBarcodeRoutePermissionKeys('/club/members/barcode-management', '?tab=classes'), ['club.fitness:update', 'club.subscriptions.special:update']);
  assert.deepEqual(operationalBarcodeRoutePermissionKeys('/club/members/barcode-management', '?tab=barcodes'), []);
  assert.deepEqual(operationalBarcodeRoutePermissionKeys('/dashboard', '?tab=staff'), []);
});

test('consumes the scan parameter once without dropping reception display preferences', () => {
  assert.deepEqual(consumeReceptionScanSearch('?tablet=1&scan=A%2F12'), {
    code: 'A/12',
    search: '?tablet=1',
  });
  assert.deepEqual(consumeReceptionScanSearch('?tablet=1'), {
    code: null,
    search: '?tablet=1',
  });
  assert.deepEqual(consumeReceptionScanSearch('?scan=%20%20'), {
    code: null,
    search: '',
  });
});

test('scanner-owned routes match route segments, not unrelated path substrings', () => {
  assert.equal(pathOwnsItsOwnScanner('/club/events/checkin'), true);
  assert.equal(pathOwnsItsOwnScanner('/club/events/checkin/manual'), true);
  assert.equal(pathOwnsItsOwnScanner('/archive/club/events/checkin'), false);
  assert.equal(pathOwnsItsOwnScanner('/club/events/checkin-archive'), false);
});

test('persistent camera closes while a route-owned scanner is active', () => {
  assert.equal(persistentCameraShouldOpen(true, '/sales-portal'), true);
  assert.equal(persistentCameraShouldOpen(true, '/live/kiosk'), false);
  assert.equal(persistentCameraShouldOpen(false, '/sales-portal'), false);
});

test('persistent scanning is limited to authenticated application routes', () => {
  assert.equal(persistentScannerAllowedPath('/login'), false);
  assert.equal(persistentScannerAllowedPath('/sales-portal'), true);
  assert.equal(persistentCameraShouldOpen(true, '/login'), false);
});
