import { BadRequestException } from '@nestjs/common';
import { AppManagementService } from './app-management.service';

describe('AppManagementService invitation integrity', () => {
  const row = {
    id: 1,
    invitation_code: 'INV000001',
    recipient_name: 'Guest',
    recipient_email: null,
    recipient_phone: '01012345678',
    inviter_member_id: 4,
    subscription_id: 55,
    sent_date: new Date('2026-08-26T00:00:00Z'),
    status: 'pending',
    accepted_date: null,
    rejected_date: null,
    rejection_reason: null,
    attendance_date: null,
    branch_id: 3,
    created_at: new Date('2026-08-26T00:00:00Z'),
    updated_at: new Date('2026-08-26T00:00:00Z'),
  } as const;

  interface SetupOptions {
    createError?: unknown;
    /** Active subscriptions of the inviting member, newest first. */
    subscriptions?: Array<{ id: number; type: { invitations_count: number | null } | null }>;
    /** Invitations already charged against those subscriptions. */
    used?: Array<{ subscription_id: number | null; _count: { _all: number } }>;
    /** Reception invitations charged against the same package allowance. */
    receptionUsed?: Array<{ subscription_id: number | null; _count: { _all: number } }>;
    created?: Record<string, unknown>;
  }

  function setup(options: SetupOptions = {}) {
    const { createError } = options;
    const created = { ...row, ...options.created };
    const tx = {
      am_invitations: {
        create: createError
          ? jest.fn().mockRejectedValue(createError)
          : jest.fn().mockResolvedValue(created),
        groupBy: jest.fn().mockResolvedValue(options.used ?? []),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue(
          options.subscriptions ?? [{ id: 55, type: { invitations_count: 2 } }],
        ),
      },
      club_guest_invitations: {
        groupBy: jest.fn().mockResolvedValue(options.receptionUsed ?? []),
      },
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ name: 'أحمد', member_code: 'M-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: unknown) => Promise<unknown>) => work(tx)),
      am_invitations: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(created),
        update: jest.fn().mockResolvedValue(created),
      },
      club_sales_crm_leads: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_branches: { findUnique: jest.fn() },
    };
    const invitationPhones = {
      prepare: jest.fn().mockResolvedValue({
        phone: '01012345678',
        uniqueKey: '01012345678',
      }),
      isPhoneUniqueViolation: jest.fn().mockImplementation(
        (error: unknown) => error === createError,
      ),
      duplicateError: jest.fn().mockReturnValue(
        new BadRequestException('هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم'),
      ),
    };
    const leads = { create: jest.fn().mockResolvedValue({ id: 900 }) };
    const service = new AppManagementService(
      prisma as never,
      { get: jest.fn() } as never,
      invitationPhones as never,
      { allowedBranchIds: () => null, isBranchAllowed: () => true } as never,
      leads as never,
    );
    return { service, prisma, tx, invitationPhones, leads };
  }

  it('stores the canonical phone and race-protection key on every create path', async () => {
    const { service, tx } = setup();

    await service.createInvitation({
      recipientName: ' Guest ',
      recipientPhone: '٠١٠ ١٢٣-٤٥٦٧٨',
      inviterMemberId: 4,
      branchId: 3,
    });

    expect(tx.am_invitations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient_name: 'Guest',
        recipient_phone: '01012345678',
        recipient_phone_unique_key: '01012345678',
      }),
    });
  });

  it('excludes the current invitation when validating an administrative phone edit', async () => {
    const { service, invitationPhones } = setup();

    await service.updateInvitation(1, { recipientPhone: '01012345678' });

    expect(invitationPhones.prepare).toHaveBeenCalledWith('01012345678', 1);
  });

  it('returns the business duplicate error for a concurrent unique-key collision', async () => {
    const conflict = { code: 'P2002', meta: { target: ['recipient_phone_unique_key'] } };
    const { service } = setup({ createError: conflict });

    await expect(service.createInvitation({
      recipientName: 'Guest',
      recipientPhone: '01012345678',
    })).rejects.toEqual(expect.objectContaining({
      message: 'هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم',
    }));
  });

  it('captures the invited guest as a member_invitation lead linked to the invitation', async () => {
    const { service, leads, tx } = setup();

    await service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    });

    expect(leads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Guest',
        phone: '01012345678',
        source: 'member_invitation',
        branchId: 3,
        assignmentMode: 'automatic',
        notes: expect.stringContaining('أحمد'),
      }),
      undefined,
      expect.objectContaining({ invitationId: 1, prisma: tx }),
    );
  });

  it('writes the lead inside the invitation transaction so a failure leaves neither behind', async () => {
    const { service, prisma, tx, leads } = setup();

    await service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(leads.create).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ prisma: tx }),
    );
  });

  it('charges the invitation to the active subscription that still has an allowance', async () => {
    const { service, tx } = setup({
      subscriptions: [
        { id: 90, type: { invitations_count: 1 } },
        { id: 55, type: { invitations_count: 3 } },
      ],
      used: [{ subscription_id: 90, _count: { _all: 1 } }],
    });

    await service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    });

    expect(tx.am_invitations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ subscription_id: 55 }),
    });
  });

  it('rejects an invitation when the member package includes none', async () => {
    const { service, leads } = setup({
      subscriptions: [{ id: 55, type: { invitations_count: null } }],
    });

    await expect(service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    })).rejects.toEqual(expect.objectContaining({
      message: 'باقة العضو الحالية لا تتضمن دعوات',
    }));
    expect(leads.create).not.toHaveBeenCalled();
  });

  it('rejects an invitation once the package allowance is spent', async () => {
    const { service, leads } = setup({
      subscriptions: [{ id: 55, type: { invitations_count: 2 } }],
      used: [{ subscription_id: 55, _count: { _all: 2 } }],
    });

    await expect(service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    })).rejects.toEqual(expect.objectContaining({
      message: 'لا توجد دعوات متبقية في اشتراك العضو',
    }));
    expect(leads.create).not.toHaveBeenCalled();
  });

  it('counts reception invitations against the same package allowance', async () => {
    const { service, leads } = setup({
      subscriptions: [{ id: 55, type: { invitations_count: 2 } }],
      used: [{ subscription_id: 55, _count: { _all: 1 } }],
      receptionUsed: [{ subscription_id: 55, _count: { _all: 1 } }],
    });

    await expect(service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    })).rejects.toEqual(expect.objectContaining({
      message: 'لا توجد دعوات متبقية في اشتراك العضو',
    }));
    expect(leads.create).not.toHaveBeenCalled();
  });

  it('skips the lead for an email-only invitation, which has no phone to follow up on', async () => {
    const { service, leads } = setup({
      created: { recipient_phone: null, inviter_member_id: null, subscription_id: null },
    });

    await service.createInvitation({
      recipientName: 'ضيف',
      recipientEmail: 'guest@example.com',
      branchId: 3,
    });

    expect(leads.create).not.toHaveBeenCalled();
  });

  it('skips the lead when no branch owns the invitation, since a lead cannot be branchless', async () => {
    const { service, leads } = setup({
      created: { branch_id: null, inviter_member_id: null, subscription_id: null },
    });

    await service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
    });

    expect(leads.create).not.toHaveBeenCalled();
  });

  it('reports the captured lead and its follow-up status on the invitation payload', async () => {
    const { service, prisma } = setup();
    prisma.club_sales_crm_leads.findMany.mockResolvedValue([
      { id: 900, status: 'in_progress', invitation_id: 1 },
    ]);

    const result = await service.createInvitation({
      recipientName: 'ضيف',
      recipientPhone: '01012345678',
      inviterMemberId: 4,
      branchId: 3,
    });

    expect(result).toEqual(expect.objectContaining({ leadId: 900, leadStatus: 'in_progress' }));
  });
});
