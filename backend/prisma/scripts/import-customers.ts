/* eslint-disable no-console */
/**
 * SAFE, append-only import of customers (name/phone/email) into club_members.
 *
 * Unlike the old (removed) women-members importer, this NEVER deletes anything — it is
 * meant to run against the live server where staff have already added real members.
 * Works for any Cus_Phone_Email sheet (name/phone/email); pass --file to pick the sheet.
 *
 * Goal: EVERY distinct person ends up in the system, each with a UNIQUE valid phone,
 * and no duplicates. Rules:
 *   - No deletes. Ever. member_code continues from the branch MAX (no code collision).
 *   - Identical rows (same name + same number) collapse to one.
 *   - Rows that SHARE a number AND have near-identical names (typos: "ماز محمد" ≈
 *     "مازن محمد") are merged into one person (fuller name kept).
 *   - Rows that share a number but have DIFFERENT names are different people: the first
 *     keeps the number, the rest get a fresh unique placeholder number.
 *   - Junk / invalid / missing numbers (11111111111, 00000000000, wrong length, blank)
 *     get a fresh unique placeholder number (prefix from --fake-prefix, default 019 —
 *     an unassigned EG range, so it can never clash with a real mobile). The original
 *     value is kept in notes for staff to correct.
 *   - A valid number that already exists in the DB => that person is already in the
 *     system => the whole group is SKIPPED (prevents replicating existing members).
 *   - Gender is guessed from the name; unsure rows are flagged in notes.
 *   - Dry run by default. Writes only with --commit. Per-file [imp:src] marker blocks
 *     an accidental second import (--force overrides).
 *
 * Usage:
 *   Dry run : npx ts-node -r tsconfig-paths/register prisma/scripts/import-customers.ts --branch=1
 *   Commit  : npx ts-node -r tsconfig-paths/register prisma/scripts/import-customers.ts --branch=1 --commit
 *   Options : --file=<path>  --gender=male|female  --fake-prefix=019  --limit=N  --force
 */
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  formatBranchMemberCode,
  getEmailValidationError,
  getPhoneValidationError,
  normalizeName,
  normalizePhoneForStorage,
  normalizePhoneInput,
} from '../../src/modules/club-members/club-member.utils';
import { inferGender, Gender } from './arabic-name-gender';
import { normalizeForMatch, namesSimilar, makePhoneGenerator } from './member-dedup';

const BATCH_SIZE = 500;
const DEFAULT_FILE = path.resolve(__dirname, '../../../data/2.xlsx');

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const HAS = (f: string) => process.argv.includes(`--${f}`);

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value && (value as { text?: unknown }).text != null) {
    return String((value as { text: unknown }).text).trim();
  }
  if (typeof value === 'object' && 'result' in value && (value as { result?: unknown }).result != null) {
    return String((value as { result: unknown }).result).trim();
  }
  return String(value).trim();
}

interface Parsed {
  row: number;
  name: string; // display name
  nkey: string; // match key
  email: string | null;
  emailBad: boolean;
  rawPhone: string;
  valid: boolean;
  storage: string | null; // normalized valid phone, else null
  groupKey: string; // storage (valid) or stripped input (junk); '' for empty phone
}

// One resolved person before phone/code assignment.
interface OutMember {
  name: string;
  firstRow: number;
  keptPhone: string | null; // real number kept, else null => needs a generated one
  origPhone: string; // original raw phone (for the note)
  mergedNames: string[]; // other name variants merged into this person
  emailBad: boolean;
  email: string | null;
}

