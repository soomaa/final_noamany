import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubLeadsService } from './club-leads.service';

const salesUser = { sub: 9, emp_code: 77, branch: 1, name: 'أخصائي' } as never;

function buildService(isSales = true) {
  const lead = {
    id: 5,
    name: 'عميل',
    phone: '01000000000',
    source: 'walk_in',
    facebook_profile_url: null,
    interested_program: null,
    subscription_type_id: null,
    status: 'new',
    assigned_to: 88,
    assignment_mode: 'manual',
    converted_member_id: null,
    invitation_id: null,
    notes: null,
    last_contacted_at: null,
    branch_id: 1,
    created_by: 3,
    created_at: new Date('2026-08-01T08:00:00Z'),
    updated_at: new Date('2026-08-01T08:00:00Z'),
    follow_ups: [],
  };
  const prisma = {
    $executeRaw: jest.fn(),
    club_leads: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(lead),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
        ...lead,
        ...data,
        id: 6,
        follow_ups: [],
      })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
        ...lead,
        ...data,
        follow_ups: [],
      })),
    },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    club_lead_follow_ups: { create: jest.fn().mockResolvedValue({ id: 12 }) },
    // Round-robin now skips specialists switched off in the sales settings.
    club_sales_rep_settings: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    club_sales_round_robin_state: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, last_employee_id: null }),
    },
    employees: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscription_types: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  (prisma as typeof prisma & { $transaction: jest.Mock }).$transaction = jest
    .fn()
    .mockImplementation((callback) => callback(prisma));
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([1]),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  const employees = {
    isSalesEmployee: jest.fn().mockResolvedValue(isSales),
    salesReps: jest.fn().mockResolvedValue([]),
  };
  return {
    service: new ClubLeadsService(
      prisma as never,
      branchScope as never,
      employees as never,
      {} as never,
    ),
    prisma,
    employees,
  };
}

