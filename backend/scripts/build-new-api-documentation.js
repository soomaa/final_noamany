/*
 * Builds the modern (/api) Postman collection and a machine-readable test-case
 * catalogue directly from the existing complete Swagger collection plus the
 * current Nest controllers. Legacy /Api routes are deliberately excluded.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const backendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(backendRoot, '..');
const sourceCollectionPath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_FULL_NEW_API.postman_collection.json');
const HTTP_DECORATORS = new Map([['Get', 'GET'], ['Post', 'POST'], ['Put', 'PUT'], ['Patch', 'PATCH'], ['Delete', 'DELETE'], ['Head', 'HEAD'], ['Options', 'OPTIONS']]);

function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}

function decoratorCall(decorator) {
  return ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
}

function decoratorName(decorator) {
  const call = decoratorCall(decorator);
  const expression = call ? call.expression : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function firstStringArgument(decorator) {
  const argument = decoratorCall(decorator)?.arguments[0];
  return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) ? argument.text : undefined;
}

function getDecorator(node, name) {
  return decorators(node).find((decorator) => decoratorName(decorator) === name);
}

function normalizePath(...parts) {
  const joined = parts.filter((part) => part !== undefined && part !== null && part !== '').join('/');
  return `/${joined}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) result.push(full);
  }
  return result;
}

function permissionsFor(node) {
  return decorators(node)
    .filter((decorator) => decoratorName(decorator) === 'RequiresPermission')
    .flatMap((decorator) => [...(decoratorCall(decorator)?.arguments || [])]
      .map((argument) => argument.getText().replace(/^['"`]|['"`]$/g, '')));
}

function publicRoute(node, parent) {
  return Boolean(getDecorator(node, 'Public') || getDecorator(parent, 'Public'));
}

function statusFor(method, node) {
  const httpCode = getDecorator(node, 'HttpCode');
  const text = httpCode ? (decoratorCall(httpCode)?.arguments[0]?.getText() || '') : '';
  const explicit = text.match(/\b(\d{3})\b/);
  if (explicit) return Number(explicit[1]);
  if (/NO_CONTENT/.test(text)) return 204;
  return method === 'POST' ? 201 : 200;
}

function parameterInfo(parameter) {
  const type = parameter.type?.getText() || 'unknown';
  for (const decorator of decorators(parameter)) {
    const name = decoratorName(decorator);
    if (name === 'Body') return { location: 'body', name: firstStringArgument(decorator), type };
    if (name === 'Param') return { location: 'path', name: firstStringArgument(decorator), type };
    if (name === 'Query') return { location: 'query', name: firstStringArgument(decorator), type };
    if (name === 'UploadedFile' || name === 'UploadedFiles') return { location: 'file', name: firstStringArgument(decorator) || 'file', type };
  }
  return undefined;
}

function returnExpression(method) {
  const statement = method.body?.statements.find(ts.isReturnStatement);
  return statement?.expression ? statement.expression.getText().replace(/\s+/g, ' ').slice(0, 500) : undefined;
}

function scanControllers() {
  const controllers = new Map();
  const controllerFiles = sourceFiles(path.join(backendRoot, 'src')).filter((file) => file.endsWith('.controller.ts'));
  for (const file of controllerFiles) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const controller = getDecorator(node, 'Controller');
      if (!controller) return;
      const controllerPath = firstStringArgument(controller) || '';
      if (controllerPath === 'Api' || controllerPath.startsWith('Api/')) return;
      const classPermissions = permissionsFor(node);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const routeDecorator = decorators(member).find((decorator) => HTTP_DECORATORS.has(decoratorName(decorator)));
        if (!routeDecorator) continue;
        const method = HTTP_DECORATORS.get(decoratorName(routeDecorator));
        const route = normalizePath('api', controllerPath, firstStringArgument(routeDecorator) || '');
        const parameters = member.parameters.map(parameterInfo).filter(Boolean);
        const key = `${method} ${route}`;
        controllers.set(key, {
          method,
          route,
          controller: node.name?.text || path.basename(file),
          sourceFile: path.relative(workspaceRoot, file).replace(/\\/g, '/'),
          handler: member.name.getText(),
          public: publicRoute(member, node),
          permissions: [...new Set([...classPermissions, ...permissionsFor(member)])],
          parameters,
          body: parameters.find((parameter) => parameter.location === 'body'),
          file: parameters.find((parameter) => parameter.location === 'file'),
          successStatus: statusFor(method, member),
          returnExpression: returnExpression(member),
        });
      }
    });
  }
  return controllers;
}

function walkItems(items, callback) {
  for (const item of items || []) {
    if (item.item) walkItems(item.item, callback);
    if (item.request) callback(item);
  }
}

function rawUrl(request) {
  return typeof request.url === 'string' ? request.url : request.url.raw;
}

function routeKey(request) {
  const relative = rawUrl(request)
    .replace(/^\{\{baseUrl\}\}/, '')
    .replace(/\?.*$/, '')
    .replace(/\{\{([A-Za-z_$][\w$]*)\}\}/g, ':$1');
  return `${request.method.toUpperCase()} ${relative}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function primitiveExample(type, property = 'value') {
  const normalized = type.replace(/\s+/g, '');
  if (/\[\]$/.test(normalized)) return [primitiveExample(normalized.slice(0, -2), property)];
  const arrayType = normalized.match(/^Array<(.+)>$/);
  if (arrayType) return [primitiveExample(arrayType[1], property)];
  if (/boolean/i.test(normalized)) return true;
  if (/number|int|float|decimal/i.test(normalized)) return 1;
  if (/date/i.test(property) || /Date/.test(normalized)) return '2026-08-23';
  if (/time/i.test(property)) return '10:00';
  if (/email/i.test(property)) return 'user@example.com';
  if (/phone|mobile/i.test(property)) return '01000000000';
  if (/password/i.test(property)) return 'ChangeMe123!';
  if (/id$/i.test(property)) return 1;
  return `<${property}>`;
}

function inlineObjectExample(typeText) {
  const body = typeText.match(/^\{([\s\S]*)\}$/)?.[1];
  if (!body) return undefined;
  const example = {};
  for (const part of body.split(/[;,]\s*/)) {
    const match = part.trim().match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+)$/);
    if (match) example[match[1]] = primitiveExample(match[3], match[1]);
  }
  return Object.keys(example).length ? example : undefined;
}

