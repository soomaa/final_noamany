import { ClubAttendanceService } from './club-attendance.service';

function fixture() {
  const member = { id: 10, branch_id: 2, member_code: 'B868', name: 'Member' };
  const sub = { id: 20, member_id: 10, branch_id: 2, status: 'active', subscription_type: 'Package',
    subscription_start_date: '2020-01-01', subscription_end_date: '2099-01-01',
    is_linked_to_sessions: true, sessions_used: 0, sessions_count: 4, spa_used: 0, inbody_used: 0,
    private_package_id: 1, type: { includes_spa: true, spa_count: 4, inbody_count: 4 } };
  const prisma = {
    $queryRaw: jest.fn(), $executeRaw: jest.fn().mockResolvedValue(1), $transaction: jest.fn(),
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue(sub), update: jest.fn() },
    club_classes: { findFirst: jest.fn() },
    club_spa_attendance: { create: jest.fn() },
    club_attendance: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  const permissions = { canAny: jest.fn().mockResolvedValue(true) };
  const entitlement = { validate: jest.fn().mockResolvedValue({ allowed: true, activeSubscription: {
    id: 20, subscriptionType: 'Package', isLinkedToSessions: true, sessionsRemaining: 4,
    specialClassTypeId: 3,
  } }) };
  const service = new ClubAttendanceService(prisma as never,
    { resolveByIdOrCode: jest.fn().mockResolvedValue(member) } as never, entitlement as never,
    { log: jest.fn() } as never, { emit: jest.fn() } as never, { dispatch: jest.fn() } as never,
    permissions as never, { isMemberGenderAllowed: jest.fn().mockReturnValue(true) } as never);
  return { service, prisma, sub, permissions, entitlement };
}
const user = { sub: 1, level: 1, branch: 2 } as never;

