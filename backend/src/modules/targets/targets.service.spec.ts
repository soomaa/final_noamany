import { TargetsService } from './targets.service';

const user = {
  sub: 9,
  level: 2,
  emp_code: 17,
  branch: 3,
  branch_name: 'السيدات',
  man_women_type: 2,
  name: 'مسؤول',
  image: null,
  job_title: null,
  is_trainer: false,
  trainer_id: null,
};

describe('TargetsService', () => {
  it('returns client identity and reconciles the sales tab from explicit Protein/Bar line snapshots', async () => {
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          { id: 44, member_code: 'M-0044', name: 'منى', phone: '01000000000' },
        ]),
      },
      sales_quick_sale_items: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: 'مياه معدنية',
            business_classification: 'protein',
            line_total: 120,
            unit_price: 120,
            quantity: 1,
            free_quantity: 0,
            sale: {
              id: 51,
              collected_amount: 270,
              sale_number: 'QS-1',
              business_date: '2026-09-08',
              sale_date: '2026-09-08',
              branch_id: 3,
              target_employee_id: 17,
              customer_member_id: 44,
              customer_name: 'اسم قديم',
              customer_phone: null,
            },
          },
          {
            id: 2,
            name: 'Protein Mega Shake',
            business_classification: 'bar',
            line_total: 80,
            unit_price: 80,
            quantity: 1,
            free_quantity: 0,
            sale: {
              id: 51,
              collected_amount: 270,
              sale_number: 'QS-1',
              business_date: '2026-09-08',
              sale_date: '2026-09-08',
              branch_id: 3,
              target_employee_id: 17,
              customer_member_id: 44,
              customer_name: 'اسم قديم',
              customer_phone: null,
            },
          },
          {
            id: 3,
            name: 'منتج مخزني',
            business_classification: null,
            line_total: 100,
            unit_price: 100,
            quantity: 1,
            free_quantity: 0,
            sale: {
              id: 51,
              collected_amount: 270,
              sale_number: 'QS-1',
              business_date: '2026-09-08',
              sale_date: '2026-09-08',
              branch_id: 3,
              target_employee_id: 17,
              customer_member_id: 44,
              customer_name: 'اسم قديم',
              customer_phone: null,
            },
          },
        ]),
      },
    } as any;
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    } as any;
    const service = new TargetsService(prisma, branchScope);

    const result = await service.report(
      {
        tab: 'sales',
        month: '2026-09',
        personId: 17,
        branchId: 3,
        gender: 'female',
        page: 1,
        pageSize: 25,
      },
      user,
    );

    expect(prisma.sales_quick_sale_items.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sale: expect.objectContaining({
            branch_id: { in: [3] },
            target_employee_id: 17,
            customer_member_id: { in: [44] },
          }),
        }),
      }),
    );
    expect(prisma.sales_quick_sale_items.findMany.mock.calls[0][0].where.business_classification).toBeUndefined();
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(1, {
      where: { gender: 'female' },
      select: { id: true },
    });
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [44] } },
      select: { id: true, member_code: true, name: true, phone: true },
    });
    expect(result.summary).toEqual({
      count: 2,
      totalAmount: 180,
      targetAmount: 108,
      proteinAmount: 108,
      barAmount: 72,
    });
    expect(result.data[0]).toMatchObject({
      clientName: 'منى',
      clientCode: 'M-0044',
      clientPhone: '01000000000',
      classification: 'protein',
      amount: 108,
    });
  });

  it('intersects the requested audience with the authenticated men/women scope', async () => {
    const prisma = {
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
      sales_quick_sale_items: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue('male'),
    } as any;
    const service = new TargetsService(prisma, branchScope);

    await expect(service.report({
      tab: 'sales',
      month: '2026-09',
      gender: 'female',
      page: 1,
      pageSize: 25,
    }, user)).rejects.toThrow('لا تملك صلاحية');

    expect(prisma.club_members.findMany).not.toHaveBeenCalled();
  });

  it('scopes the people picker by branch and applicable gender on the server', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    } as any;
    const service = new TargetsService(prisma, branchScope);

    await service.people({ branchId: 3, gender: 'female' }, user);

    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branch_id_fk: { in: [3] },
        emp_type: 2,
      }),
    }));
  });

  it('uses authoritative employee audience codes for the men people picker', async () => {
    const prisma = { employees: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    } as any;
    const service = new TargetsService(prisma, branchScope);

    await service.people({ branchId: 3, gender: 'male' }, user);

    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ emp_type: 1 }),
    }));
  });
});
