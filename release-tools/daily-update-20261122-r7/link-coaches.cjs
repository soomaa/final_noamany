#!/usr/bin/env node
/*
 * Coaches roster (client video, 23 Nov 2026): a captain's account should show only that captain on the trainer
 * target / evaluation pages, and the coach names should be in one language.
 *   node link-coaches.cjs check    <APP>
 *   node link-coaches.cjs apply    <APP> <backup.json>
 *   node link-coaches.cjs rollback <APP> <backup.json>
 *
 * apply (one transaction):
 *  1. links the 13 old-system coach rows («COACH / …», no employee) to their captain employee (matched by name,
 *     checked on 23 Nov) — the row keeps its id and takes the employee's Arabic name;
 *  2. hides the 5 old-system rows that are duplicates or ambiguous (Samar / Shady already have an Arabic row,
 *     Nada Hamdy is now a branch manager, Nada Ahmed and Shorok match two captains each); none of the 18 is used
 *     by any class, private subscription, schedule, target, evaluation or salary (checked 23 Nov);
 *  3. gives every active employee with a trainer job title (كابتن…) who has no coach row one, named in Arabic —
 *     the same as the employee→coach sync (club-fitness/trainer-sync.util).
 * The touched rows are saved first; rollback puts them back and hides the rows it created.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const [mode, APP, BACKUP_FILE] = process.argv.slice(2);
if (!['apply', 'rollback', 'check'].includes(mode) || !APP) {
  console.error('usage: link-coaches.cjs apply|rollback|check <APP> [backup.json]');
  process.exit(2);
}
if (!process.env.DATABASE_URL && fs.existsSync(path.join(APP, '.env'))) {
  for (const line of fs.readFileSync(path.join(APP, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const { PrismaClient } = require(path.join(APP, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

// club_trainers.id → employees.id (English old-system name → captain's Arabic name)
const LINKS = {
  1002: 32,  // COACH / ISLAM WAGDY      → اسلام وجدي السيد
  1020: 33,  // COACH/NEHAD ELARABY      → نهاد ابراهيم محمود عيد العربي
  1029: 43,  // COACH / MOHAMED HASSAN   → محمد حسن اسماعيل محمد عبد المجيد
  1032: 83,  // COACH / MOHAMED RAFAAT   → محمد رافت
  1035: 54,  // COACH / SARA MOHAMED     → ساره محمد الحسينى ابراهيم عبده
  1037: 102, // COACH/ MOAZ MOSTAFA      → معاذ مصطفي فتحى
  1038: 70,  // COACH/SEIF ELESLAM       → سيف الاسلام
  1040: 80,  // COACH/AYA HOSNY          → ايه حسني
  1041: 92,  // COACH/HAGER GAMAL        → هاجر جمال
  1042: 40,  // COACH/ZEYAD ELSHORBAGY   → زياد محمد السعيد الشوربجى
  1043: 38,  // COACH/SAGED KHALED       → ساجد خالد السيد السعدنى
  1045: 12,  // COACH/ RANIA ADEL        → رانيا عادل فاروق الطنبشاوي
  1046: 10,  // COACH/MONA OSAMA         → منى اسامة عبد الباري الصعيدى
};
// Duplicates / ambiguous: hidden (is_active=false), kept for history.
const HIDE = [1021, 1023, 1028, 1044, 1047];
const TRAINER_JOB_TITLES = ['مدرب', 'مدرب لياقة', 'مدربة لياقة'];
const FIELDS = { id: true, employee_id: true, name: true, phone: true, email: true, is_active: true, is_deleted: true };

async function plan(db) {
  const rows = await db.club_trainers.findMany({ where: { id: { in: [...Object.keys(LINKS).map(Number), ...HIDE] } }, select: FIELDS });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems = [];
  for (const [tid, eid] of Object.entries(LINKS)) {
    const row = byId.get(Number(tid));
    if (!row) { problems.push(`coach ${tid} missing`); continue; }
    if (row.employee_id != null && row.employee_id !== eid) problems.push(`coach ${tid} already linked to employee ${row.employee_id}`);
    const other = await db.club_trainers.findFirst({ where: { employee_id: eid, NOT: { id: Number(tid) } }, select: { id: true } });
    if (other) problems.push(`employee ${eid} already has coach ${other.id}`);
  }
  const jobs = await db.department_jobs.findMany({ where: { OR: [{ is_trainer: true }, { name: { in: TRAINER_JOB_TITLES } }] }, select: { id: true } });
  const emps = jobs.length ? await db.employees.findMany({
    where: { mosma_wazefy_code: { in: jobs.map((j) => j.id) }, OR: [{ leave_emp: null }, { leave_emp: 0 }] },
    select: { id: true, employee: true, phone: true, email: true },
  }) : [];
  const linked = new Set((await db.club_trainers.findMany({ where: { employee_id: { not: null } }, select: { employee_id: true } })).map((r) => r.employee_id));
  const willLink = new Set(Object.values(LINKS));
  const create = emps.filter((e) => !linked.has(e.id) && !willLink.has(e.id));
  return { rows, problems, create };
}

async function main() {
  if (mode === 'rollback') {
    const saved = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    await prisma.$transaction(async (tx) => {
      // Created rows first (their employee_id would clash with a restored link otherwise): hidden and unlinked.
      if (saved.created.length) await tx.club_trainers.updateMany({ where: { id: { in: saved.created } }, data: { is_active: false, employee_id: null } });
      for (const row of saved.rows) {
        const { id, ...data } = row;
        await tx.club_trainers.update({ where: { id }, data });
      }
    }, { timeout: 60000 });
    console.log(`COACHES ROLLED BACK: ${saved.rows.length} rows restored, ${saved.created.length} created rows hidden`);
    return;
  }

  const p = await plan(prisma);
  console.log(`link ${Object.keys(LINKS).length}, hide ${HIDE.length}, create ${p.create.length}; problems: ${p.problems.join('; ') || 'none'}`);
  if (p.problems.length) process.exit(1);
  if (mode === 'check') return;
  if (!BACKUP_FILE) throw new Error('backup file required');

  const backup = { at: new Date().toISOString(), rows: p.rows, created: [] };
  await prisma.$transaction(async (tx) => {
    for (const [tid, eid] of Object.entries(LINKS)) {
      const emp = await tx.employees.findUnique({ where: { id: eid }, select: { employee: true, phone: true, email: true } });
      const row = p.rows.find((r) => r.id === Number(tid));
      await tx.club_trainers.update({
        where: { id: Number(tid) },
        data: { employee_id: eid, name: emp?.employee?.trim() || row.name, phone: emp?.phone ?? row.phone, email: emp?.email ?? row.email, is_active: true, is_deleted: false },
      });
    }
    await tx.club_trainers.updateMany({ where: { id: { in: HIDE } }, data: { is_active: false } });
    for (const e of p.create) {
      const created = await tx.club_trainers.create({
        data: { employee_id: e.id, name: e.employee?.trim() || `موظف #${e.id}`, phone: e.phone ?? null, email: e.email ?? null, is_active: true },
        select: { id: true },
      });
      backup.created.push(created.id);
    }
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 1));
  }, { timeout: 120000 });
  console.log(`COACHES LINKED: ${Object.keys(LINKS).length} linked, ${HIDE.length} hidden, ${backup.created.length} created`);
}

main().then(() => prisma.$disconnect(), async (e) => { console.error(e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
