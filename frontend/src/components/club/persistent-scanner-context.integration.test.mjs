import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);

test('the one persistent listener routes to real reception, staff, class and POS consumers', async () => {
  const [provider, model, reception, staff, classPanel, pos] = await Promise.all([
    readFile(new URL('./persistent-scanner.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../lib/persistent-scanner-model.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/club/reception.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/club/barcode-management.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/club/fitness/barcode-check-in.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/sales/new-receipt.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal((provider.match(/useHardwareScanner\(/g) ?? []).length, 1);
  assert.match(model, /\/club\/members\/barcode-management\?tab=staff&scan=/);
  assert.match(model, /\/club\/members\/barcode-management\?tab=classes&scan=/);
  assert.match(reception, /consumeReceptionScanSearch/);
  assert.match(staff, /attendance\/barcode-preview/);
  assert.match(staff, /consumedStaffScan/);
  assert.match(classPanel, /club-classes\/barcode-check-in/);
  assert.match(classPanel, /consumedScan/);
  assert.match(pos, /get\('memberScan'\)/);
  assert.match(pos, /lookupGymMember\(scanned\)/);
  assert.match(pos, /delete\('memberScan'\)/);
  assert.equal(root.protocol, 'file:');
});
