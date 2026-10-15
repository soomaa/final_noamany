import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTreasuryReportDate } from './treasury-operating-date.ts';

test('defaults treasury to the open shift operating date', () => {
  assert.equal(resolveTreasuryReportDate('2026-09-07', '2026-09-06', false), '2026-09-06');
});

test('keeps a date explicitly selected by the user', () => {
  assert.equal(resolveTreasuryReportDate('2026-09-07', '2026-09-06', true), '2026-09-07');
});

test('keeps today when there is no open shift', () => {
  assert.equal(resolveTreasuryReportDate('2026-09-07', null, false), '2026-09-07');
});
