import assert from 'node:assert/strict';
import test from 'node:test';
import { toDialLink, toWhatsAppLink } from './contact-links';

test('builds working WhatsApp links from local Egyptian mobile numbers', () => {
  assert.equal(toWhatsAppLink('01000000000'), 'https://wa.me/201000000000');
  assert.equal(toWhatsAppLink('0100 000 0000'), 'https://wa.me/201000000000');
  assert.equal(toWhatsAppLink('+201000000000'), 'https://wa.me/201000000000');
});

test('encodes WhatsApp messages and rejects unusable phone numbers', () => {
  const link = toWhatsAppLink('01000000000', 'اشتراكك قرب ينتهي');
  assert.ok(link?.includes(encodeURIComponent('اشتراكك قرب ينتهي')));
  assert.equal(toWhatsAppLink('123'), null);
  assert.equal(toDialLink('12'), null);
});

test('keeps dial links in the locally dialable form', () => {
  assert.equal(toDialLink('01000000000'), 'tel:01000000000');
  assert.equal(toDialLink('+20 100 000 0000'), 'tel:+201000000000');
});
