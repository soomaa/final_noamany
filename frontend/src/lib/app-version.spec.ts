import assert from 'node:assert/strict';
import test from 'node:test';
import { entryBundle, liveBundle, runningBundle, SHELL_PATH, updateAvailable } from './app-version.ts';

test('reads the entry bundle out of the HTML', () => {
  assert.equal(entryBundle('<script type="module" crossorigin src="/assets/index-Cnjtv0I9.js"></script>'), 'index-Cnjtv0I9.js');
  assert.equal(entryBundle('<html>no bundle</html>'), null);
  assert.equal(entryBundle(null), null);
});

test('finds the bundle this tab is running from its module scripts', () => {
  const doc = {
    querySelectorAll: () => [{ getAttribute: () => '/assets/vendor-x.js' }, { getAttribute: () => '/assets/index-DUXN7OVA.js' }],
  } as never;
  assert.equal(runningBundle(doc), 'index-DUXN7OVA.js');
  assert.equal(runningBundle({ querySelectorAll: () => [{ getAttribute: () => '/src/main.tsx' }] } as never), null);
});

test('an update shows only when both names are known and differ', () => {
  assert.equal(updateAvailable('index-A.js', 'index-B.js'), true);
  assert.equal(updateAvailable('index-A.js', 'index-A.js'), false);
  assert.equal(updateAvailable(null, 'index-B.js'), false); // dev server: no hashed entry
  assert.equal(updateAvailable('index-A.js', null), false); // offline / server error
});

test('the live check asks for the management shell, never throws and bypasses caches', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const ok = (async (u: string, i?: RequestInit) => {
    url = u;
    init = i;
    return new Response('<script src="/assets/index-NEW1.js">');
  }) as typeof fetch;
  assert.equal(await liveBundle(ok), 'index-NEW1.js');
  // /index.html is the public website on the Noamany server; the system lives behind /login.
  assert.equal(SHELL_PATH, '/login');
  assert.match(url, /^\/login\?v=\d+$/);
  assert.equal(init?.cache, 'no-store');
  assert.equal((init?.headers as Record<string, string>).Accept, 'text/html');
  assert.equal(await liveBundle((async () => new Response('', { status: 502 })) as typeof fetch), null);
  assert.equal(await liveBundle((async () => { throw new Error('offline'); }) as typeof fetch), null);
});
