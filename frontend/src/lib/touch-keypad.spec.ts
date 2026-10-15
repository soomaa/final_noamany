import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enterKey, keyboardKeypadKey, normalizeKeypadDigits, preferredKeypadSide } from './touch-keypad.ts';
test('touch amounts replace the old amount, retain decimals and support correction', () => {
  assert.equal(enterKey('150', '2', { replace: true, decimal: true }), '2');
  assert.equal(enterKey('2.', '5', { decimal: true }), '2.5');
  assert.equal(enterKey('2.50', '9', { decimal: true }), '2.50');
  assert.equal(enterKey('2.50', 'backspace'), '2.5');
  assert.equal(enterKey('2', 'clear'), '');
  assert.equal(enterKey('01', '2'), '012');
  assert.equal(enterKey('3', '.'), '3');
});

test('physical keyboards map Arabic, Persian, numpad and correction keys without submitting', () => {
  assert.equal(normalizeKeypadDigits('١٢٣٫٤۵'), '123.45');
  assert.equal(keyboardKeypadKey('٧'), '7');
  assert.equal(keyboardKeypadKey('Decimal'), '.');
  assert.equal(keyboardKeypadKey('Backspace'), 'backspace');
  assert.equal(keyboardKeypadKey('Delete'), 'clear');
  for (const key of ['Enter', 'Escape', 'Tab', 'ArrowLeft', 'a']) assert.equal(keyboardKeypadKey(key), null);
  let value = enterKey('', '1', { decimal: true });
  value = enterKey(value, keyboardKeypadKey('٢')!, { decimal: true });
  value = enterKey(value, '.', { decimal: true });
  value = enterKey(value, keyboardKeypadKey('5')!, { decimal: true });
  assert.equal(value, '12.5');
});


test('keypad moves above or below a field when neither horizontal side fits', () => {
  assert.equal(preferredKeypadSide(390, { left: 41, right: 349 }), 'bottom');
  assert.equal(preferredKeypadSide(1024, { left: 248, right: 776 }), 'bottom');
  assert.equal(preferredKeypadSide(1280, { left: 800, right: 1200 }), 'right');
  assert.equal(preferredKeypadSide(1280, { left: 40, right: 400 }), 'right');
});
