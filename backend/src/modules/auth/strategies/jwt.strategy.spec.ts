import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('marks an active RBAC super-admin as unrestricted for branch scope', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 9 });
    const findMany = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({ approved: 1, level: 2 });
    const strategy = new JwtStrategy(
      { get: jest.fn().mockReturnValue('test-access-secret') } as never,
      {
        users: { findUnique },
        rbac_user_roles: { findFirst },
        rbac_user_section_exceptions: { findMany },
        employees: { findUnique: jest.fn().mockResolvedValue({ emp_type: 3 }) },
      } as never,
    );

    const user = await strategy.validate({
      sub: 42,
      level: 2,
      emp_code: 14,
      branch: 3,
      branch_name: 'طنطا',
      man_women_type: 0,
      name: 'Admin',
      image: null,
      job_title: 'مدير على النظام',
      is_trainer: false,
      trainer_id: null,
    });

    expect(user.is_super_admin).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 42, role: { is_super_admin: true } }),
      }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('uses the account\'s current level when a user is promoted after signing in', async () => {
    const findUnique = jest.fn().mockResolvedValue({ approved: 1, level: 1 });
    const findFirst = jest.fn();
    const strategy = new JwtStrategy(
      { get: jest.fn().mockReturnValue('test-access-secret') } as never,
      {
        users: { findUnique },
        rbac_user_roles: { findFirst },
        rbac_user_section_exceptions: { findMany: jest.fn() },
      } as never,
    );

    const user = await strategy.validate({
      sub: 42,
      level: 2,
      emp_code: 14,
      branch: 3,
      branch_name: 'طنطا',
      man_women_type: 0,
      name: 'Admin',
      image: null,
      job_title: 'مدير على النظام',
      is_trainer: false,
      trainer_id: null,
    });

    expect(user.level).toBe(1);
    expect(user.is_super_admin).toBe(true);
  });

  it('allows an all-sections employee to access both men and women sections', async () => {
    const findUnique = jest.fn().mockResolvedValue({ approved: 1, level: 2 });
    const findFirst = jest.fn().mockResolvedValue(null);
    const findMany = jest.fn().mockResolvedValue([]);
    const strategy = new JwtStrategy(
      { get: jest.fn().mockReturnValue('test-access-secret') } as never,
      {
        users: { findUnique },
        rbac_user_roles: { findFirst },
        rbac_user_section_exceptions: { findMany },
        employees: { findUnique: jest.fn().mockResolvedValue({ emp_type: 3 }) },
      } as never,
    );

    const user = await strategy.validate({
      sub: 42,
      level: 2,
      emp_code: 14,
      branch: 3,
      branch_name: 'طنطا',
      man_women_type: 3,
      name: 'All sections',
      image: null,
      job_title: 'موظف',
      is_trainer: false,
      trainer_id: null,
    });

    expect(user.member_sections).toEqual(['male', 'female']);
  });
});
