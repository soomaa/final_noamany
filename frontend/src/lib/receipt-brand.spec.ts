import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptLogoUrl } from './receipt-brand.ts';

test('legacy bundled receipt marks resolve to the transparent ONE80 PNG', () => {
  for (const logo of [undefined, '', '/one-logo.jpeg', '/one-logo.png', 'https://cafe.local/one-logo.jpeg', '/ONE80-logo.jpg']) {
    assert.equal(receiptLogoUrl(logo), '/one-logo.png');
  }
});

test('receipt branding retains explicitly uploaded logos', () => {
  assert.equal(receiptLogoUrl(' /uploads/branch-logo.png '), '/uploads/branch-logo.png');
});
