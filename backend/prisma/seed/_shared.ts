/* eslint-disable no-console */
/**
 * Shared helpers + context loaders for the comprehensive demo seed.
 *
 * Design:
 *  - One PrismaClient shared across all seed modules.
 *  - Deterministic PRNG (seedable) so repeated seeds produce identical data.
 *  - Date helpers anchored on a fixed BASE date so the demo always looks "current".
 *  - `clearTables()` for idempotent re-runs (child-before-parent order per module).
 *  - Loader helpers so each module can read the IDs it depends on straight from the
 *    DB (branches, employees, users, products, ...) instead of threading state.
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
//  Deterministic PRNG (LCG). Reproducible across runs — no Math.random().
// ---------------------------------------------------------------------------
let _state = 987654321;
export function reseed(n = 987654321) {
  _state = n >>> 0;
}
export function rnd(): number {
  // xorshift32
  _state ^= _state << 13;
  _state ^= _state >>> 17;
  _state ^= _state << 5;
  _state >>>= 0;
  return _state / 0xffffffff;
}
export function randInt(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
export function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
export function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  }
  return out;
}
export function chance(p: number): boolean {
  return rnd() < p;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
//  Dates. BASE is "today" for the demo (2026-07-01). Legacy columns are often
//  VARCHAR dates — use the string helpers for those.
// ---------------------------------------------------------------------------
export const BASE = new Date('2026-07-01T09:00:00Z');
export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
export function daysFromBase(days: number): Date {
  return addDays(BASE, days);
}
/** 'YYYY-MM-DD' */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD HH:MM:SS' */
export function ymdhms(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
/** Arabic-locale style date string 'DD-MM-YYYY' used by many legacy _ar columns */
export function dmy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}
export function hms(d: Date): string {
  return d.toISOString().slice(11, 19);
}

// ---------------------------------------------------------------------------
//  Name / text pools (Arabic-first, matching the app's audience).
// ---------------------------------------------------------------------------
export const AR_MALE = [
  'أحمد', 'محمد', 'عبدالله', 'خالد', 'سعود', 'فهد', 'ماجد', 'يوسف', 'عمر', 'إبراهيم',
  'سلطان', 'ناصر', 'بندر', 'طلال', 'عبدالعزيز', 'راكان', 'تركي', 'زياد', 'مازن', 'وليد',
];
export const AR_FEMALE = [
  'نورة', 'سارة', 'ريم', 'لمى', 'هند', 'دانة', 'شهد', 'جواهر', 'العنود', 'منيرة',
  'رهف', 'وعد', 'أروى', 'غادة', 'مها', 'أمل', 'بشاير', 'لطيفة', 'حصة', 'ابتسام',
];
export const AR_FAMILY = [
  'العتيبي', 'القحطاني', 'الغامدي', 'الشهري', 'الدوسري', 'الحربي', 'المطيري', 'الزهراني',
  'السبيعي', 'العنزي', 'البقمي', 'الشمري', 'الرشيدي', 'المالكي', 'الخالدي', 'الجهني',
];
export function fullNameMale(): string {
  return `${pick(AR_MALE)} ${pick(AR_MALE)} ${pick(AR_FAMILY)}`;
}
export function fullNameFemale(): string {
  return `${pick(AR_FEMALE)} ${pick(AR_MALE)} ${pick(AR_FAMILY)}`;
}
export function phone(): string {
  return `05${randInt(0, 9)}${randInt(1000000, 9999999)}`;
}
export function email(seed: number): string {
  return `demo.user${seed}@noamanycenter.test`;
}

// ---------------------------------------------------------------------------
//  Idempotency: truncate a set of tables (children first) with FK checks off.
// ---------------------------------------------------------------------------
export async function clearTables(names: string[]): Promise<void> {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  for (const n of names) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${n}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
}

// ---------------------------------------------------------------------------
//  Context loaders — read prerequisite IDs from the DB (set by foundation).
// ---------------------------------------------------------------------------
export async function getBranches() {
  return prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' } });
}
export async function getBranchIds(): Promise<number[]> {
  return (await getBranches()).map((b) => b.branch_id);
}
export async function getEmployees() {
  return prisma.employees.findMany({
    where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      emp_code: true,
      employee: true,
      branch_id_fk: true,
      emp_type: true,
      basic_salary: true,
      phone: true,
    },
  });
}
export async function getUsers() {
  return prisma.users.findMany({ orderBy: { user_id: 'asc' }, select: { user_id: true, emp_code: true, name: true, level: true, branch_id_fk: true } });
}
export async function getDepartments() {
  return prisma.hr_edarat_aqsam.findMany({ orderBy: { id: 'asc' } });
}
export async function getJobs() {
  return prisma.department_jobs.findMany({ orderBy: { id: 'asc' } });
}

export function log(section: string, msg: string) {
  console.log(`  [${section}] ${msg}`);
}
