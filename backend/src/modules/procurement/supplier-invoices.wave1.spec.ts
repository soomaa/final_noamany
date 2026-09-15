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

  it('converts a selected package count to the material base unit', () => {
    const baseQuantity = (service as unknown as {
      toBasePurchaseQuantity: (
        quantity: number,
        unit: string,
        product: { name_ar: string; unit_of_measure: string; is_packaged: boolean },
        productPackage: { product_id: number; package_base_quantity: number },
      ) => number;
    }).toBasePurchaseQuantity(
      3,
      'package',
      { name_ar: 'سيرب', unit_of_measure: 'ml', is_packaged: true },
      { product_id: 4, package_base_quantity: 700 },
    );

    expect(baseQuantity).toBe(2100);
  });
});

