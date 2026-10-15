import assert from 'node:assert/strict';
import test from 'node:test';
import { HardwareScannerBuffer, isScannerTypingTarget } from './use-hardware-scanner';

test('emits fast scanner bursts terminated by Enter or Tab and keeps leading zeroes', () => {
  const enter = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  for (const [index, key] of [...'0246999'].entries()) enter.push(key, index * 10);
  assert.deepEqual(enter.push('Enter', 80), { code: '0246999', preventDefault: true });

  const tab = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  for (const [index, key] of [...'A/12'].entries()) tab.push(key, index * 8);
  assert.deepEqual(tab.push('Tab', 40), { code: 'A/12', preventDefault: true });
});

test('flushes suffix-less scanners but rejects short or human-speed input', () => {
  const suffixless = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  for (const [index, key] of [...'778899'].entries()) suffixless.push(key, index * 9);
  assert.equal(suffixless.flush(), '778899');

  const short = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  short.push('1', 0);
  short.push('2', 10);
  assert.equal(short.flush(), null);

  const human = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  for (const [index, key] of [...'1234'].entries()) human.push(key, index * 200);
  assert.equal(human.flush(), null);
});

test('ignores modified and non-printable keys without contaminating a pending scan', () => {
  const buffer = new HardwareScannerBuffer({ minLength: 4, maxGapMs: 120 });
  buffer.push('0', 0);
  buffer.push('Shift', 5);
  buffer.push('1', 10, true);
  buffer.push('2', 15);
  buffer.push('3', 20);
  buffer.push('4', 25);
  assert.equal(buffer.flush(), '0234');
});

test('recognizes every editable target so normal typing remains local', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(isScannerTypingTarget({ tagName, isContentEditable: false }), true);
  }
  assert.equal(isScannerTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isScannerTypingTarget({ tagName: 'BUTTON', isContentEditable: false }), false);
  assert.equal(isScannerTypingTarget(null), false);
});
