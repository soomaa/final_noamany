import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScannedCode } from './scanned-code.ts';

test('a code typed on the US layout stays the same (upper-cased)', () => {
  assert.equal(normalizeScannedCode('B18580'), 'B18580');
  assert.equal(normalizeScannedCode(' b18580 '), 'B18580');
});

test('a scan typed through the Arabic keyboard layout is read back as the code', () => {
  assert.equal(normalizeScannedCode('لآ18580'), 'B18580'); // Shift+B
  assert.equal(normalizeScannedCode('لا18580'), 'B18580'); // B
  assert.equal(normalizeScannedCode('ِ20208'), 'A20208'); // Shift+A = kasra
  assert.equal(normalizeScannedCode('}12576'), 'C12576'); // Shift+C
  assert.equal(normalizeScannedCode('ؤ12576'), 'C12576'); // C
});

test('Arabic-Indic digits become Latin digits', () => {
  assert.equal(normalizeScannedCode('لآ١٨٥٨٠'), 'B18580');
  assert.equal(normalizeScannedCode('٠١٠٠٧٨٥٥٨١٦'), '01007855816');
});

test('names and phone numbers are left alone', () => {
  assert.equal(normalizeScannedCode('احمد محمد'), 'احمد محمد');
  assert.equal(normalizeScannedCode('لا'), 'لا');
  assert.equal(normalizeScannedCode('01007855816'), '01007855816');
});
