import { Prisma } from '@prisma/client';

/**
 * Employee exit (termination) types and the notice-shortfall rule.
 *
 * The bylaw requires an employee who leaves to give `requiredNoticeDays` (default 30) of notice.
 * Leaving with less (or none) is not a regular resignation: it is recorded as
 * "ترك العمل / إخلال طرف" (abandonment / breach) or a short-notice resignation.
 */
export const EXIT_TYPES = [
  'resignation',
  'resignation_short_notice',
  'abandonment',
  'termination',
  'contract_end',
  'other',
] as const;

export type ExitType = (typeof EXIT_TYPES)[number];

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  resignation: 'استقالة بإخطار',
  resignation_short_notice: 'استقالة بدون إخطار كافٍ',
  abandonment: 'ترك العمل / إخلال طرف',
  termination: 'إنهاء خدمة من الشركة',
  contract_end: 'انتهاء عقد',
  other: 'أخرى',
};

/** Exit types where the employee owes the company notice (company-side exits owe none). */
export const EMPLOYEE_INITIATED_EXITS: readonly ExitType[] = [
  'resignation',
  'resignation_short_notice',
  'abandonment',
  'other',
];

export const DEFAULT_REQUIRED_NOTICE_DAYS = 30;

/** Default notice period; overridable with HR_REQUIRED_NOTICE_DAYS. */
export function defaultRequiredNoticeDays(): number {
  const n = Number(process.env.HR_REQUIRED_NOTICE_DAYS);
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : DEFAULT_REQUIRED_NOTICE_DAYS;
}

export function isExitType(value: unknown): value is ExitType {
  return typeof value === 'string' && (EXIT_TYPES as readonly string[]).includes(value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days between two YYYY-MM-DD dates (UTC, so DST never shifts the count). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export interface NoticeShortfall {
  /** Days between the notice date and the last working day (null when no notice was given). */
  noticeDaysGiven: number | null;
  /** Missing notice days (0 when notice was sufficient or the exit is company-initiated). */
  shortfallDays: number;
  /** Suggested type when the chosen type contradicts the notice actually given. */
  suggestedType: ExitType | null;
}

/**
 * Notice shortfall = required notice days − days actually served between the notice date and
 * the last working day, never below 0. No notice at all means the whole period is missing.
 * Company-side exits (termination, contract_end) owe no employee notice → shortfall 0.
 */
export function computeNoticeShortfall(input: {
  exitType: ExitType;
  noticeGivenDate?: string | null;
  lastWorkingDate: string;
  requiredNoticeDays: number;
}): NoticeShortfall {
  const required = Math.max(0, Math.floor(input.requiredNoticeDays));
  const noticeDaysGiven = input.noticeGivenDate
    ? Math.max(0, daysBetween(input.noticeGivenDate, input.lastWorkingDate))
    : null;
  if (!EMPLOYEE_INITIATED_EXITS.includes(input.exitType)) {
    return { noticeDaysGiven, shortfallDays: 0, suggestedType: null };
  }
  const shortfallDays = Math.max(0, required - (noticeDaysGiven ?? 0));
  const suggestedType: ExitType | null =
    input.exitType === 'resignation' && shortfallDays > 0 ? 'abandonment' : null;
  return { noticeDaysGiven, shortfallDays, suggestedType };
}

type RawReader = { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

/**
 * Latest exit type per employee id. Tolerates a missing hr_employee_exits table (migration not yet
 * applied) by returning an empty map, so legacy reports keep working.
 */
export async function latestExitTypes(prisma: RawReader, empIds: number[]): Promise<Map<number, ExitType>> {
  const out = new Map<number, ExitType>();
  if (!empIds.length) return out;
  try {
    const rows = await prisma.$queryRaw<Array<{ emp_id: number; exit_type: string }>>(Prisma.sql`
      SELECT x.emp_id, x.exit_type FROM hr_employee_exits x
      JOIN (SELECT emp_id, MAX(id) AS id FROM hr_employee_exits
            WHERE emp_id IN (${Prisma.join(empIds)}) GROUP BY emp_id) last ON last.id = x.id`);
    for (const r of rows) if (isExitType(r.exit_type)) out.set(Number(r.emp_id), r.exit_type);
  } catch {
    /* table missing → no structured exits yet */
  }
  return out;
}
