import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

function makeService(audience: 'male' | 'female' | null = null) {
  const prisma = {
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([{
        id: 1, member_code: 'A7118', member_name: 'عضو', branch_id: 3,
        attendance_date: '2026-10-07', check_in_time: new Date('2026-10-07T06:30:00Z'),
        is_grace_session: false,
      }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const branchScope = {
    memberGenderFilter: jest.fn().mockReturnValue(audience),
    resolveListFilter: jest.fn((_user, requested) => requested ? [Number(requested)] : null),
    // Same rule as BranchScopeService: a one-section employee is locked to it (403 for the other).
    resolveMemberGenderRequest: jest.fn((_user, requested?: string | null) => {
      const wanted = requested === 'male' || requested === 'female' ? requested : null;
      if (audience === null) return wanted;
      if (wanted && wanted !== audience) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا القسم');
      return audience;
    }),
  };
  const service = new ClubAttendanceService(
    prisma as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, branchScope as never,
  );
  return { service, prisma };
}

const query = {
  startDate: '2026-10-07', endDate: '2026-10-07', branch: '3', gender: 'female',
  memberCode: 'A7118', fromTime: '09:00', toTime: '10:00',
  page: 1, pageSize: 10, skip: 0, take: 10,
};

describe('barcode scan times', () => {
  it('filters by branch, member, section, date and Cairo clock time', async () => {
    const { service, prisma } = makeService();
    const result = await service.barcodeScanTimes(query as never, { sub: 1, level: 1, branch: 3 } as never);

    const where = prisma.club_attendance.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { attendance_date: { gte: '2026-10-07', lte: '2026-10-07' } },
      { branch_id: { in: [3] } },
      { member: { is: { gender: 'female' } } },
      { member_code: { contains: 'A7118' } },
      { OR: [{ attendance_date: '2026-10-07', check_in_time: {
        gte: new Date('2026-10-07T06:00:00Z'),
        lt: new Date('2026-10-07T07:01:00Z'),
      } }] },
    ]));
    expect(result.data[0]).toMatchObject({ memberCode: 'A7118', scanType: 'عادي' });
  });

  it('keeps the employee section restriction: the other section is refused, their own is applied', async () => {
    const { service, prisma } = makeService('male');
    const user = { sub: 5, level: 2, branch: 3 } as never;
    await expect(service.barcodeScanTimes(query as never, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_attendance.findMany).not.toHaveBeenCalled();
    await service.barcodeScanTimes({ ...query, gender: undefined } as never, user);
    expect(prisma.club_attendance.findMany.mock.calls[0][0].where.AND).toContainEqual({ member: { is: { gender: 'male' } } });
  });

  it('uses the winter Cairo offset for time filters outside daylight saving', async () => {
    const { service, prisma } = makeService();
    await service.barcodeScanTimes({ ...query, startDate: '2026-01-07', endDate: '2026-01-07' } as never, { sub: 1, level: 1, branch: 3 } as never);
    const where = prisma.club_attendance.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ OR: [{
      attendance_date: '2026-01-07',
      check_in_time: { gte: new Date('2026-01-07T07:00:00Z'), lt: new Date('2026-01-07T08:01:00Z') },
    }] });
  });

  it('rejects foreign branches and invalid ranges', async () => {
    const { service } = makeService();
    await expect(service.barcodeScanTimes({ ...query, branch: '9' } as never, { sub: 5, level: 2, branch: 3 } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.barcodeScanTimes({ ...query, endDate: '2026-10-06' } as never, { sub: 1, level: 1, branch: 3 } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.barcodeScanTimes({ ...query, fromTime: '12:00', toTime: '09:00' } as never, { sub: 1, level: 1, branch: 3 } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
