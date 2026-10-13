const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const esbuild = require('esbuild');

function load(entry) {
  const result = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['@nestjs/common', 'lucide-react'],
    write: false,
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, process, console });
  return module.exports;
}

const { ACTIONS, flattenCatalog } = load('../../backend/src/modules/rbac/catalog/rbac.catalog.ts');
const { RbacCatalogService } = load('../../backend/src/modules/rbac/admin/catalog.service.ts');
const { NAV_SECTIONS } = load('../src/lib/nav.ts');
const { orderRbacCatalogForSidebar } = load('../src/lib/rbac-nav-order.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('opening permissions restores missing sidebar resources and their actions without replacing grants', async () => {
  const flat = flattenCatalog();
  const originalIds = new Map(flat.map((resource, index) => [resource.key, index + 1]));
  const omitted = new Set(flat.filter((resource, index) => resource.type === 'page' && index % 9 === 0).map((resource) => resource.key));
  omitted.add('club.subscriptions.member_transfer');
  const resources = new Map(flat.filter((resource) => !omitted.has(resource.key)).map((resource) => [resource.key, {
    id: originalIds.get(resource.key),
    key: resource.key,
    parent_id: resource.parentKey ? originalIds.get(resource.parentKey) : null,
    type: resource.type,
    name_ar: resource.nameAr,
    name_en: resource.nameEn ?? null,
    route: resource.route ?? null,
    icon: resource.icon ?? null,
    sort_order: resource.sortOrder,
    is_active: true,
  }]));
  const stale = resources.get('club.subscriptions.list');
  stale.route = '/outdated-subscription-route';
  stale.is_active = false;

  const actions = new Map(ACTIONS.map((action, index) => [action.key, {
    id: index + 1,
    key: action.key,
    label_ar: action.labelAr,
    label_en: action.labelEn,
    sensitive: action.sensitive,
    sort_order: action.sortOrder,
  }]));
  const links = new Map(flat.filter((resource) => !omitted.has(resource.key)).flatMap((resource) =>
    resource.actions.map((action) => {
      const pair = { resource_id: originalIds.get(resource.key), action_id: actions.get(action).id };
      return [`${pair.resource_id}:${pair.action_id}`, pair];
    })
  ));
  let nextResourceId = flat.length + 1;
  let resourceWrites = 0;
  let linkWrites = 0;
  let catalogInvalidations = 0;
  const prisma = {
    rbac_resources: {
      findMany: async () => [...resources.values()],
      upsert: async ({ where, update, create }) => {
        resourceWrites++;
        const existing = resources.get(where.key);
        const row = existing ? Object.assign(existing, update) : { id: nextResourceId++, ...create };
        resources.set(where.key, row);
        return { id: row.id };
      },
    },
    rbac_actions: {
      findMany: async () => [...actions.values()],
      upsert: async () => { throw new Error('All action definitions already exist'); },
    },
    rbac_resource_actions: {
      findMany: async () => [...links.values()],
      createMany: async ({ data }) => {
        linkWrites += data.length;
        for (const pair of data) links.set(`${pair.resource_id}:${pair.action_id}`, pair);
      },
    },
  };
  const engine = {
    invalidateCatalog: () => { catalogInvalidations++; },
    invalidateAll: () => {},
  };
  const service = new RbacCatalogService(prisma, engine);
  const catalog = await service.getCatalog();
  const routes = new Set();
  const visit = (nodes) => nodes.forEach((node) => { if (node.route) routes.add(node.route); visit(node.children); });
  visit(catalog.tree);

  for (const resource of flat.filter((item) => item.route)) assert.ok(routes.has(resource.route), resource.route);
  const ordered = orderRbacCatalogForSidebar(catalog);
  assert.deepEqual(plain(ordered.tree.map((module) => module.key)), plain(NAV_SECTIONS.map((section) => section.id === 'settings' ? 'admin' : section.id)));
  NAV_SECTIONS.forEach((section, index) => {
    const displayed = ordered.tree[index].children;
    const expectedGroups = section.groups ?? [];
    const actualGroups = displayed.filter((node) => node.type === 'group');
    assert.deepEqual(plain(actualGroups.map((group) => group.key)), plain(expectedGroups.map((group) => `sidebar-group:${section.id}:${group.id}`)));
    expectedGroups.forEach((group, groupIndex) => {
      assert.deepEqual(plain(actualGroups[groupIndex].children.map((page) => page.route)), plain(group.items.map((item) => item.to)));
    });
  });
  assert.equal(resources.get('club.subscriptions.member_transfer').parent_id, resources.get('club.subscriptions').id);
  assert.equal(resources.get('club.subscriptions.list').route, '/club/subscriptions');
  assert.ok(resourceWrites > 0);
  assert.ok(linkWrites > 0);
  assert.equal(catalogInvalidations, 1);

  const writesAfterFirstRead = [resourceWrites, linkWrites];
  await service.getCatalog();
  assert.deepEqual([resourceWrites, linkWrites], writesAfterFirstRead);
});
