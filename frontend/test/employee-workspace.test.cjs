const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('employee workspace renders only server-filtered, clickable work actions', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/workspace.tsx'), 'utf8');

  assert.match(source, /useNav\(\)/);
  assert.match(source, /<WorkspaceWidgets/);
  assert.match(source, /node\.clickable && node\.route/);
  assert.match(source, /<Link to=\{action\.route\}/);
});

test('workspace is a shell route and is lazy-loaded with the other application pages', () => {
  const router = fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8');
  const lazyPages = fs.readFileSync(path.join(root, 'src/app/lazy-pages.ts'), 'utf8');

  assert.match(router, /WorkspacePage/);
  assert.match(router, /<Route path="workspace" element=\{<Lazy><WorkspacePage \/><\/Lazy>\} \/>/);
  assert.match(lazyPages, /export const WorkspacePage = lazyPage\(\(\) => import\('\@\/pages\/workspace'\), 'WorkspacePage'\)/);
  assert.match(router, /TRAINER_ALLOWED_PATHS = new Set\(\['\/trainer', '\/profile', '\/notifications', '\/workspace'\]\)/);
});

test('workspace widgets do not contain fixed links to pages a user may not view', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/workspace/workspace-widgets.tsx'), 'utf8');

  assert.doesNotMatch(source, /<Link to="\/club\/subscriptions\/expired"/);
  assert.doesNotMatch(source, /<Link to="\/club\/subscriptions\/outstanding"/);
  assert.doesNotMatch(source, /<Link to="\/settings\/automation"/);
});
