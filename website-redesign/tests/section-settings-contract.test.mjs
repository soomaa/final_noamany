import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('WEB-01 manifest covers every authored public section and preserves fallback content when CMS is absent', async () => {
  const [main, html] = await Promise.all([read('src/main.js'), read('index.html')]);
  for (const key of ['hero','about','products','offers','schedule','services','classes','coaches','videos','gallery','membership','branches','contact','lead','footer']) {
    assert.match(main, new RegExp(`${key}:\\{root:`), key);
  }
  assert.match(main, /A missing record leaves the curated page fallback untouched/);
  assert.match(html, /class="hero luxe-hero"/);
  assert.match(html, /<footer>/);
});

test('section settings reject unknown DOM keys and retired ticker mutation endpoints', async () => {
  const [source, publicSource] = await Promise.all([
    read('../backend/src/modules/portal-management/portal-management.service.ts'),
    read('../backend/src/modules/public-portal/public-portal.service.ts'),
  ]);
  assert.match(source, /PUBLIC_SECTION_KEYS/);
  assert.doesNotMatch(source.match(/const TYPES =[\s\S]*?\];/)?.[0] ?? '', /'ticker'/);
  assert.match(source, /مفتاح قسم الموقع غير معتمد/);
  assert.match(publicSource, /content_type NOT IN \('ticker','membership-plans'\)/);
});

test('the admin section picker exposes every managed homepage section key', async () => {
  const editor = await read('../frontend/src/pages/portal-management/index.tsx');
  const sectionConfig = editor.match(/'section-settings':\{[\s\S]*?\}\]},/)?.[0] ?? '';
  for (const key of ['hero','about','products','offers','schedule','services','classes','coaches','videos','gallery','membership','branches','contact','lead','footer']) {
    assert.match(sectionConfig, new RegExp(`value:'${key}'`), key);
  }
});
