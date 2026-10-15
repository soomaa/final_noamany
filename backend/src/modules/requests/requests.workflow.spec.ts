import { BadRequestException } from '@nestjs/common';
import { RequestsService } from './requests.service';

describe('RequestsService atomic approval workflow', () => {
  const request = {
    id: 41,
    type: 'allowance',
    emp_id_fk: 17,
    emp_code_fk: 4401,
    emp_name: 'موظف',
    status: 0,
    payload: JSON.stringify({ allowance_type_id: 3, amount: 500 }),
  };
  const user = { sub: 7, branch: 2 } as never;

  function makeService(effectFailure?: Error) {
    const tx = {
      $queryRaw: jest.fn(),
      hr_requests: {
        findUnique: jest.fn().mockResolvedValue(request),
        update: jest.fn(),
      },
      hr_request_effects: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 91 }),
      },
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 17 }),
        findFirst: jest.fn(),
      },
      business_audit_log: { create: jest.fn() },
    };
    const prisma = {
      hr_requests: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const effects = {
      prepare: jest.fn(),
      apply: effectFailure
        ? jest.fn().mockRejectedValue(effectFailure)
        : jest.fn().mockResolvedValue({
            snapshot: { employeeId: 17, amount: 500 },
            result: { domain: 'hr_finance_employes', id: 12 },
          }),
    };
    const audit = { log: jest.fn() };
    const service = new RequestsService(
      prisma as never,
      { requestWhere: jest.fn().mockResolvedValue({ emp_id_fk: { in: [17] } }) } as never,
      effects as never,
      audit as never,
    );
    return { service, prisma, tx, effects, audit };
  }

  it('commits domain effect, immutable evidence, audit, and approved state together', async () => {
    const { service, tx, effects, audit } = makeService();

    await expect(service.approve(41, user)).resolves.toMatchObject({
      id: 41,
      status: 'approved',
      effectId: 91,
    });

    expect(effects.apply).toHaveBeenCalledWith(
      tx,
      'allowance',
      41,
      17,
      4401,
      { allowance_type_id: 3, amount: 500 },
      7,
    );
    expect(tx.hr_request_effects.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ request_id: 41, employee_id: 17, applied_by: 7 }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hr_request.approved', actorUserId: 7 }),
      tx,
    );
    expect(tx.hr_requests.update).toHaveBeenCalledWith({
      where: { id: 41 },
      data: { status: 4, reason_action: 'approved' },
    });
  });

  it('does not approve when the domain handler fails', async () => {
    const { service, tx } = makeService(new BadRequestException('invalid effect'));

    await expect(service.approve(41, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.hr_request_effects.create).not.toHaveBeenCalled();
    expect(tx.hr_requests.update).not.toHaveBeenCalled();
  });

  it('rejects a stale or repeated approval before applying another effect', async () => {
    const { service, tx, effects } = makeService();
    tx.hr_requests.findUnique.mockResolvedValue({ ...request, status: 4 });

    await expect(service.approve(41, user)).rejects.toThrow('غير معلق');
    expect(effects.apply).not.toHaveBeenCalled();
  });
});
