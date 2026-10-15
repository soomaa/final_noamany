import { localDateString } from '../club-fitness/club-fitness.utils';
import { ClubLeadsService } from './club-leads.service';

describe('renewal candidates use the latest contract', () => {
  const today = localDateString();
  const past = '2020-01-01';
  const future = '2999-12-31';
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    subscription_number: 'S-1',
    subscription_type: 'شهري',
    subscription_start_date: '2019-01-01',
    subscription_end_date: past,
    paid_amount: 800,
    branch_id: 1,
    member_id: 7,
    customer_name: null,
    guardian_phone: null,
    member: { name: 'عضو مجدد', phone: '0101', member_code: 'M7' },
    ...over,
  });
  const serviceFor = (rows: unknown[]) =>
    new ClubLeadsService(
      {
        club_subscriptions: { findMany: jest.fn().mockResolvedValue(rows) },
        club_sales_crm_leads: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      { resolveListFilter: () => null } as never,
      { salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

  it('drops a member from expired as soon as a newer renewal exists', async () => {
    const service = serviceFor([
      row({ id: 2, subscription_number: 'S-2', subscription_end_date: future }),
      row({ id: 1, subscription_number: 'S-1', subscription_end_date: past }),
    ]);

    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    expect(list.total).toBe(0);
  });

  it('keeps today out of the expired bucket', async () => {
    const service = serviceFor([row({ subscription_end_date: today })]);

    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    expect(list.total).toBe(0);
  });

  it('does not pre-filter subscriptions by end date before choosing the latest contract', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClubLeadsService(
      {
        club_subscriptions: { findMany },
        club_sales_crm_leads: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      { resolveListFilter: () => null } as never,
      { salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

    await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    const [[call]] = findMany.mock.calls;
    expect(JSON.stringify(call?.where ?? {})).not.toContain('subscription_end_date');
  });
});