describe('ClubLeadsService sales ownership', () => {
  it('forces a sales specialist list to their own assigned leads even when scope is omitted', async () => {
    const { service, prisma } = buildService();

    await service.list({ page: 1, pageSize: 20 }, salesUser);

    expect(prisma.club_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { branch_id: { in: [1] } },
          { assigned_to: 77 },
        ]),
      },
    }));
  });

  it('blocks a sales specialist from reading another specialist lead by id', async () => {
    const { service } = buildService();

    await expect(service.findOne(5, salesUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('always assigns a lead created by a sales specialist to that specialist', async () => {
    const { service, prisma } = buildService();

    await service.create({
      fullName: 'عميل جديد',
      phone: '01012345678',
      source: 'walk_in',
      branchId: 1,
      assignedToId: 88,
      assignmentMode: 'manual',
    }, salesUser);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_to: 77, assignment_mode: 'manual' }),
    }));
  });

  it('always starts a newly entered lead in the new state', async () => {
    const { service, prisma } = buildService();

    await service.create({
      fullName: 'عميل جديد',
      phone: '01012345678',
      source: 'walk_in',
      branchId: 1,
      status: 'lost',
    } as never, salesUser);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'new' }),
    }));
  });

  it('accepts a Facebook campaign lead without requiring a profile URL', async () => {
    const { service, prisma } = buildService();

    await service.create({
      fullName: 'عميل حملة',
      phone: '01012345678',
      source: 'facebook_campaign',
      branchId: 1,
    }, salesUser);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'facebook_campaign',
        facebook_profile_url: null,
      }),
    }));
  });

  it('creates one actionable lead for a new quick-sale phone', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await service.recordQuickSaleCustomer({
      fullName: 'فاطمة أحمد',
      phone: '010 1234 5678',
      serviceName: 'حصة فردية',
      branchId: 1,
      receiptNumber: 'R-104',
    }, manager);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'فاطمة أحمد',
        phone: '01012345678',
        source: 'walk_in',
        interested_program: 'بيع سريع — حصة فردية',
        status: 'new',
        notes: expect.stringContaining('R-104'),
      }),
    }));
  });

  it('automatically assigns a new quick-sale lead to the next eligible sales specialist', async () => {
    const { service, prisma, employees } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;
    employees.salesReps.mockResolvedValue([
      { id: 11, name: 'أخصائي الفرع', empCode: 110, branchId: 1 },
      { id: 22, name: 'أخصائي فرع آخر', empCode: 220, branchId: 2 },
    ]);

    await service.recordQuickSaleCustomer({
      fullName: 'عميلة خدمة سريعة',
      phone: '01012345678',
      serviceName: 'جلسة قياس',
      branchId: 1,
      receiptNumber: 'R-106',
    }, manager);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assigned_to: 11,
        assignment_mode: 'automatic',
      }),
    }));
  });

  it('round-robins an additional branch to a representative assigned to that branch', async () => {
    const { service, prisma, employees } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 2, level: 1, name: 'مدير' } as never;
    employees.salesReps.mockResolvedValue([
      { id: 11, name: 'أخصائي متعدد الفروع', empCode: 110, branchId: 1, branchIds: [1, 2] },
    ]);

    await service.recordQuickSaleCustomer({
      fullName: 'عميل الفرع الثاني',
      phone: '01012345678',
      serviceName: 'جلسة قياس',
      branchId: 2,
      receiptNumber: 'R-208',
    }, manager);

    expect(prisma.club_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_to: 11, branch_id: 2 }),
    }));
  });

  it('records another quick sale on the existing phone instead of duplicating the lead', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;
    prisma.club_leads.findFirst.mockResolvedValue({
      id: 5,
      status: 'qualified',
      branch_id: 1,
      assigned_to: 88,
    });

    await service.recordQuickSaleCustomer({
      fullName: 'اسم لن ينشئ سجلًا ثانيًا',
      phone: '01012345678',
      serviceName: 'حصة فردية',
      branchId: 1,
      receiptNumber: 'R-105',
    }, manager);

    expect(prisma.club_leads.create).not.toHaveBeenCalled();
    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lead_id: 5,
        status: 'qualified',
        note: expect.stringContaining('بيع سريع — حصة فردية'),
      }),
    });
    expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5, assigned_to: 88 },
      data: expect.objectContaining({ interested_program: 'بيع سريع — حصة فردية' }),
    }));
  });

  it('assigns an existing unassigned quick-sale lead without replacing an owned lead', async () => {
    const { service, prisma, employees } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;
    prisma.club_leads.findFirst.mockResolvedValue({
      id: 5,
      status: 'new',
      branch_id: 1,
      assigned_to: null,
    });
    employees.salesReps.mockResolvedValue([
      { id: 11, name: 'أخصائي الفرع', empCode: 110, branchId: 1 },
    ]);

    await service.recordQuickSaleCustomer({
      fullName: 'عميلة موجودة',
      phone: '01012345678',
      serviceName: 'جلسة قياس',
      branchId: 1,
      receiptNumber: 'R-107',
    }, manager);

    expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5, assigned_to: null },
      data: expect.objectContaining({
        assigned_to: 11,
        assignment_mode: 'automatic',
      }),
    }));
  });

  it('changes status through a recorded sales follow-up and timestamps the contact', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await service.followUp(5, { note: 'تم الاتصال بالعميل', status: 'qualified' }, manager);

    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lead_id: 5, note: 'تم الاتصال بالعميل', status: 'qualified' }),
    });
    expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5, status: 'new', assigned_to: 88 },
      data: expect.objectContaining({ status: 'qualified', last_contacted_at: expect.any(Date) }),
    }));
  });

  it('prevents a sales specialist from qualifying their own assigned lead', async () => {
    const { service, prisma } = buildService(true);
    prisma.club_leads.findUnique.mockResolvedValue({
      ...prisma.club_leads.findUnique.getMockImplementation?.(),
      id: 5,
      name: 'عميل',
      phone: '01000000000',
      source: 'walk_in',
      facebook_profile_url: null,
      interested_program: null,
      subscription_type_id: null,
      status: 'in_progress',
      assigned_to: 77,
      assignment_mode: 'manual',
      converted_member_id: null,
      invitation_id: null,
      notes: null,
      last_contacted_at: null,
      next_follow_up_at: null,
      branch_id: 1,
      created_by: 3,
      created_at: new Date('2026-08-01T08:00:00Z'),
      updated_at: new Date('2026-08-01T08:00:00Z'),
      follow_ups: [],
    });

    await expect(service.followUp(5, {
      activityType: 'meeting',
      note: 'العميل مستعد للاشتراك',
      status: 'qualified',
    } as never, salesUser)).rejects.toThrow('يتم تأهيل العميل تلقائيًا عند تسجيله من الاستقبال');

    expect(prisma.club_lead_follow_ups.create).not.toHaveBeenCalled();
  });

  it('records an unanswered call without forcing a note and keeps its typed activity metadata', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await service.followUp(5, {
      activityType: 'call',
      answered: false,
      status: 'in_progress',
      nextFollowUpAt: '2026-08-29T10:30:00.000Z',
    } as never, manager);

    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lead_id: 5,
        activity_type: 'call',
        answered: false,
        note: 'لم يتم الرد',
        next_follow_up_at: new Date('2026-08-29T10:30:00.000Z'),
      }),
    });
  });

  it('requires a next follow-up date when moving a lead to follow later', async () => {
    const { service } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await expect(service.followUp(5, {
      activityType: 'conversation',
      note: 'مهتم لاحقًا',
      status: 'follow_later',
    } as never, manager)).rejects.toThrow('موعد المتابعة القادمة مطلوب');
  });

  it('rejects manual assignment to a sales representative from another branch', async () => {
    const { service, employees } = buildService(false);
    employees.salesReps.mockResolvedValue([
      { id: 88, name: 'مندوب فرع آخر', empCode: 880, branchId: 2 },
    ]);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await expect(service.create({
      fullName: 'عميل جديد',
      phone: '01012345678',
      source: 'walk_in',
      branchId: 1,
      assignedToId: 88,
      assignmentMode: 'manual',
    }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps automatic round-robin state independent for each branch', async () => {
    const { service, prisma, employees } = buildService(false);
    employees.salesReps.mockResolvedValue([
      { id: 11, name: 'مندوب فرع 1', empCode: 110, branchId: 1 },
      { id: 22, name: 'مندوب فرع 2', empCode: 220, branchId: 2 },
    ]);

    await expect(service.nextRoundRobinRep(1)).resolves.toMatchObject({ id: 11 });
    await expect(service.nextRoundRobinRep(2)).resolves.toMatchObject({ id: 22 });

    expect(prisma.club_sales_round_robin_state.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 1 },
      create: expect.objectContaining({ id: 1, last_employee_id: 11 }),
    }));
    expect(prisma.club_sales_round_robin_state.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 2 },
      create: expect.objectContaining({ id: 2, last_employee_id: 22 }),
    }));
  });

  it('leaves a lead unassigned when its branch has no active sales representative', async () => {
    const { service, prisma, employees } = buildService(false);
    employees.salesReps.mockResolvedValue([
      { id: 22, name: 'مندوب فرع 2', empCode: 220, branchId: 2 },
    ]);

    await expect(service.nextRoundRobinRep(1)).resolves.toBeNull();
    expect(prisma.club_sales_round_robin_state.upsert).not.toHaveBeenCalled();
  });
});


