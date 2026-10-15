'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../../diagnose-one80-pos-requests-20261004.cjs');

test('normalizes Cairo log time and emits only safe request fields', () => {
  const raw = '192.0.2.1 - - [04/Oct/2026:20:40:56 +0300] "GET /api/pos/stock-watch?branchId=1&token=SECRET HTTP/1.1" 200 512 "https://example.invalid/?secret=PRIVATE" "Sensitive user agent"';
  const parsed = parseLine(raw, 'test-only-salt');
  assert.equal(parsed.at, '2026-10-04T17:40:56.000Z');
  assert.equal(parsed.branchId, 1);
  assert.equal(parsed.status, 200);
  assert.doesNotMatch(JSON.stringify(parsed), /192\.0\.2\.1|SECRET|PRIVATE|Sensitive/);
  assert.notEqual(parsed.client, parseLine(raw, 'different-salt').client);
});

test('supports common format and records failures without assuming returned stock', () => {
  const parsed = parseLine('192.0.2.1 - - [04/Oct/2026:17:40:56 +0000] "GET /api/pos/stock-watch?branchId=abc HTTP/1.1" 503 -', 'salt');
  assert.equal(parsed.status, 503);
  assert.equal(parsed.branchId, null);
  assert.equal(parsed.at, '2026-10-04T17:40:56.000Z');
});

test('recognises hashed JS entry bundles but ignores unrelated endpoints', () => {
  const line = '192.0.2.1 - - [04/Oct/2026:20:40:56 +0300] "GET /assets/index-example.js HTTP/1.1" 304 0';
  assert.equal(parseLine(line, 'salt').asset, 'index-example.js');
  assert.equal(parseLine(line.replace('/assets/index-example.js', '/api/auth/login?token=SECRET'), 'salt'), null);
  assert.equal(parseLine('unsupported format', 'salt'), null);
});
