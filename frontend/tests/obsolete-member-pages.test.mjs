import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readBackend = (path) => readFile(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

test('retires obsolete member groups and surveys from navigation while preserving a safe redirect', async () => {
  const [router, lazyPages, catalog, nav] = await Promise.all([
    readFrontend('../src/app/router.tsx'),
    readFrontend('../src/app/lazy-pages.ts'),
    readBackend('src/modules/rbac/catalog/rbac.catalog.ts'),
    readFrontend('../src/lib/nav.ts'),
  ]);

  for (const path of ['club/members/groups', 'club/members/surveys']) {
    assert.match(
      router,
      new RegExp(`<Route path="${path}" element=\\{<Navigate to="/club/members" replace \\/>\\} \\/>`),
    );
  }

  assert.doesNotMatch(lazyPages, /ClubMemberGroupsPage|ClubSurveysPage/);
  assert.doesNotMatch(catalog, /club\.members\.(groups|surveys)/);
  assert.doesNotMatch(nav, /CR\.members\.(groups|surveys)/);
});
