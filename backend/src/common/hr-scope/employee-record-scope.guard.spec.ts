import { ForbiddenException } from '@nestjs/common';
import { EmployeeRecordScopeGuard } from './employee-record-scope.guard';

describe('EmployeeRecordScopeGuard', () => {
  const user = { sub: 7, employeeId: 17 };
  function execution(id?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, params: id == null ? {} : { id } }),
      }),
    } as never;
  }

  it('allows an employee record only when it exists inside the SQL scope', async () => {
    const scope = { employeeWhere: jest.fn().mockResolvedValue({ id: 17 }) };
    const prisma = { employees: { count: jest.fn().mockResolvedValue(1) } };
    const guard = new EmployeeRecordScopeGuard(scope as never, prisma as never);

    await expect(guard.canActivate(execution('17'))).resolves.toBe(true);
    expect(prisma.employees.count).toHaveBeenCalledWith({
      where: { AND: [{ id: 17 }, { id: 17 }] },
    });
  });

  it('returns the same forbidden response for a foreign or absent record', async () => {
    const guard = new EmployeeRecordScopeGuard(
      { employeeWhere: jest.fn().mockResolvedValue({ branch_id_fk: { in: [3] } }) } as never,
      { employees: { count: jest.fn().mockResolvedValue(0) } } as never,
    );

    await expect(guard.canActivate(execution('99'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores routes that do not identify an employee record', async () => {
    const scope = { employeeWhere: jest.fn() };
    const guard = new EmployeeRecordScopeGuard(scope as never, {} as never);

    await expect(guard.canActivate(execution())).resolves.toBe(true);
    expect(scope.employeeWhere).not.toHaveBeenCalled();
  });
});
