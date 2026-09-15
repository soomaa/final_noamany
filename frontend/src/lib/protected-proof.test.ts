import assert from 'node:assert/strict';
import test from 'node:test';
import { openProtectedProof } from './protected-proof.ts';

test('reserves the proof tab during the click before awaiting protected content', async () => {
  const events: string[] = [];
  const preview = { opener: {}, location: { replace(url: string) { assert.match(url, /^blob:/); events.push('navigate'); } }, close() {} };
  const browser = { open() { events.push('open'); return preview; }, setTimeout(callback: () => void) { callback(); } } as unknown as Window;
  await openProtectedProof(async () => { events.push('fetch'); assert.equal(preview.opener, null); return new Blob(['receipt']); }, browser);
  assert.deepEqual(events, ['open', 'fetch', 'navigate']);
});

test('reports blocked proof tabs without downloading an invisible attachment', async () => {
  let fetched = false;
  await assert.rejects(openProtectedProof(async () => { fetched = true; return new Blob(); }, { open: () => null } as unknown as Window));
  assert.equal(fetched, false);
});

test('closes reserved proof tab when the authenticated download fails', async () => {
  let closed = false;
  const preview = { opener: {}, close() { closed = true; } };
  await assert.rejects(openProtectedProof(async () => { throw new Error('unauthorized'); }, { open: () => preview } as unknown as Window), /unauthorized/);
  assert.equal(closed, true);
});
