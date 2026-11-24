import { ClubLeadsService } from './club-leads.service';

describe('renewal candidates — "already in pipeline" is matched per branch', () => {
  const lapsed = (branch_id: number, phone: string, member_code: string) => ({
    id: branch_id * 10,
    subscription_number: `S-${member_code}`,
    subscription_type: 'شهري',
    subscription_start_date: '2019-01-01',
    subscription_end_date: '2020-01-01',
    paid_amount: 500,
    branch_id,
    member_id: branch_id * 100,
    customer_name: null,
    guardian_phone: null,
    member: { name: 'عضو', phone, member_code },
  });

  function serviceFor(openLeads: Array<{ phone: string; branch_id: number | null }>) {
    const leadsFindMany = jest.fn().mockResolvedValue(openLeads);
    const service = new ClubLeadsService(
      {
        club_subscriptions: { findMany: jest.fn().mockResolvedValue([lapsed(1, '0101', 'A1'), lapsed(2, '0101', 'B1')]) },
        club_leads: { findMany: leadsFindMany },
      } as never,
      { resolveListFilter: () => null } as never,
      { salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    return { service, leadsFindMany };
  }

  it("does not mark a branch-1 member as in the pipeline because of branch 2's lead", async () => {
    const { service, leadsFindMany } = serviceFor([{ phone: '0101', branch_id: 2 }]);
    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    const byBranch = Object.fromEntries(list.data.map((row) => [row.branchId, row.hasOpenLead]));
    expect(byBranch).toEqual({ 1: false, 2: true });
    expect(list.summary).toMatchObject({ alreadyInPipeline: 1, convertible: 1 });
    // Only these branches' leads plus legacy leads with no branch are fetched.
    expect(leadsFindMany.mock.calls[0][0].where).toMatchObject({ OR: [{ branch_id: { in: [1, 2] } }, { branch_id: null }] });
  });

  it('treats a legacy open lead with no branch as in the pipeline for every branch (no duplicate leads)', async () => {
    const { service } = serviceFor([{ phone: '0101', branch_id: null }]);
    const list = await service.listRenewalCandidates({ state: 'expired' }, {} as never);

    const byBranch = Object.fromEntries(list.data.map((row) => [row.branchId, row.hasOpenLead]));
    expect(byBranch).toEqual({ 1: true, 2: true });
    expect(list.summary).toMatchObject({ alreadyInPipeline: 2, convertible: 0 });
  });
});
