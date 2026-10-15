import { ClubSubscriptionsService } from './club-subscriptions.service';

function fixture(extra = {}) {
  const sub = { id: 1, member_id: 9, branch_id: 2, status: 'frozen', renewal_hold: false, freezes: [],
    subscription_type_id: null, special_class_type_id: null, subscription_start_date: '2026-10-01',
    subscription_end_date: '2026-10-30', is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
    subscription_value: 100, paid_amount: 0, waived_amount: 0, transferred_credit_amount: 0,
    discount_enabled: false, discount_value: 0, updated_at: new Date(), ...extra };
  const tx = { $queryRaw: jest.fn().mockResolvedValue([]), club_subscriptions: {
    findUnique: jest.fn().mockResolvedValue(sub), update: jest.fn(async ({ data }) => ({ ...sub, ...data })),
  }, $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = { ...tx, $transaction: async work => work(tx) };
  const service = new ClubSubscriptionsService(prisma as never, {} as never, {} as never,
    { log: jest.fn() } as never, {} as never, { isBranchAllowed: () => true } as never, {} as never, {} as never);
  jest.spyOn(service as any, 'assertNoDuplicateLiveSubscription').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'syncMemberProfileFromSubscription').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'mapSub').mockImplementation(row => row);
  return { service, tx };
}

describe('frozen subscription editing', () => {
  it.each([{ status: 'frozen' }, { status: 'active', renewal_hold: true }, { status: 'active', freezes: [{ is_active: true }] }])('preserves the freeze on a note edit: %j', async extra => {
    const { service } = fixture(extra);
    expect(await service.update(1, { notes: 'ملاحظة' })).toMatchObject({ status: 'frozen', notes: 'ملاحظة' });
  });
  it('rejects a date change while frozen so thaw cannot restore an obsolete end date', async () => {
    const { service, tx } = fixture();
    await expect(service.update(1, { subscriptionEndDate: '2026-11-10' })).rejects.toThrow('فك التجميد');
    expect(tx.club_subscriptions.update).not.toHaveBeenCalled();
  });
  it('refuses manual session usage during an active freeze', async () => {
    const { service, tx } = fixture({ is_linked_to_sessions: true, sessions_count: 10 });
    await expect(service.useSession(1)).rejects.toThrow('مجمّد');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
