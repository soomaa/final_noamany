import { ClubSubscriptionsService } from './club-subscriptions.service';

function fixture(failAudit = false) {
  let state: any = { id: 1, branch_id: 2, member_id: 9, customer_name: 'عضو', subscription_number: 'S1',
    subscription_value: 100, discount_enabled: false, discount_value: 0, paid_amount: 0,
    remaining_amount: 100, waived_amount: 0, transferred_credit_amount: 0, receipts: [], waivers: [] };
  let tail = Promise.resolve();
  const prisma = { $transaction: async (work) => {
    let local: any; let unlock: (() => void) | undefined;
    const current = () => local ??= structuredClone(state);
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        if (parts.join('').includes('FOR UPDATE') && !unlock) {
          const previous = tail; tail = new Promise<void>(resolve => { unlock = resolve; }); await previous;
        }
        return [];
      },
      club_subscriptions: {
        findUnique: async () => ({ ...current() }),
        update: async ({ data }) => {
          for (const [key, value] of Object.entries(data)) current()[key] = typeof value === 'object' && value !== null
            ? current()[key] + Number((value as any).increment ?? -(value as any).decrement) : value;
          return { ...current() };
        },
      },
      club_receipts: { create: async ({ data }) => { current().receipts.push(data); return { id: 1, ...data }; },
        aggregate: async () => ({ _sum: { amount: current().receipts.reduce((sum, row) => sum + row.amount, 0) } }) },
      club_subscription_waivers: { create: async ({ data }) => { current().waivers.push(data); return { id: 1, ...data }; } },
    };
    try { const result = await work(tx); state = current(); return result; } finally { unlock?.(); }
  } };
  const audit = { log: jest.fn(async () => { if (failAudit) throw new Error('audit unavailable'); }) };
  const service = new ClubSubscriptionsService(prisma as never, { nextReceiptNumber: async () => 'R1' } as never,
    { postJournal: jest.fn() } as never, audit as never, {} as never,
    { isBranchAllowed: () => true } as never, {} as never, {} as never);
  jest.spyOn(service as any, 'mapSub').mockImplementation(row => row);
  return { service, state: () => state, audit };
}

describe('subscription payment and waiver integrity', () => {
  it('serializes payment against waiver so their total cannot exceed the debt', async () => {
    const { service, state } = fixture();
    const results = await Promise.allSettled([service.processPayment(1, 60), service.processWaiver(1, 60, 'إعفاء')]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(state().remaining_amount).toBe(40);
    expect(state().paid_amount + state().waived_amount).toBe(60);
  });

  it.each(['payment', 'waiver'])('rolls back %s and its document when audit fails', async kind => {
    const { service, state } = fixture(true);
    await expect(kind === 'payment' ? service.processPayment(1, 60) : service.processWaiver(1, 60, 'إعفاء')).rejects.toThrow('audit unavailable');
    expect(state()).toMatchObject({ remaining_amount: 100, paid_amount: 0, waived_amount: 0, receipts: [], waivers: [] });
  });

  it.each([NaN, Infinity, -1, 0])('rejects invalid payment amount %s', async amount => {
    await expect(fixture().service.processPayment(1, amount)).rejects.toThrow();
  });
});
