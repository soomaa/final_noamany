import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClubLeadsService } from './club-leads.service';

const user = { sub: 9, emp_code: 77, branch: 1, name: 'مندوب' } as never;

function setup() {
  const prisma: any = {
    club_leads: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    club_lead_follow_ups: { create: jest.fn() },
    club_members: { findFirst: jest.fn() },
    club_subscriptions: { findFirst: jest.fn() },
    employees: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((work: (tx: any) => unknown) => work(prisma));
  const scope = { resolveListFilter: jest.fn().mockReturnValue([1]) };
  const employees = { isSalesEmployee: jest.fn().mockResolvedValue(true) };
  return {
    prisma,
    scope,
    employees,
    service: new ClubLeadsService(prisma, scope as never, employees as never),
  };
}

const lead = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  full_name: 'عميل',
  phone: '01000000000',
  source: 'walk_in',
  status: 'in_progress',
  assigned_to_id: 77,
  notes: null,
  converted_member_id: null,
  last_contacted_at: null,
  next_call_at: null,
  next_follow_up_at: null,
  branch_id: 1,
  created_at: new Date('2026-09-01T08:00:00Z'),
  updated_at: new Date('2026-09-01T08:00:00Z'),
  follow_ups: [],
  ...overrides,
});

describe('ClubLeadsService personal CRM scope and list contract', () => {
  it('lists only the current salesperson and allowed branch with stable filters and pagination', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.count.mockResolvedValue(128);
    prisma.club_leads.findMany.mockResolvedValue([lead({ id: 51 })]);

    const result = await service.mine(user, { page: 3, pageSize: 20, status: 'in_progress', search: '0100' });

    expect(result).toEqual(expect.objectContaining({ total: 128, page: 3, pageSize: 20 }));
    expect(result.data[0]).toEqual(expect.objectContaining({ id: 51, fullName: 'عميل', convertedMemberId: null }));
    const query = prisma.club_leads.findMany.mock.calls[0][0];
    expect(query.where.AND).toEqual(expect.arrayContaining([
      { assigned_to_id: 77 },
      { branch_id: { in: [1] } },
      { status: 'in_progress' },
      { OR: [{ full_name: { contains: '0100' } }, { phone: { contains: '0100' } }, { notes: { contains: '0100' } }] },
    ]));
    expect(query).toEqual(expect.objectContaining({ skip: 40, take: 20, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }));
  });

  it('cannot load another salesperson lead or a lead outside the allowed branch', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findFirst.mockResolvedValue(null);

    await expect(service.findOne(91, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.club_leads.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ id: 91 }, { assigned_to_id: 77 }, { branch_id: { in: [1] } }]) },
    }));
  });

  it('returns renewal subscription dates and complete activity fields in the client file', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findFirst.mockResolvedValue(lead({
      converted_member_id: 41,
      follow_ups: [{
        id: 7,
        note: 'تم التواصل',
        status: 'converted',
        activity_type: 'conversation',
        answered: null,
        interests: 'سنوي',
        next_follow_up_at: new Date('2026-09-12T10:00:00Z'),
        next_call_at: null,
        created_by: 77,
        created_at: new Date('2026-09-09T10:00:00Z'),
      }],
    }));
    prisma.club_subscriptions.findFirst.mockResolvedValue({
      subscription_number: 'SUB-41',
      subscription_type: 'سنوي',
      paid_amount: 2500,
      subscription_start_date: '2026-01-01',
      subscription_end_date: '2026-12-31',
      type: { name: 'الباقة السنوية' },
    });
    prisma.employees.findMany.mockResolvedValue([{ id: 77, employee: 'مندوب المبيعات' }]);

    const result = await service.findOne(1, user);

    expect(prisma.club_subscriptions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: 41, branch_id: 1 },
    }));

    expect(result.subscription).toEqual({
      subscriptionNumber: 'SUB-41',
      packageName: 'الباقة السنوية',
      paidAmount: 2500,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(result.followUps[0]).toEqual(expect.objectContaining({
      status: 'converted',
      interests: 'سنوي',
      nextFollowUpAt: new Date('2026-09-12T10:00:00Z'),
      createdByName: 'مندوب المبيعات',
    }));
  });

  it('rejects a user who is not a salesperson', async () => {
    const { employees, service } = setup();
    employees.isSalesEmployee.mockResolvedValue(false);
    await expect(service.mine(user, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ClubLeadsService reminders', () => {
  it('sorts all appointments before paginating and reports overdue across the full result', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findMany.mockResolvedValue([
      lead({ id: 1, next_call_at: new Date('2030-09-10T09:00:00Z'), next_follow_up_at: new Date('2020-09-08T09:00:00Z') }),
      lead({ id: 2, next_call_at: new Date('2030-09-09T09:00:00Z') }),
    ]);

    const first = await service.reminders(user, { page: 1, pageSize: 2 });
    const second = await service.reminders(user, { page: 2, pageSize: 2 });

    expect(first.total).toBe(3);
    expect(first.overdue).toBe(1);
    expect(first.data.map((row) => [row.lead.id, row.kind])).toEqual([[1, 'follow_up'], [2, 'call']]);
    expect(second.data.map((row) => [row.lead.id, row.kind])).toEqual([[1, 'call']]);
    expect(prisma.club_leads.findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([
      { branch_id: { in: [1] } },
      { assigned_to_id: 77 },
      { status: { notIn: ['lost', 'qualified'] } },
    ]));
  });

  it('atomically completes only the exact still-current reminder', async () => {
    const { prisma, service } = setup();
    const dueAt = '2026-09-09T09:00:00.000Z';

    await service.completeReminder(1, { kind: 'call', dueAt }, user);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.club_leads.updateMany).toHaveBeenCalledWith({
      where: { AND: expect.arrayContaining([
        { id: 1 }, { assigned_to_id: 77 }, { branch_id: { in: [1] } }, { next_call_at: new Date(dueAt) },
      ]) },
      data: { next_call_at: null },
    });
    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lead_id: 1, activity_type: 'system' }),
    }));

    prisma.club_leads.updateMany.mockResolvedValue({ count: 0 });
    prisma.club_lead_follow_ups.create.mockClear();
    await expect(service.completeReminder(1, { kind: 'call', dueAt }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_lead_follow_ups.create).not.toHaveBeenCalled();
    await expect(service.completeReminder(1, { kind: 'anything', dueAt }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ClubLeadsService follow-up and renewal handoff', () => {
  it('validates a follow-up and writes its history and lead schedule in one transaction', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findFirst.mockResolvedValue(lead());
    const nextCallAt = '2026-09-11T09:00:00.000Z';

    await service.followUp(1, { activityType: 'call', answered: true, note: 'تم التواصل', status: 'in_progress', nextCallAt }, user);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lead_id: 1, answered: true, next_call_at: new Date(nextCallAt) }),
    }));
    expect(prisma.club_leads.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([
        { id: 1 },
        { status: 'in_progress' },
        { assigned_to_id: 77 },
        { branch_id: { in: [1] } },
      ]) },
      data: expect.objectContaining({ status: 'in_progress', next_call_at: new Date(nextCallAt) }),
    }));
  });

  it('accepts the frontend conversation activity and preserves a converted renewal lead status', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findFirst.mockResolvedValue(lead({ status: 'converted', converted_member_id: 41 }));

    await service.followUp(1, { activityType: 'conversation', note: 'مهتم بالتجديد', interests: 'باقة سنوية', status: 'converted' }, user);

    expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activity_type: 'conversation', interests: 'باقة سنوية', status: 'converted' }),
    }));
    expect(prisma.club_leads.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'converted' }) }));
  });

  it('rejects invalid calls, dates, statuses and missing follow-later schedule', async () => {
    const { service } = setup();
    await expect(service.followUp(1, { activityType: 'call', note: 'x' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.followUp(1, { activityType: 'note', note: 'x', nextFollowUpAt: 'invalid' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.followUp(1, { activityType: 'note', note: 'x', status: 'bogus' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.followUp(1, { activityType: 'note', note: 'x', status: 'follow_later' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls back when the lead is reassigned or changed before the transactional write', async () => {
    const { prisma, service } = setup();
    prisma.club_leads.findFirst.mockResolvedValue(lead());
    prisma.club_leads.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.followUp(1, {
      activityType: 'conversation',
      note: 'تم التواصل',
      status: 'in_progress',
    }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_lead_follow_ups.create).not.toHaveBeenCalled();
  });

  it('hands a sold member to the current specialist but refuses another specialist ownership', async () => {
    const { prisma, service } = setup();
    prisma.club_subscriptions.findFirst.mockResolvedValue({ member_id: 41 });
    prisma.club_members.findFirst.mockResolvedValue({ id: 41, name: 'عضو', phone: '0100', branch_id: 1 });
    prisma.club_leads.findFirst.mockResolvedValue(lead({ id: 8, assigned_to_id: null, converted_member_id: 41 }));
    prisma.club_leads.update.mockResolvedValue(lead({ id: 8, converted_member_id: 41 }));

    const result = await service.ensureRenewalLead(41, user);

    expect(prisma.club_subscriptions.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ member_id: 41, sales_id: 77, branch_id: { in: [1] } }) }));
    expect(prisma.club_leads.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assigned_to_id: 77, converted_member_id: 41 }) }));
    expect(result).toEqual(expect.objectContaining({ id: 8, convertedMemberId: 41 }));

    prisma.club_leads.findFirst.mockResolvedValue(lead({ id: 9, assigned_to_id: 88, converted_member_id: 41 }));
    await expect(service.ensureRenewalLead(41, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never reuses a phone-matched lead already converted to a different member', async () => {
    const { prisma, service } = setup();
    prisma.club_subscriptions.findFirst.mockResolvedValue({ member_id: 41 });
    prisma.club_members.findFirst.mockResolvedValue({ id: 41, name: 'عضو', phone: '0100', branch_id: 1 });
    prisma.club_leads.findFirst.mockResolvedValue(null);
    prisma.club_leads.create.mockResolvedValue(lead({ id: 10, status: 'converted', converted_member_id: 41 }));

    await service.ensureRenewalLead(41, user);

    expect(prisma.club_leads.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        branch_id: 1,
        OR: [
          { converted_member_id: 41 },
          { converted_member_id: null, phone: '0100' },
        ],
      },
    }));
  });
});
