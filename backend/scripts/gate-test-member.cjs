#!/usr/bin/env node
/**
 * Test member for the ONE80 gate trial: "MTA Codex Test", membership code 555, gate number
 * 5555555, in the gate's branch. Data only — no code, schema or settings change.
 *
 * ONE80's QR50BE readers send Wiegand-26, so the gate number the member shows as QR must be
 * seven digits (1,000,000–16,777,215). By default it is the code's digits repeated to seven:
 * 555 → 5555555, 666 → 6666666. Override with --gate <7 digits>.
 *
 *   node scripts/gate-test-member.cjs create      member + one active monthly subscription
 *   node scripts/gate-test-member.cjs create --code 666 --name "MTA Codex Test2sub" --subs 2
 *                                                 any code/name; --subs 2 adds a 5-session package too
 *   node scripts/gate-test-member.cjs add-second  a second active subscription (tests the
 *                                                 "several subscriptions → reception picks" path)
 *   node scripts/gate-test-member.cjs status      what exists now
 *   node scripts/gate-test-member.cjs remove      deletes everything this script created
 *
 * Every action takes --code (default 555). Test members are recognised by their note and
 * their TEST-GATE-<code>- subscription numbers, so "remove" can never touch a real member.
 *
 * Branch: BRANCH_ID=<id>, otherwise the branch of the one active gate controller, otherwise
 * the only branch. Anything ambiguous stops with the list of branches.
 */
const fs = require('fs');
const path = require('path');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  // A flag given without a value must stop the run, never fall back to another member.
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}

let CODE, NAME, SUBS, GATE;
try {
  CODE = option('code', '555').trim().toUpperCase();
  NAME = option('name', 'MTA Codex Test').trim();
  SUBS = Number(option('subs', '1'));
  if (!/^[A-Z0-9]{1,20}$/.test(CODE)) throw new Error('--code must be letters/digits');
  if (![1, 2].includes(SUBS)) throw new Error('--subs must be 1 or 2');
  const digits = CODE.replace(/\D/g, '');
  GATE = option('gate', digits ? digits.repeat(Math.ceil(7 / digits.length)).slice(0, 7) : '');
  if (!/^\d{7}$/.test(GATE) || Number(GATE) < 1_000_000 || Number(GATE) > 16_777_215) {
    throw new Error('--gate must be 7 digits between 1000000 and 16777215 (Wiegand-26)');
  }
} catch (error) {
  console.error(`!! ${error.message}`);
  process.exit(1);
}
const SUB_PREFIX = `TEST-GATE-${CODE}-`;
const TEST_NOTE = 'عضو تجريبي لاختبار البوابة — يُحذف بعد الاختبار';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) throw new Error('Run from the PHAROS app folder (no .env here)');
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (!line) throw new Error('DATABASE_URL missing in .env');
  process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, '').replace(/^"|"$/g, '');
}

function cairoDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
}

async function findBranch(db) {
  const byId = async (id) => {
    const branch = await db.tbl_branches.findUnique({ where: { branch_id: Number(id) }, select: { branch_id: true, branch_name: true } });
    if (!branch) throw new Error(`No branch ${id}`);
    return branch;
  };
  if (process.env.BRANCH_ID) return byId(process.env.BRANCH_ID);
  const gates = await db.gate_controllers.findMany({ where: { is_active: true }, select: { branch_id: true } });
  const gateBranches = [...new Set(gates.map((g) => g.branch_id))];
  if (gateBranches.length === 1) return byId(gateBranches[0]);
  const all = await db.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } });
  if (all.length === 1) return all[0];
  console.log('Branches:', all.map((b) => `${b.branch_id}=${b.branch_name}`).join(' | '));
  throw new Error('Could not pick the gate branch unambiguously; rerun with BRANCH_ID=<id>');
}

async function status(db) {
  const member = await db.club_members.findFirst({
    where: { member_code: CODE },
    include: { gate_credential: true },
  });
  if (!member) return console.log(`No member with code ${CODE}.`);
  const subs = await db.club_subscriptions.findMany({ where: { member_id: member.id }, orderBy: { id: 'asc' } });
  const visits = await db.club_attendance.count({ where: { member_id: member.id } });
  console.log(`Member #${member.id} ${member.name} code=${member.member_code} branch=${member.branch_id} active=${member.is_active}`);
  console.log(`Gate number: ${member.gate_credential?.credential_no ?? '—'} (active=${member.gate_credential?.is_active ?? '—'})`);
  for (const s of subs) {
    console.log(`  sub #${s.id} ${s.subscription_number} "${s.subscription_type}" ${s.subscription_start_date}→${s.subscription_end_date}` +
      (s.is_linked_to_sessions ? ` sessions ${s.sessions_used}/${s.sessions_count}` : ''));
  }
  console.log(`Visits recorded: ${visits}`);
}

