import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTRY_VOICE_TEXT, isExpiryRefusal, pickArabicVoice, refusalReasons } from './entry-voice.ts';

test('prefers an Egyptian voice, then Saudi, then any Arabic', () => {
  const v = (lang: string) => ({ lang, name: lang });
  assert.equal(pickArabicVoice([v('en-US'), v('ar-SA'), v('ar-EG')])?.lang, 'ar-EG');
  assert.equal(pickArabicVoice([v('en-US'), v('ar_SA'), v('ar-AE')])?.lang, 'ar_SA');
  assert.equal(pickArabicVoice([v('en-US'), v('ar-AE')])?.lang, 'ar-AE');
  assert.equal(pickArabicVoice([v('en-US'), v('fr-FR')]), null);
});

test('says the words the client asked for', () => {
  assert.equal(ENTRY_VOICE_TEXT.granted, 'مقبول');
  assert.equal(ENTRY_VOICE_TEXT.rejected, 'مرفوض');
  assert.equal(ENTRY_VOICE_TEXT.expired, 'الاشتراك منتهي');
});

test('an expired subscription is told apart from other refusals', () => {
  assert.equal(isExpiryRefusal([{ code: 'subscription_not_active', severity: 'block' }]), true);
  assert.equal(isExpiryRefusal([{ code: 'no_active_subscription', severity: 'block', messageEn: 'No active subscription (last ended 2026-11-01)' }]), true);
  assert.equal(isExpiryRefusal([{ code: 'no_active_subscription', severity: 'block', messageEn: 'No active subscription' }]), false);
  assert.equal(isExpiryRefusal([{ code: 'member_blocked', severity: 'block' }]), false);
  assert.equal(isExpiryRefusal(null), false);
});

test('reads refusal reasons off a failed check-in', () => {
  const error = { response: { data: { entitlement: { reasons: [{ code: 'subscription_not_active', severity: 'block' }] } } } };
  assert.equal(isExpiryRefusal(refusalReasons(error)), true);
  assert.deepEqual(refusalReasons(new Error('x')), []);
});
