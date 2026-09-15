import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderReview } from "./pos-order-review.ts";

test("buildOrderReview prepares line totals and the full order summary", () => {
  const review = buildOrderReview([
    { name: "مياه كبيرة", quantity: 2, unitPrice: 15 },
    { name: "Red Bull", quantity: 1, unitPrice: 80 },
  ]);

  assert.deepEqual(
    review.lines.map(({ lineTotal }) => lineTotal),
    [30, 80],
  );
  assert.equal(review.productCount, 2);
  assert.equal(review.totalUnits, 3);
  assert.equal(review.subtotal, 110);
});

test("buildOrderReview normalizes unsafe numeric values", () => {
  const review = buildOrderReview([
    { name: "منتج", quantity: Number.NaN, unitPrice: -10 },
  ]);

  assert.equal(review.lines[0].quantity, 0);
  assert.equal(review.lines[0].unitPrice, 0);
  assert.equal(review.lines[0].lineTotal, 0);
  assert.equal(review.totalUnits, 0);
  assert.equal(review.subtotal, 0);
});
