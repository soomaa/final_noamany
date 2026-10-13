const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { AuthService } = require('../dist/modules/auth/auth.service');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const target = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/noamany_local_barcode_20261012') {
  throw Error('This smoke test only runs on the isolated local barcode database');
}
const p = new PrismaClient();
const prefix = 'QA-BC-20261012';
const statePath = path.join(__dirname, '../../tmp/local-barcode-fixtures.json');
const reportPath = path.join(__dirname, '../../tmp/local-barcode-smoke-report.json');
const base = 'http://127.0.0.1:4002/api';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
let token;
const qaUsername = 'qa_barcode_local_20261012';
const qaPassword = 'Local-Barcode-QA-20261012!';
async function request(route, body, expected = 200) {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.ok(response.status === expected || (expected === 200 && response.status === 201), `${route}: HTTP ${response.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
async function login(username = qaUsername) {
  const admin = await p.users.findFirst({ where: { username, approved: 1 } });
  assert.ok(admin, 'An existing approved local administrator is required');
  const candidates = username === qaUsername ? [qaPassword] : ['Noamany@2026', 'noamany@123'];
  const verifier = new AuthService(p, {}, {}, {});
  let password;
  for (const candidate of candidates) {
    if ((await verifier.verifyStaffPassword(admin, candidate)).valid) password = candidate;
  }
  password ??= process.env.LOCAL_SMOKE_PASSWORD;
  assert.ok(password, 'Set LOCAL_SMOKE_PASSWORD to the existing local admin password');
  const result = await request('/auth/login', { username, password });
  token = result.accessToken;
  assert.ok(token);
  return admin;
}
async function setup() {
  let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  if (state?.members.length) throw Error('Member fixtures already exist; use run/cleanup instead');
  if (!state) {
  const original = await p.users.findFirst({ where: { username: 'admin', approved: 1 } });
  assert.ok(original);
  assert.equal(await p.users.count({ where: { username: qaUsername } }), 0, 'Refuse to replace an existing QA account');
  const account = await p.users.create({ data: { username: qaUsername, name: 'اختبار الباركود المحلي',
    password: await bcrypt.hash(qaPassword, 10), level: 1, approved: 1, branch_id_fk: original.branch_id_fk || 2 } });
  state = { qaUserId: account.user_id, typeId: null, members: [], subscriptions: [] };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  const roles = await p.rbac_user_roles.findMany({ where: { user_id: original.user_id, role: { is_super_admin: true } } });
  assert.ok(roles.length);
  await p.rbac_user_roles.createMany({ data: roles.map((role) => ({ user_id: account.user_id, role_id: role.role_id,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000), created_by: original.user_id })) });
  }
  const admin = await login();
  const branchId = admin.branch_id_fk || 2;
  const type = await p.club_subscription_types.create({ data: {
    name: `${prefix} test benefits`, price: 1000, days: 30, apply_to_all_branches: true,
    is_linked_to_sessions: true, sessions_count: 4, includes_spa: true, spa_count: 4, inbody_count: 4,
  } });
  state.typeId = type.id;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  for (const suffix of ['A', 'B']) {
    const member = await p.club_members.create({ data: {
      member_code: `${prefix}-${suffix}`, card_number: `${prefix}-CARD-${suffix}`,
      name: `اختبار اسكان ${suffix}`, gender: 'male', branch_id: branchId, created_by: admin.user_id,
    } });
    state.members.push({ id: member.id, code: member.member_code, card: member.card_number });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    const sub = await p.club_subscriptions.create({ data: {
      subscription_number: `${prefix}-SUB-${suffix}`, registration_date: today, member_id: member.id,
      branch_id: branchId, subscription_type_id: type.id, subscription_type: type.name,
      subscription_start_date: today, subscription_end_date: '2026-12-31',
      subscription_value: 1000, paid_amount: 1000, remaining_amount: 0,
      is_linked_to_sessions: true, sessions_count: 4, created_by: admin.user_id,
    } });
    state.subscriptions.push(sub.id);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
  console.log(JSON.stringify({ fixtureMembers: state.members.map((m) => m.code), subscriptions: state.subscriptions }));
}
async function run() {
  await login();
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const member = state.members[1]; const subscriptionId = state.subscriptions[1];
  const results = [];
  await request(`/club-attendance/member-overview?code=${encodeURIComponent(member.card)}`);
  results.push('card lookup');
  await request('/club-attendance/check-in', { memberId: member.id, attendanceType: 'normal', consumeSession: false });
  let sub = await p.club_subscriptions.findUnique({ where: { id: subscriptionId } });
  assert.equal(sub.sessions_used, 0); assert.equal(sub.spa_used, 0); assert.equal(sub.inbody_used, 0);
  results.push('normal entry does not consume service benefits');
  for (const [attendanceType, field] of [['class', 'sessions_used'], ['spa', 'spa_used'], ['inbody', 'inbody_used']]) {
    await request('/club-attendance/service-check-in', { memberId: member.id, subscriptionId, attendanceType });
    sub = await p.club_subscriptions.findUnique({ where: { id: subscriptionId } });
    assert.equal(sub[field], 1);
    const overview = await request(`/club-attendance/member-overview?code=${encodeURIComponent(member.code)}`);
    const selected = overview.subscriptions.find((s) => s.id === subscriptionId);
    assert.equal(selected[({ class: 'sessionsUsed', spa: 'spaUsed', inbody: 'inbodyUsed' })[attendanceType]], 1);
    results.push(`${attendanceType}: stored type and overview usage 1/4`);
  }
  const stored = await p.club_attendance.findMany({ where: { member_id: member.id }, select: { attendance_type: true } });
  assert.deepEqual(stored.map((row) => row.attendance_type).sort(), ['class', 'inbody', 'normal', 'spa']);
  const scans = await request(`/club-attendance/barcode-scan-times?startDate=${today}&endDate=${today}&memberCode=${encodeURIComponent(member.code)}`);
  assert.deepEqual(scans.data.map((row) => row.scanType).sort(), ['عادي', 'حصص', 'سبا', 'إنبودي'].sort());
  results.push('attendance and scan report distinguish all four types');
  await request(`/club-attendance/daily-summary?memberId=${member.id}&startDate=${today}&endDate=${today}`);
  await request('/club-attendance/service-check-in', { memberId: member.id, subscriptionId, attendanceType: 'inbody' }, 400);
  sub = await p.club_subscriptions.findUnique({ where: { id: subscriptionId } }); assert.equal(sub.inbody_used, 1);
  results.push('duplicate InBody attendance cannot consume another benefit');
  const report = { database: target.pathname.slice(1), passed: results.length, results, createdAt: new Date().toISOString() };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
async function cleanup() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const memberIds = state.members.map((member) => member.id);
  const attendance = await p.club_attendance.findMany({ where: { member_id: { in: memberIds } }, select: { id: true } });
  await p.$transaction(async (tx) => {
    await tx.business_audit_log.deleteMany({ where: { entity_type: 'club_attendance', entity_id: { in: attendance.map((row) => String(row.id)) } } });
    await tx.club_spa_attendance.deleteMany({ where: { member_id: { in: memberIds } } });
    await tx.club_attendance.deleteMany({ where: { member_id: { in: memberIds } } });
    await tx.club_subscriptions.deleteMany({ where: { id: { in: state.subscriptions }, subscription_number: { startsWith: prefix } } });
    await tx.club_members.deleteMany({ where: { id: { in: memberIds }, member_code: { startsWith: prefix } } });
    if (state.typeId) await tx.club_subscription_types.deleteMany({ where: { id: state.typeId, name: { startsWith: prefix } } });
    await tx.rbac_user_roles.deleteMany({ where: { user_id: state.qaUserId } });
    await tx.users.deleteMany({ where: { user_id: state.qaUserId, username: qaUsername } });
  }, { maxWait: 10000, timeout: 30000 });
  fs.unlinkSync(statePath); console.log('Removed only fixtures created by this local test');
}
async function recheck() {
  await login();
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  await request('/club-members/barcode-preview', undefined, 400);
  await request(`/club-members/barcode-preview?memberCode=${encodeURIComponent(state.members[0].code)}`);
  const started = Date.now();
  const ledger = await request('/accounting/general-ledger');
  const elapsedMs = Date.now() - started;
  assert.ok(Array.isArray(ledger.sections));
  const report = { barcodePreviewWithoutCode: 400, barcodePreviewWithCode: 200,
    generalLedger: { status: 200, elapsedMs, accountSections: ledger.sections.length } };
  fs.writeFileSync(path.join(__dirname, '../../tmp/local-system-rechecks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
const mode = process.argv[2];
({ setup, run, cleanup, recheck }[mode] ?? (() => { throw Error('Use setup, run, recheck or cleanup'); }))()
  .catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
