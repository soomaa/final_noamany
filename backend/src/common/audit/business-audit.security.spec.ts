import { RequestContextService } from '../http/request-context.service';
import {
  BusinessAuditService,
  computeChangedFields,
  sanitizeAuditValue,
} from './business-audit.service';

describe('business audit security foundation', () => {
  it('recursively redacts credentials and HR financial/personal values', () => {
    expect(
      sanitizeAuditValue({
        name: 'موظف',
        email: 'employee@example.test',
        address: 'Cairo street',
        personalPhoto: '/uploads/employee.png',
        birthDate: '1990-01-01',
        password: 'secret',
        refreshToken: 'token',
        basic_salary: 9000,
        bank_account_num: '123',
        nested: { phone: '01000000000', status: 'active' },
      }),
    ).toEqual({
      name: '[REDACTED]',
      email: '[REDACTED]',
      address: '[REDACTED]',
      personalPhoto: '[REDACTED]',
      birthDate: '[REDACTED]',
      password: '[REDACTED]',
      refreshToken: '[REDACTED]',
      basic_salary: '[REDACTED]',
      bank_account_num: '[REDACTED]',
      nested: { phone: '[REDACTED]', status: 'active' },
    });
  });

  it('retains changed field names while values are redacted separately', () => {
    expect(
      computeChangedFields(
        { basic_salary: 8000, status: 'active' },
        { basic_salary: 9000, status: 'active' },
      ),
    ).toEqual(['basic_salary']);
  });

  it('redacts unknown and legacy DTO fields by default instead of relying on aliases', () => {
    expect(
      sanitizeAuditValue({
        jwal: '01000000000',
        other_jwal: '01100000000',
        deyana_fk: 2,
        phesh_genai: 'clearance.pdf',
        shahadt_jaish: 'yes',
        e3fa_reason: 'private medical reason',
        note: 'free-form employee details',
        status: 'active',
        approved: true,
      }),
    ).toEqual({
      jwal: '[REDACTED]',
      other_jwal: '[REDACTED]',
      deyana_fk: '[REDACTED]',
      phesh_genai: '[REDACTED]',
      shahadt_jaish: '[REDACTED]',
      e3fa_reason: '[REDACTED]',
      note: '[REDACTED]',
      status: 'active',
      approved: true,
    });
  });

  it('uses the active request correlation id and supports the caller transaction', async () => {
    const prisma = { business_audit_log: { create: jest.fn() } };
    const tx = { business_audit_log: { create: jest.fn() } };
    const requestContext = new RequestContextService();
    const service = new BusinessAuditService(prisma as never, requestContext);

    await requestContext.run({ correlationId: 'request_audit_123' }, () =>
      service.log(
        {
          entityType: 'employee',
          entityId: 17,
          action: 'employee.updated',
          before: { password: 'old', status: 'active' },
          after: { password: 'new', status: 'inactive' },
        },
        tx as never,
      ),
    );

    expect(prisma.business_audit_log.create).not.toHaveBeenCalled();
    expect(tx.business_audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlation_id: 'request_audit_123',
        before_json: { password: '[REDACTED]', status: 'active' },
        after_json: { password: '[REDACTED]', status: 'inactive' },
      }),
    });
  });

  it('filters audit reads to the authenticated branch scope', async () => {
    const prisma = { business_audit_log: {
      findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
    } };
    const branches = { allowedBranchIds: jest.fn().mockReturnValue([3, 6]) };
    const service = new BusinessAuditService(
      prisma as never,
      new RequestContextService(),
      branches as never,
    );
    await service.list({}, { sub: 7 } as never);
    expect(prisma.business_audit_log.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ branch_id: { in: [3, 6] } }] },
    }));
  });
});
