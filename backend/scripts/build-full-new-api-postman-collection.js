/* Generates a Postman v2.1 collection from the current local Swagger document. */
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(backendRoot, '..');
const outputPath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_FULL_NEW_API.postman_collection.json');
const mobileCollectionPath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_NEW_MOBILE_API.postman_collection.json');
const swaggerUrl = process.env.SWAGGER_URL || 'http://127.0.0.1:4000/api/docs-json';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function walkItems(items, callback) {
  for (const item of items || []) {
    if (item.item) walkItems(item.item, callback);
    if (item.request) callback(item);
  }
}

function requestKey(method, rawUrl) {
  const relative = rawUrl.replace(/^\{\{baseUrl\}\}/, '').replace(/\?.*$/, '');
  return `${method.toUpperCase()} ${relative}`;
}

function existingMobileRequests() {
  const collection = JSON.parse(fs.readFileSync(mobileCollectionPath, 'utf8'));
  const map = new Map();
  walkItems(collection.item, (item) => {
    const rawUrl = typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
    map.set(requestKey(item.request.method, rawUrl), item);
  });
  return map;
}

function postmanUrl(route, parameters) {
  const rawPath = route.replace(/\{([^}]+)\}/g, '{{$1}}');
  const query = (parameters || [])
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => `${encodeURIComponent(parameter.name)}={{${parameter.name}}}`)
    .join('&');
  return `{{baseUrl}}${rawPath}${query ? `?${query}` : ''}`;
}

function generatedRequest(route, method, operation) {
  const parameters = operation.parameters || [];
  const url = postmanUrl(route, parameters);
  const request = {
    method: method.toUpperCase(),
    header: [],
    url: { raw: url, host: ['{{baseUrl}}'], path: route.split('/').filter(Boolean).map((part) => part.replace(/^\{(.+)\}$/, '{{$1}}')) },
    description: operation.summary || operation.description || operation.operationId || '',
  };
  const content = operation.requestBody && operation.requestBody.content;
  if (content) {
    const contentType = Object.keys(content)[0];
    if (contentType) {
      request.header.push({ key: 'Content-Type', value: contentType });
      if (contentType === 'application/json') request.body = { mode: 'raw', raw: '{}', options: { raw: { language: 'json' } } };
    }
  }
  return request;
}

function makeItem(route, method, operation, existing) {
  const key = `${method.toUpperCase()} ${route}`;
  if (existing.has(key)) return JSON.parse(JSON.stringify(existing.get(key)));
  return {
    name: `${method.toUpperCase()} ${route}`,
    request: generatedRequest(route, method, operation),
    response: [],
  };
}

async function main() {
  const response = await fetch(swaggerUrl);
  if (!response.ok) throw new Error(`Swagger request failed: HTTP ${response.status}`);
  const swagger = await response.json();
  const existing = existingMobileRequests();
  const folders = new Map();
  let routeCount = 0;
  let operationCount = 0;

  for (const [route, pathItem] of Object.entries(swagger.paths || {})) {
    if (!route.startsWith('/api/')) continue;
    routeCount += 1;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operationCount += 1;
      const folderName = (operation.tags && operation.tags[0]) || route.split('/')[2] || 'Other';
      if (!folders.has(folderName)) folders.set(folderName, []);
      folders.get(folderName).push(makeItem(route, method, operation, existing));
    }
  }

  const collection = {
    info: {
      _postman_id: '5fc12f92-9e51-4971-a7ee-5fd4e77f2a12',
      name: 'Noamany - Full New System API',
      description: `Generated from the local Swagger contract. ${routeCount} current-system paths and ${operationCount} operations. Legacy /Api/ routes are intentionally excluded.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'https://final.noamanycenter.com', type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'id', value: '1', type: 'string' },
      { key: 'employeeId', value: '1', type: 'string' },
      { key: 'branchId', value: '1', type: 'string' },
    ],
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    item: [...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => ({ name, item })),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, routeCount, operationCount, folders: folders.size }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
