import { BadRequestException } from '@nestjs/common';

export interface PayrollTaxBracketInput {
  lowerBound: number;
  upperBound: number | null;
  ratePercent: number;
}

export interface PayrollTaxCalculationInput {
  periodicTaxableEarnings: number;
  periodicReliefs: number;
  periodsPerYear: number;
  annualAllowance: number;
  annualTaxCredit: number;
  brackets: PayrollTaxBracketInput[];
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateTaxBrackets(brackets: PayrollTaxBracketInput[]): void {
  if (!brackets.length) throw new BadRequestException('يجب تعريف شرائح ضريبة الدخل');
  const ordered = [...brackets].sort((a, b) => a.lowerBound - b.lowerBound);
  if (ordered[0].lowerBound !== 0) {
    throw new BadRequestException('يجب أن تبدأ شرائح الضريبة من صفر');
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const bracket = ordered[index];
    if (
      !Number.isFinite(bracket.lowerBound) ||
      bracket.lowerBound < 0 ||
      !Number.isFinite(bracket.ratePercent) ||
      bracket.ratePercent < 0 ||
      bracket.ratePercent > 100 ||
      (bracket.upperBound != null &&
        (!Number.isFinite(bracket.upperBound) || bracket.upperBound <= bracket.lowerBound))
    ) {
      throw new BadRequestException('تعريف شريحة ضريبة الدخل غير صالح');
    }
    if (index < ordered.length - 1) {
      if (bracket.upperBound == null || bracket.upperBound !== ordered[index + 1].lowerBound) {
        throw new BadRequestException('شرائح ضريبة الدخل يجب أن تكون متصلة بلا فجوات أو تداخل');
      }
    } else if (bracket.upperBound != null) {
      throw new BadRequestException('يجب أن تكون شريحة ضريبة الدخل الأخيرة مفتوحة الحد الأعلى');
    }
  }
}

export function calculatePeriodicIncomeTax(input: PayrollTaxCalculationInput) {
  if (!Number.isInteger(input.periodsPerYear) || input.periodsPerYear <= 0) {
    throw new BadRequestException('عدد فترات الضريبة السنوية غير صالح');
  }
  for (const value of [
    input.periodicTaxableEarnings,
    input.periodicReliefs,
    input.annualAllowance,
    input.annualTaxCredit,
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('مدخلات احتساب ضريبة الدخل غير صالحة');
    }
  }
  validateTaxBrackets(input.brackets);
  const brackets = [...input.brackets].sort((a, b) => a.lowerBound - b.lowerBound);
  const annualTaxableBase = money(
    Math.max(
      0,
      (input.periodicTaxableEarnings - input.periodicReliefs) * input.periodsPerYear -
        input.annualAllowance,
    ),
  );
  const bracketBreakdown = brackets.map((bracket) => {
    const upper = bracket.upperBound ?? annualTaxableBase;
    const taxableAmount = money(
      Math.max(0, Math.min(annualTaxableBase, upper) - bracket.lowerBound),
    );
    return {
      lowerBound: bracket.lowerBound,
      upperBound: bracket.upperBound,
      ratePercent: bracket.ratePercent,
      taxableAmount,
      taxAmount: money((taxableAmount * bracket.ratePercent) / 100),
    };
  });
  const annualGrossTax = money(bracketBreakdown.reduce((sum, row) => sum + row.taxAmount, 0));
  const annualTax = money(Math.max(0, annualGrossTax - input.annualTaxCredit));
  return {
    annualTaxableBase,
    annualGrossTax,
    annualTax,
    periodicTax: money(annualTax / input.periodsPerYear),
    bracketBreakdown,
  };
}
