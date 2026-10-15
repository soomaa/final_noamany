import { normalizeBillingCycle, resolvePosDiscountPercentage, sameSaleCart } from "./sales.utils";

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

describe("normalizeBillingCycle", () => {
  it("retires the daily cycle: daily becomes monthly, everything else is untouched", () => {
    expect(normalizeBillingCycle("daily")).toBe("monthly");
    expect(normalizeBillingCycle("monthly")).toBe("monthly");
    expect(normalizeBillingCycle("immediate")).toBe("immediate");
    expect(normalizeBillingCycle(undefined)).toBeUndefined();
    expect(normalizeBillingCycle(null)).toBeNull();
  });
});

describe("sameSaleCart", () => {
  const saved = [
    { cafe_product_id: 7, cafe_variant_id: null, product_id: 44, bundle_id: null, quantity: "2" },
    { cafe_product_id: 9, cafe_variant_id: 3, product_id: 0, bundle_id: null, quantity: 1 },
  ];
  it("matches the same products, sizes and quantities in any order", () => {
    expect(sameSaleCart([{ cafeProductId: 9, cafeVariantId: 3, quantity: 1 }, { cafeProductId: 7, quantity: 2 }], saved)).toBe(true);
  });
  it("rejects a changed quantity, an extra line or a different size", () => {
    expect(sameSaleCart([{ cafeProductId: 7, quantity: 3 }, { cafeProductId: 9, cafeVariantId: 3, quantity: 1 }], saved)).toBe(false);
    expect(sameSaleCart([{ cafeProductId: 7, quantity: 2 }], saved)).toBe(false);
    expect(sameSaleCart([{ cafeProductId: 7, quantity: 2 }, { cafeProductId: 9, cafeVariantId: 4, quantity: 1 }], saved)).toBe(false);
  });
  it("treats bundle lines by bundle id", () => {
    expect(sameSaleCart([{ bundleId: 5, quantity: 1 }], [{ bundle_id: 5, cafe_product_id: null, quantity: 1 }])).toBe(true);
    expect(sameSaleCart([{ bundleId: 6, quantity: 1 }], [{ bundle_id: 5, cafe_product_id: null, quantity: 1 }])).toBe(false);
  });
  it('does not replay a saved bundle with different component choices or sizes', () => {
    const snapshot = [{ groupId: 10, cafeProductId: 7, cafeVariantId: null }, { groupId: 20, cafeProductId: 8, cafeVariantId: 2 }];
    const invoice = [{ bundle_id: 5, bundle_selection: snapshot, quantity: 1 }];
    expect(sameSaleCart([{ bundleId: 5, bundleSelections: [...snapshot].reverse(), quantity: 1 }], invoice)).toBe(true);
    expect(sameSaleCart([{ bundleId: 5, bundleSelections: [{ ...snapshot[0], cafeProductId: 99 }, snapshot[1]], quantity: 1 }], invoice)).toBe(false);
    expect(sameSaleCart([{ bundleId: 5, bundleSelections: [snapshot[0], { ...snapshot[1], cafeVariantId: 3 }], quantity: 1 }], invoice)).toBe(false);
    // A fixed combo submitted without explicit picks must still replay its server-resolved defaults.
    expect(sameSaleCart([{ bundleId: 5, quantity: 1 }], invoice)).toBe(true);
  });
});
