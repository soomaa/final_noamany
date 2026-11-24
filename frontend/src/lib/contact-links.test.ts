import assert from 'node:assert/strict';
import test from 'node:test';
import { toDialLink, toWhatsAppLink } from './contact-links.ts';

/**
 * Every member phone in production is stored as `01xxxxxxxxx`. The sales portal built its
 * WhatsApp href from the raw digits, producing `wa.me/01000000000` — a number WhatsApp
 * rejects — so the button failed 100% of the time and the team stopped trusting it.
 */
test('a locally-stored Egyptian number becomes a working wa.me link', () => {
  assert.equal(toWhatsAppLink('01000000000'), 'https://wa.me/201000000000');
  assert.equal(toWhatsAppLink('0100 000 0000'), 'https://wa.me/201000000000');
});

test('the raw-digits form the portal used is exactly what breaks', () => {
  // Documents the defect: this is what the old code produced.
  assert.notEqual(toWhatsAppLink('01000000000'), 'https://wa.me/01000000000');
});

test('numbers already in international form are left alone', () => {
  assert.equal(toWhatsAppLink('+201000000000'), 'https://wa.me/201000000000');
  assert.equal(toWhatsAppLink('00201000000000'), 'https://wa.me/201000000000');
});

test('a prefilled message rides along, encoded', () => {
  const link = toWhatsAppLink('01000000000', 'اشتراكك قرب ينتهي');
  assert.ok(link?.startsWith('https://wa.me/201000000000?text='));
  assert.ok(link?.includes(encodeURIComponent('اشتراكك قرب ينتهي')));
});

test('unusable input yields no link rather than a broken one', () => {
  assert.equal(toWhatsAppLink(''), null);
  assert.equal(toWhatsAppLink(null), null);
  assert.equal(toWhatsAppLink('123'), null);
});

test('dial links keep the number the phone can actually dial', () => {
  assert.equal(toDialLink('01000000000'), 'tel:01000000000');
  assert.equal(toDialLink('+20 100 000 0000'), 'tel:+201000000000');
  assert.equal(toDialLink('12'), null);
});
