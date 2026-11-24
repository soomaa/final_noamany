import assert from 'node:assert/strict';
import test from 'node:test';
import { isMaskedValue } from './masked-value.ts';
import { maskPhoneLocally, revealPhonePath } from './phone-mask.ts';

test('masks the national form, keeping the last two digits', () => {
  assert.equal(maskPhoneLocally('201554441578'), '*********78');
  assert.equal(maskPhoneLocally('01554441578'), '*********78');
  assert.equal(maskPhoneLocally('+1 (847) 772-2926'), '***************26');
  assert.equal(maskPhoneLocally('7'), '*');
});

test('a locally masked value reads as masked, like a server-masked one', () => {
  assert.equal(isMaskedValue(maskPhoneLocally('01554441578')), true);
});

test('reveal path prefers the member, then the lead, else nothing', () => {
  assert.equal(revealPhonePath({ memberId: 4 }), '/club-members/4/phone');
  assert.equal(revealPhonePath({ leadId: 9 }), '/club-members/potential-leads/9/phone');
  assert.equal(revealPhonePath({ memberId: 4, leadId: 9 }), '/club-members/4/phone');
  assert.equal(revealPhonePath({}), null);
  assert.equal(revealPhonePath({ memberId: null, leadId: null }), null);
});

test('printed numbers are always masked', async () => {
  const { printedPhone } = await import('./phone-mask.ts');
  assert.equal(printedPhone('01554441578'), '*********78');
  assert.equal(printedPhone('*********78'), '*********78');
});
