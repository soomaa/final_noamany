import { ClubAttendanceService } from './club-attendance.service';

function fixture({ frozen = false, force = false } = {}) {
  const visits: any[] = []; let tail = Promise.resolve(); let consumed = 0;
  const subscription = { id: 31, member_id: 9, branch_id: 2, status: frozen ? 'frozen' : 'active', freezes: [],
    sessions_count: 12, sessions_used: 0 };
  const prisma = {
    club_attendance: { findFirst: jest.fn().mockResolvedValue(null) },
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue({ member_id: 9, branch_id: 2, private_package_id: null }) },
    $transaction: async (work) => {
      let unlock: (() => void) | undefined;
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray) => {
          if (parts.join('').includes('club_members') && !unlock) {
            const previous = tail; tail = new Promise<void>(resolve => { unlock = resolve; }); await previous;
          }
          return [];
        },
        $executeRaw: async () => { consumed++; return 1; },
        club_subscriptions: { findUnique: async () => ({ ...subscription }) },
        club_attendance: {
          findFirst: async ({ where }) => where.check_in_time ? visits.find(row => row.check_in_time > where.check_in_time.gt && row.check_in_time <= where.check_in_time.lte) ?? null : null,
          findMany: async () => [],
          create: async ({ data }) => { const row = { id: visits.length + 1, ...data }; visits.push(row); return row; },
        },
      };
      try { return await work(tx); } finally { unlock?.(); }
    },
  };
  const snapshot = { id: 31, subscriptionType: 'اشتراك', isLinkedToSessions: true, sessionsRemaining: 12,
    specialClassTypeId: null, endDate: '2026-10-30' };
  const service = new ClubAttendanceService(prisma as never,
    { resolveByIdOrCode: async () => ({ id: 9, branch_id: 2, member_code: 'B9', name: 'عضو' }) } as never,
    { validate: async () => ({ allowed: !force, allowGraceSessions: true, warnings: [], reasons: force ? [{ code: 'subscription_frozen', messageAr: 'مجمد' }] : [], activeSubscription: snapshot }) } as never,
    { log: jest.fn() } as never, { emit: jest.fn() } as never, { dispatch: jest.fn() } as never,
    { canAny: async () => true } as never, { resolveListFilter: () => null } as never);
  jest.spyOn(service as any, 'reportEntryAlert').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'recordSubscriptionUsageTx').mockResolvedValue(undefined);
  return { service, visits, consumed: () => consumed };
}

const user = { sub: 1, level: 1, branch: 0 } as never;
const now = new Date('2026-10-15T09:00:00Z');
describe('attendance transaction integrity', () => {
  it('accepts only one concurrent scan and consumes one session', async () => {
    const { service, visits, consumed } = fixture();
    const results = await Promise.allSettled([1, 2].map(() => service.checkIn({ memberId: 9, consumeSession: true }, user, now)));
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(visits).toHaveLength(1); expect(consumed()).toBe(1);
  });

  it('rejects an entry when the subscription froze after entitlement was checked', async () => {
    const { service, visits, consumed } = fixture({ frozen: true });
    await expect(service.checkIn({ memberId: 9, consumeSession: true }, user, now)).rejects.toThrow('تجميده');
    expect(visits).toHaveLength(0); expect(consumed()).toBe(0);
  });

  it('never allows grace-session override of a frozen subscription', async () => {
    const { service, visits } = fixture({ force: true });
    await expect(service.checkIn({ memberId: 9, force: true, overrideReason: 'سماح' }, user, now)).rejects.toThrow();
    expect(visits).toHaveLength(0);
  });
});
