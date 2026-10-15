import { BadRequestException } from '@nestjs/common';
import { calculatePeriodicIncomeTax, validateTaxBrackets } from './payroll-tax.util';

describe('payroll income tax policy', () => {
  const brackets = [
    { lowerBound: 0, upperBound: 20_000, ratePercent: 0 },
    { lowerBound: 20_000, upperBound: 50_000, ratePercent: 10 },
    { lowerBound: 50_000, upperBound: null, ratePercent: 20 },
  ];

  it('calculates progressive annual brackets and a deterministic periodic amount', () => {
    const result = calculatePeriodicIncomeTax({
      periodicTaxableEarnings: 10_000,
      periodicReliefs: 500,
      periodsPerYear: 12,
      annualAllowance: 12_000,
      annualTaxCredit: 600,
      brackets,
    });

    // annual base = (10,000 - 500) * 12 - 12,000 = 102,000
    // annual gross tax = 0 + 3,000 + 10,400 = 13,400; credit => 12,800
    expect(result.annualTaxableBase).toBe(102_000);
    expect(result.annualTax).toBe(12_800);
    expect(result.periodicTax).toBe(1066.67);
    expect(result.bracketBreakdown).toEqual([
      expect.objectContaining({ taxableAmount: 20_000, taxAmount: 0 }),
      expect.objectContaining({ taxableAmount: 30_000, taxAmount: 3_000 }),
      expect.objectContaining({ taxableAmount: 52_000, taxAmount: 10_400 }),
    ]);
  });

  it('never produces negative tax after allowances or credits', () => {
    expect(
      calculatePeriodicIncomeTax({
        periodicTaxableEarnings: 500,
        periodicReliefs: 700,
        periodsPerYear: 12,
        annualAllowance: 20_000,
        annualTaxCredit: 100,
        brackets,
      }).periodicTax,
    ).toBe(0);
  });

  it('rejects gaps, overlaps, invalid rates, and a bounded final bracket', () => {
    expect(() =>
      validateTaxBrackets([
        { lowerBound: 0, upperBound: 10_000, ratePercent: 0 },
        { lowerBound: 9_000, upperBound: null, ratePercent: 10 },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateTaxBrackets([{ lowerBound: 0, upperBound: 10_000, ratePercent: 101 }]),
    ).toThrow(BadRequestException);
  });
});
