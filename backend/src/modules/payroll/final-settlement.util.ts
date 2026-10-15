import { BadRequestException } from '@nestjs/common';

export interface BenefitTier {
  lowerYears: number;
  upperYears: number | null;
  salaryMonthsPerYear: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateBenefitTiers(tiers: BenefitTier[]): void {
  if (!tiers.length) throw new BadRequestException('يجب تعريف شرائح مكافأة نهاية الخدمة');
  const ordered = [...tiers].sort((a, b) => a.lowerYears - b.lowerYears);
  if (ordered[0].lowerYears !== 0) throw new BadRequestException('يجب أن تبدأ شرائح مدة الخدمة من صفر');
  ordered.forEach((tier, index) => {
    if (
      !Number.isFinite(tier.lowerYears) ||
      tier.lowerYears < 0 ||
      !Number.isFinite(tier.salaryMonthsPerYear) ||
      tier.salaryMonthsPerYear < 0 ||
      (tier.upperYears != null &&
        (!Number.isFinite(tier.upperYears) || tier.upperYears <= tier.lowerYears))
    ) {
      throw new BadRequestException('تعريف شريحة مكافأة نهاية الخدمة غير صالح');
    }
    if (index < ordered.length - 1) {
      if (tier.upperYears == null || tier.upperYears !== ordered[index + 1].lowerYears) {
        throw new BadRequestException('شرائح مدة الخدمة يجب أن تكون متصلة بلا فجوات أو تداخل');
      }
    } else if (tier.upperYears != null) {
      throw new BadRequestException('يجب أن تكون شريحة مدة الخدمة الأخيرة مفتوحة');
    }
  });
}

export function calculateFinalSettlementBenefits(input: {
  serviceYears: number;
  monthlyBenefitBase: number;
  unusedLeaveDays: number;
  leaveDailyBase: number;
  maxCompensatedLeaveDays: number | null;
  tiers: BenefitTier[];
}) {
  for (const value of [
    input.serviceYears,
    input.monthlyBenefitBase,
    input.unusedLeaveDays,
    input.leaveDailyBase,
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new BadRequestException('مدخلات التسوية النهائية غير صالحة');
  }
  validateBenefitTiers(input.tiers);
  const tiers = [...input.tiers].sort((a, b) => a.lowerYears - b.lowerYears);
  const benefitBreakdown = tiers.map((tier) => {
    const upper = tier.upperYears ?? input.serviceYears;
    const years = Math.max(0, Math.min(input.serviceYears, upper) - tier.lowerYears);
    return {
      ...tier,
      serviceYears: Math.round(years * 1_000_000) / 1_000_000,
      amount: money(years * tier.salaryMonthsPerYear * input.monthlyBenefitBase),
    };
  });
  const compensatedLeaveDays =
    input.maxCompensatedLeaveDays == null
      ? input.unusedLeaveDays
      : Math.min(input.unusedLeaveDays, input.maxCompensatedLeaveDays);
  return {
    endOfServiceBenefit: money(benefitBreakdown.reduce((sum, row) => sum + row.amount, 0)),
    compensatedLeaveDays,
    unusedLeaveCompensation: money(compensatedLeaveDays * input.leaveDailyBase),
    benefitBreakdown,
  };
}

export function serviceYearsBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new BadRequestException('تاريخا بداية ونهاية الخدمة غير صالحين');
  }
  return Math.round(((end - start) / 86_400_000 / 365.2425) * 1_000_000) / 1_000_000;
}
