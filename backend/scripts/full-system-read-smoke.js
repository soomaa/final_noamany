/*
 * Read-only smoke test for every documented GET endpoint that has no path params.
 * It intentionally never calls POST/PUT/PATCH/DELETE (except staff login).
 */
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4000';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'noamany@123';
const CONCURRENCY = Math.max(1, Number(process.env.SMOKE_CONCURRENCY || 8));
const TIMEOUT_MS = Math.max(1000, Number(process.env.SMOKE_TIMEOUT_MS || 15000));

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`Login failed with HTTP ${login.status}`);
  const loginBody = await login.json();
  const token = loginBody.accessToken;
  if (!token) throw new Error('Login response did not contain an access token');

  const docsResponse = await request('/api/docs-json');
  if (!docsResponse.ok) throw new Error(`Swagger JSON failed with HTTP ${docsResponse.status}`);
  const docs = await docsResponse.json();
  const paths = Object.entries(docs.paths)
    .filter(([path, operations]) => path.startsWith('/api/') && operations.get && !path.includes('{'))
    .map(([path]) => path)
    .sort();

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const index = cursor++;
      const path = paths[index];
      const started = Date.now();
      try {
        const response = await request(path, { headers: { authorization: `Bearer ${token}` } });
        const text = await response.text();
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        const logicalStatus = Number(body?.status);
        const logicalFailure = response.ok && Number.isFinite(logicalStatus) && logicalStatus >= 400;
        results.push({
          path,
          httpStatus: response.status,
          logicalStatus: logicalFailure ? logicalStatus : null,
          message: logicalFailure || response.status >= 400
            ? String(body?.message || text || '').slice(0, 180)
            : null,
          elapsedMs: Date.now() - started,
          category: logicalFailure
            ? 'logical_failure'
            : response.status >= 500
              ? 'server_error'
              : response.status === 401
                ? 'unauthorized'
                : response.status === 403
                  ? 'forbidden'
                  : response.status >= 400
                    ? 'client_error'
                    : 'ok',
        });
      } catch (error) {
        results.push({
          path,
          httpStatus: null,
          logicalStatus: null,
          message: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
          elapsedMs: Date.now() - started,
          category: error?.name === 'AbortError' ? 'timeout' : 'network_error',
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  results.sort((a, b) => a.path.localeCompare(b.path));
  const summary = results.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ baseUrl: BASE_URL, endpointCount: paths.length, summary, results }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
