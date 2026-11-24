import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { fakeChainPrisma, jwt } from '../../common/hr-approval/approval-chain.fixture-spec';
import { LeavesService } from '../leaves/leaves.service';
import { OvertimeRequestsService } from '../overtime-requests/overtime-requests.service';
import { RequestFlowService } from './request-flow.service';

/**
 * HR request flow (25 Nov 2026): manager overtime entries go to HR, «إرجاع للتعديل» + resubmit,
 * and the HR inbox that lists every open request.
 *
 * Staff (fakeChainPrisma): employee 10 / login 100 → direct manager 20 / login 200;
 * HR officer 30 / login 300; unrelated login 500; admin login 1.
 */

type Row = Record<string, any>;

/**
 * Tiny SQL double for the raw statements of hr_overtime_requests, hr_request_returns and
 * hr_request_timeline: INSERT (col list + values), UPDATE … SET … WHERE … and simple SELECTs.
 */
function sqlDouble() {
  const tables: Record<string, Row[]> = { hr_overtime_requests: [], hr_request_returns: [], hr_request_timeline: [] };
  const ids: Record<string, number> = { hr_overtime_requests: 0, hr_request_returns: 0, hr_request_timeline: 0 };
  let lastId = 0;
  const MARK = (i: number) => `\u0000${i}\u0000`;
  const text = (q: { strings: string[] }) => q.strings.map((s, i) => (i === 0 ? s : MARK(i - 1) + s)).join('');
  const value = (expr: string, values: unknown[]): unknown => {
    const e = expr.trim();
    const m = /^\u0000(\d+)\u0000$/.exec(e);
    if (m) return values[Number(m[1])];
    if (e === 'NULL') return null;
    if (/^NOW\(\)$/.test(e)) return new Date();
    if (/^'.*'$/.test(e)) return e.slice(1, -1);
    if (/^\d+$/.test(e)) return Number(e);
    return e;
  };
  const split = (list: string) => list.split(',').map((x) => x.trim()).filter(Boolean);
  const where = (clause: string, values: unknown[]) => {
    const conds = clause.split(/\s+AND\s+/i).map((c) => c.trim()).filter(Boolean);
    return (row: Row) =>
      conds.every((c) => {
        let m = /^\(?(\w+)\s+IN\s+\((.*)\)\)?$/i.exec(c);
        if (m) return split(m[2]).map((v) => value(v, values)).includes(row[m[1]]);
        m = /^(\w+)\s*<>\s*(.+)$/.exec(c);
        if (m) return row[m[1]] !== value(m[2], values);
        m = /^(\w+)\s*=\s*(.+)$/.exec(c);
        if (m) return row[m[1]] === value(m[2], values);
        return true;
      });
  };
  const tableOf = (sql: string) => /(?:INTO|UPDATE|FROM)\s+(\w+)/i.exec(sql)?.[1] ?? '';

  const $executeRaw = jest.fn(async (q: { strings: string[]; values: unknown[] }) => {
    const sql = text(q).replace(/\s+/g, ' ');
    const table = tableOf(sql);
    const rows = (tables[table] ??= []);
    if (/^\s*INSERT/i.test(sql)) {
      const m = /\(([^)]*)\)\s*VALUES\s*\((.*)\)\s*$/i.exec(sql)!;
      const cols = split(m[1]);
      const vals = split(m[2]);
      const row: Row = { id: ++ids[table] };
      cols.forEach((c, i) => (row[c] = value(vals[i], q.values)));
      row.status ??= table === 'hr_overtime_requests' ? 'pending' : 'open';
      rows.push(row);
      lastId = row.id;
      return 1;
    }
    const m = /SET (.*) WHERE (.*)$/i.exec(sql);
    if (!m) return 0;
    const match = where(m[2], q.values);
    let changed = 0;
    for (const row of rows.filter(match)) {
      for (const assign of split(m[1])) {
        const [col, expr] = assign.split(/\s*=\s*/);
        row[col.trim()] = value(expr, q.values);
      }
      changed += 1;
    }
    return changed;
  });

  const $queryRaw = jest.fn(async (q: { strings: string[]; values: unknown[] }) => {
    const sql = text(q).replace(/\s+/g, ' ');
    if (sql.includes('LAST_INSERT_ID')) return [{ id: lastId }];
    const table = tableOf(sql);
    const rows = tables[table] ?? [];
    const m = /WHERE (.*?)(?: ORDER BY .*?)?(?: LIMIT .*)?$/i.exec(sql);
    return m ? rows.filter(where(m[1], q.values)).map((r) => ({ ...r })) : rows.map((r) => ({ ...r }));
  });

  return { tables, $executeRaw, $queryRaw };
}

