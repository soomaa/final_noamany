const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  cache.set(file, mod.exports);
  new Function('require', 'module', 'exports', code)((id) => {
    if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    let next = id.startsWith('@/') ? path.join(root, 'frontend/src', id.slice(2)) : path.resolve(path.dirname(file), id);
    if (!path.extname(next)) next += '.ts';
    return load(next);
  }, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
const nav = load(path.join(root, 'frontend/src/lib/nav.ts'));
const backend = load(path.join(root, 'backend/src/modules/rbac/catalog/rbac.catalog.ts'));
const projection = load(path.join(root, 'frontend/src/lib/rbac-nav-order.ts'));
const labels = load(path.join(root, 'frontend/src/locales/ar.json')).nav;
const dto = (nodes) => nodes.map((n, i) => ({ ...n, nameEn: n.nameEn ?? null, route: n.route ?? null, icon: n.icon ?? null, sortOrder: i, children: dto(n.children ?? []) }));
const original = { actions: backend.ACTIONS, tree: dto(backend.RESOURCE_TREE) };
const ordered = projection.orderRbacCatalogForSidebar(original);

test('every sidebar department, group and page appears in permissions with the same labels and order', () => {
  assert.equal(ordered.tree.length, nav.NAV_SECTIONS.length);
  nav.NAV_SECTIONS.forEach((section, index) => {
    const module = ordered.tree[index];
    assert.equal(module.key, section.id === 'settings' ? 'admin' : section.id);
    assert.equal(module.nameAr, labels.sections[section.id]);
    const expected = [];
    const landing = nav.navSectionLandingPath(section.id);
    expected.push({ type: 'page', route: landing, name: labels.sections[section.id] });
    for (const item of section.items ?? []) if (item.to !== landing) expected.push({ type: 'page', route: item.to, name: labels.routes[item.to] ?? item.label ?? item.to.split('/').filter(Boolean).pop().replace(/-/g, ' ') });
    for (const group of section.groups ?? []) expected.push({ type: 'group', name: labels.groups[group.id] ?? group.id, pages: group.items.map(item => ({ route: item.to, name: labels.routes[item.to] ?? item.label ?? item.to.split('/').filter(Boolean).pop().replace(/-/g, ' ') })) });
    const actual = module.children.map(node => node.type === 'group'
      ? { type: 'group', name: node.nameAr, pages: node.children.map(page => ({ route: page.route, name: page.nameAr })) }
      : { type: 'page', route: node.route, name: node.nameAr });
    assert.deepEqual(actual, expected, section.id);
  });
});

test('new sidebar pages have stable unique keys and keep existing permission ancestry', () => {
  const flat = backend.flattenCatalog();
  assert.equal(new Set(flat.map(r => r.key)).size, flat.length);
  const byRoute = new Map(flat.filter(r => r.route).map(r => [r.route, r]));
  const visit = (nodes) => nodes.forEach(node => {
    if (node.type === 'page') {
      const real = byRoute.get(node.route);
      assert.ok(real, node.route);
      assert.equal(node.key, real.key);
      assert.deepEqual(node.actions, real.actions);
    }
    visit(node.children);
  });
  visit(ordered.tree);
  assert.equal(byRoute.get('/club/members/barcode-management/member-check-in').parentKey, 'club.members.barcode_management');
  assert.equal(byRoute.get('/club/lockers/inventory').parentKey, 'club.lockers');
  assert.equal(byRoute.get('/club/members/measurements').parentKey, 'club.membership');
  assert.equal(byRoute.get('/org/job-titles').key, 'org.departments');
  assert.equal(byRoute.get('/org/departments').key, 'hr.organization.departments');
});
