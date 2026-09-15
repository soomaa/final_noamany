import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptLogoUrl } from './receipt-brand.ts';

test('legacy bundled receipt marks resolve to the Noamany logo', () => {
  for (const logo of [undefined, '', '/legacy-logo.jpeg', 'https://cafe.local/legacy-logo.png']) {
    assert.equal(receiptLogoUrl(logo), '/noamany-logo.png');
  }
});

test('receipt branding retains explicitly uploaded logos', () => {
  assert.equal(receiptLogoUrl(' /uploads/branch-logo.png '), '/uploads/branch-logo.png');
});
