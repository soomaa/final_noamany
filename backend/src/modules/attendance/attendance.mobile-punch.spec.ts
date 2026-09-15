import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AttendanceService } from './attendance.service';

describe('AttendanceService mobile GPS punch', () => {
  const prisma = {
    employees: { findUnique: jest.fn() },
    tbl_branches: { findUnique: jest.fn(), findFirst: jest.fn() },
    branch_settings: { findFirst: jest.fn(), findMany: jest.fn() },
    mobile_offline_attendance_sync: {
      findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
  };
  const service = new AttendanceService(prisma as never);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prisma.employees.findUnique.mockResolvedValue({ id: 8, emp_code: 1008, branch_id_fk: 3, emp_sign: '3' });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_id: 3, branch_name: 'الفرع الرئيسي' });
    prisma.branch_settings.findFirst.mockResolvedValue({
      id: 3,
      title: 'الفرع الرئيسي',
      lat_map: '30.0444',
      long_map: '31.2357',
      distance: 100,
    });
  });

  it('syncs an offline check-in at its captured time and marks it for review', async () => {
    prisma.mobile_offline_attendance_sync.findUnique.mockResolvedValue(null);
    prisma.mobile_offline_attendance_sync.create.mockResolvedValue({ id: 91 });
    prisma.mobile_offline_attendance_sync.update.mockResolvedValue({});
    const punch = jest.spyOn(service, 'mobilePunch').mockResolvedValue({
      id: 55, type: 'in', lateMin: 0, branchId: 3, branchName: 'الفرع الرئيسي', distanceMeters: 0,
    });

    const result = await (service as any).syncOfflinePunch(
      { sub: 11, emp_code: 8 } as never,
      {
        offlineId: '6c2d91fd-4637-4172-8e78-4c2f1bfe1c58',
        capturedAtUtc: '2026-08-23T20:15:00.000Z',
        timezone: 'Africa/Cairo',
        lat: '30.0444',
        long: '31.2357',
      },
      new Date('2026-08-23T21:00:00.000Z'),
    );

    expect(punch).toHaveBeenCalledWith(
      { sub: 11, emp_code: 8 },
      { lat: '30.0444', long: '31.2357', photo: undefined },
      { actionDate: '2026-08-23', time: '11:15 PM' },
    );
    expect(result).toEqual(expect.objectContaining({
      id: 55,
      offlineId: '6c2d91fd-4637-4172-8e78-4c2f1bfe1c58',
      capturedAtDevice: '2026-08-23T20:15:00.000Z',
      receivedAtServer: '2026-08-23T21:00:00.000Z',
      requiresReview: true,
      replayed: false,
    }));
  });

  it('replays the stored result for the same user and offlineId without punching again', async () => {
    const payloadHash = createHash('sha256').update(JSON.stringify({
      capturedAtUtc: '2026-08-23T20:15:00.000Z', timezone: 'Africa/Cairo', lat: '30.0444', long: '31.2357', photo: null,
    })).digest('hex');
    prisma.mobile_offline_attendance_sync.findUnique.mockResolvedValue({
      payload_hash: payloadHash,
      state: 'completed',
      result_json: { id: 55, type: 'in', replayed: false },
    });
    const punch = jest.spyOn(service, 'mobilePunch');

    const result = await (service as any).syncOfflinePunch(
      { sub: 11, emp_code: 8 } as never,
      {
        offlineId: '6c2d91fd-4637-4172-8e78-4c2f1bfe1c58',
        capturedAtUtc: '2026-08-23T20:15:00.000Z', timezone: 'Africa/Cairo', lat: '30.0444', long: '31.2357',
      },
      new Date('2026-08-23T21:00:00.000Z'),
    );

    expect(punch).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 55, type: 'in', replayed: true });
  });

  it('rejects reuse of offlineId with a different payload', async () => {
    prisma.mobile_offline_attendance_sync.findUnique.mockResolvedValue({
      payload_hash: 'a'.repeat(64), state: 'completed', result_json: { id: 55 },
    });

    await expect((service as any).syncOfflinePunch(
      { sub: 11, emp_code: 8 } as never,
      {
        offlineId: '6c2d91fd-4637-4172-8e78-4c2f1bfe1c58',
        capturedAtUtc: '2026-08-23T20:15:00.000Z', timezone: 'Africa/Cairo', lat: '30.0444', long: '31.2357',
      },
      new Date('2026-08-23T21:00:00.000Z'),
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('binds the punch to the authenticated employee and verified branch', async () => {
    const check = jest
      .spyOn(service, 'manualCheck')
      .mockResolvedValue({ id: 55, type: 'in', lateMin: 0 });

    const result = await service.mobilePunch(
      { sub: 11, emp_code: 8 } as never,
      { lat: '30.0444', long: '31.2357' },
    );

    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ empCode: '1008', channel: 'app' }),
      11,
      3,
      undefined,
      3,
    );
    expect(result).toEqual(expect.objectContaining({ branchId: 3, distanceMeters: 0 }));
    expect(prisma.tbl_branches.findUnique).toHaveBeenCalledWith({ where: { branch_id: 3 } });
    expect(prisma.branch_settings.findFirst).toHaveBeenCalledWith({ where: { title: 'الفرع الرئيسي' } });
  });

  it('rejects a punch outside the branch geofence', async () => {
    await expect(
      service.mobilePunch(
        { sub: 11, emp_code: 8 } as never,
        { lat: '30.1000', long: '31.3000' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the fingerprint branch instead of the employee home branch for check-in and check-out', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 8, emp_code: 1008, branch_id_fk: 1, emp_sign: '2' });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_id: 2, branch_name: 'فرع البصمة' });
    prisma.branch_settings.findFirst.mockResolvedValue({
      id: 2,
      title: 'فرع البصمة',
      lat_map: '30.0444',
      long_map: '31.2357',
      distance: 100,
    });
    const check = jest
      .spyOn(service, 'manualCheck')
      .mockResolvedValueOnce({ id: 57, type: 'in', lateMin: 0 })
      .mockResolvedValueOnce({ id: 57, type: 'out', mobakerMin: 0, overtimeMin: 0 });

    const punch = { lat: '30.0444', long: '31.2357' };
    await service.mobilePunch({ sub: 11, emp_code: 8 } as never, punch);
    await service.mobilePunch({ sub: 11, emp_code: 8 } as never, punch);

    expect(check).toHaveBeenNthCalledWith(1, expect.objectContaining({ empCode: '1008' }), 11, 2, undefined, 2);
    expect(check).toHaveBeenNthCalledWith(2, expect.objectContaining({ empCode: '1008' }), 11, 2, undefined, 2);
    expect(prisma.tbl_branches.findUnique).toHaveBeenCalledWith({ where: { branch_id: 2 } });
    expect(prisma.branch_settings.findFirst).toHaveBeenCalledWith({ where: { title: 'فرع البصمة' } });
  });

  it('allows an administration employee to punch at the nearest configured branch', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 8, emp_code: 1008, branch_id_fk: 1, emp_sign: 'all' });
    prisma.branch_settings.findMany.mockResolvedValue([
      { id: 1, title: 'فرع بعيد', lat_map: '30.1000', long_map: '31.3000', distance: 100 },
      // Settings IDs and canonical branch IDs are different tables/keys.
      { id: 17, title: 'الفرع الرئيسي', lat_map: '30.0444', long_map: '31.2357', distance: 100 },
    ]);
    prisma.tbl_branches.findFirst.mockResolvedValue({ branch_id: 3, branch_name: 'الفرع الرئيسي' });
    const check = jest
      .spyOn(service, 'manualCheck')
      .mockResolvedValue({ id: 56, type: 'in', lateMin: 0 });

    const result = await service.mobilePunch(
      { sub: 11, emp_code: 8 } as never,
      { lat: '30.0444', long: '31.2357' },
    );

    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ empCode: '1008', channel: 'app' }),
      11,
      3,
      undefined,
      3,
    );
    expect(result).toEqual(expect.objectContaining({ branchId: 3, branchName: 'الفرع الرئيسي' }));
  });

  it('uses administration schedule scope when an employee has no fingerprint location', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 8, emp_code: 1008, branch_id_fk: 1, emp_sign: null });
    prisma.branch_settings.findMany.mockResolvedValue([
      { id: 17, title: 'الفرع الرئيسي', lat_map: '30.0444', long_map: '31.2357', distance: 100 },
    ]);
    prisma.tbl_branches.findFirst.mockResolvedValue({ branch_id: 3, branch_name: 'الفرع الرئيسي' });
    const check = jest.spyOn(service, 'manualCheck').mockResolvedValue({ id: 58, type: 'in', lateMin: 0 });

    const result = await service.mobilePunch(
      { sub: 11, emp_code: 8 } as never,
      { lat: '30.0444', long: '31.2357' },
    );

    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ empCode: '1008', channel: 'app' }),
      11,
      3,
      undefined,
      0,
    );
    expect(result).toEqual(expect.objectContaining({ branchId: 3, branchName: 'الفرع الرئيسي' }));
  });

  it('rejects an app punch when the employee has only a legacy schedule', async () => {
    const legacyShift = {
      id: 10,
      title: 'legacy',
      hdoor_from_time: '01:00 PM',
      hdoor_to_time: '02:00 PM',
      hdoor_khasm_from: '01:00 PM',
      ensraf_from_time: '08:00 PM',
      ensraf_to_time: '09:00 PM',
      ensraf_khasm_from: '08:00 PM',
    };
    const legacyOnlyPrisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 8, emp_code: 1008, branch_id_fk: 3, emp_sign: '3' }) },
      attendance_channels: { findMany: jest.fn().mockResolvedValue([]) },
      attendance_rules: { findMany: jest.fn().mockResolvedValue([]) },
      hr_emp_dwam: { findFirst: jest.fn().mockResolvedValue({ id: 80, emp_id: 8, always_id_fk: 10 }) },
      tbl_hdoor_dawms_emps: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdodr_setting: {
        findFirst: jest.fn().mockResolvedValue(legacyShift),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ hodoor_id: 90 }),
        update: jest.fn().mockResolvedValue({ hodoor_id: 90 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
      $transaction: jest.fn(async (callback) => callback(legacyOnlyPrisma)),
    };
    const legacyService = new AttendanceService(legacyOnlyPrisma as never);

    await expect((legacyService.manualCheck as any)(
      { empCode: '1008', type: 'in', channel: 'app' },
      11,
      3,
      { actionDate: '2026-08-26', time: '01:30 PM' },
      3,
    )).rejects.toThrow('لا يوجد دوام مسجل لهذا الموظف في موقع البصمة');
  });
});
