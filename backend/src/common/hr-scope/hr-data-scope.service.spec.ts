import { HrDataScopeService } from './hr-data-scope.service';
import { JwtUser } from '../types/jwt-user';

describe('HrDataScopeService employee matrix', () => {
  const base: JwtUser = {
    sub: 7,
    employeeId: 17,
    employeeCode: 4401,
    emp_code: 17,
    level: 2,
    branch: 3,
    branch_name: null,
    man_women_type: 0,
    name: 'موظف',
    image: null,
    job_title: null,
    is_trainer: false,
    trainer_id: null,
  };

  function service(scope?: string) {
    return new HrDataScopeService(
      { scopeFor: jest.fn().mockResolvedValue(scope) } as never,
      { allowedBranchIds: jest.fn().mockReturnValue([3, 6, 7]) } as never,
      {
        employees: {
          findUnique: jest.fn().mockResolvedValue({ edara_id: 12 }),
          findMany: jest.fn().mockResolvedValue([{ id: 17, emp_code: 4401 }]),
        },
      } as never,
    );
  }

  it('allows a super admin to query all employees', async () => {
    await expect(service().employeeWhere({ ...base, level: 1 })).resolves.toEqual({});
  });

  it('builds request predicates from scoped employee ids and business codes', async () => {
    await expect(service('own').requestWhere(base)).resolves.toEqual({
      OR: [{ emp_id_fk: { in: [17] } }, { emp_code_fk: { in: [4401] } }],
    });
  });

  it('exposes canonical scoped identities for non-relational HR records', async () => {
    await expect(service('own').employeeIdentities(base, 'finance.loans')).resolves.toEqual({
      ids: [17], codes: [4401],
    });
  });

  it('keeps globally scoped request queries unrestricted', async () => {
    await expect(service('global').requestWhere(base)).resolves.toEqual({});
  });

  it('defaults an ordinary employee to self only', async () => {
    await expect(service().employeeWhere(base)).resolves.toEqual({ id: 17 });
  });

  it('fails closed for an unlinked employee account', async () => {
    await expect(
      service('own').employeeWhere({ ...base, employeeId: null, employeeCode: null, emp_code: null }),
    ).resolves.toEqual({ id: -1 });
  });

  it('converts branch scope into a SQL branch predicate', async () => {
    await expect(
      service('branch').employeeWhere({ ...base, level: 3 }),
    ).resolves.toEqual({ branch_id_fk: { in: [3, 6, 7] } });
  });

  it('converts department scope into a SQL department predicate', async () => {
    await expect(service('department').employeeWhere(base)).resolves.toEqual({ edara_id: 12 });
  });

  it('keeps team scope inside the actor branch set', async () => {
    await expect(service('team').employeeWhere({ ...base, level: 3 })).resolves.toEqual({
      AND: [
        { branch_id_fk: { in: [3, 6, 7] } },
        { OR: [{ id: 17 }, { manger: '17' }, { manger: '4401' }] },
      ],
    });
  });
});
