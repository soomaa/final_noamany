import { BadRequestException } from '@nestjs/common';
import {
  allocateCollectedCafeSale,
  requireSaleClassification,
  summarizeCafeTargetLines,
} from './cafe-target-classification';

describe('café target classification', () => {
  it('counts only explicitly classified Protein lines even when product names suggest another class', () => {
    const summary = summarizeCafeTargetLines([
      { classification: 'protein', amount: 120, name: 'مياه معدنية' },
      { classification: 'bar', amount: 80, name: 'Protein Mega Shake' },
      { classification: 'management_withdrawal', amount: 0, name: 'Protein للإدارة' },
    ]);

    expect(summary).toEqual({
      proteinAmount: 120,
      barAmount: 80,
      managementWithdrawalCount: 1,
      targetAmount: 120,
    });
  });

  it('rejects an unclassified saleable product instead of inferring Protein from its name', () => {
    expect(() =>
      requireSaleClassification({
        name: 'Protein 100%',
        businessClassification: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts only the server-owned Protein or Bar product fact', () => {
    expect(
      requireSaleClassification({
        name: 'أي اسم',
        businessClassification: 'bar',
      }),
    ).toBe('bar');
  });

  it('allocates the amount actually collected across Protein and Bar without paying free units', () => {
    const rows = allocateCollectedCafeSale([
      { classification: 'protein', grossAmount: 100, paidAmount: 100 },
      { classification: 'bar', grossAmount: 100, paidAmount: 50 },
      { classification: null, grossAmount: 50, paidAmount: 50 },
    ], 180);

    expect(rows.map((row) => row.amount)).toEqual([90, 45, 45]);
    expect(summarizeCafeTargetLines(rows)).toMatchObject({
      proteinAmount: 90,
      barAmount: 45,
      targetAmount: 90,
    });
  });

  it('does not create a Protein payroll base for an uncollected sale', () => {
    expect(allocateCollectedCafeSale([
      { classification: 'protein', grossAmount: 200, paidAmount: 200 },
    ], 0)).toEqual([
      { classification: 'protein', grossAmount: 200, paidAmount: 200, amount: 0 },
    ]);
  });
});
