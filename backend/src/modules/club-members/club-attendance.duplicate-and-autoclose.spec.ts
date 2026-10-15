import { BadRequestException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

/**
 * Two defects found in production data: reception staff pressing check-in twice created a
 * phantom zero-minute visit (110 rows), and the hourly sweep stamped its own run time as
 * the check-out, which recorded 8-16 hour visits (62% of all rows).
 */
describe('ClubAttendanceService duplicate check-in and auto close', () => {
  const build = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      club_attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      club_subscriptions: { findUnique: jest.fn() },
      ...overrides,
    };
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({
        id: 9,
        branch_id: 1,
        member_code: 'A000327',
        name: 'Mab Mamoon',
      }),
    };
    const entitlement = { validate: jest.fn().mockResolvedValue({ allowed: true, reasons: [], warnings: [] }) };
    const service = new ClubAttendanceService(
      prisma as never,
      members as never,
      entitlement as never,
      { log: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      {} as never,
      { resolveListFilter: () => null } as never,
    );
    return { service, prisma, entitlement };
  };

  describe('check-in cooldown', () => {
    it('rejects a second press within the cooldown instead of opening another visit', async () => {
      const { service, prisma, entitlement } = build();
      (prisma.club_attendance.findFirst as jest.Mock).mockResolvedValue({
        id: 41,
        check_in_time: new Date('2026-09-03T18:53:00Z'),
      });

      await expect(
        service.checkIn({ memberId: 9 } as never, undefined, new Date('2026-09-03T18:54:00Z')),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Entitlement runs first so a blocked member hears the real reason, but the guard
      // still fires before the transaction, so no session is consumed by a stray press.
      expect(entitlement.validate).toHaveBeenCalled();
    });

    it('allows a genuine second visit later the same day', async () => {
      const { service, prisma } = build();
      (prisma.club_attendance.findFirst as jest.Mock).mockResolvedValue(null);

      await service
        .checkIn({ memberId: 9 } as never, undefined, new Date('2026-09-03T22:00:00Z'))
        .catch(() => undefined);

      const where = (prisma.club_attendance.findFirst as jest.Mock).mock.calls[0][0].where;
      // 22:00 minus the two minute window.
      expect(where.check_in_time.gt).toEqual(new Date('2026-09-03T21:58:00Z'));
      expect(where.member_id).toBe(9);
    });
  });

  describe('autoCheckoutStale', () => {
    it('caps a forgotten visit instead of stamping the sweep time, and marks it auto_closed', async () => {
      const checkIn = new Date('2026-08-29T18:44:00Z');
      const { service, prisma } = build();
      (prisma.club_attendance.findMany as jest.Mock).mockResolvedValue([
        { id: 7, check_in_time: checkIn },
      ]);

      const result = await service.autoCheckoutStale();

      expect(result).toEqual({ checkedOut: 1 });
      const data = (prisma.club_attendance.update as jest.Mock).mock.calls[0][0].data;
      expect(data.status).toBe('auto_closed');
      expect(data.duration).toBe(120);
      expect(data.check_out_time).toEqual(new Date('2026-08-29T20:44:00Z'));
    });
  });
});
