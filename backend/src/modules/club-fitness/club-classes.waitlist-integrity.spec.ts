import { BadRequestException } from '@nestjs/common';
import { ClubClassesService } from './club-classes.service';
import { eligibleEnrollmentSource } from './class-enrollment-entitlement';
jest.mock('./class-enrollment-entitlement', () => ({ eligibleEnrollmentSource: jest.fn() }));

describe('waitlist promotion entitlement integrity', () => {
  it('skips an ineligible member and persists the eligible member subscription', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_classes: { findUnique: jest.fn().mockResolvedValue({ id: 4, class_date: '2099-10-01', status: 'scheduled', max_capacity: 5 }) },
      club_class_waitlist: { findMany: jest.fn().mockResolvedValue([{ id: 1, member_id: 10 }, { id: 2, member_id: 11 }]), update: jest.fn() },
      club_class_enrollments: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    (eligibleEnrollmentSource as jest.Mock).mockRejectedValueOnce(new BadRequestException('frozen')).mockResolvedValueOnce(44);
    const service: any = Object.create(ClubClassesService.prototype);
    expect(await service.promoteWaitlist(4, tx)).toBe(true);
    expect(tx.club_class_waitlist.update).toHaveBeenNthCalledWith(1, { where: { id: 1 }, data: { status: 'cancelled' } });
    expect(tx.club_class_enrollments.create).toHaveBeenCalledWith({ data: expect.objectContaining({ member_id: 11, subscription_id: 44, attendance_status: 'registered' }) });
    expect(tx.club_class_waitlist.update).toHaveBeenLastCalledWith({ where: { id: 2 }, data: { status: 'promoted' } });
  });
});