const setup = () => {
  const prisma = fakeChainPrisma();
  const sql = sqlDouble();
  Object.assign(prisma, {
    $executeRaw: sql.$executeRaw,
    $queryRaw: sql.$queryRaw,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
    tbl_branches: { findMany: jest.fn(async () => [{ branch_id: 1, branch_name: 'فرع 1' }]) },
  });
  const push = { sendToUsers: jest.fn().mockResolvedValue({ sent: 1, skipped: 0 }), pushToUsers: jest.fn().mockResolvedValue(1) };
  const attendance = {
    createExtraHours: jest.fn().mockResolvedValue({ id: 900, message: 'تمت تسجيل الساعات الإضافية بنجاح', confirmedHours: 2 }),
    createShiftSwap: jest.fn().mockResolvedValue({ id: 901, message: 'تم تسجيل الشيفت الإضافي بنجاح' }),
  };
  const overtime = new OvertimeRequestsService(prisma as never, attendance as never, new BranchScopeService(), push as never);
  const leaves = new LeavesService(prisma as never, new BranchScopeService(), undefined, push as never);
  const flow = new RequestFlowService(prisma as never, leaves, undefined, overtime);
  return { prisma, sql, push, attendance, overtime, leaves, flow };
};

const manager = jwt(200, 3, 20);
const hr = jwt(300, 2, 30);
const PAST = '2025-01-15';

describe('Manager overtime entry → HR approval', () => {
  it('a direct manager entry creates an HR-stage request and writes nothing to tbl_emps_hours_edafi', async () => {
    const { sql, overtime, attendance, push } = setup();
    const res = await overtime.managerEntry({ empId: 10, date: PAST, kind: 'hours', hours: 3, reason: 'جرد آخر الشهر' }, manager);

    expect(res).toMatchObject({ queued: true, status: 'pending', stage: 'approve_hr', message: 'اتبعت للـ HR للموافقة' });
    expect(attendance.createExtraHours).not.toHaveBeenCalled();
    const row = sql.tables.hr_overtime_requests[0];
    expect(row).toMatchObject({ source: 'manager', stage: 'approve_hr', approve_direct_manager: 'yes', publisher: 200, current_to_user_id: 300, hours: 3 });
    expect(push.sendToUsers).toHaveBeenCalledWith([300], 'ساعات إضافية بانتظار موافقتك', expect.any(String), 200);
  });

  it('refuses an employee outside the manager team', async () => {
    const { overtime } = setup();
    await expect(overtime.managerEntry({ empId: 30, date: PAST, kind: 'hours', hours: 1 }, manager)).rejects.toThrow('مش ضمن فريقك');
  });

  it('HR approval records it through AttendanceService.createExtraHours (fingerprint rule applies)', async () => {
    const { sql, overtime, attendance } = setup();
    const { requestId } = await overtime.managerEntry({ empId: 10, date: PAST, hours: 2, reason: 'x' }, manager);

    // The manager cannot approve his own entry; only HR (or an admin) can.
    await expect(overtime.action(requestId!, { action: 'accept' }, manager)).rejects.toThrow();
    const final = await overtime.action(requestId!, { action: 'accept' }, hr);

    expect(final).toMatchObject({ status: 'approved', final: true, extraHoursId: 900 });
    expect(attendance.createExtraHours).toHaveBeenCalledWith(expect.objectContaining({ empId: 10, numHours: 2, edafaDate: PAST }), 300);
    expect(sql.tables.hr_overtime_requests[0]).toMatchObject({ status: 'approved', extra_hours_id: 900 });
  });

  it('an extra shift from the manager is recorded as tbl_emps_shef_edafi ttype 2 only on HR approval', async () => {
    const { prisma, overtime, attendance } = setup();
    Object.assign(prisma, { tbl_hdodr_setting: { findUnique: jest.fn(async () => ({ id: 7, title: 'مسائي' })) } });
    const { requestId } = await overtime.managerEntry({ empId: 10, date: '2030-01-01', kind: 'shift', shiftId: 7 }, manager);
    expect(attendance.createShiftSwap).not.toHaveBeenCalled();
    await overtime.action(requestId!, { action: 'accept' }, hr);
    expect(attendance.createShiftSwap).toHaveBeenCalledWith(expect.objectContaining({ empId: 10, ttype: 2, dwamIdFk: 7, sheftDate: '2030-01-01' }), 300);
  });

  it('HR entering overtime records it directly (auto-approved, logged)', async () => {
    const { sql, overtime, attendance } = setup();
    const res = await overtime.managerEntry({ empId: 10, date: PAST, hours: 2 }, hr);
    expect(res).toMatchObject({ queued: false, autoApproved: true, id: 900 });
    expect(attendance.createExtraHours).toHaveBeenCalledWith(expect.objectContaining({ empId: 10, numHours: 2 }), 300);
    expect(sql.tables.hr_overtime_requests[0]).toMatchObject({ status: 'approved', source: 'manager', extra_hours_id: 900 });
  });
});

