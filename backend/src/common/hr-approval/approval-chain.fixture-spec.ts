/**
 * Test-only in-memory Prisma for the approval-chain specs (excluded from the build by the
 * `*spec.ts` pattern, not picked up by jest's `.spec.ts` regex).
 */
type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    const value = row[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('in' in cond) return (cond.in as unknown[]).includes(value);
      if ('notIn' in cond) return !(cond.notIn as unknown[]).includes(value);
      if ('not' in cond) return value !== cond.not;
      if ('startsWith' in cond) return String(value ?? '').startsWith(cond.startsWith);
      return true;
    }
    return value === cond;
  });
}

function table(rows: Row[]) {
  let nextId = Math.max(0, ...rows.map((r) => Number(r.id ?? r.user_id ?? 0))) + 1;
  return {
    rows,
    findUnique: jest.fn(async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null),
    findFirst: jest.fn(async ({ where }: { where?: Row } = {}) => rows.find((r) => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where))),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId++, ...data };
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    aggregate: jest.fn(async () => ({ _max: { id: rows.length, agaza_rkm: rows.length, ezn_rkm: rows.length }, _sum: {}, _count: { id: 0 } })),
    count: jest.fn(async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where)).length),
  };
}

/**
 * Staff used by the specs:
 *   employee 10 (login 100) — the requester; direct manager = employee 20 (login 200)
 *   employee 30 (login 300) — HR officer (job-title code 44)
 *   employee 40 (login 400) — department manager (code 32: emp_type 1)
 *   login 1 — admin (level 1); login 500 — unrelated staff
 */
export function fakeChainPrisma(overrides: { employees?: Row[]; users?: Row[]; settings?: Row[] } = {}) {
  const employees = table(
    overrides.employees ?? [
      { id: 10, emp_code: 1010, employee: 'موظف', manger: '20', emp_type: 1, edara_id: null, branch_id_fk: 1, start_work_date_m: null },
      { id: 20, emp_code: 1020, employee: 'المدير المباشر', manger: null, emp_type: 1, edara_id: null, branch_id_fk: 1 },
      { id: 30, emp_code: 1030, employee: 'الموارد البشرية', manger: null, emp_type: 1, edara_id: null, branch_id_fk: 1 },
      { id: 40, emp_code: 1040, employee: 'مدير الإدارة', manger: null, emp_type: 1, edara_id: null, branch_id_fk: 1 },
    ],
  );
  const users = table(
    overrides.users ?? [
      { user_id: 1, emp_code: null, level: 1, approved: 1, name: 'admin' },
      { user_id: 100, emp_code: 10, level: 2, approved: 1, name: 'موظف' },
      { user_id: 200, emp_code: 20, level: 3, approved: 1, name: 'المدير المباشر' },
      { user_id: 300, emp_code: 30, level: 2, approved: 1, name: 'الموارد البشرية' },
      { user_id: 400, emp_code: 40, level: 3, approved: 1, name: 'مدير الإدارة' },
      { user_id: 500, emp_code: null, level: 2, approved: 1, name: 'آخر' },
    ],
  );
  const settings = table(
    overrides.settings ?? [
      { id: 1, job_title_code_fk: 44, person_id: 30, person_code: '1030', person_name: 'الموارد البشرية', person_suspend: 1 },
      { id: 2, job_title_code_fk: 32, person_id: 40, person_code: '1040', person_name: 'مدير الإدارة', person_suspend: 1 },
    ],
  );
  return {
    employees,
    users,
    hr_egraat_emp_setting: settings,
    holiday_setting: table([{ id: 3, name: 'مرضية', min_days: 0, max_days: 30, agaza_ttype: 2, active: 'yes' }]),
    hr_all_agzat_orders: table([]),
    hr_all_agzat_history: table([]),
    hr_all_ozonat_orders: table([]),
    hr_all_ozonat_history: table([]),
    tbl_sys_notifications_settings: table([]),
    tbl_notifications: table([]),
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(async () => []),
  };
}

export const jwt = (sub: number, level = 2, emp_code: number | null = null) =>
  ({ sub, level, emp_code, branch: 1, name: `u${sub}` }) as any;
