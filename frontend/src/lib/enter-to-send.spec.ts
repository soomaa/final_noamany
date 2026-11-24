import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSendOnKey } from './enter-to-send.ts';

test('Enter sends on a device with a real keyboard', () => {
  assert.equal(shouldSendOnKey({ key: 'Enter', shiftKey: false }, true), true);
});

test('Shift+Enter always breaks the line instead of sending', () => {
  assert.equal(shouldSendOnKey({ key: 'Enter', shiftKey: true }, true), false);
});

test('Enter never sends on a touch keyboard — it is the only way to break a line', () => {
  assert.equal(shouldSendOnKey({ key: 'Enter', shiftKey: false }, false), false);
});

test('other keys never send', () => {
  assert.equal(shouldSendOnKey({ key: 'a', shiftKey: false }, true), false);
  assert.equal(shouldSendOnKey({ key: ' ', shiftKey: false }, true), false);
});
