export interface CommissionPreview {
  baseAmount: number;
  percent: number;
  amount: number;
  equation: string;
}

function safeNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function number(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function commissionPreview(rawBaseAmount: number, rawPercent: number): CommissionPreview {
  const baseAmount = safeNonNegative(rawBaseAmount);
  const percent = safeNonNegative(rawPercent);
  const amount = Math.round(baseAmount * percent) / 100;
  return {
    baseAmount,
    percent,
    amount,
    equation: `${number(baseAmount)} × ${Number.isInteger(percent) ? percent : number(percent)}% = ${number(amount)}`,
  };
}
