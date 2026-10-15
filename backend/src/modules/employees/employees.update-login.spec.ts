import { ConflictException } from '@nestjs/common';
import { EmployeesService } from './employees.service';

describe('EmployeesService.update login identity', () => {
  const phone = '01000000016';
  const form = {
    emp_name: 'Updated Employee',
    job_title_id_fk: '5',
    employment_type: '1',
    branch_id_fk: '2',
    jwal: phone,
    emp_type: '1',
    basic_salary: '5000',
    addToSystem: true,
    systemUsername: 'new-login',
    systemPassword: '',
  };

  function setup(otherUsername: string, otherEmployeeId: number | null = 900) {
    const employee = {
      id: 16, emp_code: 1016, employee: 'Original Employee', phone,
      branch_id_fk: 2, mosma_wazefy_code: 5, personal_photo: null, is_sales: false,
    };
    const users = [
      { user_id: 71, emp_code: 16, username: 'old-login', name: 'Original Employee',
        role_id_fk: 3, branch_id_fk: 2, password: 'existing-bcrypt-hash', approved: 1 },
      { user_id: 90, emp_code: otherEmployeeId, username: otherUsername, name: 'Other Account',
        role_id_fk: 3, branch_id_fk: 1, password: 'other-bcrypt-hash', approved: 1 },
    ];
    // Model the users query boundary so a phone alias in an OR filter really
    // finds the unrelated account, and excluding the current user matters.
    const prisma = {
      employees: {
        findUnique: jest.fn(async () => employee),
        findFirst: jest.fn(async () => null),
        update: jest.fn(async ({ data }) => Object.assign(employee, data)),
      },
      api_users: { findFirst: jest.fn(async () => null) },
      users: {
        findFirst: jest.fn(async ({ where }) => users.find((u) =>
          (where.emp_code === undefined || u.emp_code === where.emp_code) &&
          (where.user_id?.not === undefined || u.user_id !== where.user_id.not) &&
          (where.username === undefined || u.username === where.username) &&
          (!where.OR || where.OR.some((part: { username: string }) => part.username === u.username)),
        ) ?? null),
        update: jest.fn(async ({ where, data }) => {
          const user = users.find((u) => u.user_id === where.user_id);
          if (!user) throw new Error('Unknown user');
          return Object.assign(user, data);
        }),
        create: jest.fn(),
      },
      department_jobs: { findUnique: jest.fn(async () => ({ id: 5, name: 'Employee' })) },
      rbac_roles: {
        upsert: jest.fn(async () => ({ id: 3 })),
        findUnique: jest.fn(async () => ({ id: 21 })),
        findMany: jest.fn(async () => [{ id: 3 }]),
      },
      rbac_user_roles: {
        count: jest.fn(async () => 1),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async () => ({})),
      },
      $queryRaw: jest.fn(async () => []),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (work) =>
      Array.isArray(work) ? Promise.all(work) : work(prisma));
    const engine = { invalidateUser: jest.fn() };
    const service = new EmployeesService(prisma as never, engine as never, {} as never);
    return { service, prisma, employee, users };
  }

  it.each(['old-login', 'new-login', ` ${'new-login'} `])(
    'saves %j on the linked account when a different account is named after the employee phone',
    async (systemUsername) => {
      const { service, prisma, employee, users } = setup(phone);
      const untouchedAccount = { ...users[1] };

      await expect(service.update(16, { ...form, systemUsername }, 1)).resolves.toEqual({ id: 16 });

      expect(employee.employee).toBe('Updated Employee');
      expect(employee.emp_code).toBe(1016);
      expect(users[0]).toMatchObject({
        user_id: 71, emp_code: 16, username: systemUsername.trim(),
        name: 'Updated Employee', password: 'existing-bcrypt-hash',
      });
      expect(users[1]).toEqual(untouchedAccount);
      expect(prisma.users.create).not.toHaveBeenCalled();
    },
  );

  it('rechecks the actual username when provisioning inside the transaction', async () => {
    const { service, users } = setup(phone);

    await expect((service as any).provisionUser(
      16, 'Updated Employee', phone, 2, 3, phone, { username: 'new-login' },
    )).resolves.toBeUndefined();

    expect(users[0].username).toBe('new-login');
    expect(users[1].username).toBe(phone);
  });

  it.each([900, null, 16])(
    'rejects a username owned by a different account (employee link %j) before saving the employee',
    async (otherEmployeeId) => {
      const { service, prisma, employee, users } = setup('taken-login', otherEmployeeId);
      const before = users.map((u) => ({ ...u }));

      await expect(service.update(16, { ...form, systemUsername: 'taken-login' }, 1))
        .rejects.toBeInstanceOf(ConflictException);

      expect(employee.employee).toBe('Original Employee');
      expect(users).toEqual(before);
      expect(prisma.employees.update).not.toHaveBeenCalled();
    },
  );

  it('rejects the phone when it is explicitly requested as an already-taken username', async () => {
    const { service, employee } = setup(phone);

    await expect(service.update(16, { ...form, systemUsername: phone }, 1))
      .rejects.toBeInstanceOf(ConflictException);

    expect(employee.employee).toBe('Original Employee');
  });

  it('still rejects a phone actually assigned to a different employee', async () => {
    const { service, prisma, employee } = setup('unrelated-login');
    prisma.employees.findFirst.mockResolvedValue({ id: 900, employee: 'Other Employee' } as never);

    await expect(service.update(16, form, 1)).rejects.toBeInstanceOf(ConflictException);

    expect(employee.employee).toBe('Original Employee');
  });
});