describe('reception service attendance', () => {
  it.each(['spa', 'inbody'] as const)('allows reception staff to record %s using their attendance permission', async (attendanceType) => {
    const { service, permissions } = fixture();
    permissions.canAny.mockImplementation(async (_userId, required) => required.includes('club.reception:create'));
    const result = await service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType }, user);
    expect(result.attendance.attendanceType).toBe(attendanceType);
  });

  it('includes older active subscriptions before limiting the overview to ten rows', async () => {
    const { service, prisma, sub } = fixture();
    const data = prisma as any;
    data.club_members = { findFirst: jest.fn().mockResolvedValue({ id: 10, member_code: 'B868', name: 'Member', branch_id: 2 }) };
    data.club_subscriptions.count = jest.fn().mockResolvedValue(12);
    data.club_subscriptions.findMany = jest.fn().mockResolvedValue([
      ...Array.from({ length: 11 }, (_, index) => ({ ...sub, id: index + 100, subscription_end_date: '2020-01-01', freezes: [] })),
      { ...sub, id: 20, freezes: [] },
    ]);
    data.club_subscription_freezes = { findMany: jest.fn().mockResolvedValue([]) };
    data.club_locker_subscriptions = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
    data.club_receipts = { findMany: jest.fn().mockResolvedValue([]) };
    data.club_attendance.findMany = jest.fn().mockResolvedValue([]);
    const overview = await (service as any).memberOverview('B868', { sub: 1, level: 1, branch: 2 });
    expect(overview.subscriptions).toHaveLength(10);
    expect(overview.subscriptions[0]).toMatchObject({ id: 20, status: 'active' });
  });
  it('normal scanning records normal entry without consuming a private/class package or looking up a class', async () => {
    const { service, prisma } = fixture();
    const result = await service.checkIn({ memberId: 10, attendanceType: 'normal', consumeSession: false }, user);
    expect(result.attendance.attendanceType).toBe('normal');
    expect(result.subscription?.consumedSession).toBe(false);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.club_classes.findFirst).not.toHaveBeenCalled();
  });

  it.each(['spa', 'inbody'] as const)('records %s against the selected subscription and consumes only its balance', async (attendanceType) => {
    const { service, prisma } = fixture();
    const result = await service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType }, user);
    expect(result.attendance.attendanceType).toBe(attendanceType);
    expect(result.attendance.subscriptionId).toBe(20);
    expect(prisma.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 20 }, data: {
      [attendanceType === 'spa' ? 'spa_used' : 'inbody_used']: { increment: 1 },
    } });
    expect(prisma.club_spa_attendance.create).toHaveBeenCalledTimes(attendanceType === 'spa' ? 1 : 0);
  });

  it('records SPA from a positive legacy allowance even when its old includes-SPA flag is unset', async () => {
    const { service, prisma, sub } = fixture();
    sub.type.includes_spa = false;
    const result = await service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'spa' }, user);
    expect(result.attendance.attendanceType).toBe('spa');
    expect(prisma.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { spa_used: { increment: 1 } } });
  });

  it.each(['spa', 'inbody'] as const)('rejects exhausted %s benefits before recording or deducting', async (attendanceType) => {
    const { service, prisma, sub } = fixture();
    sub.spa_used = 4; sub.inbody_used = 4;
    await expect(service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType }, user)).rejects.toThrow('لا يوجد رصيد');
    expect(prisma.club_subscriptions.update).not.toHaveBeenCalled();
    expect(prisma.club_attendance.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate service attendance without another deduction', async () => {
    const { service, prisma } = fixture();
    prisma.club_attendance.findFirst.mockResolvedValue({ id: 1 } as never);
    await expect(service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'inbody' }, user)).rejects.toThrow('بالفعل اليوم');
    expect(prisma.club_subscriptions.update).not.toHaveBeenCalled();
  });

  it('requires the permission for the requested service', async () => {
    const { service, permissions, prisma } = fixture();
    permissions.canAny.mockResolvedValue(false);
    await expect(service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'spa' }, user)).rejects.toThrow('صلاحية');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not consume a subscription owned by another member', async () => {
    const { service, sub, prisma } = fixture();
    sub.member_id = 99;
    await expect(service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'inbody' }, user)).rejects.toThrow('غير متاح');
    expect(prisma.club_subscriptions.update).not.toHaveBeenCalled();
  });

  it('passes the selected class subscription to attendance and consumes one session', async () => {
    const { service, sub } = fixture();
    sub.private_package_id = null as never;
    const checkIn = jest.spyOn(service, 'checkIn').mockResolvedValue({} as never);
    await service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'class' }, user);
    expect(checkIn).toHaveBeenCalledWith({ memberId: 10, subscriptionId: 20, attendanceType: 'class', consumeSession: true }, user);
  });

  it('records a class session without closing the normal visit', async () => {
    const { service, prisma, sub, entitlement } = fixture();
    sub.private_package_id = null as never;
    entitlement.validate.mockResolvedValue({ allowed: true, activeSubscription: {
      id: 20, subscriptionType: 'Package', isLinkedToSessions: true, sessionsRemaining: 4,
      specialClassTypeId: null,
    } } as never);
    const result = await service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'class' }, user);
    expect(result.attendance.attendanceType).toBe('class');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.club_attendance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attendance_type: 'class', subscription_id: 20 }) }));
  });

  it('rejects the final session if another desk consumed it before the atomic deduction', async () => {
    const { service, prisma, sub, entitlement } = fixture();
    sub.private_package_id = null as never;
    entitlement.validate.mockResolvedValue({ allowed: true, activeSubscription: {
      id: 20, subscriptionType: 'Package', isLinkedToSessions: true, sessionsRemaining: 1, specialClassTypeId: null,
    } } as never);
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.checkInService({ memberId: 10, subscriptionId: 20, attendanceType: 'class' }, user)).rejects.toThrow('لا توجد حصص متبقية');
    expect(prisma.club_attendance.create).not.toHaveBeenCalled();
  });
});
