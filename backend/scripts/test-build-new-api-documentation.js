const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDocumentation } = require('./build-new-api-documentation');

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noamany-api-docs-'));

try {
  const result = buildDocumentation({ outputDir });
  const collection = JSON.parse(fs.readFileSync(result.collectionPath, 'utf8'));
  const testCases = JSON.parse(fs.readFileSync(result.testCasesPath, 'utf8'));

  const requests = [];
  const walk = (items) => items.forEach((item) => {
    if (item.item) walk(item.item);
    if (item.request) requests.push(item);
  });
  walk(collection.item);

  assert.ok(requests.length > 1000, 'the collection should cover the complete modern API');
  assert.equal(testCases.summary.operationCount, requests.length);
  assert.equal(testCases.summary.legacyOperationCount, 0);
  assert.ok(testCases.summary.controllerOperationCount > 1000);
  assert.deepEqual(
    testCases.summary.unmatchedControllerOperations,
    [],
    `controllers missing from the generated collection: ${testCases.summary.unmatchedControllerOperations.join(', ')}`,
  );

  for (const request of requests) {
    const rawUrl = typeof request.request.url === 'string' ? request.request.url : request.request.url.raw;
    assert.match(rawUrl, /^\{\{baseUrl\}\}\/api(?:\/|$)/, `modern API route expected: ${rawUrl}`);
    assert.doesNotMatch(rawUrl, /\/Api(?:\/|$)/, `legacy route must be excluded: ${rawUrl}`);
    assert.ok(request.event?.some((event) => event.listen === 'test'), `Postman tests missing: ${request.name}`);
  }

  for (const testCase of testCases.testCases) {
    assert.ok(testCase.request.method);
    assert.ok(testCase.request.url.startsWith('{{baseUrl}}/api'));
    assert.ok(testCase.responses.success.status >= 200 && testCase.responses.success.status < 300);
    assert.ok(Object.hasOwn(testCase.responses.success, 'example'));
  }

  console.log(JSON.stringify({ ok: true, operations: requests.length, outputDir }));
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