async function create(db) {
  const branch = await findBranch(db);
  const existing = await db.club_members.findFirst({ where: { member_code: CODE } });
  if (existing && existing.notes !== TEST_NOTE) {
    throw new Error(`Code ${CODE} already belongs to "${existing.name}" (#${existing.id}) — nothing changed`);
  }
  const taken = await db.gate_credentials.findFirst({ where: { credential_no: GATE } });
  if (taken && (!existing || taken.member_id !== existing.id)) {
    throw new Error(`Gate number ${GATE} is already used by member #${taken.member_id} — nothing changed`);
  }
  if (existing) {
    console.log('Test member already exists; leaving it as is.');
    return status(db);
  }
  await db.$transaction(async (tx) => {
    const member = await tx.club_members.create({
      data: {
        member_code: CODE, name: NAME, gender: 'male', branch_id: branch.branch_id,
        is_active: true, notes: TEST_NOTE,
      },
    });
    await tx.club_subscriptions.create({
      data: {
        subscription_number: `${SUB_PREFIX}1`, member_id: member.id, branch_id: branch.branch_id,
        registration_date: cairoDate(), subscription_start_date: cairoDate(-1), subscription_end_date: cairoDate(30),
        subscription_type: 'اختبار البوابة — شهري', subscription_value: 0, paid_amount: 0, remaining_amount: 0,
        status: 'active', gender: 'male',
      },
    });
    if (SUBS === 2) await tx.club_subscriptions.create({ data: secondSubscription(member) });
    await tx.gate_credentials.create({ data: { member_id: member.id, credential_no: GATE } });
  });
  console.log(`✅ Created in branch ${branch.branch_id} (${branch.branch_name}).`);
  await status(db);
}

function secondSubscription(member) {
  return {
    subscription_number: `${SUB_PREFIX}2`, member_id: member.id, branch_id: member.branch_id,
    registration_date: cairoDate(), subscription_start_date: cairoDate(-1), subscription_end_date: cairoDate(30),
    subscription_type: 'اختبار البوابة — ٥ حصص', subscription_value: 0, paid_amount: 0, remaining_amount: 0,
    status: 'active', gender: 'male', is_linked_to_sessions: true, sessions_count: 5, sessions_used: 0,
  };
}

async function addSecond(db) {
  const member = await db.club_members.findFirst({ where: { member_code: CODE, notes: TEST_NOTE } });
  if (!member) throw new Error('Run "create" first');
  const number = `${SUB_PREFIX}2`;
  if (await db.club_subscriptions.findFirst({ where: { subscription_number: number } })) {
    console.log('Second subscription already exists.');
    return status(db);
  }
  await db.club_subscriptions.create({ data: secondSubscription(member) });
  console.log('✅ Second subscription added — the next gate entry will wait for reception to pick.');
  await status(db);
}

async function remove(db) {
  const member = await db.club_members.findFirst({ where: { member_code: CODE, notes: TEST_NOTE } });
  if (!member) return console.log('Nothing to remove.');
  const subs = await db.club_subscriptions.findMany({
    where: { member_id: member.id }, select: { id: true, subscription_number: true },
  });
  const foreign = subs.filter((s) => !s.subscription_number.startsWith(SUB_PREFIX));
  if (foreign.length) throw new Error(`Member has non-test subscriptions (${foreign.map((s) => s.id)}); remove by hand`);
  try {
    await db.$transaction(async (tx) => {
      await tx.gate_events.updateMany({ where: { member_id: member.id }, data: { member_id: null } });
      await tx.club_class_enrollments.deleteMany({ where: { member_id: member.id } });
      await tx.club_attendance.deleteMany({ where: { member_id: member.id } });
      await tx.club_subscriptions.deleteMany({ where: { member_id: member.id } });
      await tx.gate_credentials.deleteMany({ where: { member_id: member.id } });
      await tx.club_members.delete({ where: { id: member.id } });
    });
    console.log('✅ Test member, subscriptions, visits and gate number removed.');
  } catch (error) {
    // Something else now points at the member (e.g. an automation record). Hide it instead.
    await db.$transaction([
      db.club_members.update({ where: { id: member.id }, data: { is_active: false, is_deleted: true } }),
      db.gate_credentials.updateMany({ where: { member_id: member.id }, data: { is_active: false } }),
    ]);
    console.log(`⚠ Could not hard-delete (${error.code ?? error.message}); member hidden and gate number disabled instead.`);
  }
}

async function main() {
  loadDatabaseUrl();
  const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
  const db = new PrismaClient();
  const action = process.argv[2] ?? 'status';
  try {
    if (action === 'create') await create(db);
    else if (action === 'add-second') await addSecond(db);
    else if (action === 'remove') await remove(db);
    else if (action === 'status') await status(db);
    else throw new Error(`Unknown action "${action}"`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`!! ${error.message}`);
  process.exit(1);
});
