const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('opening a visible sidebar section does not navigate an employee to a denied landing page', () => {
  const sidebar = fs.readFileSync(path.join(root, 'src/components/layout/sidebar.tsx'), 'utf8');

  assert.match(sidebar, /const \{[^}]*\bcanNavRoute\b[^}]*\bcanRoute\b[^}]*\bisReady\b[^}]*\} = usePermission\(\);/);
  assert.match(sidebar, /isReady \? filterNavSections\(NAV_SECTIONS, canNavRoute\) : \[\]/);
  assert.match(sidebar, /setDrilled\(section\.id\);[\s\S]*?const landingPath = navSectionLandingPath\(section\.id\);[\s\S]*?if \(canRoute\(landingPath\)\) navigate\(landingPath\);/);
});

test('sidebar keeps a parent department only when it contains an allowed page', () => {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(root, 'src/lib/filter-nav.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', js)(mod.exports, mod);
  const sections = [
    { id: 'club', groups: [{ id: 'reception', items: [{ to: '/club/reception' }, { to: '/club/subscriptions' }] }] },
    { id: 'finance', items: [{ to: '/reports/finance/daily-closing' }] },
    { id: 'admin', items: [{ to: '/admin/users' }] },
  ];
  const allowed = new Set(['/club/reception', '/reports/finance/daily-closing']);
  const result = mod.exports.filterNavSections(sections, route => allowed.has(route));
  assert.deepEqual(result.map(s => s.id), ['club', 'finance']);
  assert.deepEqual(result[0].groups[0].items, [{ to: '/club/reception' }]);
  assert.equal(sections[0].groups[0].items.length, 2, 'do not mutate shared navigation for other users');
  assert.deepEqual(mod.exports.filterNavSections(sections, () => false), []);
});
