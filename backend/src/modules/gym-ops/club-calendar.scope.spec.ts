import { ClubCalendarService } from './club-calendar.service';

describe('ClubCalendarService backup audience scope', () => {
  it('adds authoritative gender to member and subscription export queries', async () => {
    const prisma = { club_members: { findMany: jest.fn().mockResolvedValue([]) }, club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) } };
    const scope = { resolveListFilter: () => null, memberGenderFilter: () => 'female', isBranchAllowed: () => true };
    const service = new ClubCalendarService(prisma as never, scope as never);
    await service.exportMembersCsv(undefined, { sub: 1 } as any);
    await service.exportSubscriptionsCsv(undefined, { sub: 1 } as any);
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ gender: 'female' }) }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ gender: 'female' }) }));
  });
});
