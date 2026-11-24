import { MosCallsLogService } from './mos-calls-log.service';

/**
 * The call log is the rep's pipeline seen through its phone calls, so it takes the same
 * owner scope as the Potential Members list: a rep sees their own calls only, and the
 * `salesId` filter cannot widen that.
 */
function build(scope: { assignedTo: number | null; restricted: boolean }) {
  const followUps = jest.fn().mockResolvedValue([]);
  const manual = jest.fn().mockResolvedValue([]);
  const prisma = {
    club_lead_follow_ups: { findMany: followUps },
    club_calls: { findMany: manual },
    employees: { findUnique: jest.fn().mockResolvedValue({ id: 3, emp_code: 1003 }) },
    users: { findMany: jest.fn().mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]) },
  };
  // A branch-scoped viewer: the rep's ownership must win over this, not stack on it.
  const branch = { resolveListFilter: () => [1] };
  const employees = {
    salesReps: async () => [
      { id: 3, name: 'Rep A', branchId: null },
      { id: 4, name: 'Rep B', branchId: null },
    ],
  };
  const visibility = { forUser: async () => ({ phones: true, sensitive: false, employeeId: null }) };
  const leadScope = { scopeFor: async () => scope };
  const service = new MosCallsLogService(
    prisma as never,
    branch as never,
    employees as never,
    visibility as never,
    leadScope as never,
  );
  return { service, followUps, manual };
}

type FollowUpWhere = { lead: Record<string, unknown>; OR?: unknown[] };
const whereOf = (call: jest.Mock) => (call.mock.calls[0][0] as { where: FollowUpWhere }).where;
const leadWhereOf = (call: jest.Mock) => whereOf(call).lead;

describe('MosCallsLogService owner scope', () => {
  it('pins a sales rep to their own calls even when salesId names a colleague', async () => {
    const { service, followUps, manual } = build({ assignedTo: 3, restricted: true });
    await service.list({ sub: 7 }, { salesId: '4' });
    const where = whereOf(followUps);
    expect(where.lead.assigned_to).toBeUndefined();
    // Their leads, or calls they logged themselves — and no branch filter on top.
    expect(where.OR).toEqual([{ lead: { assigned_to: 3 } }, { created_by: { in: [7, 8] } }]);
    expect(where.lead.branch_id).toBeUndefined();
    // Manual desk entries carry no owner, so a pinned rep cannot be shown any of them.
    expect(manual).not.toHaveBeenCalled();
  });

  it('gives an unresolved rep nothing rather than everything', async () => {
    const { service, followUps } = build({ assignedTo: null, restricted: true });
    await service.list({ sub: 7 }, {});
    expect(whereOf(followUps).OR).toEqual([{ lead: { assigned_to: -1 } }]);
  });

  it('lets a supervisor browse everyone and filter by any rep', async () => {
    const { service, followUps, manual } = build({ assignedTo: null, restricted: false });
    await service.list({ sub: 1 }, {});
    expect(leadWhereOf(followUps).assigned_to).toBeUndefined();
    expect(leadWhereOf(followUps).branch_id).toEqual({ in: [1] });
    expect(whereOf(followUps).OR).toBeUndefined();
    expect(manual).toHaveBeenCalled();

    const filtered = build({ assignedTo: null, restricted: false });
    await filtered.service.list({ sub: 1 }, { salesId: '4' });
    expect(leadWhereOf(filtered.followUps).assigned_to).toBe(4);
  });

  it('offers a rep only themselves in the rep filter, and everyone to a supervisor', async () => {
    const rep = await build({ assignedTo: 3, restricted: true }).service.reps({ sub: 1 });
    expect(rep).toEqual({ canChoose: false, data: [{ id: 3, name: 'Rep A' }] });

    const supervisor = await build({ assignedTo: null, restricted: false }).service.reps({ sub: 1 });
    expect(supervisor.canChoose).toBe(true);
    expect(supervisor.data.map((r) => r.id)).toEqual([3, 4]);
  });
});
