import { ClubMembersService } from './club-members.service';

function hasCreatorFilter(where: { AND?: Array<Record<string, unknown>> }) {
  return where.AND?.some((clause) => Object.prototype.hasOwnProperty.call(clause, 'created_by')) ?? false;
}

function buildService(employee: { jobTitle: string; isSales: boolean }) {
  const prisma = {
    employees: {
      findUnique: jest.fn().mockResolvedValue({
        mosma_wazefy_code: null,
        mosma_wazefy_n: employee.jobTitle,
        leave_emp: null,
        employee_type: 1,
        is_sales: employee.isSales,
      }),
    },
    club_members: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(hasCreatorFilter(where) ? [] : [{ id: 1 }]),
      ),
      count: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(hasCreatorFilter(where) ? 0 : 506),
      ),
    },
  };
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([1]),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  return new ClubMembersService(
    prisma as never,
    { log: jest.fn() } as never,
    branchScope as never,
    {} as never,
  );
}

describe('ClubMembersService member-list sales scope', () => {
  const query = {
    page: 1,
    pageSize: 25,
    skip: 0,
    take: 25,
  };

  it('keeps the full branch member list for a receptionist with the additional sales flag', async () => {
    const service = buildService({ jobTitle: 'Receptionist', isSales: true });

    const result = await service.list(query as never, {
      sub: 9,
      emp_code: 77,
      branch: 1,
    } as never);

    expect(result.total).toBe(506);
  });

  it('keeps personal ownership filtering for a sales-specialist job title', async () => {
    const service = buildService({ jobTitle: 'أخصائي مبيعات', isSales: false });

    const result = await service.list(query as never, {
      sub: 9,
      emp_code: 77,
      branch: 1,
    } as never);

    expect(result.total).toBe(0);
  });
});
