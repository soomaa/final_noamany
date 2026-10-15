import { BadRequestException } from '@nestjs/common';
import { PayrollTaxPolicyService } from './payroll-tax-policy.service';

describe('PayrollTaxPolicyService fail-closed resolution', () => {
  it('fails when no published policy covers the whole payroll period', async () => {
    const prisma = { payroll_tax_policies: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PayrollTaxPolicyService(prisma as never);
    await expect(service.resolveForPeriod('2026-07-26', '2026-08-25')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to publish a policy whose effective period overlaps a published one', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      payroll_tax_policies: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          status: 'draft',
          effective_from: new Date('2026-01-01T00:00:00Z'),
          effective_to: null,
          source_reference: 'official',
          brackets: [
            { lower_bound: 0, upper_bound: 1000, rate_percent: 0 },
            { lower_bound: 1000, upper_bound: null, rate_percent: 10 },
          ],
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 2, code: 'OLD', version: 1 }),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new PayrollTaxPolicyService(prisma as never);
    await expect(service.publish(3, 7)).rejects.toThrow('تتداخل');
    expect(tx.payroll_tax_policies.update).not.toHaveBeenCalled();
  });

  it('fails when overlapping published policies make the result ambiguous', async () => {
    const policy = { id: 1, brackets: [] };
    const prisma = {
      payroll_tax_policies: { findMany: jest.fn().mockResolvedValue([policy, { ...policy, id: 2 }]) },
    };
    const service = new PayrollTaxPolicyService(prisma as never);
    await expect(service.resolveForPeriod('2026-07-26', '2026-08-25')).rejects.toThrow(
      'أكثر من سياسة',
    );
  });

  it('returns a serializable immutable calculation snapshot', async () => {
    const prisma = {
      payroll_tax_policies: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            code: 'EG-INCOME',
            version: 3,
            name: 'Policy',
            jurisdiction: 'EG',
            effective_from: new Date('2026-01-01T00:00:00Z'),
            effective_to: null,
            annual_allowance: '12000.00',
            annual_tax_credit: '500.00',
            periods_per_year: 12,
            source_reference: 'official-source',
            brackets: [
              { sort_order: 1, lower_bound: '0', upper_bound: '20000', rate_percent: '0' },
              { sort_order: 2, lower_bound: '20000', upper_bound: null, rate_percent: '10' },
            ],
          },
        ]),
      },
    };
    const service = new PayrollTaxPolicyService(prisma as never);
    const resolved = await service.resolveForPeriod('2026-07-26', '2026-08-25');

    expect(resolved.key).toBe('EG-INCOME@3');
    expect(resolved.snapshot).toEqual(
      expect.objectContaining({
        id: 9,
        code: 'EG-INCOME',
        version: 3,
        annualAllowance: 12000,
        sourceReference: 'official-source',
      }),
    );
    expect(JSON.stringify(resolved.snapshot)).toContain('ratePercent');
  });
});