function requestExample(endpoint) {
  if (!endpoint?.body) return undefined;
  return inlineObjectExample(endpoint.body.type) || { _example: `Supply fields required by ${endpoint.body.type}` };
}

function responseExample(endpoint) {
  const route = endpoint?.route || '';
  const method = endpoint?.method || 'GET';
  if (route === '/api/health') return { status: 'ok', app: 'Noamany HR API', ts: '2026-08-23T10:00:00.000Z' };
  if (method === 'DELETE') return { id: 1, deleted: true };
  if (method === 'GET' && /\/:\w+/.test(route)) return { id: 1 };
  if (method === 'GET') return [];
  return { id: 1, success: true };
}

function errorExample(status) {
  const messages = { 400: 'Validation failed', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
  return { statusCode: status, message: messages[status] };
}

function postmanTests(successStatus) {
  return [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          `pm.test('Returns HTTP ${successStatus}', function () {`,
          `  pm.response.to.have.status(${successStatus});`,
          '});',
          "pm.test('Does not return a server error', function () {",
          '  pm.expect(pm.response.code).to.be.below(500);',
          '});',
        ],
      },
    },
  ];
}

function generatedItemForController(endpoint) {
  const raw = `{{baseUrl}}${endpoint.route.replace(/:([A-Za-z_$][\w$]*)/g, '{{$1}}')}`;
  const queryParameters = endpoint.parameters.filter((parameter) => parameter.location === 'query' && parameter.name);
  const url = queryParameters.length
    ? `${raw}?${queryParameters.map((parameter) => `${encodeURIComponent(parameter.name)}={{${parameter.name}}}`).join('&')}`
    : raw;
  return {
    name: `${endpoint.method} ${endpoint.route} (from controller)`,
    request: {
      method: endpoint.method,
      header: [{ key: 'Accept', value: 'application/json' }],
      url,
      description: `Generated from ${endpoint.sourceFile}:${endpoint.handler}.`,
    },
    response: [],
  };
}

function enrichRequest(item, endpoint) {
  const output = clone(item);
  const request = output.request;
  const example = requestExample(endpoint);
  if (example && !endpoint.file) {
    request.header = (request.header || []).filter((header) => header.key.toLowerCase() !== 'content-type');
    request.header.push({ key: 'Content-Type', value: 'application/json' }, { key: 'Accept', value: 'application/json' });
    request.body = { mode: 'raw', raw: `${JSON.stringify(example, null, 2)}\n`, options: { raw: { language: 'json' } } };
  }
  if (endpoint?.file) {
    request.header = (request.header || []).filter((header) => header.key.toLowerCase() !== 'content-type');
    request.body = { mode: 'formdata', formdata: [{ key: endpoint.file.name, type: 'file', src: '', description: 'Select a valid test file before sending.' }] };
  }
  const successStatus = endpoint?.successStatus || (request.method === 'POST' ? 201 : 200);
  output.event = postmanTests(successStatus);
  output.response = [{
    name: `Illustrative ${successStatus} response`,
    originalRequest: clone(request),
    status: String(successStatus),
    code: successStatus,
    _postman_previewlanguage: 'json',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: JSON.stringify(responseExample(endpoint), null, 2),
  }];
  return output;
}

