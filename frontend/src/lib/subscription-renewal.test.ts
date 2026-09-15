import assert from 'node:assert/strict';
import test from 'node:test';
import { renewalEditableFields, renewalPrimaryAction } from './subscription-renewal.ts';

test('uses an immediate action only after the subscription quota ends', () => {
  assert.equal(renewalPrimaryAction({ scheduleMode: 'immediate' }), 'بدء التجديد الآن');
  assert.equal(renewalPrimaryAction({ scheduleMode: 'after_queue' }), 'إضافة التجديد للطابور');
});

test('does not expose plan or date edits during a renewal', () => {
  assert.deepEqual(renewalEditableFields, ['discount', 'payment']);
});
