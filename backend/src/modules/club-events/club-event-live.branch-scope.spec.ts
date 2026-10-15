import { ForbiddenException } from '@nestjs/common';
import { ClubEventLiveCheckinService } from './club-event-live.service';

describe('ClubEventLiveCheckinService branch isolation', () => {
  const prisma = {
    club_events: { findFirst: jest.fn() },
    club_event_registrations: { findFirst: jest.fn() },
    club_event_checkins: { findMany: jest.fn() },
  };
  const registrations = { register: jest.fn() };
  const checkin = { liveGuest: jest.fn() };
  const branchScope = { isBranchAllowed: jest.fn() };
  const user = { sub: 21, level: 2, branch: 1 } as never;
  const service = new ClubEventLiveCheckinService(
    prisma as never,
    registrations as never,
    checkin as never,
    branchScope as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.club_events.findFirst.mockResolvedValue({ id: 70, branch_id: 2, status: 'approved' });
    branchScope.isBranchAllowed.mockReturnValue(false);
  });

  it.each([
    ['phone lookup', () => service.getByPhone(70, { phone: '01000000000' }, user)],
    ['recent attendees', () => service.recentCheckins(70, 50, user)],
    [
      'guest check-in',
      () => service.guestCheckin(70, { name: 'ضيف', phone: '01000000000', source: 'kiosk' }, user),
    ],
  ])('fails closed for cross-branch %s before reading or writing attendee data', async (_label, run) => {
    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_event_registrations.findFirst).not.toHaveBeenCalled();
    expect(prisma.club_event_checkins.findMany).not.toHaveBeenCalled();
    expect(registrations.register).not.toHaveBeenCalled();
    expect(checkin.liveGuest).not.toHaveBeenCalled();
  });
});