function testCase(item, endpoint) {
  const request = item.request;
  const successStatus = endpoint?.successStatus || (request.method === 'POST' ? 201 : 200);
  const response = responseExample(endpoint);
  const errors = [{ status: 400, example: errorExample(400), when: 'Invalid request data or a business-rule violation.' }];
  if (!endpoint?.public) errors.push({ status: 401, example: errorExample(401), when: 'Bearer token is absent, invalid, or expired.' });
  if (endpoint?.permissions?.length) errors.push({ status: 403, example: errorExample(403), when: `Caller lacks one of: ${endpoint.permissions.join(', ')}` });
  if (/\/:\w+/.test(endpoint?.route || '')) errors.push({ status: 404, example: errorExample(404), when: 'Referenced resource does not exist or is outside the caller scope.' });
  return {
    id: routeKey(request).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase(),
    name: item.name,
    request: {
      method: request.method,
      url: rawUrl(request),
      authentication: endpoint?.public ? 'public' : 'Bearer {{token}}',
      requiredPermissions: endpoint?.permissions || [],
      parameters: endpoint?.parameters || [],
      body: endpoint?.body ? { dto: endpoint.body.type, example: requestExample(endpoint) } : undefined,
      fileUpload: endpoint?.file ? { field: endpoint.file.name, note: 'Select a valid local file before executing.' } : undefined,
    },
    responses: {
      success: {
        status: successStatus,
        contentType: 'application/json or an endpoint-specific empty response',
        example: response,
        illustrative: true,
        sourceExpression: endpoint?.returnExpression || 'Controller delegates response construction to its service.',
      },
      errors,
    },
    assertions: [
      { name: 'Success status', expression: `pm.response.code === ${successStatus}` },
      { name: 'No server error', expression: 'pm.response.code < 500' },
    ],
    source: endpoint ? { controller: endpoint.controller, handler: endpoint.handler, file: endpoint.sourceFile } : { collection: 'Swagger-generated source collection' },
  };
}

function buildDocumentation({ outputDir = path.join(workspaceRoot, 'docs') } = {}) {
  const source = JSON.parse(fs.readFileSync(sourceCollectionPath, 'utf8'));
  const controllers = scanControllers();
  const collection = clone(source);
  collection.info = {
    ...collection.info,
    name: 'Noamany - New System API (Documented & Testable)',
    description: 'Modern /api endpoints only. Legacy /Api routes are excluded. Request and response examples are illustrative static contracts generated from current controllers; execute against a dedicated test database to capture live data.',
  };
  collection.variable = [
    { key: 'baseUrl', value: 'http://127.0.0.1:4000', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'id', value: '1', type: 'string' },
    { key: 'branchId', value: '1', type: 'string' },
  ];
  const testCases = [];
  let legacyOperationCount = 0;
  const enrich = (items) => items.map((item) => {
    if (item.item) return { ...item, item: enrich(item.item) };
    if (!item.request) return item;
    const key = routeKey(item.request);
    if (!key.includes(' /api/') && !key.endsWith(' /api')) {
      legacyOperationCount += 1;
      return undefined;
    }
    const endpoint = controllers.get(key);
    const documented = enrichRequest(item, endpoint);
    testCases.push(testCase(documented, endpoint));
    return documented;
  }).filter(Boolean);
  collection.item = enrich(collection.item);
  let documentedOperations = new Set(testCases.map((test) => routeKey({ method: test.request.method, url: test.request.url })));
  const missingControllerEndpoints = [...controllers.values()].filter((endpoint) => !documentedOperations.has(`${endpoint.method} ${endpoint.route}`));
  if (missingControllerEndpoints.length) {
    const additions = missingControllerEndpoints.map((endpoint) => {
      const documented = enrichRequest(generatedItemForController(endpoint), endpoint);
      testCases.push(testCase(documented, endpoint));
      return documented;
    });
    collection.item.push({ name: 'Current controller additions', item: additions });
    documentedOperations = new Set(testCases.map((test) => routeKey({ method: test.request.method, url: test.request.url })));
  }
  const unmatchedControllerOperations = [...controllers.keys()].filter((key) => !documentedOperations.has(key));
  const testDocument = {
    info: {
      name: 'Noamany New System API Test Cases',
      version: '1.0',
      generatedAt: new Date().toISOString(),
      scope: 'Modern /api routes only; legacy /Api routes excluded.',
      responseExamples: 'Illustrative static contracts. They are not captured database records.',
    },
    summary: {
      operationCount: testCases.length,
      controllerOperationCount: controllers.size,
      unmatchedControllerOperations,
      legacyOperationCount,
    },
    sharedErrorContract: { statusCode: 400, message: 'Validation failed' },
    testCases,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const collectionPath = path.join(outputDir, 'NOAMANY_NEW_SYSTEM_API.postman_collection.json');
  const testCasesPath = path.join(outputDir, 'NOAMANY_NEW_SYSTEM_API_TEST_CASES.json');
  fs.writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
  fs.writeFileSync(testCasesPath, `${JSON.stringify(testDocument, null, 2)}\n`);
  return { collectionPath, testCasesPath, operationCount: testCases.length, controllerOperationCount: controllers.size };
}

if (require.main === module) console.log(JSON.stringify(buildDocumentation(), null, 2));

module.exports = { buildDocumentation, scanControllers };
