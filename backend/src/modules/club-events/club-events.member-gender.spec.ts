import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubEventCheckinService } from './club-event-checkin.service';
import { ClubEventRegistrationsService } from './club-event-registrations.service';
import { ClubEventScopeService } from './club-event-scope.service';

describe('club events رجالي/حريمي/الكل filter', () => {
  const men = { level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as any;
  const women = { level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as any;
  const admin = { level: 1 } as any;
  const section = (gender: string) => ({ OR: [{ member_id: null }, { member: { gender } }] });

  function setup() {
    const prisma = {
      club_events: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      club_event_registrations: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      club_event_sessions: { findMany: jest.fn().mockResolvedValue([]) },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const scope = new ClubEventScopeService(prisma as any, new BranchScopeService());
    const registrations = new ClubEventRegistrationsService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    const checkin = new ClubEventCheckinService(prisma as any, {} as any, {} as any);
    return { prisma, scope, registrations, checkin };
  }
  const regWhere = (prisma: any) => prisma.club_event_registrations.findMany.mock.calls[0][0].where;
  const page = { page: 1, pageSize: 20, skip: 0, take: 20 } as any;

  it('men employee: no implicit men filter; an explicit section filters; women is allowed', async () => {
    const { prisma, scope, registrations, checkin } = setup();
    await registrations.list(page, undefined, scope.resolveMemberGender(men, undefined));
    expect(JSON.stringify(regWhere(prisma))).not.toContain('gender');

    prisma.club_event_registrations.findMany.mockClear();
    await checkin.roster(7, scope.resolveMemberGender(men, 'male'));
    expect(regWhere(prisma)).toEqual(expect.objectContaining(section('male')));

    prisma.club_event_registrations.findMany.mockClear();
    await checkin.statistics(7, scope.resolveMemberGender(men, undefined));
    expect(regWhere(prisma)).toEqual({ event_id: 7, is_deleted: false, status: { not: 'cancelled' } });

    expect(() => scope.resolveMemberGender(men, 'female')).not.toThrow();
    prisma.club_event_registrations.findMany.mockClear();
    await checkin.roster(7, scope.resolveMemberGender(men, 'female'));
    expect(regWhere(prisma)).toEqual(expect.objectContaining(section('female')));
  });

  it('women employee: explicit female filters, men is allowed too', async () => {
    const { prisma, scope, checkin } = setup();
    await checkin.roster(7, scope.resolveMemberGender(women, 'female'));
    expect(regWhere(prisma)).toEqual(expect.objectContaining(section('female')));
    expect(() => scope.resolveMemberGender(women, 'male')).not.toThrow();
    prisma.club_event_registrations.findMany.mockClear();
    await checkin.roster(7, scope.resolveMemberGender(women, 'male'));
    expect(regWhere(prisma)).toEqual(expect.objectContaining(section('male')));
  });

  it('admin: gender=female filters female, none is unfiltered', async () => {
    const { prisma, scope, registrations, checkin } = setup();
    await registrations.list(page, undefined, scope.resolveMemberGender(admin, 'female'));
    expect(regWhere(prisma).AND).toEqual(expect.arrayContaining([section('female')]));

    prisma.club_event_registrations.findMany.mockClear();
    await registrations.list(page, undefined, scope.resolveMemberGender(admin, 'all'));
    expect(JSON.stringify(regWhere(prisma))).not.toContain('gender');

    prisma.club_event_registrations.findMany.mockClear();
    await checkin.statistics(7, scope.resolveMemberGender(admin, undefined));
    expect(regWhere(prisma)).toEqual({ event_id: 7, is_deleted: false, status: { not: 'cancelled' } });
  });
});
