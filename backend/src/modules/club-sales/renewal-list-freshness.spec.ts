import { ClubLeadsService } from './club-leads.service';
import { localDateString } from '../club-fitness/club-fitness.utils';

/**
 * A member who renews must leave the lapsed list the moment the renewal is recorded.
 *
 * The list used to filter by expiry date in SQL and only then group to one row per person.
 * That order is wrong: the renewal is excluded by the WHERE clause, so the grouping sees
 * only the old expired contract and keeps listing the member as lapsed forever. Against real
 * data this affected 518 members — people the sales team chased after they had already paid.
 *
 * Whether someone is lapsed is a fact about their LATEST contract, so every contract has to
 * be loaded before the question is asked.
 */
describe('the lapsed list reflects the latest contract', () => {
  // The service works in local (Cairo) dates. Using toISOString() here would compare against
  // UTC and disagree with it for the first hours of every day — the exact divergence the
  // service was fixed for.
  const TODAY = localDateString();
  const past = '2020-01-01';
  const future = '2999-12-31';

  const row = (over: Record<string, unknown>) => ({
    id: 1,
    subscription_number: 'S-1',
    subscription_type: 'one month',
    subscription_start_date: '2019-01-01',
    subscription_end_date: past,
    paid_amount: 800,
    branch_id: 1,
    member_id: 7,
    customer_name: null,
    guardian_phone: null,
    member: { name: 'عضو مجدّد', phone: '0101', member_code: 'M7' },
    ...over,
  });

  const serviceFor = (rows: unknown[]) => new ClubLeadsService(
    { club_subscriptions: { findMany: jest.fn().mockResolvedValue(rows) },
      club_leads: { findMany: jest.fn().mockResolvedValue([]) } } as never,
    { resolveListFilter: () => null } as never,
    { salesReps: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
  );

  it('drops a member from "expired" once they renew', async () => {
    // Newest first, exactly as the query orders them.
    const service = serviceFor([
      row({ id: 2, subscription_number: 'S-2', subscription_end_date: future }),
      row({ id: 1, subscription_number: 'S-1', subscription_end_date: past }),
    ]);

    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    expect(list.total).toBe(0);
  });

  it('still lists a member whose only contract has lapsed', async () => {
    const service = serviceFor([row({ subscription_end_date: past })]);
    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);
    expect(list.total).toBe(1);
    expect(list.data[0]).toMatchObject({ endDate: past });
  });

  it('never asks the database to pre-filter by expiry, which is what caused the staleness', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClubLeadsService(
      { club_subscriptions: { findMany }, club_leads: { findMany: jest.fn().mockResolvedValue([]) } } as never,
      { resolveListFilter: () => null } as never,
      { salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

    await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    const [[call]] = findMany.mock.calls;
    const clauses = JSON.stringify(call?.where ?? {});
    expect(clauses).not.toContain('subscription_end_date');
  });

  it('reports the renewed member under "due soon" instead of losing them', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    const service = serviceFor([
      row({ id: 2, subscription_end_date: soon.toISOString().slice(0, 10) }),
      row({ id: 1, subscription_end_date: past }),
    ]);

    const list = await service.listRenewalCandidates({ state: 'due_soon', days: 30 }, {} as never);

    expect(list.total).toBe(1);
    expect(list.data[0].state).toBe('due_soon');
  });

  it('keeps today itself out of the lapsed bucket', async () => {
    const service = serviceFor([row({ subscription_end_date: TODAY })]);
    const expired = await service.listRenewalCandidates({ state: 'expired' }, {} as never);
    expect(expired.total).toBe(0);
  });
});
