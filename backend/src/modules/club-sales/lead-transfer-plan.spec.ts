import { buildLeadTransferPlan, canAssignSalesRepToBranch } from './lead-transfer-plan';

describe('sales representative transfer plan', () => {
  it('counts actionable leads and active subscription ownership only', () => {
    expect(buildLeadTransferPlan({
      leads: [{ status: 'new' }, { status: 'lost' }, { status: 'converted' }],
      subscriptions: [{ endDate: '2026-09-10' }, { endDate: '2026-09-08' }],
      today: '2026-09-09',
    })).toEqual({ leads: 2, activeSubscriptions: 1, total: 3 });
  });

  it('requires an active target with an intersecting branch', () => {
    expect(canAssignSalesRepToBranch({ isActive: true, branchIds: [1, 3] }, 3)).toBe(true);
    expect(canAssignSalesRepToBranch({ isActive: false, branchIds: [3] }, 3)).toBe(false);
    expect(canAssignSalesRepToBranch({ isActive: true, branchIds: [2] }, 3)).toBe(false);
  });
});
