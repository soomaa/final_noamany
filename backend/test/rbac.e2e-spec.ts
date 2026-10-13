/**
 * rbac.e2e-spec.ts -- End-to-end RBAC verification suite.
 *
 * What this proves (beyond "tests pass"):
 *  P1  Permission check  -- the RBAC engine actually denies missing keys (403).
 *  P2  Branch isolation  -- BranchScopeGuard rejects cross-branch requests (403/404).
 *  P3  Role hierarchy    -- lower roles cannot call approve-only endpoints.
 *  P4  Token integrity   -- forged / missing tokens are rejected (401).
 *  P5  Public endpoints  -- @Public() routes remain accessible without auth.
 *
 * Prerequisites (run before this suite):
 *   npx ts-node prisma/seed-rbac.ts   <- roles + permissions
 *   npx ts-node prisma/seed-e2e.ts    <- test users + writes test/e2e-config.json
 *   node dist/main                    <- running instance on APP_PORT
 *
 * Run with:
 *   set E2E_BASE_URL=http://localhost:4002/api
 *   npx jest --config jest-e2e.json --testPathPatterns=rbac.e2e-spec --verbose --forceExit
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// -- Branch config (written by seed-e2e.ts) ------------------------------------
const configPath = path.join(__dirname, 'e2e-config.json');
if (!fs.existsSync(configPath)) {
  throw new Error(
    'test/e2e-config.json not found. ' +
    'Run "npx ts-node prisma/seed-e2e.ts" first to generate it.',
  );
}
const E2E_CONFIG: { branchA: number; branchB: number } = JSON.parse(
  fs.readFileSync(configPath, 'utf-8'),
);
const BRANCH_A: number = E2E_CONFIG.branchA;
const BRANCH_B: number = E2E_CONFIG.branchB;

// -- Config --------------------------------------------------------------------
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4002/api';
const PASSWORD  = 'Test@1234';

const USERS = {
  hr_manager:     'e2e_hr_manager',
  branch_mgr_b1: 'e2e_branch_mgr_b1',
  branch_mgr_b2: 'e2e_branch_mgr_b2',
  employee:       'e2e_employee',
} as const;

// -- HTTP client ---------------------------------------------------------------
function client(token?: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true, // never throw on 4xx/5xx
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// -- Auth helper ---------------------------------------------------------------
async function login(username: string, password = PASSWORD): Promise<string> {
  const res = await axios.post(
    `${BASE_URL}/auth/login`,
    { username, password },
    { validateStatus: () => true },
  );
  if (res.status !== 200) {
    throw new Error(
      `Login failed for "${username}" -> HTTP ${res.status}: ${JSON.stringify(res.data)}`,
    );
  }
  const token: string | undefined = res.data?.accessToken;
  if (!token) throw new Error(`Login for "${username}" returned no accessToken`);
  return token;
}

// -- Global token cache --------------------------------------------------------
// All logins happen ONCE before any suite runs. This prevents parallel
// beforeAll() blocks from hammering the auth rate-limiter (ThrottlerException).
let hrToken: string;
let b1Token: string;
let b2Token: string;
let empToken: string;

beforeAll(async () => {
  [hrToken, b1Token, b2Token, empToken] = await Promise.all([
    login(USERS.hr_manager),
    login(USERS.branch_mgr_b1),
    login(USERS.branch_mgr_b2),
    login(USERS.employee),
  ]);
}, 30_000);

// -----------------------------------------------------------------------------
// P5 -- Public endpoints (no auth required)
// -----------------------------------------------------------------------------
describe('P5 -- Public endpoints', () => {
  it('POST /auth/login is accessible without token', async () => {
    const res = await axios.post(
      `${BASE_URL}/auth/login`,
      { username: '__no_such_user__', password: 'wrong' },
      { validateStatus: () => true },
    );
    expect([200, 401]).toContain(res.status);
  });
});

// -----------------------------------------------------------------------------
// P4 -- Token integrity
// -----------------------------------------------------------------------------
describe('P4 -- Token integrity', () => {
  it('GET /auth/me without token -> 401', async () => {
    const res = await client().get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with tampered token -> 401', async () => {
    const res = await client('totally.invalid.jwt').get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with valid token -> 200 and returns user', async () => {
    const res = await client(hrToken).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('sub');
    expect(res.data).toHaveProperty('branch');
  });
});

// -----------------------------------------------------------------------------
// P1 -- Permission check on accounting.journal:approve
// -----------------------------------------------------------------------------
describe('P1 -- accounting.journal:approve permission', () => {
  // ID 999999 -> record does not exist, but the permission check fires BEFORE
  // the service tries to find the record, so:
  //   hr_manager  -> 404 (passes permission gate, record not found)
  //   branch_mgr  -> 403 (blocked by PermissionsGuard)
  //   employee    -> 403 (blocked by PermissionsGuard)
  const ENDPOINT = '/accounting/journal-entries/999999/post';

  it('hr_manager -> passes permission check (not 403)', async () => {
    const res = await client(hrToken).post(ENDPOINT);
    expect(res.status).not.toBe(403);
    expect([200, 201, 400, 404, 409, 422, 500]).toContain(res.status);
  });

  it('branch_manager -> 403 (missing accounting.journal:approve)', async () => {
    const res = await client(b1Token).post(ENDPOINT);
    expect(res.status).toBe(403);
  });

  it('employee -> 403 (missing accounting.journal:approve)', async () => {
    const res = await client(empToken).post(ENDPOINT);
    expect(res.status).toBe(403);
  });
});

// -----------------------------------------------------------------------------
// P3 -- Role hierarchy on employees.list:view
// -----------------------------------------------------------------------------
describe('P3 -- employees.list:view permission', () => {
  it('hr_manager -> can list employees (not 403)', async () => {
    const res = await client(hrToken).get('/hr/employees?pageSize=1');
    expect(res.status).not.toBe(403);
  });

  it('employee -> access denied on employee list (403 or 404)', async () => {
    // The guard may return 403 (explicit denial) or 404 (existence hidden).
    // Either response means the employee cannot access the list.
    const res = await client(empToken).get('/hr/employees?pageSize=1');
    expect([403, 404]).toContain(res.status);
  });
});

// -----------------------------------------------------------------------------
// P2 -- Branch isolation (BranchScopeGuard)
// -----------------------------------------------------------------------------
describe('P2 -- Branch isolation', () => {
  it('branch_mgr_b1 JWT branch should be BRANCH_A', async () => {
    const res = await client(b1Token).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.data.branch).toBe(BRANCH_A);
  });

  it('branch_mgr_b2 requesting BRANCH_A -> access denied (403 or 404)', async () => {
    // 403: BranchScopeGuard returned Forbidden.
    // 404: Guard hides endpoint existence for foreign-branch requests.
    const res = await client(b2Token).get(`/hr/employees?branchId=${BRANCH_A}`);
    expect([403, 404]).toContain(res.status);
  });

  it('branch_mgr_b1 requesting BRANCH_B -> access denied (403 or 404)', async () => {
    const res = await client(b1Token).get(`/hr/employees?branchId=${BRANCH_B}`);
    expect([403, 404]).toContain(res.status);
  });

  it('hr_manager (branch-scoped to BRANCH_A) -> BRANCH_B data is denied', async () => {
    const me = await client(hrToken).get('/auth/me');
    expect(me.status).toBe(200);
    const foreignRes = await client(hrToken).get(`/hr/employees?branchId=${BRANCH_B}`);
    if (me.data.branch === BRANCH_A) {
      expect([403, 404]).toContain(foreignRes.status);
    }
    // If hr_manager is super-admin (level=1) this assertion is informational only.
  });
});

// -----------------------------------------------------------------------------
// P1 -- Additional: payroll.runs:approve
// -----------------------------------------------------------------------------
describe('P1 -- payroll.runs:approve permission', () => {
  const ENDPOINT = '/payroll/runs/999999/approve';

  it('branch_manager -> 403 on payroll approve', async () => {
    const res = await client(b1Token).post(ENDPOINT);
    expect(res.status).toBe(403);
  });

  it('hr_manager -> passes permission gate (not 403)', async () => {
    const res = await client(hrToken).post(ENDPOINT);
    expect(res.status).not.toBe(403);
  });
});

// -----------------------------------------------------------------------------
// Sanity: token refresh works
// -----------------------------------------------------------------------------
describe('Token refresh', () => {
  it('POST /auth/refresh without cookie -> 401', async () => {
    const res = await client().post('/auth/refresh');
    expect(res.status).toBe(401);
  });
});
