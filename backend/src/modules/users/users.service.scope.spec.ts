import { UsersService } from './users.service';

describe('UsersService operational scope', () => {
  const prisma = {
    users: { findUnique: jest.fn(), update: jest.fn() },
    permissions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    employees: { update: jest.fn() },
    tbl_branches: { findUnique: jest.fn() },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const service = new UsersService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('persists one authoritative branch and men/women scope on the linked employee', async () => {
    prisma.users.findUnique.mockResolvedValue({ user_id: 9, level: 3, emp_code: 41, branch_id_fk: 2 });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_id: 5 });
    prisma.users.update.mockResolvedValue({});
    prisma.employees.update.mockResolvedValue({});

    await expect(service.putPermissions(9, { permissions: [], scope: { branchId: 5, gender: 'female' } }))
      .resolves.toMatchObject({ scope: { branchId: 5, gender: 'female' } });
    expect(prisma.employees.update).toHaveBeenCalledWith({
      where: { id: 41 }, data: { branch_id_fk: 5, emp_type: 2 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete scope before starting the atomic permission replacement', async () => {
    prisma.users.findUnique.mockResolvedValue({ user_id: 9, level: 3, emp_code: 41, branch_id_fk: 2 });

    await expect(service.putPermissions(9, { permissions: ['12'], scope: { branchId: 0, gender: 'male' } }))
      .rejects.toThrow('حدد فرعًا وقسمًا صالحين');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.permissions.deleteMany).not.toHaveBeenCalled();
    expect(prisma.employees.update).not.toHaveBeenCalled();
  });
});
