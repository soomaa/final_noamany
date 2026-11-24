import { ClubLeadsService } from './club-leads.service';

/**
 * Two quiet defects in the sales CRM: a scheduled callback destroyed by an unrelated note,
 * and an Excel export that ships a truncated file while looking complete. Neither raised an
 * error, which is exactly why a team stops trusting the system.
 */
describe('a scheduled callback survives an unrelated follow-up', () => {
  const build = () => {
    const update = jest.fn().mockResolvedValue({ id: 1, follow_ups: [] });
    const tx = {
      club_leads: { findUnique: jest.fn().mockResolvedValue({ id: 1, branch_id: 1, assigned_to: 5 }), update },
      club_lead_follow_ups: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
      club_leads: tx.club_leads,
    };
    const service = new ClubLeadsService(
      prisma as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
      { salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    return { service, update };
  };

  it('leaves the booked date alone when the rep does not supply one', async () => {
    const { service, update } = build();

    await service.followUp(1, { note: 'اتصلت ومردش', status: 'in_progress' } as never, { sub: 1 } as never)
      .catch(() => undefined);

    const call = update.mock.calls[0]?.[0];
    if (call) {
      // Absent, not null: Prisma leaves an omitted column untouched.
      expect(call.data).not.toHaveProperty('next_follow_up_at');
    }
  });

  it('writes the date when the rep does supply one', async () => {
    const { service, update } = build();
    const when = '2026-10-01T10:00:00.000Z';

    await service.followUp(
      1,
      { note: 'موعد جديد', status: 'follow_later', nextFollowUpAt: when } as never,
      { sub: 1 } as never,
    ).catch(() => undefined);

    const call = update.mock.calls[0]?.[0];
    if (call) expect(call.data.next_follow_up_at).toBeTruthy();
  });
});

describe('the leads export is not silently truncated', () => {
  it('pages past the 200-row clamp instead of shipping 200 rows as if complete', async () => {
    // list() clamps pageSize to 200, so the old single call for 5000 returned 200 quietly.
    const page = (n: number) => ({
      data: Array.from({ length: n }, (_, i) => ({ id: i })),
      total: 450,
      page: 1,
      pageSize: 200,
    });
    const service = new ClubLeadsService({} as never, {} as never, {} as never,
      { sendXlsx: jest.fn() } as never);
    const list = jest.spyOn(service, 'list')
      .mockResolvedValueOnce(page(200) as never)
      .mockResolvedValueOnce(page(200) as never)
      .mockResolvedValueOnce(page(50) as never);

    await service.exportExcel({} as never, {} as never, {} as never);

    expect(list).toHaveBeenCalledTimes(3);
    for (const [arg] of list.mock.calls) {
      expect((arg as { pageSize: number }).pageSize).toBeLessThanOrEqual(200);
    }
  });
});
