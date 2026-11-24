#!/usr/bin/env node
/*
 * Branch-manager permission sheet (client, 22 Nov 2026).
 *   node apply-manager-sheet.cjs apply    <APP> <backup.json>   # writes the backup first, then applies
 *   node apply-manager-sheet.cjs rollback <APP> <backup.json>   # puts the saved permissions back
 *   node apply-manager-sheet.cjs check    <APP>                 # prints what apply would do, changes nothing
 *
 * apply:
 *  1. adds the job titles «مشرف إدارة حريمي» and «مشرف إدارة رجالي» (copied from «مدير فرع»: same
 *     department / parent / status) when no job title with that name exists;
 *  2. for every job title that gets the sheet (مدير / مديرة فرع, مشرف إدارة حريمي / رجالي): makes sure its
 *     job_title_<id> role exists, saves its current permission rows to the backup, and replaces them with the
 *     sheet (view / print / export only) + the leave approvals and self-service those roles already had.
 * Everything runs in one transaction.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const [mode, APP, BACKUP_FILE] = process.argv.slice(2);
if (!['apply', 'rollback', 'check'].includes(mode) || !APP) {
  console.error('usage: apply-manager-sheet.cjs apply|rollback|check <APP> [backup.json]');
  process.exit(2);
}
// The app reads its database URL from APP/.env (Nest ConfigModule); do the same when it is not exported.
if (!process.env.DATABASE_URL && fs.existsSync(path.join(APP, '.env'))) {
  for (const line of fs.readFileSync(path.join(APP, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require(path.join(APP, 'node_modules/@prisma/client'));
// The installer points at the package's copy (the server's dist still has the old one during the pre-check).
const defaults = require(process.env.DEFAULTS_JS || path.join(APP, 'dist/modules/rbac/job-title-defaults.js'));
const prisma = new PrismaClient();

const NEW_TITLES = ['مشرف إدارة حريمي', 'مشرف إدارة رجالي'];
// Kept from the role's current matrix: HR approvals are not part of the reports sheet.
const KEEP_RESOURCES = ['leaves', 'leaves.list', 'leaves.missions', 'leaves.permissions', 'leaves.requests'];

async function sheetRows(tx, roleId, current) {
  const cells = [...defaults.branchManagerCells(), ...defaults.selfServiceCells()];
  const [resources, actions] = await Promise.all([
    tx.rbac_resources.findMany({ select: { id: true, key: true } }),
    tx.rbac_actions.findMany({ select: { id: true, key: true } }),
  ]);
  const rid = new Map(resources.map((r) => [r.key, r.id]));
  const aid = new Map(actions.map((a) => [a.key, a.id]));
  const keepIds = new Set(KEEP_RESOURCES.map((k) => rid.get(k)).filter(Boolean));
  const rows = new Map();
  for (const c of cells) {
    if (!rid.has(c.resourceKey) || !aid.has(c.actionKey)) throw new Error(`unknown permission ${c.resourceKey}:${c.actionKey}`);
    const row = { role_id: roleId, resource_id: rid.get(c.resourceKey), action_id: aid.get(c.actionKey), effect: 'allow' };
    rows.set(`${row.resource_id}:${row.action_id}`, row);
  }
  for (const r of current) {
    if (keepIds.has(r.resource_id)) rows.set(`${r.resource_id}:${r.action_id}`, { role_id: roleId, resource_id: r.resource_id, action_id: r.action_id, effect: r.effect });
  }
  return [...rows.values()];
}

async function main() {
  if (mode === 'rollback') {
    const saved = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    await prisma.$transaction(async (tx) => {
      for (const role of saved.roles) {
        await tx.rbac_role_permissions.deleteMany({ where: { role_id: role.roleId } });
        if (role.rows.length) await tx.rbac_role_permissions.createMany({ data: role.rows.map(({ id, ...r }) => r) });
      }
      for (const job of saved.createdJobs) {
        const role = await tx.rbac_roles.findUnique({ where: { key: `job_title_${job.id}` } });
        const users = role ? await tx.rbac_user_roles.count({ where: { role_id: role.id } }) : 0;
        const emps = await tx.employees.count({ where: { mosma_wazefy_code: job.id } });
        if (users || emps) { console.log(`kept job title ${job.id} «${job.name}» (in use)`); continue; }
        if (role) { await tx.rbac_role_permissions.deleteMany({ where: { role_id: role.id } }); await tx.rbac_roles.deleteMany({ where: { id: role.id } }); }
        await tx.department_jobs.deleteMany({ where: { id: job.id } });
        console.log(`removed job title ${job.id} «${job.name}»`);
      }
    }, { timeout: 60000 });
    console.log(`MANAGER SHEET ROLLED BACK: ${saved.roles.length} roles restored`);
    return;
  }

  const jobs = await prisma.department_jobs.findMany({ select: { id: true, name: true, from_id_fk: true, status: true, in_order: true, dep_code: true, edara_id: true } });
  const norm = (s) => s.replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const source = jobs.find((j) => norm(j.name) === norm('مدير فرع')) ?? jobs.find((j) => defaults.isBranchManagerSheetTitle(j.name));
  const missing = NEW_TITLES.filter((t) => !jobs.some((j) => norm(j.name) === norm(t)));
  const targets = jobs.filter((j) => defaults.isBranchManagerSheetTitle(j.name));
  console.log(`job titles with the sheet: ${targets.map((j) => `${j.id} «${j.name}»`).join(', ') || 'none'}`);
  console.log(`job titles to add: ${missing.join(', ') || 'none'}`);
  if (mode === 'check') return;
  if (!BACKUP_FILE) throw new Error('backup file required');

  const backup = { at: new Date().toISOString(), roles: [], createdJobs: [] };
  await prisma.$transaction(async (tx) => {
    for (const name of missing) {
      const job = await tx.department_jobs.create({
        data: { name, from_id_fk: source?.from_id_fk ?? 0, status: source?.status ?? 0, in_order: source?.in_order ?? '0', dep_code: source?.dep_code ?? null, edara_id: source?.edara_id ?? null },
        select: { id: true, name: true },
      });
      backup.createdJobs.push(job);
      targets.push({ ...job });
    }
    for (const job of targets) {
      const key = `job_title_${job.id}`;
      const role = await tx.rbac_roles.upsert({
        where: { key },
        create: { key, name_ar: job.name, name_en: job.name, description: `صلاحيات المسمى الوظيفي: ${job.name}`, is_system: true },
        update: {},
      });
      const current = await tx.rbac_role_permissions.findMany({ where: { role_id: role.id } });
      backup.roles.push({ roleId: role.id, key, name: job.name, rows: current });
      const rows = await sheetRows(tx, role.id, current);
      await tx.rbac_role_permissions.deleteMany({ where: { role_id: role.id } });
      await tx.rbac_role_permissions.createMany({ data: rows });
      console.log(`role ${key} «${job.name}»: ${current.length} → ${rows.length} permissions`);
    }
    // The backup must exist before the transaction commits.
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 1));
  }, { timeout: 60000 });
  console.log(`MANAGER SHEET APPLIED: ${backup.roles.length} roles, ${backup.createdJobs.length} job titles added`);
}

main().then(() => prisma.$disconnect(), async (e) => { console.error(e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
