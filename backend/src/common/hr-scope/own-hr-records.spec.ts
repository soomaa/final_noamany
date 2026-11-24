import type { JwtUser } from '../types/jwt-user';
import { ownOnlyEmployeeIds } from './own-hr-records';

describe('ownOnlyEmployeeIds', () => {
  const base = { sub: 50, level: 2, emp_code: 900, branch: 3, name: 'x' } as unknown as JwtUser;
  const prisma = {
    users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 900 }) },
    employees: { findMany: jest.fn().mockResolvedValue([{ id: 77 }]) },
  };
  const engine = (approver: boolean) => ({ canAny: jest.fn().mockResolvedValue(approver) });

  it('limits a captain / reception account (view + create only) to its own employee', async () => {
    const result = await ownOnlyEmployeeIds(prisma as never, engine(false), base, 'leaves.permissions');
    expect(result).toEqual([77]);
    expect(prisma.employees.findMany).toHaveBeenCalledWith({ where: { OR: [{ id: 900 }, { emp_code: 900 }] }, select: { id: true } });
  });

  it('keeps the full board for approvers, branch managers and admins', async () => {
    expect(await ownOnlyEmployeeIds(prisma as never, engine(true), base, 'leaves.permissions')).toBeNull();
    expect(await ownOnlyEmployeeIds(prisma as never, engine(false), { ...base, level: 3 }, 'leaves.permissions')).toBeNull();
    expect(await ownOnlyEmployeeIds(prisma as never, engine(false), { ...base, is_super_admin: true } as JwtUser, 'leaves.permissions')).toBeNull();
  });

  it('shows nothing of others when the account is linked to no employee', async () => {
    const unlinked = { ...prisma, users: { findUnique: jest.fn().mockResolvedValue({ emp_code: null }) } };
    expect(await ownOnlyEmployeeIds(unlinked as never, engine(false), { ...base, emp_code: null } as unknown as JwtUser, 'leaves.requests')).toEqual([]);
  });
});
