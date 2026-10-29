import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

const payload = {
  sub: 7,
  level: 2,
  emp_code: 21,
  branch: 3,
  branch_name: 'طنطا',
  man_women_type: 1,
  name: 'Reception',
  image: null,
  job_title: 'ريسبشن',
  is_trainer: false,
  trainer_id: null,
};

function strategyFor(employee: Record<string, unknown> | null, level = 2) {
  return new JwtStrategy(
    { get: jest.fn().mockReturnValue('test-access-secret') } as never,
    {
      users: { findUnique: jest.fn().mockResolvedValue({ approved: 1, level, emp_code: 21 }) },
      rbac_user_roles: { findFirst: jest.fn().mockResolvedValue(null) },
      rbac_user_section_exceptions: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
    } as never,
  );
}

describe('JwtStrategy inactive employees', () => {
  it('rejects a session whose employee was marked inactive', async () => {
    await expect(strategyFor({ emp_type: 1, employee_type: 2, leave_emp: 0 }).validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session whose employee was removed', async () => {
    await expect(strategyFor({ emp_type: 1, employee_type: 1, leave_emp: 1 }).validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps an active employee signed in', async () => {
    const user = await strategyFor({ emp_type: 1, employee_type: 1, leave_emp: 0 }).validate(payload);
    expect(user.sub).toBe(7);
  });

  it('never locks out a level-1 administrator', async () => {
    const user = await strategyFor({ emp_type: 1, employee_type: 2, leave_emp: 1 }, 1).validate({ ...payload, level: 1 });
    expect(user.level).toBe(1);
  });
});
