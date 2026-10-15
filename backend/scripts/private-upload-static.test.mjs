import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the application never mounts the upload root as public static content', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /useStaticAssets\([^)]*uploadDir/s);
  assert.match(source, /authenticated \/api\/uploads\/files/);
});
