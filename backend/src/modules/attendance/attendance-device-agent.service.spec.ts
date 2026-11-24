import { BadRequestException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';

describe('AttendanceDeviceAgentService', () => {
  // Minimal in-memory stand-in for the attendance_device_punches SQL the service issues.
  const rows: Array<Record<string, any>> = [];
  let nextId = 1;
  const run = (q: { sql: string; values: unknown[] }) => {
    const sql = q.sql.replace(/\s+/g, ' ').trim();
    const v = q.values as any[];
    if (sql.startsWith('INSERT IGNORE')) {
      const [device_id, device_user_id, punch_date, punch_time, device_state, verify_type] = v;
      if (rows.some((r) => r.device_id === device_id && r.device_user_id === device_user_id
        && r.punch_date === punch_date && r.punch_time === punch_time)) return 0;
      rows.push({ id: nextId++, device_id, device_user_id, punch_date, punch_time, device_state, verify_type,
        result: 'processing', received_at: Date.now() });
      return 1;
    }
    if (sql.startsWith('SELECT id FROM')) {
      const [device_id, device_user_id, punch_date, punch_time] = v;
      return rows.filter((r) => r.device_id === device_id && r.device_user_id === device_user_id
        && r.punch_date === punch_date && r.punch_time === punch_time).map((r) => ({ id: r.id }));
    }
    if (sql.startsWith('SELECT punch_time')) {
      const [user, date, exclude] = v;
      return rows.filter((r) => r.device_user_id === user && r.punch_date === date && r.result === 'applied'
        && r.id !== exclude).map((r) => ({ punch_time: r.punch_time }));
    }
    if (sql.startsWith('UPDATE attendance_device_punches SET result')) {
      const [result, message, attendance_id, id] = v;
      Object.assign(rows.find((r) => r.id === id)!, { result, message, attendance_id });
      return 1;
    }
    if (sql.startsWith('UPDATE attendance_device_punches SET received_at')) {
      const [id, seconds] = v;
      const row = rows.find((r) => r.id === id && r.result === 'processing' && Date.now() - r.received_at > seconds * 1000);
      if (!row) return 0;
      row.received_at = Date.now();
      return 1;
    }
    if (sql.startsWith('DELETE FROM')) {
      const at = rows.findIndex((r) => r.id === v[0]);
      if (at >= 0) rows.splice(at, 1);
      return 1;
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const prisma = {
    attendance_devices: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(async (q: any) => run(q)),
    $queryRaw: jest.fn(async (q: any) => run(q)),
  };
  const attendance = { manualCheck: jest.fn() };
  const service = new AttendanceDeviceAgentService(prisma as never, attendance as never);
  const now = new Date('2026-11-24T12:00:00Z');
  const batch = (punches: Array<{ userId: string; time: string }>) => ({ deviceId: 1, punches });

  beforeEach(() => {
    jest.clearAllMocks();
    rows.length = 0;
    nextId = 1;
    prisma.attendance_devices.findUnique.mockResolvedValue({ id: 1, branch_id_fk: 3 });
    attendance.manualCheck.mockImplementation(async () => ({ id: 900, type: 'in', lateMin: 0 }));
    process.env.ATTENDANCE_AGENT_TOKEN = 'x'.repeat(32);
  });

  it('replays the punch through the attendance engine at the device time and branch', async () => {
    const res = await service.ingest(batch([{ userId: '1008', time: '2026-11-24 08:03:59' }]), now);
    expect(attendance.manualCheck).toHaveBeenCalledWith(
      { empCode: '1008', channel: 'device' }, 0, 3, { actionDate: '2026-11-24', time: '08:03' },
    );
    expect(res).toMatchObject({ applied: 1, results: [{ status: 'applied', type: 'in' }] });
    expect(rows[0]).toMatchObject({ result: 'applied', attendance_id: 900 });
    expect(prisma.attendance_devices.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'online' }),
    }));
  });

  it('processes oldest first and skips a punch it already handled', async () => {
    const p = [{ userId: '7', time: '2026-11-24 17:00:00' }, { userId: '7', time: '2026-11-24 08:00:00' }];
    await service.ingest(batch(p), now);
    expect(attendance.manualCheck.mock.calls.map((c) => c[3].time)).toEqual(['08:00', '17:00']);
    const again = await service.ingest(batch(p), now);
    expect(again).toMatchObject({ duplicate: 2, applied: 0 });
    expect(attendance.manualCheck).toHaveBeenCalledTimes(2);
  });

  it('ignores a second scan within two minutes', async () => {
    const res = await service.ingest(batch([
      { userId: '7', time: '2026-11-24 08:00:00' },
      { userId: '7', time: '2026-11-24 08:01:30' },
    ]), now);
    expect(res).toMatchObject({ applied: 1, ignored: 1 });
    expect(attendance.manualCheck).toHaveBeenCalledTimes(1);
  });

  it('records engine rejections and asks the agent to retry transient failures', async () => {
    attendance.manualCheck
      .mockRejectedValueOnce(new NotFoundException('الموظف غير موجود'))
      .mockRejectedValueOnce(new Error('db down'));
    const res = await service.ingest(batch([
      { userId: '1', time: '2026-11-24 08:00:00' },
      { userId: '2', time: '2026-11-24 08:00:00' },
    ]), now);
    expect(res.results.map((r) => [r.userId, r.status, r.message])).toEqual([
      ['1', 'rejected', 'الموظف غير موجود'],
      ['2', 'retry', 'db down'],
    ]);
    expect(rows.map((r) => [r.device_user_id, r.result])).toEqual([['1', 'rejected']]);
  });

  it('treats a busy punch lock as transient', async () => {
    attendance.manualCheck.mockRejectedValueOnce(new BadRequestException('يوجد طلب بصمة آخر قيد التنفيذ، حاول مرة أخرى بعد لحظات'));
    const res = await service.ingest(batch([{ userId: '1', time: '2026-11-24 08:00:00' }]), now);
    expect(res.results[0].status).toBe('retry');
    expect(rows).toHaveLength(0);
  });

  it('rejects non-numeric ids, impossible dates and very old punches without punching', async () => {
    const res = await service.ingest(batch([
      { userId: 'abc', time: '2026-11-24 08:00:00' },
      { userId: '5', time: '2026-02-30 08:00:00' },
      { userId: '5', time: '2026-09-01 08:00:00' },
    ]), now);
    expect(res.results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(attendance.manualCheck).not.toHaveBeenCalled();
  });

  it('takes over a punch left in "processing" by a request that died, but not a fresh one', async () => {
    rows.push({ id: 50, device_id: 1, device_user_id: '9', punch_date: '2026-11-24', punch_time: '07:00:00',
      result: 'processing', received_at: Date.now() - 10 * 60 * 1000 });
    rows.push({ id: 51, device_id: 1, device_user_id: '9', punch_date: '2026-11-24', punch_time: '07:30:00',
      result: 'processing', received_at: Date.now() });
    const res = await service.ingest(batch([
      { userId: '9', time: '2026-11-24 07:00:00' },
      { userId: '9', time: '2026-11-24 07:30:00' },
    ]), now);
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'duplicate']);
    expect(attendance.manualCheck).toHaveBeenCalledTimes(1);
  });

  it('refuses unknown devices', async () => {
    prisma.attendance_devices.findUnique.mockResolvedValue(null);
    await expect(service.ingest(batch([]), now)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('agent token', () => {
    it('accepts only the configured token', () => {
      expect(() => service.assertAgentToken('x'.repeat(32))).not.toThrow();
      expect(() => service.assertAgentToken('y'.repeat(32))).toThrow(UnauthorizedException);
      expect(() => service.assertAgentToken(undefined)).toThrow(UnauthorizedException);
    });

    it('is disabled when no strong token is configured', () => {
      process.env.ATTENDANCE_AGENT_TOKEN = 'short';
      expect(() => service.assertAgentToken('short')).toThrow(ServiceUnavailableException);
      delete process.env.ATTENDANCE_AGENT_TOKEN;
      expect(() => service.assertAgentToken('')).toThrow(ServiceUnavailableException);
    });
  });
});
