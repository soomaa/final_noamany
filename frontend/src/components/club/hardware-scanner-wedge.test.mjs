import assert from 'node:assert/strict';
import test from 'node:test';
import { createHardwareScannerWedge } from './use-hardware-scanner.ts';

const type = (wedge, value, startedAt, gap, extra = {}) => {
  [...value].forEach((key, index) => wedge.handle({ key, at: startedAt + index * gap, ...extra }));
};

test('Enter- and Tab-suffixed scanners emit real wedge codes', () => {
  const got = [];
  const wedge = createHardwareScannerWedge((code) => got.push(code));
  type(wedge, '3302508010286', 1000, 10);
  assert.equal(wedge.handle({ key: 'Enter', at: 1130 }), true);
  type(wedge, '5061', 2000, 10);
  assert.equal(wedge.handle({ key: 'Tab', at: 2045 }), true);
  assert.deepEqual(got, ['3302508010286', '5061']);
  wedge.dispose();
});

test('scanner with no suffix flushes through the production timer path', async () => {
  const got = [];
  const wedge = createHardwareScannerWedge((code) => got.push(code), { flushMs: 20 });
  type(wedge, '5054', 0, 10);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(got, ['5054']);
  wedge.dispose();
});

test('slow typing, short bursts, fields, composition, repeats, and shortcuts do not scan', () => {
  const got = [];
  const wedge = createHardwareScannerWedge((code) => got.push(code));
  type(wedge, '5061', 0, 400);
  wedge.handle({ key: 'Enter', at: 2000 });
  type(wedge, '12', 3000, 10);
  wedge.handle({ key: 'Enter', at: 3030 });
  type(wedge, '3302508010286', 4000, 10, { typingTarget: true });
  type(wedge, '5678', 5000, 10, { isComposing: true });
  type(wedge, '5678', 6000, 10, { repeat: true });
  type(wedge, '5678', 7000, 10, { ctrlKey: true });
  assert.deepEqual(got, []);
  wedge.dispose();
});

test('focus entering a field clears a pending global burst', () => {
  const got = [];
  const wedge = createHardwareScannerWedge((code) => got.push(code));
  type(wedge, '5054', 0, 10);
  wedge.handle({ key: 'x', at: 45, typingTarget: true });
  wedge.handle({ key: 'Enter', at: 50 });
  assert.deepEqual(got, []);
  wedge.dispose();
});

test('dispose cancels a pending suffixless scan', async () => {
  const got = [];
  const wedge = createHardwareScannerWedge((code) => got.push(code), { flushMs: 20 });
  type(wedge, '5054', 0, 10);
  wedge.dispose();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(got, []);
});
