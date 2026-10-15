import { ClubAttendanceService } from './club-attendance.service';

const baseMember = {
  id: 11,
  member_code: 'A0011',
  name: 'عضو تجريبي',
  phone: '01000000011',
  profile_picture: null,
  branch_id: 2,
};

function makeService() {
  const prisma = {
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 101,
          subscription_number: 'SUB-101',
          subscription_type: 'شهري',
          status: 'active',
          subscription_start_date: '2026-08-01',
          subscription_end_date: '2026-08-31',
          is_linked_to_sessions: false,
          sessions_count: null,
          sessions_used: 0,
          branch_id: 2,
          member: baseMember,
        },
        {
          id: 102,
          subscription_number: 'SUB-102',
          subscription_type: 'عشر حصص',
          status: 'active',
          subscription_start_date: '2026-08-01',
          subscription_end_date: '2026-09-30',
          is_linked_to_sessions: true,
          sessions_count: 10,
          sessions_used: 4,
          branch_id: 2,
          member: { ...baseMember, id: 12, member_code: 'A0012', name: 'عضو حصص' },
        },
      ]),
    },
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([
        ...Array.from({ length: 5 }, (_, index) => ({
          id: 1000 + index,
          subscription_id: 101,
          attendance_date: `2026-08-${String(2 + index).padStart(2, '0')}`,
          check_in_time: new Date(`2026-08-${String(2 + index).padStart(2, '0')}T08:00:00Z`),
          check_out_time: null,
          duration: null,
          status: 'checked_in',
        })),
        {
          id: 1100,
          subscription_id: 102,
          attendance_date: '2026-08-10',
          check_in_time: new Date('2026-08-10T08:00:00Z'),
          check_out_time: null,
          duration: null,
          status: 'checked_in',
        },
      ]),
    },
  };
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([2]),
  };
  const service = new ClubAttendanceService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    branchScope as never,
  );
  return { service, prisma, branchScope };
}

describe('club attendance subscription utilization', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T12:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('keeps calendar days separate from visits and reports session balances', async () => {
    const { service } = makeService();

    const result = await service.subscriptionUtilization(
      { page: 1, pageSize: 20, skip: 0, take: 20, status: 'active' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );

    expect(result.total).toBe(2);
    expect(result.data[0]).toMatchObject({
      subscriptionId: 101,
      totalDays: 30,
      remainingDays: 16,
      attendanceDays: 5,
      attendanceEntries: 5,
      sessionsRemaining: null,
      attendanceRate: 36, // 5 attendance days / 14 elapsed days
    });
    expect(result.data[1]).toMatchObject({
      subscriptionId: 102,
      sessionsCount: 10,
      sessionsUsed: 4,
      sessionsRemaining: 6,
      attendanceEntries: 1,
      attendanceRate: 40, // sessions used / sessions count for session-linked plans
    });
  });

  it('sorts by attendanceRate in either direction and filters by rate bucket', async () => {
    const { service } = makeService();

    const ascending = await service.subscriptionUtilization(
      { page: 1, pageSize: 20, skip: 0, take: 20, status: 'all', sort: 'attendanceRate', order: 'asc' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );
    expect(ascending.data.map((row) => row.subscriptionId)).toEqual([101, 102]);

    const descending = await service.subscriptionUtilization(
      { page: 1, pageSize: 20, skip: 0, take: 20, status: 'all', sort: 'attendanceRate', order: 'desc' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );
    expect(descending.data.map((row) => row.subscriptionId)).toEqual([102, 101]);

    const lowOnly = await service.subscriptionUtilization(
      { page: 1, pageSize: 20, skip: 0, take: 20, status: 'all', rateBucket: 'low' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );
    expect(lowOnly.data.map((row) => row.subscriptionId)).toEqual([101]);
    expect(lowOnly.total).toBe(1);
  });

  it('counts legacy attendance without a subscription id against the subscription active that day', async () => {
    const { service, prisma } = makeService();
    prisma.club_subscriptions.findMany.mockResolvedValue([
      {
        id: 101,
        subscription_number: 'SUB-101',
        subscription_type: 'شهري',
        status: 'active',
        subscription_start_date: '2026-08-01',
        subscription_end_date: '2026-08-31',
        is_linked_to_sessions: false,
        sessions_count: null,
        sessions_used: 0,
        branch_id: 2,
        member: baseMember,
      },
    ]);
    prisma.club_attendance.findMany.mockResolvedValue([
      ...Array.from({ length: 5 }, (_, index) => ({
        id: 1200 + index,
        member_id: baseMember.id,
        branch_id: 2,
        subscription_id: null,
        attendance_date: `2026-08-${String(2 + index).padStart(2, '0')}`,
        check_in_time: new Date(`2026-08-${String(2 + index).padStart(2, '0')}T08:00:00Z`),
        check_out_time: null,
        duration: null,
        status: 'checked_in',
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: 1300 + index,
        member_id: baseMember.id,
        branch_id: 2,
        subscription_id: 101,
        attendance_date: `2026-08-${String(10 + index).padStart(2, '0')}`,
        check_in_time: new Date(`2026-08-${String(10 + index).padStart(2, '0')}T08:00:00Z`),
        check_out_time: null,
        duration: null,
        status: 'checked_in',
      })),
    ]);

    const result = await service.subscriptionUtilization(
      { page: 1, pageSize: 20, skip: 0, take: 20, status: 'active' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );

    expect(result.data[0]).toMatchObject({
      subscriptionId: 101,
      attendanceDays: 7,
      attendanceEntries: 7,
      remainingDays: 16,
      attendanceRate: 50, // 7 attendance days / 14 elapsed days
    });
  });

  it('applies computed status before pagination and keeps a non-admin in their branch', async () => {
    const { service, prisma } = makeService();

    const result = await service.subscriptionUtilization(
      { page: 1, pageSize: 1, skip: 0, take: 1, status: 'active', branch: '2' } as never,
      { sub: 7, level: 2, branch: 2 } as never,
    );

    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(result.data).toHaveLength(1);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branch_id: { in: [2] } }),
      }),
    );
  });
});