async function main() {
  const commit = HAS('commit');
  const force = HAS('force');
  const branchId = Number(arg('branch'));
  const filePath = arg('file') ? path.resolve(process.cwd(), arg('file') as string) : DEFAULT_FILE;
  const genderOverride = arg('gender') as Gender | undefined;
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const fakePrefix = arg('fake-prefix') ?? '019';
  const source = path.basename(filePath);
  const marker = `[imp:${source}]`;

  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error('Missing/invalid --branch=<id>. Example: --branch=1');
  if (limit != null && (!Number.isInteger(limit) || limit <= 0)) throw new Error('--limit must be a positive integer');
  if (genderOverride && genderOverride !== 'male' && genderOverride !== 'female') throw new Error('--gender must be "male" or "female"');
  if (!/^01[0-9]{1,2}$/.test(fakePrefix)) throw new Error('--fake-prefix must look like 019 / 010 (starts 01, 3-4 digits)');

  const prisma = new PrismaClient();
  try {
    console.log(`=== Import customers into branch ${branchId} — ${commit ? 'COMMIT' : 'DRY RUN'} ===`);
    console.log(`Excel: ${filePath}  |  placeholder prefix: ${fakePrefix}`);

    const branch = await prisma.tbl_branches.findUnique({ where: { branch_id: branchId } });
    if (!branch) throw new Error(`Branch ${branchId} not found — create it before importing.`);
    if (!branch.br_code) {
      throw new Error(`Branch ${branchId} has no br_code — configure it before importing.`);
    }
    console.log(`Branch: ${branch.branch_name} (prefix ${branch.br_code})`);

    const already = await prisma.club_members.count({ where: { notes: { contains: marker } } });
    if (already > 0) {
      console.log(`\n⚠ ${already} members already carry the ${marker} marker (this file was imported before).`);
      if (commit && !force) throw new Error('Refusing to import again (would duplicate). Pass --force to override.');
    }

    // All existing phones (any format) — used both to skip existing people and to keep
    // generated placeholders unique.
    const existingRows = await prisma.club_members.findMany({ where: { phone: { not: null } }, select: { phone: true } });
    const existingPhones = new Set<string>();
    for (const e of existingRows) {
      const p = normalizePhoneForStorage(e.phone ?? '');
      if (p) existingPhones.add(p);
    }
    console.log(`Existing phones in DB: ${existingPhones.size}`);

    const codePrefix = branch.br_code;
    const codes = await prisma.club_members.findMany({
      where: { member_code: { startsWith: codePrefix } },
      select: { member_code: true },
    });
    let maxSeq = 0;
    for (const { member_code } of codes) {
      if (member_code?.startsWith(codePrefix)) {
        const n = parseInt(member_code.slice(codePrefix.length), 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
    console.log(`Existing codes with prefix ${codePrefix}: ${codes.length} — next code seq: ${maxSeq + 1}`);

    // ---- Parse ----
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error(`No worksheet in ${filePath}`);

    const parsed: Parsed[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameRaw = normalizeName(cellText(row.getCell(1).value));
      const rawPhone = cellText(row.getCell(2).value);
      const emailRaw = cellText(row.getCell(3).value) || null;
      if (!nameRaw && !rawPhone) continue; // fully empty

      const name = nameRaw || `عضو غير مسمى — صف ${r}`;
      const inp = normalizePhoneInput(rawPhone);
      const valid = !!inp && !getPhoneValidationError(rawPhone);
      const storage = valid ? normalizePhoneForStorage(rawPhone) : null;
      const emailBad = !!emailRaw && !!getEmailValidationError(emailRaw);
      parsed.push({
        row: r,
        name,
        nkey: normalizeForMatch(name),
        email: emailBad ? null : emailRaw,
        emailBad,
        rawPhone,
        valid,
        storage,
        groupKey: valid ? (storage as string) : inp, // '' when phone missing
      });
    }

    // ---- 1) Collapse literally identical rows (same name + same non-empty number) ----
    const seen = new Set<string>();
    let droppedIdentical = 0;
    const rows: Parsed[] = [];
    for (const p of parsed) {
      if (p.groupKey) {
        const k = `${p.nkey}${p.groupKey}`;
        if (seen.has(k)) {
          droppedIdentical++;
          continue;
        }
        seen.add(k);
      }
      rows.push(p);
    }

    // ---- 2) Group by number; cluster near-identical names inside each group ----
    const withNumber = rows.filter((p) => p.groupKey);
    const noNumber = rows.filter((p) => !p.groupKey); // missing phone -> each its own person
    const groups = new Map<string, Parsed[]>();
    for (const p of withNumber) {
      const g = groups.get(p.groupKey);
      if (g) g.push(p);
      else groups.set(p.groupKey, [p]);
    }

    const out: OutMember[] = [];
    let mergedSamePerson = 0;
    let skippedExistingInDb = 0;

    for (const [key, grp] of groups) {
      const isValid = grp[0].valid;
      if (isValid && existingPhones.has(key)) {
        skippedExistingInDb += grp.length; // person already in the system
        continue;
      }
      // Name-merge ONLY when a REAL number is shared (strong same-person signal).
      // Junk/placeholder numbers are shared by many unrelated people, so there we
      // keep every row as its own person (one cluster each).
      const clusters: { name: string; nkey: string; rows: Parsed[] }[] = [];
      if (isValid) {
        for (const p of grp) {
          const c = clusters.find((cl) => namesSimilar(p.nkey, cl.nkey));
          if (c) {
            c.rows.push(p);
            if (p.name.length > c.name.length) {
              c.name = p.name;
              c.nkey = p.nkey;
            }
          } else clusters.push({ name: p.name, nkey: p.nkey, rows: [p] });
        }
      } else {
        for (const p of grp) clusters.push({ name: p.name, nkey: p.nkey, rows: [p] });
      }
      mergedSamePerson += grp.length - clusters.length;
      clusters.forEach((c, idx) => {
        const first = c.rows.reduce((a, b) => (a.row < b.row ? a : b));
        out.push({
          name: c.name,
          firstRow: first.row,
          keptPhone: isValid && idx === 0 ? key : null, // only the first cluster keeps a real number
          origPhone: first.rawPhone,
          mergedNames: c.rows.filter((x) => x.name !== c.name).map((x) => x.name),
          email: c.rows.find((x) => x.email)?.email ?? null,
          emailBad: c.rows.some((x) => x.emailBad),
        });
      });
    }
    for (const p of noNumber) {
      out.push({ name: p.name, firstRow: p.row, keptPhone: null, origPhone: p.rawPhone, mergedNames: [], email: p.email, emailBad: p.emailBad });
    }

    // ---- 3) Assign phones: keep reals, generate unique placeholders for the rest ----
    const taken = new Set<string>(existingPhones);
    for (const m of out) if (m.keptPhone) taken.add(m.keptPhone);
    const genPhone = makePhoneGenerator(fakePrefix, taken);
    let generated = 0;
    for (const m of out) {
      if (!m.keptPhone) {
        (m as OutMember & { finalPhone: string }).finalPhone = genPhone();
        generated++;
      } else {
        (m as OutMember & { finalPhone: string }).finalPhone = m.keptPhone;
      }
    }

    // ---- 4) Build insert rows (stable order by first appearance) ----
    out.sort((a, b) => a.firstRow - b.firstRow);
    let seq = maxSeq;
    let genderFemale = 0;
    let genderFlagged = 0;
    let emailDropped = 0;
    const toInsert: Prisma.club_membersCreateManyInput[] = out.map((m) => {
      const finalPhone = (m as OutMember & { finalPhone: string }).finalPhone;
      const generatedHere = finalPhone !== m.keptPhone;
      const notes: string[] = [`مستورد من ${source} ${marker}`];
      if (m.name.startsWith('عضو غير مسمى')) notes.push('اسم مفقود في Excel');
      if (m.emailBad) {
        emailDropped++;
        notes.push('بريد غير صالح — تم تجاهله');
      }
      if (generatedHere) notes.push(`رقم مؤقت تلقائي — الأصل: ${m.origPhone || 'فارغ'}`);
      if (m.mergedNames.length) notes.push(`دُمج كنفس الشخص (نفس الرقم): ${[...new Set(m.mergedNames)].join('، ')}`);

      let gender: Gender;
      if (genderOverride) gender = genderOverride;
      else {
        const g = inferGender(m.name);
        gender = g.gender;
        if (!g.confident) {
          genderFlagged++;
          notes.push('الجنس مُخمَّن — يرجى المراجعة');
        }
      }
      if (gender === 'female') genderFemale++;

      seq++;
      return {
        member_code: formatBranchMemberCode(codePrefix, seq),
        name: m.name,
        phone: finalPhone,
        email: m.email,
        gender,
        branch_id: branchId,
        is_active: true,
        is_deleted: false,
        notes: notes.join(' | '),
      };
    });

    // ---- Summary ----
    console.log('\n--- Summary ---');
    console.log(`Rows with data              : ${parsed.length}`);
    console.log(`Identical rows collapsed    : ${droppedIdentical}`);
    console.log(`Merged as same person (typo): ${mergedSamePerson}`);
    console.log(`Skipped (number already in DB): ${skippedExistingInDb}`);
    console.log(`TO INSERT (distinct people) : ${toInsert.length}`);
    console.log(`  real number kept          : ${toInsert.length - generated}`);
    console.log(`  placeholder number given  : ${generated}`);
    console.log(`  gender male/female        : ${toInsert.length - genderFemale} / ${genderFemale}`);
    console.log(`  gender flagged for review : ${genderFlagged}`);
    console.log(`  invalid emails dropped    : ${emailDropped}`);
    if (toInsert.length) console.log(`  code range                : ${toInsert[0].member_code} … ${toInsert[toInsert.length - 1].member_code}`);

    if (!commit) {
      console.log('\n=== DRY RUN — nothing written. Re-run with --commit to apply. ===');
      return;
    }

    const rowsToWrite = limit ? toInsert.slice(0, limit) : toInsert;
    if (limit) console.log(`\n(⚠ --limit=${limit}: writing only the first ${rowsToWrite.length} of ${toInsert.length})`);
    console.log(`\n▶ Inserting ${rowsToWrite.length} members…`);
    let inserted = 0;
    for (let i = 0; i < rowsToWrite.length; i += BATCH_SIZE) {
      const batch = rowsToWrite.slice(i, i + BATCH_SIZE);
      const res = await prisma.club_members.createMany({ data: batch, skipDuplicates: true });
      inserted += res.count;
      console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: +${res.count}`);
    }
    const total = await prisma.club_members.count({ where: { branch_id: branchId, is_deleted: false } });
    console.log(`\n✔ Inserted ${inserted} members (${total} total in branch ${branchId}).`);
    console.log('Next: provision mobile logins ->');
    console.log('  npx ts-node -r tsconfig-paths/register prisma/scripts/provision-member-app-accounts.ts --commit');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