describe('personal CRM pagination', () => {
  it('serves page three of 128 assigned contacts and keeps owner scoping', async () => {
    const { service, prisma } = buildService();
    prisma.club_leads.count.mockResolvedValue(128);
    const result = await (service.mine as Function)(salesUser, { page: 3, pageSize: 50, search: 'Ahmed', status: 'in_progress', assignedToId: 88 });
    expect(result).toEqual(expect.objectContaining({ page: 3, total: 128, pageSize: 50 }));
    expect(prisma.club_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 50,
      where: { AND: expect.arrayContaining([{ assigned_to: 77 }, { status: 'in_progress' }]) } }));
  });
});

it('does not reopen a converted member when an old sales form submits a follow-up status', async () => {
  const { service, prisma } = buildService();
  const existing = await prisma.club_leads.findUnique();
  prisma.club_leads.findUnique.mockResolvedValue({ ...existing, assigned_to: 77, status: 'converted', converted_member_id: 41 });
  await service.followUp(5, { activityType: 'note', note: 'ملاحظة من شاشة قديمة', status: 'in_progress' }, salesUser);
  expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'converted' }) }));
});

describe('lead profile photo', () => {
  it('only loads the linked non-deleted member photo within the authorized lead branch', async () => {
    const { service, prisma } = buildService();
    const existing = await prisma.club_leads.findUnique();
    prisma.club_leads.findUnique.mockResolvedValue({ ...existing, assigned_to: 77, converted_member_id: 41 });
    const members = { findFirst: jest.fn().mockResolvedValue({ profile_picture: 'members/qa.jpg' }) };
    (prisma as typeof prisma & { club_members: typeof members }).club_members = members;
    expect((await service.findOne(5, salesUser)).profilePicture).toBe('members/qa.jpg');
    expect(members.findFirst).toHaveBeenCalledWith({ where: { id: 41, branch_id: 1, is_deleted: false }, select: { profile_picture: true } });
  });
  it('returns a missing photo for a potential client without a linked member', async () => {
    const { service, prisma } = buildService();
    prisma.club_leads.findUnique.mockResolvedValue({ ...(await prisma.club_leads.findUnique()), assigned_to: 77 });
    expect((await service.findOne(5, salesUser)).profilePicture).toBeNull();
  });
});

it('keeps personal client ordering stable when follow-up activity changes', async () => {
  const {service,prisma} = buildService();
  await service.list({ page:1, pageSize:50 }, salesUser);
  expect(prisma.club_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({orderBy:[{created_at:'desc'},{id:'desc'}]}));
});

 test('stores an independent call booking in both the lead and activity without erasing the follow-up date', async () => {
  const { service, prisma } = buildService();
  const existing = await prisma.club_leads.findUnique();
  prisma.club_leads.findUnique.mockResolvedValue({ ...existing, assigned_to: 77 } as never);
  const nextCallAt = '2026-09-09T10:00:00.000Z';
  await service.followUp(5, { activityType: 'call', answered: false, nextCallAt }, salesUser);
  expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({assigned_to:77}),data:expect.objectContaining({next_call_at:new Date(nextCallAt)})}));
  expect(prisma.club_leads.update.mock.calls[0][0].data).not.toHaveProperty('next_follow_up_at');
  expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({next_call_at:new Date(nextCallAt)})}));
  prisma.club_leads.update.mockClear();
  await service.followUp(5, {activityType:'call',answered:false},salesUser);
  expect(prisma.club_leads.update.mock.calls[0][0].data).not.toHaveProperty('next_call_at');
 });
