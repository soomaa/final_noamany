import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubLeadsService } from './club-leads.service';

const salesUser = { sub: 9, emp_code: 77, branch: 1, name: 'أخصائي' } as never;

function buildService(isSales = true) {
  const lead = {
    id: 5,
    full_name: 'عميل',
    phone: '01000000000',
    source: 'walk_in',
    facebook_profile_url: null,
    interested_program: null,
    subscription_type_id: null,
    status: 'new',
    assigned_to_id: 88,
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
    club_sales_crm_leads: {
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
    club_sales_crm_lead_follow_ups: { create: jest.fn().mockResolvedValue({ id: 12 }) },
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

    expect(prisma.club_sales_crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { branch_id: { in: [1] } },
          { assigned_to_id: 77 },
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

    expect(prisma.club_sales_crm_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_to_id: 77, assignment_mode: 'manual' }),
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

    expect(prisma.club_sales_crm_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'new' }),
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

    expect(prisma.club_sales_crm_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        full_name: 'فاطمة أحمد',
        phone: '01012345678',
        source: 'walk_in',
        interested_program: 'بيع سريع — حصة فردية',
        status: 'new',
        notes: expect.stringContaining('R-104'),
      }),
    }));
  });

  it('records another quick sale on the existing phone instead of duplicating the lead', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;
    prisma.club_sales_crm_leads.findFirst.mockResolvedValue({
      id: 5,
      status: 'qualified',
      branch_id: 1,
      assigned_to_id: 88,
    });

    await service.recordQuickSaleCustomer({
      fullName: 'اسم لن ينشئ سجلًا ثانيًا',
      phone: '01012345678',
      serviceName: 'حصة فردية',
      branchId: 1,
      receiptNumber: 'R-105',
    }, manager);

    expect(prisma.club_sales_crm_leads.create).not.toHaveBeenCalled();
    expect(prisma.club_sales_crm_lead_follow_ups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lead_id: 5,
        status: 'qualified',
        note: expect.stringContaining('بيع سريع — حصة فردية'),
      }),
    });
    expect(prisma.club_sales_crm_leads.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5 },
      data: expect.objectContaining({ interested_program: 'بيع سريع — حصة فردية' }),
    }));
  });

  it('changes status through a recorded sales follow-up and timestamps the contact', async () => {
    const { service, prisma } = buildService(false);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await service.followUp(5, { note: 'تم الاتصال بالعميل', status: 'qualified' }, manager);

    expect(prisma.club_sales_crm_lead_follow_ups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lead_id: 5, note: 'تم الاتصال بالعميل', status: 'qualified' }),
    });
    expect(prisma.club_sales_crm_leads.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5 },
      data: expect.objectContaining({ status: 'qualified', last_contacted_at: expect.any(Date) }),
    }));
  });

  it('prevents a sales specialist from qualifying their own assigned lead', async () => {
    const { service, prisma } = buildService(true);
    prisma.club_sales_crm_leads.findUnique.mockResolvedValue({
      ...prisma.club_sales_crm_leads.findUnique.getMockImplementation?.(),
      id: 5,
      full_name: 'عميل',
      phone: '01000000000',
      source: 'walk_in',
      facebook_profile_url: null,
      interested_program: null,
      subscription_type_id: null,
      status: 'in_progress',
      assigned_to_id: 77,
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

    expect(prisma.club_sales_crm_lead_follow_ups.create).not.toHaveBeenCalled();
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

    expect(prisma.club_sales_crm_lead_follow_ups.create).toHaveBeenCalledWith({
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

  it('rejects an inactive sales representative even when their primary branch matches', async () => {
    const { service, employees } = buildService(false);
    employees.salesReps.mockResolvedValue([
      { id: 88, name: 'مندوب موقوف', empCode: 880, branchId: 1, branchIds: [1], isActive: false },
    ]);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await expect(service.create({
      fullName: 'عميل جديد', phone: '01012345678', source: 'walk_in', branchId: 1,
      assignedToId: 88, assignmentMode: 'manual',
    }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a representative explicitly assigned to the lead branch', async () => {
    const { service, prisma, employees } = buildService(false);
    employees.salesReps.mockResolvedValue([
      { id: 88, name: 'مندوب متعدد الفروع', empCode: 880, branchId: 2, branchIds: [1, 2], isActive: true },
    ]);
    const manager = { sub: 1, emp_code: null, branch: 1, name: 'مدير' } as never;

    await service.create({
      fullName: 'عميل جديد', phone: '01012345678', source: 'walk_in', branchId: 1,
      assignedToId: 88, assignmentMode: 'manual',
    }, manager);

    expect(prisma.club_sales_crm_leads.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_to_id: 88 }),
    }));
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
