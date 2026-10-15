import assert from 'node:assert/strict';
import test from 'node:test';
import * as posAdmin from './pos-admin.tsx';

test('inventory tracking exposes a blocking operational warning when disabled', () => {
  const notice = (posAdmin as { inventoryTrackingNotice?: (enabled: boolean) => null | { title: string; description: string } }).inventoryTrackingNotice;
  assert.equal(typeof notice, 'function');
  assert.equal(notice!(true), null);
  assert.match(notice!(false)?.title ?? '', /المخزون/);
  assert.match(notice!(false)?.description ?? '', /من غير خصم/);
});
