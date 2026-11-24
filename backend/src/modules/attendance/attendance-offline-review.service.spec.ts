import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AttendanceOfflineReviewService } from './attendance-offline-review.service';

describe('AttendanceOfflineReviewService', () => {
  // 08:05 Cairo (UTC+2) captured offline, synced 3 hours later.
  const sync = (over: Record<string, unknown> = {}) => ({
    id: 11,
    user_id: 70,
    state: 'completed',
    captured_at_device: new Date('2026-11-24T06:05:00.000Z'),
    captured_timezone: 'Africa/Cairo',
    received_at_server: new Date('2026-11-24T09:05:00.000Z'),
    attendance_id: 500,
    result_json: { id: 500, type: 'in', lateMin: 5, branchId: 3, branchName: 'فرع المعادي', distanceMeters: 90 },
    ...over,
  });
  let record: Record<string, any> | null;
  let history: Array<Record<string, any>>;
  let reviews: Map<number, Record<string, any>>;
  const sqlLog: string[] = [];

  const tx = {
    tbl_hdoor_emps: {
      findUnique: jest.fn(async () => record && { ...record }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const match = record && Object.entries(where).every(([k, v]) => record![k] === v);
        if (match) record = null;
        return { count: match ? 1 : 0 };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const match = record && Object.entries(where).every(([k, v]) => record![k] === v);
        if (match) Object.assign(record!, data);
        return { count: match ? 1 : 0 };
      }),
    },
    tbl_hdoor_emps_history: {
      findFirst: jest.fn(async ({ where }: any) =>
        history.find((h) => Object.entries(where).every(([k, v]) => h[k] === v)) ?? null),
      delete: jest.fn(async ({ where }: any) => { history = history.filter((h) => h.hodoor_id !== where.hodoor_id); }),
    },
    $executeRaw: jest.fn(async (q: any) => {
      const sql = q.sql.replace(/\s+/g, ' ').trim();
      sqlLog.push(sql);
      const [id] = q.values;
      reviews.set(id, { sync_id: id, decision: sql.includes("'rejected'") ? 'rejected' : 'approved',
        reason: sql.includes("'rejected'") ? q.values[1] : null, reviewed_by_name: 'HR', reviewed_at: new Date() });
      return 1;
    }),
  };
  const prisma = {
    ...tx,
    mobile_offline_attendance_sync: { findUnique: jest.fn(), findMany: jest.fn() },
    users: { findMany: jest.fn(async () => [{ user_id: 70, emp_code: 7, name: 'user' }]) },
    employees: { findMany: jest.fn(async () => [{ id: 7, emp_code: 1008, employee: 'أحمد', branch_id_fk: 3 }]) },
    tbl_branches: { findMany: jest.fn(async () => [{ branch_id: 3, branch_name: 'فرع المعادي' }]) },
    branch_settings: { findMany: jest.fn(async () => [{ title: 'فرع المعادي', distance: 100 }]) },
    $queryRaw: jest.fn(async () => [...reviews.values()]),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  prisma.tbl_hdoor_emps = {
    ...tx.tbl_hdoor_emps,
    findMany: jest.fn(async () => (record ? [{ ...record }] : [])),
  } as never;
  const attendance = { managerStaffCodes: jest.fn(async () => null) };
  const service = new AttendanceOfflineReviewService(prisma as never, attendance as never);
  const hr = { sub: 2, level: 1, name: 'HR', branch: 0 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    reviews = new Map();
    sqlLog.length = 0;
    record = { hodoor_id: 500, member_code: 1008, action_date: '2026-11-24', hdoor_time: '08:05 AM', ensraf_time: null,
      late_min: 5, mobaker_min: null, branch_id_fk: 3, hdoor_lat: '30.1', hdoor_long: '31.2', hdoor_img_path: '/x.jpg' };
    history = [{ hodoor_id: 900, member_code: 1008, action_date: '2026-11-24', action_time: '08:05 AM', ttype: 'hdoor' }];
    prisma.mobile_offline_attendance_sync.findUnique.mockResolvedValue(sync());
    prisma.mobile_offline_attendance_sync.findMany.mockResolvedValue([sync()]);
  });

  it('lists the punch with device vs sync time and flags a late sync near the geofence edge', async () => {
    const res = await service.list({ dateFrom: '2026-11-24', dateTo: '2026-11-24' }, hr);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      empCode: 1008, employeeName: 'أحمد', branchName: 'فرع المعادي', type: 'in', actionDate: '2026-11-24',
      punchTime: '08:05 AM', currentTime: '08:05 AM', delayMinutes: 180, distanceMeters: 90, radiusMeters: 100,
      flags: ['late_sync', 'near_geofence_edge'], review: null,
    });
    expect(res.counters).toMatchObject({ pending: 1, suspicious: 1 });
  });

  it('rejecting a check-in with no check-out deletes the attendance row and its history line', async () => {
    const res = await service.reject(11, 'وقت الموبايل غير صحيح', hr);
    expect(res).toMatchObject({ id: 11, effect: 'deleted' });
    expect(record).toBeNull();
    expect(history).toHaveLength(0);
    expect(reviews.get(11)).toMatchObject({ decision: 'rejected', reason: 'وقت الموبايل غير صحيح' });
  });

  it('rejecting a check-out clears only the departure and keeps the arrival', async () => {
    record = { ...record!, ensraf_time: '05:10 PM', mobaker_min: 0, num_min: 10, ensraf_lat: '1', ensraf_long: '2' };
    history = [{ hodoor_id: 901, member_code: 1008, action_date: '2026-11-24', action_time: '05:10 PM', ttype: 'ensraf' }];
    prisma.mobile_offline_attendance_sync.findUnique.mockResolvedValue(sync({
      captured_at_device: new Date('2026-11-24T15:10:00.000Z'),
      received_at_server: new Date('2026-11-24T15:20:00.000Z'),
      result_json: { id: 500, type: 'out', branchId: 3, branchName: 'فرع المعادي', distanceMeters: 20 },
    }));
    const res = await service.reject(11, 'بصمة من خارج الفرع', hr);
    expect(res.effect).toBe('cleared');
    expect(record).toMatchObject({ hdoor_time: '08:05 AM', ensraf_time: null, num_min: null, ensraf_lat: null, ttype: 'hdoor' });
    expect(history).toHaveLength(0);
  });

  it('refuses to reject a punch whose time was edited after the sync', async () => {
    record!.hdoor_time = '09:00 AM';
    await expect(service.reject(11, 'سبب الرفض', hr)).rejects.toBeInstanceOf(ConflictException);
    expect(record).not.toBeNull();
    expect(reviews.size).toBe(0);
  });

  it('bulk-approves but never re-approves a rejected punch, and refuses out-of-branch reviewers', async () => {
    reviews.set(12, { sync_id: 12, decision: 'rejected', reason: 'x', reviewed_by_name: 'HR', reviewed_at: new Date() });
    prisma.mobile_offline_attendance_sync.findMany.mockResolvedValue([sync(), sync({ id: 12 })]);
    const res = await service.approve([11, 12], hr);
    expect(res).toMatchObject({ approved: 1, skipped: [{ id: 12 }] });
    expect(reviews.get(11)?.decision).toBe('approved');

    const otherBranch = { sub: 9, level: 3, branch: 6, name: 'مدير' } as never;
    await expect(service.reject(11, 'سبب الرفض', otherBranch)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
