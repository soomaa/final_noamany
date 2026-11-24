import { NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';

/** Builds an XLSX in the legacy 10-column device layout. */
async function xlsx(rows: unknown[][]): Promise<Express.Multer.File> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['No.', 'Name', 'Date', 'On duty', 'Off duty', 'Clock In', 'Clock Out', 'Absent', 'Work Time', 'Department']);
  for (const row of rows) sheet.addRow(row);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { originalname: 'device.xlsx', buffer } as Express.Multer.File;
}

describe('AttendanceDeviceAgentService.importFile (Excel device export)', () => {
  // In-memory stand-in for attendance_device_punches.
  const rows: Array<Record<string, any>> = [];
  let nextId = 1;
  const run = (q: { sql: string; values: unknown[] }) => {
    const sql = q.sql.replace(/\s+/g, ' ').trim();
    const v = q.values as any[];
    const same = (r: Record<string, any>, [d, u, pd, pt]: any[]) =>
      r.device_id === d && r.device_user_id === u && r.punch_date === pd && r.punch_time === pt;
    if (sql.startsWith('INSERT IGNORE')) {
      if (rows.some((r) => same(r, v))) return 0;
      rows.push({ id: nextId++, device_id: v[0], device_user_id: v[1], punch_date: v[2], punch_time: v[3],
        device_state: v[4], result: 'processing', received_at: Date.now() });
      return 1;
    }
    if (sql.startsWith('SELECT id FROM')) return rows.filter((r) => same(r, v)).map((r) => ({ id: r.id }));
    if (sql.startsWith('SELECT punch_time')) {
      const [user, date, exclude] = v;
      return rows.filter((r) => r.device_user_id === user && r.punch_date === date && r.result === 'applied'
        && r.id !== exclude).map((r) => ({ punch_time: r.punch_time }));
    }
    if (sql.startsWith('UPDATE attendance_device_punches SET result = \'processing\'')) {
      const row = rows.find((r) => r.id === v[0] && r.result === 'rejected');
      if (!row) return 0;
      row.result = 'processing';
      return 1;
    }
    if (sql.startsWith('UPDATE attendance_device_punches SET result')) {
      const [result, message, attendance_id, id] = v;
      Object.assign(rows.find((r) => r.id === id)!, { result, message, attendance_id });
      return 1;
    }
    if (sql.startsWith('UPDATE attendance_device_punches SET received_at')) return 0;
    if (sql.startsWith('DELETE FROM')) {
      const at = rows.findIndex((r) => r.id === v[0]);
      if (at >= 0) rows.splice(at, 1);
      return 1;
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const prisma = {
    attendance_devices: { findUnique: jest.fn(), update: jest.fn() },
    employees: { findMany: jest.fn() },
    $executeRaw: jest.fn(async (q: any) => run(q)),
    $queryRaw: jest.fn(async (q: any) => run(q)),
  };
  const attendance = { manualCheck: jest.fn() };
  const service = new AttendanceDeviceAgentService(prisma as never, attendance as never);
  // 14:00 Cairo on 24 Nov 2026.
  const now = new Date('2026-11-24T12:00:00Z');
  const admin = { sub: 5, level: 1, is_super_admin: true, branch: 0 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    rows.length = 0;
    nextId = 1;
    prisma.employees.findMany.mockImplementation(async ({ where }: any) =>
      where.emp_code.in.filter((c: number) => [1008, 1009].includes(c)).map((c: number) => ({ emp_code: c, branch_id_fk: 3 })));
    let id = 100;
    attendance.manualCheck.mockImplementation(async (_body: unknown, _user: unknown, _branch: unknown, clock: any) =>
      ({ id: id++, type: clock.time < '12:00' ? 'in' : 'out' }));
  });

  it('replays actual in/out through the engine at the file date/time, overnight out on the next day', async () => {
    const file = await xlsx([
      [1008, 'أحمد', '23/11/2026', '09:00', '17:00', '08:58', '17:05', '', 8, 'الاستقبال'],
      [1009, 'منى', '23/11/2026', '16:00', '00:00', '04:02 PM', '00:10', '', 8, 'الاستقبال'],
      [1008, 'أحمد', '22/11/2026', '09:00', '17:00', '', '', 'True', 0, 'الاستقبال'],
    ]);
    const res = await service.importFile(file, admin, undefined, now);

    expect(attendance.manualCheck.mock.calls.map((c) => [c[0].empCode, c[3].actionDate, c[3].time])).toEqual([
      ['1008', '2026-11-23', '08:58'],
      ['1009', '2026-11-23', '16:02'],
      ['1008', '2026-11-23', '17:05'],
      ['1009', '2026-11-24', '00:10'],
    ]);
    expect(attendance.manualCheck.mock.calls[0]).toEqual([{ empCode: '1008', channel: 'device' }, 5, undefined, expect.anything()]);
    expect(res).toMatchObject({ received: 4, applied: 4, duplicate: 0, rejected: 0, emptyRows: 1 });
    expect(rows.every((r) => r.device_id === 0 && r.result === 'applied')).toBe(true);
  });

  it('uses the chosen device branch', async () => {
    prisma.attendance_devices.findUnique.mockResolvedValue({ id: 4, branch_id_fk: 7 });
    await service.importFile(await xlsx([[1008, 'أحمد', '2026-11-23', '', '', '08:58', '', '', 0, '']]), admin, 4, now);
    expect(attendance.manualCheck.mock.calls[0][2]).toBe(7);
    expect(rows[0].device_id).toBe(4);
    prisma.attendance_devices.findUnique.mockResolvedValue(null);
    await expect(service.importFile(await xlsx([]), admin, 9, now)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports a re-upload and a punch the device agent already sent as duplicates', async () => {
    rows.push({ id: nextId++, device_id: 1, device_user_id: '1009', punch_date: '2026-11-23', punch_time: '08:59:40',
      result: 'applied', received_at: Date.now() });
    const file = await xlsx([
      [1008, 'أحمد', '23/11/2026', '', '', '08:58', '', '', 0, ''],
      [1009, 'منى', '23/11/2026', '', '', '08:59', '', '', 0, ''],
    ]);
    const first = await service.importFile(file, admin, undefined, now);
    expect(first).toMatchObject({ applied: 1, duplicate: 1 });
    expect(first.results.find((r) => r.empCode === '1009')?.message).toContain('مسجلة بالفعل');

    const again = await service.importFile(file, admin, undefined, now);
    expect(again).toMatchObject({ applied: 0, duplicate: 2 });
    expect(attendance.manualCheck).toHaveBeenCalledTimes(1);
  });

  it('treats "already recorded" engine refusals as duplicates', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    attendance.manualCheck.mockRejectedValueOnce(new BadRequestException('لقد سجلت حضورك بالفعل، انتظر ساعة على الأقل لتسجيل انصراف'));
    const res = await service.importFile(await xlsx([[1008, 'أحمد', '23/11/2026', '', '', '08:58', '', '', 0, '']]), admin, undefined, now);
    expect(res).toMatchObject({ duplicate: 1, rejected: 0 });
  });

  it('rejects unknown employee codes and unreadable cells with a reason, without punching', async () => {
    const res = await service.importFile(await xlsx([
      [4242, 'مجهول', '23/11/2026', '', '', '08:00', '', '', 0, ''],
      [1008, 'أحمد', '31/02/2026', '', '', '08:00', '', '', 0, ''],
      [1008, 'أحمد', '23/11/2026', '', '', '8h', '', '', 0, ''],
    ]), admin, undefined, now);
    expect(res.results.map((r) => [r.empCode, r.status, r.message])).toEqual([
      ['4242', 'rejected', 'كود الموظف غير موجود في النظام'],
      ['1008', 'rejected', 'تاريخ غير مقروء في العمود الثالث'],
      ['1008', 'rejected', 'وقت الحضور الفعلي غير مقروء'],
    ]);
    expect(attendance.manualCheck).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('retries punches the engine refused before when the file is uploaded again', async () => {
    attendance.manualCheck.mockRejectedValueOnce(new NotFoundException('لا يوجد دوام'));
    const file = await xlsx([[1008, 'أحمد', '23/11/2026', '', '', '08:58', '', '', 0, '']]);
    expect(await service.importFile(file, admin, undefined, now)).toMatchObject({ rejected: 1 });
    expect(await service.importFile(file, admin, undefined, now)).toMatchObject({ applied: 1 });
  });

  it('keeps branch-scoped importers to their own branches', async () => {
    const manager = { sub: 9, level: 3, branch: 5, man_women_type: 3 } as never;
    const res = await service.importFile(await xlsx([[1008, 'أحمد', '23/11/2026', '', '', '08:58', '', '', 0, '']]), manager, undefined, now);
    expect(res.results[0]).toMatchObject({ status: 'rejected', message: 'الموظف من فرع خارج صلاحياتك' });
    expect(attendance.manualCheck).not.toHaveBeenCalled();
  });
});
