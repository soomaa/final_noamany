const SCORE_0_TO_100 = /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/;
const NON_NEGATIVE_MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;

export function isScoreOutOf100(value: string): boolean {
  return SCORE_0_TO_100.test(value.trim());
}

export function isNonNegativeMoney(value: string): boolean {
  return NON_NEGATIVE_MONEY.test(value.trim());
}
