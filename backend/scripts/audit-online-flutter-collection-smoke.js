/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.env.ONLINE_BASE_URL || 'https://final.noamanycenter.com').replace(/\/$/, '');
const phone = process.env.ONLINE_PHONE;
const password = process.env.ONLINE_PASSWORD;
const timeoutMs = Number(process.env.ONLINE_TIMEOUT_MS || 30000);
const collectionPath = path.resolve(
  __dirname,
  '..',
  '..',
  'release',
  'noamany-flutter-api-handoff-20260817',
  'NOAMANY_FLUTTER_COMPLETE.postman_collection.json',
);

if (!phone || !password) throw new Error('ONLINE_PHONE and ONLINE_PASSWORD are required');

function flatten(items, rows = []) {
  for (const item of items || []) {
    if (item.request) rows.push(item);
    flatten(item.item, rows);
  }
  return rows;
}

function requestUrl(item) {
  const raw = typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '';
  const today = new Date().toISOString().slice(0, 10);
  return raw
    .replace(/^\{\{baseUrl\}\}/, baseUrl)
    .replace(/\{\{[^}]*date[^}]*\}\}/gi, today)
    .replace(/\{\{(?:page|perPage|pageSize)\}\}/gi, '1')
    .replace(/\{\{status\}\}/gi, 'sader')
    .replace(/\{\{[^}]+Id\}\}/g, '999999999')
    .replace(/\{\{[^}]+\}\}/g, '1');
}

async function readResponse(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/api/mobile/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: phone, password }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const loginData = await readResponse(loginResponse);
  const token = loginData?.accessToken;
  if (!token) throw new Error(`Login failed with HTTP ${loginResponse.status}`);

  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
  const requests = flatten(collection.item);
  const results = [];

  for (const item of requests) {
    const method = String(item.request.method || 'GET').toUpperCase();
    const url = requestUrl(item);
    const isLogin = url === `${baseUrl}/api/mobile/login`;
    if (isLogin) {
      results.push({ name: item.name, method, route: '/api/mobile/login', status: loginResponse.status, category: 'ok' });
      continue;
    }

    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const options = { method, headers, signal: AbortSignal.timeout(timeoutMs) };

    // Never replay production write bodies from the collection. Empty payloads
    // and impossible IDs exercise routing/auth/validation without creating or
    // deleting real records.
    if (!['GET', 'HEAD'].includes(method)) {
      headers['Content-Type'] = 'application/json';
      options.body = '{}';
    }

    const started = Date.now();
    try {
      const response = await fetch(url, options);
      const data = await readResponse(response);
      const logicalStatus = Number.isFinite(Number(data?.status)) ? Number(data.status) : null;
      const textMessage = String(data?.message || data?.error || '');
      const unknownRoute = response.status === 404 && /^Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+/i.test(textMessage);
      const category = response.status >= 500 || (logicalStatus != null && logicalStatus >= 500)
        ? 'server_error'
        : response.status === 401 || response.status === 403
          ? 'auth_error'
          : unknownRoute
            ? 'missing_route'
            : 'ok';
      results.push({
        name: item.name,
        method,
        route: new URL(url).pathname,
        status: response.status,
        logicalStatus,
        category,
        elapsedMs: Date.now() - started,
        message: category === 'ok' ? null : textMessage.slice(0, 180),
      });
    } catch (error) {
      results.push({
        name: item.name,
        method,
        route: new URL(url).pathname,
        status: null,
        logicalStatus: null,
        category: 'network_error',
        elapsedMs: Date.now() - started,
        message: String(error?.message || error),
      });
    }
  }

  const byCategory = results.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});
  const failures = results.filter((row) => row.category !== 'ok');
  console.log(JSON.stringify({
    testedAt: new Date().toISOString(),
    baseUrl,
    collectionRequests: requests.length,
    safeSmokeChecks: results.length,
    byCategory,
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: String(error?.message || error) }, null, 2));
  process.exitCode = 2;
});
