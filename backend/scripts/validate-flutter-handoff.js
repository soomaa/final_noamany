const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const controllerSource = fs.readFileSync(
  path.join(root, 'backend', 'src', 'modules', 'mobile', 'legacy-mobile.controller.ts'),
  'utf8',
);
const collection = JSON.parse(fs.readFileSync(
  path.join(root, 'docs', 'flutter-handoff', 'NOAMANY_FLUTTER_COMPLETE.postman_collection.json'),
  'utf8',
));

const expectedLegacyActions = new Set();
for (const match of controllerSource.matchAll(/@All\(([^\n]+)\)/g)) {
  for (const action of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
    if (action[1] !== ':action') expectedLegacyActions.add(action[1]);
  }
}
const operations = controllerSource.match(/const operations:[\s\S]*?\n    };\n    const operation/)?.[0] ?? '';
for (const match of operations.matchAll(/^\s{6}([A-Za-z0-9_]+):/gm)) {
  expectedLegacyActions.add(match[1]);
}
// The handoff intentionally maps the recognizable login_app request to the
// verified modern /api/mobile/login endpoint on the new backend.
expectedLegacyActions.delete('login_app');

const actualLegacyActions = new Set();
let requestCount = 0;
function visit(items) {
  for (const item of items ?? []) {
    if (item.item) {
      visit(item.item);
      continue;
    }
    if (!item.request) continue;
    requestCount += 1;
    const url = typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
    const legacyAction = url?.match(/\/Api\/([^?]+)/)?.[1];
    if (legacyAction) actualLegacyActions.add(legacyAction);
  }
}
visit(collection.item);

const missingActions = [...expectedLegacyActions].filter((action) => !actualLegacyActions.has(action)).sort();
const result = {
  schema: collection.info.schema,
  folders: collection.item.length,
  requests: requestCount,
  legacyControllerActions: expectedLegacyActions.size,
  legacyActionsCovered: actualLegacyActions.size,
  missingActions,
};
console.log(JSON.stringify(result, null, 2));
if (missingActions.length) process.exitCode = 1;
