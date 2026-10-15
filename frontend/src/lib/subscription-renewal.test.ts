import assert from 'node:assert/strict';
import test from 'node:test';
import { renewalEditableFields, renewalPrimaryAction } from './subscription-renewal.ts';

test('uses immediate copy when quota is exhausted', () => {
  assert.equal(renewalPrimaryAction({ scheduleMode: 'immediate' }), 'بدء التجديد الآن');
});

test('uses scheduled copy while a current period or queue still exists', () => {
  assert.equal(renewalPrimaryAction({ scheduleMode: 'after_current' }), 'تأكيد التجديد المجدول');
  assert.equal(renewalPrimaryAction({ scheduleMode: 'after_queue' }), 'إضافة التجديد للطابور');
});

test('offers promotions while keeping date calculation server-owned', () => {
  assert.deepEqual(renewalEditableFields, ['promotion', 'discount', 'payment']);
});
