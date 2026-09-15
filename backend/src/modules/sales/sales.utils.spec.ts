import { resolvePosDiscountPercentage } from "./sales.utils";

describe("resolvePosDiscountPercentage", () => {
  it("uses the configured percentage as the initial fallback", () => {
    expect(resolvePosDiscountPercentage(undefined, 12)).toBe(12);
  });

  it("accepts a per-invoice POS override for employees and partners", () => {
    expect(resolvePosDiscountPercentage(7.5, 20)).toBe(7.5);
  });

  it("keeps the invoice percentage inside the supported range", () => {
    expect(resolvePosDiscountPercentage(140, 0)).toBe(100);
    expect(resolvePosDiscountPercentage(-4, 0)).toBe(0);
  });
});

