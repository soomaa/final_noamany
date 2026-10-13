jest.mock('../rbac/job-title-role.util', () => ({ syncEmployeeUserRole: jest.fn() }));

import { UsersService } from './users.service';

describe('UsersService.create', () => {
  it('updates an existing employee login instead of creating a duplicate account', async () => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 90, employee: 'موظف', branch_id_fk: 2 }) },
      users: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ user_id: 7 })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
      },
    };
    const service = new UsersService(prisma as never);

    await service.create({ username: 'employee.login', password: 'safe-password', level: 2, empCode: 1001 });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.update).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 7 } }));
  });
});
