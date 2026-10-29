import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { RequestsService } from './requests.service';

const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as unknown as JwtUser;
const staff = { sub: 30, level: 2, branch: 2, emp_code: 300 } as unknown as JwtUser;
const approver = { sub: 31, level: 3, branch: 2, emp_code: 310 } as unknown as JwtUser;
const unlinked = { sub: 32, level: 3, branch: 2, emp_code: null } as unknown as JwtUser;

const build = (canReview: boolean) => {
  const prisma = {
    hr_requests: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { request_no: 4 } }),
      create: jest.fn().mockResolvedValue({ id: 77 }),
      update: jest.fn(),
    },
    hr_talabat_orders: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    employees: { findMany: jest.fn().mockResolvedValue([{ id: 300 }, { id: 301 }]), findUnique: jest.fn(), findFirst: jest.fn() },
  };
  const engine = { canAny: jest.fn().mockResolvedValue(canReview) };
  const service = new RequestsService(prisma as never, {} as never, new BranchScopeService(), engine as never);
  return { prisma, service };
};
const page = { page: 1, pageSize: 20, skip: 0, take: 20 } as never;

describe('RequestsService visibility', () => {
  it('limits a non-approver to their own requests', async () => {
    const { prisma, service } = build(false);
    await service.list(page, staff);
    expect(prisma.hr_requests.findMany.mock.calls[0][0].where.AND).toContainEqual({ emp_id_fk: { in: [300] } });
    expect(prisma.hr_talabat_orders.findMany.mock.calls[0][0].where.AND).toContainEqual({ emp_id_fk: { in: [300] } });
  });

  it('limits an approver to employees of their branch scope', async () => {
    const { prisma, service } = build(true);
    await service.list(page, approver);
    expect(prisma.employees.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branch_id_fk: { in: [2, 5, 6] } } }),
    );
    expect(prisma.hr_requests.findMany.mock.calls[0][0].where.AND).toContainEqual({ emp_id_fk: { in: [300, 301] } });
  });

  it('leaves the list unfiltered for system admins', async () => {
    const { prisma, service } = build(true);
    await service.list(page, admin);
    expect(prisma.hr_requests.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('forbids a non-approver from opening someone else\'s request', async () => {
    const { prisma, service } = build(false);
    prisma.hr_requests.findUnique.mockResolvedValue({ id: 5, emp_id_fk: 301, payload: '{}' });
    prisma.employees.findUnique.mockResolvedValue({ id: 301, branch_id_fk: 2 });
    await expect(service.findOne(5, staff)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids approving a request of a foreign-branch employee', async () => {
    const { prisma, service } = build(true);
    prisma.hr_requests.findUnique.mockResolvedValue({ id: 5, status: 0, emp_id_fk: 400, payload: '{}', type: 'leave' });
    prisma.employees.findUnique.mockResolvedValue({ id: 400, branch_id_fk: 4 });
    await expect(service.approve(5, approver)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.hr_requests.update).not.toHaveBeenCalled();
  });
});

describe('RequestsService.create employee resolution', () => {
  it('files for the caller (users.emp_code) and ignores a client empId', async () => {
    const { prisma, service } = build(false);
    prisma.employees.findUnique.mockResolvedValue({ id: 300, emp_code: 3000, employee: 'me', branch_id_fk: 2 });
    await service.create({ type: 'advance', empId: 999, payload: { empId: 999 } }, staff);
    expect(prisma.employees.findUnique).toHaveBeenCalledWith({ where: { id: 300 } });
    const data = prisma.hr_requests.create.mock.calls[0][0].data;
    expect(data.emp_id_fk).toBe(300);
    expect(JSON.parse(data.payload).empId).toBeUndefined();
  });

  it('never treats users.user_id as an employees.id', async () => {
    const { prisma, service } = build(false);
    await service.create({ type: 'advance' }, unlinked);
    expect(prisma.employees.findUnique).not.toHaveBeenCalled();
    expect(prisma.employees.findFirst).not.toHaveBeenCalled();
    expect(prisma.hr_requests.create.mock.calls[0][0].data.emp_id_fk).toBeUndefined();
  });

  it('lets an unlinked login name an in-scope employee but not a foreign one', async () => {
    const { prisma, service } = build(false);
    prisma.employees.findUnique.mockResolvedValueOnce({ id: 301, emp_code: 3010, employee: 'x', branch_id_fk: 5 });
    await service.create({ type: 'advance', empId: 301 }, unlinked);
    expect(prisma.hr_requests.create.mock.calls[0][0].data.emp_id_fk).toBe(301);

    prisma.employees.findUnique.mockResolvedValueOnce({ id: 400, emp_code: 4000, employee: 'y', branch_id_fk: 4 });
    await expect(service.create({ type: 'advance', empId: 400 }, unlinked)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
