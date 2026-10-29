import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { DailyReportsService } from './daily-reports.service';

/**
 * Employees: 500 + 501 work in Tanta (2) / Tanta Up (5); 900 works in branch 3.
 * A Tanta branch user (branch 2 ⇒ scope [2, 5, 6]) must only reach 500/501.
 */
const BRANCH_OF: Record<number, number> = { 500: 2, 501: 5, 900: 3 };

const tantaUser = { sub: 50, level: 3, emp_code: 500, branch: 2, man_women_type: 3 } as unknown as JwtUser;
const admin = { sub: 1, level: 1, emp_code: null, branch: 0 } as unknown as JwtUser;

function setup(report: { id: number; emp_id_fk: number | null } = { id: 7, emp_id_fk: 900 }) {
  const prisma = {
    employees: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: number[] }; OR?: unknown[] } }) => {
        if (where.id?.in) {
          return where.id.in
            .filter((id) => BRANCH_OF[id] != null)
            .map((id) => ({ id, branch_id_fk: BRANCH_OF[id] }));
        }
        // scopedEmployees(): employees of the allowed branches
        return [
          { id: 500, emp_code: 1500 },
          { id: 501, emp_code: 1501 },
        ];
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        BRANCH_OF[where.id] != null ? { id: where.id, employee: `emp ${where.id}`, branch_id_fk: BRANCH_OF[where.id] } : null,
      ),
    },
    hr_dialy_reports: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ ...report, title: 't', status: 'inprogress' }),
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new DailyReportsService(prisma as never, new BranchScopeService()) };
}

describe('DailyReportsService branch isolation', () => {
  it('defaults the list of a scoped user to employees of their branches', async () => {
    const { prisma, service } = setup();
    await service.list({ skip: 0, take: 20, page: 1, pageSize: 20 } as never, tantaUser);
    expect(prisma.hr_dialy_reports.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ emp_id_fk: { in: [500, 501] } }],
    });
  });

  it('does not restrict the list for a system admin', async () => {
    const { prisma, service } = setup();
    await service.list({ skip: 0, take: 20, page: 1, pageSize: 20 } as never, admin);
    expect(prisma.hr_dialy_reports.findMany.mock.calls[0][0].where).toEqual({});
  });

  it.each([
    ['get', (s: DailyReportsService) => s.get(7, tantaUser)],
    ['update', (s: DailyReportsService) => s.update(7, { title: 'x' } as never, tantaUser)],
    ['remove', (s: DailyReportsService) => s.remove(7, tantaUser)],
    ['approve', (s: DailyReportsService) => s.approve(7, tantaUser)],
    ['reject', (s: DailyReportsService) => s.reject(7, { radNotes: 'no' } as never, tantaUser)],
  ])('forbids %s on a report of another branch', async (_name, act) => {
    const { prisma, service } = setup({ id: 7, emp_id_fk: 900 });
    await expect(act(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.hr_dialy_reports.update).not.toHaveBeenCalled();
    expect(prisma.hr_dialy_reports.delete).not.toHaveBeenCalled();
  });

  it('allows approving a report of a Tanta sub-branch employee', async () => {
    const { prisma, service } = setup({ id: 8, emp_id_fk: 501 });
    await expect(service.approve(8, tantaUser)).resolves.toEqual(expect.objectContaining({ id: 8 }));
    expect(prisma.hr_dialy_reports.update).toHaveBeenCalled();
  });

  it('rejects creating a report for an employee of another branch', async () => {
    const { prisma, service } = setup();
    await expect(service.create({ empId: 900, title: 'x' } as never, tantaUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.hr_dialy_reports.create).not.toHaveBeenCalled();
  });

  it('keeps self-service: an employee can file their own report', async () => {
    const { prisma, service } = setup();
    await expect(service.create({ empId: 500, title: 'x' } as never, tantaUser)).resolves.toEqual({ id: 99 });
    expect(prisma.hr_dialy_reports.create).toHaveBeenCalled();
  });

  it('blocks moving a report to an out-of-scope employee', async () => {
    const { service } = setup({ id: 9, emp_id_fk: 500 });
    await expect(service.update(9, { empId: 900 } as never, tantaUser)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
