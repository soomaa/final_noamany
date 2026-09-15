import { ClubClassesService } from './club-classes.service';

describe('ClubClassesService barcode attendance', () => {
  it('resolves a scanned member code and creates walk-in attendance without a booking', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 9, member_code: '1001', is_active: true, is_deleted: false }),
      },
      club_class_enrollments: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ClubClassesService(prisma as never, {} as never, {} as never, {} as never) as unknown as {
      checkInByBarcode: (classId: number, memberCode: string) => Promise<{ memberId: number }>;
      enrollMember: jest.Mock;
      updateAttendance: jest.Mock;
    };
    service.enrollMember = jest.fn().mockResolvedValue({});
    service.updateAttendance = jest.fn().mockResolvedValue({ memberId: 9 });

    await expect(service.checkInByBarcode(21, '1001')).resolves.toEqual({ memberId: 9 });
    expect(service.enrollMember).toHaveBeenCalledWith(21, 9, { bookingSource: 'barcode' });
    expect(service.updateAttendance).toHaveBeenCalledWith(21, 9, expect.objectContaining({ attendanceStatus: 'attended' }));
  });

  it('resolves the single class currently running in the scanner user branch', async () => {
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue({ branch_id_fk: 2 }) },
      club_classes: { findMany: jest.fn().mockResolvedValue([{ id: 21 }]) },
    };
    const service = new ClubClassesService(prisma as never, {} as never, {} as never, {} as never) as unknown as {
      checkInByCurrentBarcode: (memberCode: string, userId: number) => Promise<{ classId: number }>;
      checkInByBarcode: jest.Mock;
    };
    service.checkInByBarcode = jest.fn().mockResolvedValue({ classId: 21 });

    await expect(service.checkInByCurrentBarcode('1001', 7)).resolves.toEqual({ classId: 21 });
    expect(prisma.users.findUnique).toHaveBeenCalledWith({ where: { user_id: 7 }, select: { branch_id_fk: true } });
    expect(prisma.club_classes.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: 2, is_deleted: false, is_active: true }),
    }));
    expect(service.checkInByBarcode).toHaveBeenCalledWith(21, '1001');
  });
});
