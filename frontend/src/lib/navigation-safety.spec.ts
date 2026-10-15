import assert from 'node:assert/strict';
import test from 'node:test';
import { safeInternalPath } from './navigation-safety';

test('keeps valid same-app navigation paths including query and hash', () => {
  assert.equal(safeInternalPath('/dashboard'), '/dashboard');
  assert.equal(
    safeInternalPath('/employees?status=1#active'),
    '/employees?status=1#active',
  );
});

test('fails closed for absolute, protocol-relative, and backslash URLs', () => {
  for (const untrusted of [
    'https://evil.example/steal',
    'javascript:alert(1)',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '\\evil.example/steal',
  ]) {
    assert.equal(safeInternalPath(untrusted), '/profile');
  }
});

test('fails closed for malformed, control-character, or oversized paths', () => {
  assert.equal(safeInternalPath('dashboard'), '/profile');
  assert.equal(safeInternalPath(' /dashboard'), '/profile');
  assert.equal(safeInternalPath('/dashboard\n/next'), '/profile');
  assert.equal(safeInternalPath(`/${'a'.repeat(2_048)}`), '/profile');
  assert.equal(safeInternalPath(null), '/profile');
});

test('supports an explicit trusted internal fallback', () => {
  assert.equal(safeInternalPath('//evil.example', '/login'), '/login');
});
