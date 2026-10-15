import { EmployeeType } from '../../common/constants/hr-codes';
import { Prisma } from '@prisma/client';
import { dateOnlyOrdinal } from '../../common/utils/cairo-date';

/** Engine identity for named slip fields (legacy badl_code 100–106). */
export const ENGINE_BADL = {
  BASIC: 100,
  HOUSING: 101,
  TRANSPORT: 102,
  NATURE: 103,
  ASSIGNMENT: 104,
  MEAL: 105,
  COMM: 106,
  INSURANCE: 200,
} as const;

export type EngineBadlCode = (typeof ENGINE_BADL)[keyof typeof ENGINE_BADL];

export type ComponentMethod = 'fixed' | 'percent' | 'days';

const TITLE_TO_CODE: ReadonlyArray<{ pattern: RegExp; code: EngineBadlCode }> = [
  { pattern: /أساس|اساس|basic/i, code: ENGINE_BADL.BASIC },
  { pattern: /سكن|housing/i, code: ENGINE_BADL.HOUSING },
  { pattern: /نقل|مواصل|transport/i, code: ENGINE_BADL.TRANSPORT },
  { pattern: /طبيعة/i, code: ENGINE_BADL.NATURE },
  { pattern: /تكليف|assignment/i, code: ENGINE_BADL.ASSIGNMENT },
  { pattern: /إعاش|اعاش|معيش|وجبة|meal/i, code: ENGINE_BADL.MEAL },
  { pattern: /اتصال|هاتف|جوال|comm/i, code: ENGINE_BADL.COMM },
  { pattern: /تأمين|تامين|insurance|gosi/i, code: ENGINE_BADL.INSURANCE },
];

export function isEngineBadlCode(code: number | null | undefined): code is EngineBadlCode {
  return (
    code === ENGINE_BADL.BASIC ||
    code === ENGINE_BADL.HOUSING ||
    code === ENGINE_BADL.TRANSPORT ||
    code === ENGINE_BADL.NATURE ||
    code === ENGINE_BADL.ASSIGNMENT ||
    code === ENGINE_BADL.MEAL ||
    code === ENGINE_BADL.COMM ||
    code === ENGINE_BADL.INSURANCE
  );
}

/**
 * Single salary-component identity: catalog id / title / stored code → engine code.
 * Legacy rows already stored as 100–106 keep that identity. New UI rows store
 * catalog `defined_id` and are resolved by title (بدل سكن → 101, …).
 */
export function resolveEngineBadlCode(input: {
  badlCode?: number | null;
  catalogId?: number | null;
  title?: string | null;
}): number | null {
  if (isEngineBadlCode(input.badlCode)) return input.badlCode;
  const title = (input.title ?? '').trim();
  if (title) {
    for (const { pattern, code } of TITLE_TO_CODE) {
      if (pattern.test(title)) return code;
    }
  }
  if (input.badlCode != null && input.badlCode > 0) return input.badlCode;
  if (input.catalogId != null && input.catalogId > 0) return input.catalogId;
  return null;
}

export function normalizeComponentMethod(method: number | string | null | undefined): ComponentMethod {
  if (method === 2 || method === '2' || method === 'percent') return 'percent';
  if (method === 3 || method === '3' || method === 'days') return 'days';
  return 'fixed';
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Honor method_to_count: fixed amount, % of basic, or per-day × period days. */
export function computeComponentAmount(opts: {
  value: number;
  method?: number | string | null;
  basicSalary: number;
  periodDays: number;
}): number {
  const value = Number(opts.value) || 0;
  const method = normalizeComponentMethod(opts.method);
  if (method === 'percent') return roundMoney((opts.basicSalary * value) / 100);
  if (method === 'days') return roundMoney(value * opts.periodDays);
  return roundMoney(value);
}

export interface NamedAllowances {
  housing: number;
  transport: number;
  nature: number;
  assignment: number;
  meal: number;
  communication: number;
  basicFallback: number;
}

export interface ResolvedSalaryComponents {
  named: NamedAllowances;
  otherAllowances: number;
  recurringDeductions: number;
}

const EMPTY_NAMED: NamedAllowances = {
  housing: 0,
  transport: 0,
  nature: 0,
  assignment: 0,
  meal: 0,
  communication: 0,
  basicFallback: 0,
};

export function emptyNamedAllowances(): NamedAllowances {
  return { ...EMPTY_NAMED };
}

export function applyNamedAllowance(named: NamedAllowances, code: number, amount: number) {
  switch (code) {
    case ENGINE_BADL.BASIC:
      named.basicFallback += amount;
      break;
    case ENGINE_BADL.HOUSING:
      named.housing += amount;
      break;
    case ENGINE_BADL.TRANSPORT:
      named.transport += amount;
      break;
    case ENGINE_BADL.NATURE:
      named.nature += amount;
      break;
    case ENGINE_BADL.ASSIGNMENT:
      named.assignment += amount;
      break;
    case ENGINE_BADL.MEAL:
      named.meal += amount;
      break;
    case ENGINE_BADL.COMM:
      named.communication += amount;
      break;
    default:
      break;
  }
}

export function isNamedAllowanceCode(code: number | null | undefined): boolean {
  return (
    code === ENGINE_BADL.BASIC ||
    code === ENGINE_BADL.HOUSING ||
    code === ENGINE_BADL.TRANSPORT ||
    code === ENGINE_BADL.NATURE ||
    code === ENGINE_BADL.ASSIGNMENT ||
    code === ENGINE_BADL.MEAL ||
    code === ENGINE_BADL.COMM
  );
}

/**
 * Employees that belong on an ordinary payroll run:
 * ACTIVE, not "do not include" (`show_in_mosayer = no`), and either still employed
 * or terminated with a last working day inside this period (final settlement).
 * Null `show_in_mosayer` is included (product default).
 */
export function buildPayrollEmployeeWhere(period?: {
  fromDate: string;
  toDate: string;
}): Prisma.employeesWhereInput {
  const showOnPayroll: Prisma.employeesWhereInput = {
    NOT: { show_in_mosayer: 'no' },
  };
  if (!period) {
    return {
      employee_type: EmployeeType.ACTIVE,
      ...showOnPayroll,
      OR: [{ leave_emp: null }, { leave_emp: 0 }],
    };
  }
  return {
    employee_type: EmployeeType.ACTIVE,
    ...showOnPayroll,
    OR: [
      { leave_emp: null },
      { leave_emp: 0 },
      {
        leave_emp: 1,
        end_service_date_m: { gte: period.fromDate, lte: period.toDate },
      },
    ],
  };
}

export function isFinanceRowExpired(
  row: { specific_period?: string | null; date_to?: string | null },
  today: string,
): boolean {
  return row.specific_period === '1' && !!row.date_to && row.date_to <= today;
}

export function countInclusiveDays(fromDate: string, toDate: string): number {
  const start = dateOnlyOrdinal(fromDate);
  const end = dateOnlyOrdinal(toDate);
  return end < start ? 0 : end - start + 1;
}

export function clipIsoRange(
  fromA: string,
  toA: string,
  fromB: string,
  toB: string,
): { from: string; to: string } | null {
  const from = fromA > fromB ? fromA : fromB;
  const to = toA < toB ? toA : toB;
  return from <= to ? { from, to } : null;
}