describe('Return with comment → edit → resubmit', () => {
  it('overtime: HR returns to the manager, who edits and resubmits; it resumes at HR', async () => {
    const { sql, overtime, attendance, push } = setup();
    const { requestId } = await overtime.managerEntry({ empId: 10, date: PAST, hours: 4, reason: 'x' }, manager);

    await expect(overtime.action(requestId!, { action: 'return' }, hr)).rejects.toThrow('سبب الإرجاع');
    const ret = await overtime.action(requestId!, { action: 'return', reason: 'البصمة بتقول ساعتين بس' }, hr);
    expect(ret).toMatchObject({ status: 'returned', returnedTo: 200 });
    expect(push.sendToUsers).toHaveBeenLastCalledWith([200], expect.stringContaining('رجعلك للتعديل'), expect.stringContaining('ساعتين'), 300);

    const seen = await overtime.findOne(requestId!, manager);
    expect(seen).toMatchObject({ flowStatus: 'returned', flowStatusLabel: 'مرتجع', returnComment: 'البصمة بتقول ساعتين بس', canResubmit: true });
    await expect(overtime.action(requestId!, { action: 'accept' }, hr)).rejects.toThrow('مرتجع');

    const again = await overtime.resubmit(requestId!, { hours: 2, comment: 'اتعدلت' }, manager);
    expect(again).toMatchObject({ status: 'pending', stage: 'approve_hr' });
    expect(sql.tables.hr_overtime_requests[0]).toMatchObject({ status: 'pending', hours: 2, current_to_user_id: 300 });

    await overtime.action(requestId!, { action: 'accept' }, hr);
    expect(attendance.createExtraHours).toHaveBeenCalledWith(expect.objectContaining({ numHours: 2 }), 300);
    const actions = (await overtime.findOne(requestId!, hr)).timeline.map((t) => t.action);
    expect(actions).toEqual(['submit', 'return', 'resubmit', 'accept', 'recorded']);
  });

  it('leave: HR returns it to the employee, who edits the dates and resubmits; HR decides again', async () => {
    const { prisma, sql, leaves } = setup();
    const { id } = await leaves.create({ leaveTypeId: 3, startDate: '2026-12-01', endDate: '2026-12-05' } as never, 100, 'موظف');
    await leaves.action(id, { action: 'accept' }, 200, 'مدير', manager);
    const order = () => prisma.hr_all_agzat_orders.rows.find((r) => r.id === id)!;
    expect(order().current_to_user_id).toBe(300);

    const ret = await leaves.action(id, { action: 'return', comment: 'قلل المدة ليومين' }, 300, 'HR', hr);
    expect(ret).toMatchObject({ status: 'returned', returnedTo: 100 });
    expect(order()).toMatchObject({ current_to_user_id: 100, suspend: 1 });
    expect(order().approve_hr).not.toBe('yes');
    expect(sql.tables.hr_request_returns[0]).toMatchObject({ request_type: 'leave', stage: 'approve_hr', status: 'open' });
    await expect(leaves.action(id, { action: 'accept' }, 300, 'HR', hr)).rejects.toThrow('مرتجع');

    const employee = jwt(100, 2, 10);
    const card = await leaves.flow(id, employee);
    expect(card).toMatchObject({ flowStatus: 'returned', returnComment: 'قلل المدة ليومين', canResubmit: true, canAction: false });

    await leaves.resubmit(id, { endDate: '2026-12-02', comment: 'تمام' }, employee);
    expect(order()).toMatchObject({ agaza_to_date_m: '2026-12-02', num_days: 2, current_to_user_id: 300 });
    expect(sql.tables.hr_request_returns[0].status).toBe('resubmitted');

    await expect(leaves.action(id, { action: 'accept' }, 300, 'HR', hr)).resolves.toMatchObject({ stage: 'approve_hr', nextStage: 'approve_moder_edara' });
    const actions = (await leaves.flow(id, hr)).timeline.map((t) => t.action);
    expect(actions).toEqual(['submit', 'accept', 'return', 'resubmit', 'accept']);
  });
});

describe('HR inbox «بانتظار الموافقة»', () => {
  it('HR sees every open request (also those routed to someone else) and may act as an override', async () => {
    const { overtime, flow } = setup();
    // Employee request waiting for the direct manager (not for HR).
    await overtime.create({ date: PAST, hours: 1, reason: 'x' }, jwt(100, 2, 10));
    await overtime.managerEntry({ empId: 10, date: '2025-01-16', hours: 2 }, manager);

    const hrInbox = await flow.inbox({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, hr);
    expect(hrInbox.isHr).toBe(true);
    expect(hrInbox.total).toBe(2);
    const waitingForManager = hrInbox.data.find((i) => i.flowStatus === 'pending_manager')!;
    expect(waitingForManager).toMatchObject({ routedToMe: false, override: true, canAction: true, branchName: 'فرع 1' });

    const byStage = await flow.inbox({ page: 1, pageSize: 20, skip: 0, take: 20, stage: 'hr' } as never, hr);
    expect(byStage.data.map((i) => i.flowStatus)).toEqual(['pending_hr']);

    // Someone else only sees what is routed to them.
    const other = await flow.inbox({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, jwt(500));
    expect(other.total).toBe(0);
    const dm = await flow.inbox({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, manager);
    expect(dm.data.map((i) => i.flowStatus)).toEqual(['pending_manager']);
  });
});
