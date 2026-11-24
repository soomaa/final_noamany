import { ClubLeadsService } from './club-leads.service';

/**
 * "نتيجة التواصل" on the potential-members screen. Each outcome is a status, and the two
 * closing ones must not leave a call-back behind to nag the rep.
 */
describe('recording contact feedback on a lead', () => {
  const manager = { sub: 1, emp_code: 3, name: 'مدير' } as never;
  const openLead = {
    id: 5, name: 'منى', status: 'new', branch_id: 1, assigned_to: 10,
    follow_up_at: '2099-01-01', next_follow_up_at: new Date('2099-01-01T12:00:00'), is_deleted: false,
  };

  const build = (lead: Record<string, unknown> | null = openLead) => {
    const prisma = {
      club_leads: {
        findFirst: jest.fn().mockResolvedValue(lead),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...lead, ...data })),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...lead, follow_ups: [] }),
      },
      club_lead_follow_ups: { create: jest.fn() },
      club_reminders: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      users: { findUnique: jest.fn().mockResolvedValue({ name: 'سارة', username: 'sara' }) },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_sales_rep_settings: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const client = prisma as any;
    client.$executeRaw = jest.fn();
    client.$transaction = jest.fn((work) => work(client));
    const service = new ClubLeadsService(
      prisma as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true, allowedBranchIds: () => null } as never,
      { isSalesEmployee: jest.fn().mockResolvedValue(false), salesReps: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    return { service, prisma };
  };

  it('writes the outcome as the lead\'s status and logs it', async () => {
    const { service, prisma } = build();

    await service.recordFeedback(5, { feedback: 'arrange_visit', date: '2099-02-10', note: 'جاية السبت' }, manager);

    expect(prisma.club_leads.update.mock.calls[0][0].data).toMatchObject({
      status: 'visit_arranged',
      follow_up_at: '2099-02-10',
    });
    expect(prisma.club_lead_follow_ups.create.mock.calls[0][0].data).toMatchObject({
      status: 'visit_arranged', activity_type: 'feedback', note: 'جاية السبت', author_name: 'سارة',
    });
  });

  it('refuses an outcome that needs a date when none is given', async () => {
    const { service, prisma } = build();

    await expect(service.recordFeedback(5, { feedback: 'no_answer' }, manager)).rejects.toThrow('لازم تحدد التاريخ');
    expect(prisma.club_leads.update).not.toHaveBeenCalled();
  });

  it('clears the pending call-back when the lead is closed', async () => {
    const { service, prisma } = build();

    await service.recordFeedback(5, { feedback: 'not_interested' }, manager);

    expect(prisma.club_leads.update.mock.calls[0][0].data).toMatchObject({
      status: 'lost', follow_up_at: null, next_follow_up_at: null,
    });
    // The typed note was empty, so the outcome itself becomes the log line.
    expect(prisma.club_lead_follow_ups.create.mock.calls[0][0].data.note).toBe('غير مهتم');
  });

  it('marks "membership done" without converting the lead', async () => {
    const { service, prisma } = build();

    await service.recordFeedback(5, { feedback: 'membership_done' }, manager);

    expect(prisma.club_leads.update.mock.calls[0][0].data.status).toBe('membership_done');
    expect(prisma.club_leads.update.mock.calls[0][0].data).not.toHaveProperty('converted_member_id');
  });

  it('rejects an unknown outcome and a lead that is already a member', async () => {
    await expect(build().service.recordFeedback(5, { feedback: 'maybe' }, manager)).rejects.toThrow('غير معروفة');
    await expect(build({ ...openLead, status: 'converted' }).service.recordFeedback(5, { feedback: 'unreachable' }, manager))
      .rejects.toThrow('مشترك بالفعل');
  });
});
