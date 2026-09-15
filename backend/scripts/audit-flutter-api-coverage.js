/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const legacySource = fs.readFileSync(
  path.join(root, 'backend/src/modules/mobile/legacy-mobile.controller.ts'),
  'utf8',
);
const modernSource = fs.readFileSync(
  path.join(root, 'backend/src/modules/mobile/mobile.controller.ts'),
  'utf8',
);
const collectionPath = path.join(
  root,
  'docs/flutter-handoff/NOAMANY_FLUTTER_COMPLETE.postman_collection.json',
);
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

function collectionRequests(items, result = []) {
  for (const item of items || []) {
    if (item.request) result.push(item);
    collectionRequests(item.item, result);
  }
  return result;
}

function requestPath(item) {
  const raw = typeof item.request.url === 'string'
    ? item.request.url
    : item.request.url?.raw || '';
  return raw
    .replace(/^\{\{baseUrl\}\}/, '')
    .split('?')[0]
    .replace(/\{\{[^}]+\}\}/g, ':id');
}

function quotedValues(value) {
  return [...value.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function legacyRoutes() {
  const actions = new Set();
  for (const match of legacySource.matchAll(/@All\(([\s\S]*?)\)\s*(?:\r?\n)/g)) {
    for (const action of quotedValues(match[1])) {
      if (action !== ':action') actions.add(action);
    }
  }
  const operationBlock = legacySource.match(
    /const operations:\s*Record<string,\s*\(\) => Promise<unknown>>\s*=\s*\{([\s\S]*?)\n\s*\};\s*\n\s*const operation = operations\[action\];/,
  );
  if (!operationBlock) throw new Error('Could not read legacy operation dispatcher');
  for (const match of operationBlock[1].matchAll(/^      ([A-Za-z0-9_]+):/gm)) {
    actions.add(match[1]);
  }
  return new Set([...actions].map((action) => `/Api/${action}`));
}

function modernRoutes() {
  const routes = new Set();
  for (const match of modernSource.matchAll(/@(Get|Post|Patch|Delete)\(([^)]*)\)/g)) {
    const endpoint = quotedValues(match[2])[0] || '';
    routes.add(`/api/mobile/${endpoint}`.replace(/\/$/, '').replace(/:[A-Za-z0-9_]+/g, ':id'));
  }
  return routes;
}

const requests = collectionRequests(collection.item);
const documented = new Set(requests.map(requestPath));
const expectedLegacy = legacyRoutes();
// Flutter must use the verified modern login. The broken legacy login alias is
// intentionally not distributed, while all other /Api compatibility routes remain.
expectedLegacy.delete('/Api/login_app');
const expectedModern = modernRoutes();
const expectedUploads = new Set([
  '/api/uploads/app',
  '/api/uploads/activity',
  '/api/uploads/message',
  '/api/uploads/document',
]);
const expected = new Set([...expectedLegacy, ...expectedModern, ...expectedUploads]);
const documentedApp = new Set(
  [...documented].filter((route) => route.startsWith('/Api/') || route.startsWith('/api/mobile/') || route.startsWith('/api/uploads/')),
);
const missing = [...expected].filter((route) => !documentedApp.has(route)).sort();
const unsupported = [...documentedApp].filter((route) => !expected.has(route)).sort();

const result = {
  collection: collectionPath,
  documentedRequests: requests.length,
  expectedLegacyRoutes: expectedLegacy.size,
  expectedModernRoutes: expectedModern.size,
  expectedUploadRoutes: expectedUploads.size,
  documentedApplicationRoutes: documentedApp.size,
  missing,
  unsupported,
};
console.log(JSON.stringify(result, null, 2));
if (missing.length || unsupported.length) process.exitCode = 1;
