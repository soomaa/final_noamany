import { BadRequestException } from '@nestjs/common';
import { SupplierInvoicesService } from './supplier-invoices.service';

describe('SupplierInvoicesService branch scope', () => {
  const service = new SupplierInvoicesService(
    {} as never,
    {} as never,
    { resolveBranchStockLocation: jest.fn() } as never,
    {} as never,
    {} as never,
    { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
  );

  it('requires the branch assigned to the authenticated user', () => {
    expect(() =>
      (service as unknown as { requireUserBranch: (user: { branch: number }) => number })
        .requireUserBranch({ branch: 0 }),
    ).toThrow(BadRequestException);
  });
});
