import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService explicit employee identity', () => {
  function makeService(employee: Record<string, unknown>) {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 7,
          level: 2,
          emp_code: 17,
          name: 'موظف',
          image: null,
          branch_id_fk: 3,
          approved: 1,
        }),
      },
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      department_jobs: { findUnique: jest.fn().mockResolvedValue(null) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_name: 'الفرع' }) },
      club_sales_rep_branches: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
      service: new AuthService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
      prisma,
    };
  }

  it('keeps employee primary id separate from the business employee code', async () => {
    const { service, prisma } = makeService({
      id: 17,
      emp_code: 4401,
      branch_id_fk: 3,
      emp_type: 1,
      mosma_wazefy_n: 'محاسب',
      mosma_wazefy_code: null,
      personal_photo: null,
      leave_emp: 0,
      employee_type: 1,
    });

    const claims = await (service as any).buildJwtUser(7);

    expect(prisma.employees.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 17 } }),
    );
    expect(claims).toMatchObject({
      employeeId: 17,
      employeeCode: 4401,
      emp_code: 17,
    });
  });

  it('rejects a live token as soon as the linked employee is exited', async () => {
    const { service } = makeService({
      id: 17,
      emp_code: 4401,
      branch_id_fk: 3,
      emp_type: 1,
      mosma_wazefy_n: null,
      mosma_wazefy_code: null,
      personal_photo: null,
      leave_emp: 1,
      employee_type: 1,
    });

    await expect((service as any).buildJwtUser(7)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('loads normalized sales branch assignments into live session claims', async () => {
    const { service, prisma } = makeService({
      id: 17, emp_code: 4401, branch_id_fk: 3, emp_type: 1,
      mosma_wazefy_n: 'أخصائي مبيعات', mosma_wazefy_code: null,
      personal_photo: null, leave_emp: 0, employee_type: 1,
    });
    prisma.club_sales_rep_branches.findMany.mockResolvedValue([{ branch_id: 3 }, { branch_id: 5 }]);

    await expect((service as any).buildJwtUser(7)).resolves.toMatchObject({ branch: 3, branchIds: [3, 5] });
  });
});
