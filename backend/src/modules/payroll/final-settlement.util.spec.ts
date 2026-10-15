import { BadRequestException } from '@nestjs/common';
import { calculateFinalSettlementBenefits, validateBenefitTiers } from './final-settlement.util';

describe('final settlement policy calculator', () => {
  const tiers = [
    { lowerYears: 0, upperYears: 5, salaryMonthsPerYear: 0.5 },
    { lowerYears: 5, upperYears: null, salaryMonthsPerYear: 1 },
  ];

  it('calculates service tiers and capped unused leave deterministically', () => {
    const result = calculateFinalSettlementBenefits({
      serviceYears: 7,
      monthlyBenefitBase: 6000,
      unusedLeaveDays: 40,
      leaveDailyBase: 300,
      maxCompensatedLeaveDays: 30,
      tiers,
    });
    expect(result.endOfServiceBenefit).toBe(27_000);
    expect(result.compensatedLeaveDays).toBe(30);
    expect(result.unusedLeaveCompensation).toBe(9_000);
  });

  it('rejects benefit tiers with a gap or without an open final tier', () => {
    expect(() =>
      validateBenefitTiers([
        { lowerYears: 0, upperYears: 5, salaryMonthsPerYear: 0.5 },
        { lowerYears: 6, upperYears: null, salaryMonthsPerYear: 1 },
      ]),
    ).toThrow(BadRequestException);
  });
});
