import { ReportsService } from './reports.service';

describe('ReportsService employee audience scope', () => {
  it('does not return another branch or department when a scoped user supplies them in the query', async () => {
    const employees = [
      { id: 1, employee: 'أحمد', emp_code: 101, branch_id_fk: 5, emp_type: 1, leave_emp: 0 },
      { id: 2, employee: 'منى', emp_code: 102, branch_id_fk: 5, emp_type: 2, leave_emp: 0 },
      { id: 3, employee: 'خالد', emp_code: 103, branch_id_fk: 6, emp_type: 1, leave_emp: 0 },
    ];
    const prisma = {
      employees: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            employees.filter((employee) => {
              const constraints = where.AND ?? [where];
              return constraints.every((constraint: Record<string, unknown>) => {
                if (constraint.branch_id_fk) {
                  if (!(constraint.branch_id_fk as { in: number[] }).in.includes(employee.branch_id_fk)) return false;
                }
                if (constraint.emp_type && employee.emp_type !== constraint.emp_type) return false;
                if (constraint.OR) return employee.leave_emp === 0;
                return true;
              });
            }),
          ),
        ),
      },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([5]),
      memberGenderFilter: jest.fn().mockReturnValue('male'),
    };
    const service = new (ReportsService as any)(prisma, branchScope);

    const result = await service.run(
      'employees-list',
      { page: 1, pageSize: 25, skip: 0, take: 25, branchId: '6', gender: 'female' },
      { sub: 9, level: 3, branch: 5, man_women_type: 0 },
    );

    expect(result.data).toEqual([
      expect.objectContaining({ id: 1, name: 'أحمد', value: 101 }),
    ]);
    expect(result.total).toBe(1);
  });

  it('does not use a reused employee code when a payroll row names a foreign employee id', async () => {
    const payrollRows = [
      { id: 10, emp_id: 1, emp_code: 101, emp_name: 'أحمد', safi: 5000 },
      { id: 11, emp_id: 99, emp_code: 101, emp_name: 'موظف فرع آخر', safi: 9000 },
      { id: 12, emp_id: null, emp_code: 101, emp_name: 'سجل قديم برقم مكرر', safi: 7000 },
    ];
    const prisma = {
      employees: {
        findMany: jest.fn(({ where }: { where?: unknown }) => Promise.resolve(
          where ? [{ id: 1, emp_code: 101 }] : [{ id: 1, emp_code: 101 }, { id: 99, emp_code: 101 }],
        )),
      },
      hr_mosayer_details: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            payrollRows.filter((row) => {
              const matches = (condition: Record<string, unknown>): boolean => {
                if (condition.AND) return (condition.AND as Record<string, unknown>[]).every(matches);
                if (condition.OR) return (condition.OR as Record<string, unknown>[]).some(matches);
                if (condition.emp_id === null) return row.emp_id === null;
                if (condition.emp_id) {
                  if (row.emp_id == null) return false;
                  const ids = condition.emp_id as { in?: number[]; notIn?: number[] };
                  return ids.in?.includes(row.emp_id) ?? !ids.notIn?.includes(row.emp_id);
                }
                if (condition.emp_code) return (condition.emp_code as { in: number[] }).in.includes(row.emp_code);
                return false;
              };
              return where.OR.some(matches);
            }),
          ),
        ),
      },
    };
    const service = new (ReportsService as any)(prisma, {
      resolveListFilter: jest.fn().mockReturnValue([5]),
      memberGenderFilter: jest.fn().mockReturnValue('male'),
    });

    const result = await service.run(
      'payroll-sheet',
      { page: 1, pageSize: 25, skip: 0, take: 25 },
      { sub: 9, level: 3, branch: 5, man_women_type: 0 },
    );

    expect(result.data).toEqual([
      expect.objectContaining({ id: 10, name: 'أحمد', value: 5000 }),
    ]);
    expect(result.total).toBe(1);
  });

  it('limits contracts and attendance rows by authorized employee code before applying the 1,000-row cap', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 1, emp_code: 101, employee: 'أحمد' }]) },
      contract_employe: { findMany: jest.fn().mockResolvedValue([]) },
      hr_all_agzat_orders: { groupBy: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new (ReportsService as any)(prisma, {
      resolveListFilter: jest.fn().mockReturnValue([5]),
      memberGenderFilter: jest.fn().mockReturnValue('male'),
    });
    const query = { page: 1, pageSize: 25, skip: 0, take: 25, date: '2026-09-09' };
    const user = { sub: 9, level: 3, branch: 5, man_women_type: 0 };

    await service.run('leaves-balance', query, user);
    await service.run('leaves-remaining', query, user);
    await service.run('attendance-daily', query, user);
    await service.run('attendance-late', query, user);
    await service.run('attendance-overtime', query, user);
    await service.run('attendance-shift', query, user);

    for (const call of prisma.contract_employe.findMany.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ where: { emp_code: { in: ['101'] } }, take: 1000 }));
    }
    for (const call of prisma.tbl_hdoor_emps.findMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ member_code: { in: [101] } }));
      expect(call[0].take).toBe(1000);
    }
  });
});
