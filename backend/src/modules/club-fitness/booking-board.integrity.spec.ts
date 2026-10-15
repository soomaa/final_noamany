import { BadRequestException } from '@nestjs/common';
import { BookingBoardService } from './booking-board.service';

describe('booking board integrity', () => {
  const slot = { trainerId: 1, branchId: 1, date: '2026-10-20', startTime: '10:00', endTime: '11:00', className: 'حصة تجريبية' };
  function setup(enrolled: number) {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_enrollments: { count: jest.fn().mockResolvedValue(enrolled) },
      club_classes: { update: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const classes = { create: jest.fn().mockResolvedValue({ id: 42 }), enrollMember: jest.fn().mockRejectedValue(new BadRequestException('الرصيد غير كاف')) };
    const service = new BookingBoardService(prisma as never, { isBranchAllowed: () => true } as never, classes as never);
    return { service, tx, classes };
  }
  it('preserves another member booking when enrollment of the original requester fails', async () => {
    const f = setup(1);
    await expect(f.service.quickBook({ memberId: 1, slot })).rejects.toThrow('الرصيد');
    expect(f.tx.club_classes.update).not.toHaveBeenCalled();
  });
  it('cleans up a failed quick booking only when the new session is still empty', async () => {
    const f = setup(0);
    await expect(f.service.quickBook({ memberId: 1, slot })).rejects.toThrow('الرصيد');
    expect(f.tx.club_classes.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { is_deleted: true } });
  });
  it('rejects invalid calendar dates before materializing a new session', async () => {
    const f = setup(0);
    await expect(f.service.quickBook({ memberId: 1, slot: { ...slot, date: '2027-02-30' } })).rejects.toThrow('تاريخ');
    expect(f.classes.create).not.toHaveBeenCalled();
  });
});
