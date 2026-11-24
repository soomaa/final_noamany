import { planLeadTransfer } from './lead-transfer-plan';

describe('deactivated salesperson transfer plan', () => {
  const pool = [{ id: 2, branchIds: [1] }, { id: 3, branchIds: [1] }];
  const leads = Array.from({ length: 5 }, (_, i) => ({ id: i + 10, branch_id: 1 }));
  it('distributes all follow-ups evenly with a difference of at most one', () => {
    const plan = planLeadTransfer(leads, pool, 'auto');
    expect(plan.filter(row => row.targetId === 2)).toHaveLength(3);
    expect(plan.filter(row => row.targetId === 3)).toHaveLength(2);
  });
  it('moves all follow-ups to the chosen eligible salesperson', () => {
    expect(planLeadTransfer(leads, pool, 'manual', 3).map(row => row.targetId)).toEqual([3, 3, 3, 3, 3]);
  });
  it('rejects a plan with an uncovered branch instead of silently crossing branches', () => {
    expect(() => planLeadTransfer([...leads, { id: 99, branch_id: 2 }], pool, 'auto')).toThrow('الفرع');
    expect(() => planLeadTransfer(leads, pool, 'manual', 99)).toThrow('نشط');
  });
});
