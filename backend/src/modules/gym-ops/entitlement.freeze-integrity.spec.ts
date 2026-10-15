import { EntitlementService } from './entitlement.service';

describe('entitlement freeze consistency', () => {
  it.each([{ renewal_hold: true }, { freezes: [{ freeze_start_date: '2026-10-15', planned_days: 5 }] }])('keeps a held or actively frozen subscription blocked despite an old active status: %j', extra => {
    const service = new EntitlementService({} as never, {} as never);
    const snapshot = (service as any).mapSubscription({ id: 1, status: 'active', subscription_start_date: '2026-10-01',
      subscription_end_date: '2026-10-30', sessions_used: 0, remaining_amount: 0, ...extra }, new Date('2026-10-15T09:00:00Z'));
    expect(snapshot.status).toBe('frozen');
  });
});
