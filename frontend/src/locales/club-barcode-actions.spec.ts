import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function locale(name: 'ar' | 'en') {
  return JSON.parse(
    readFileSync(new URL(`./club.${name}.json`, import.meta.url), 'utf8'),
  ) as { packages?: Record<string, string> };
}

test('QR preview action has user-facing Arabic and English labels', () => {
  assert.equal(locale('ar').packages?.openView, 'عرض رمز QR');
  assert.equal(locale('en').packages?.openView, 'View QR code');
});
