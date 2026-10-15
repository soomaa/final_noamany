import { UnauthorizedException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { hashAttendanceDeviceKey } from './attendance-device-ingest.util';

describe('AttendanceService device event ingestion', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(existingEvent: Record<string, unknown> | null = null) {
    const tx = {
      attendance_device_events: {
        findUnique: jest.fn().mockResolvedValue(existingEvent),
        create: jest.fn().mockResolvedValue({ id: 90 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      attendance_devices: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          credential_hash: hashAttendanceDeviceKey('device-secret'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new AttendanceService(prisma as never, { get: jest.fn() } as never);
    jest.spyOn(service, 'recordPunch').mockResolvedValue({ id: 31, type: 'in', lateMin: 0 });
    return { service, prisma, tx };
  }

  const payload = {
    events: [{
      eventId: 'zk-20260826-0001',
      empCode: '1001',
      occurredAt: '2026-08-26T06:15:00.000Z',
      type: 'in' as const,
    }],
  };

  it('rejects an invalid device key', async () => {
    const { service } = setup();
    await expect(service.ingestDeviceEvents(4, 'wrong', payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deduplicates provider event ids and does not project them twice', async () => {
    const { service } = setup({ id: 90, status: 'processed', attendance_record_id: 31 });
    await expect(service.ingestDeviceEvents(4, 'device-secret', payload)).resolves.toEqual({
      received: 1,
      imported: 0,
      duplicates: 1,
      rejected: 0,
    });
    expect(service.recordPunch).not.toHaveBeenCalled();
  });

  it('projects a new event and advances last_sync only after success', async () => {
    const { service, prisma, tx } = setup();
    await expect(service.ingestDeviceEvents(4, 'device-secret', payload)).resolves.toEqual({
      received: 1,
      imported: 1,
      duplicates: 0,
      rejected: 0,
    });
    expect(tx.attendance_device_events.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: expect.objectContaining({ status: 'processed', attendance_record_id: 31 }),
    });
    expect(prisma.attendance_devices.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({ last_sync: '2026-08-26T06:15:00.000Z' }),
    });
  });
});
