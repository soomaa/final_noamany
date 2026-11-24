import { ClubLeadsService } from './club-leads.service';

const existingLead = {
  id: 9,
  name: 'عضو قائم',
  phone: '01000000000',
  source: 'walk_in',
  facebook_profile_url: null,
  interested_program: 'متابعة تجديد العضوية',
  subscription_type_id: null,
  status: 'converted',
  assigned_to: 77,
  assignment_mode: 'manual',
  converted_member_id: 41,
  invitation_id: null,
  notes: null,
  last_contacted_at: null,
  next_follow_up_at: null,
  branch_id: 1,
  created_by: 9,
  created_at: new Date('2026-08-01T00:00:00Z'),
  updated_at: new Date('2026-08-01T00:00:00Z'),
  follow_ups: [],
};

describe('ClubLeadsService renewal follow-up', () => {
  it('reuses the member lead by phone instead of creating a duplicate', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 41,
          name: 'عضو قائم',
          phone: '01000000000',
          branch_id: 1,
        }),
      },
      club_leads: {
        findFirst: jest.fn().mockResolvedValue(existingLead),
        update: jest.fn().mockResolvedValue(existingLead),
        create: jest.fn(),
      },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_types: { findMany: jest.fn().mockResolvedValue([]) },
    };
    (prisma as typeof prisma & { $transaction: jest.Mock }).$transaction = jest.fn(work => work(prisma));
    const service = new ClubLeadsService(
      prisma as never,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as never,
      { isSalesEmployee: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );

    const result = await service.ensureRenewalLead(41, { sub: 9, emp_code: 77, branch: 1 } as never);

    expect(result.id).toBe(9);
    expect(prisma.club_leads.create).not.toHaveBeenCalled();
  });
});
