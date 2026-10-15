import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const here = new URL("./", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, here), "utf8");

test("package settings manages the same promotion fields consumed by the member API", () => {
  const page = read("../club/package-settings.tsx");
  const types = read("../../types/club.ts");

  assert.match(page, /BadgePercent/);
  assert.match(page, /club-subscription-types\/\$\{promoTarget\.id\}\/promo/);
  assert.match(page, /promoMarketingMessage/);
  assert.match(page, /promoEndsAt/);
  assert.match(types, /promoEnabled\?: boolean/);
  assert.match(types, /promoPrice\?: number \| null/);
});

test("payment methods have a routable permissioned admin screen", () => {
  const page = read("payment-methods.tsx");
  const routes = read("../../app/router.tsx");
  const lazy = read("../../app/lazy-pages.ts");
  const routeConstants = read("../../lib/app-management-routes.ts");

  assert.match(page, /app-management\.payment-methods/);
  assert.match(page, /app\/payment-methods\/manage/);
  assert.match(page, /كل الفروع/);
  assert.match(routes, /path="app\/payment-methods"/);
  assert.match(lazy, /AppPaymentMethodsPage/);
  assert.match(routeConstants, /paymentMethods: '\/app\/payment-methods'/);
});

test("the operational trainer editor saves standalone member-visible availability", () => {
  const page = read("../club/fitness/trainers/index.tsx");

  assert.match(page, /club-trainers\/\$\{trainerId\}\/availability/);
  assert.match(page, /Time12Input/);
  assert.match(page, /أيام التواجد/);
  assert.match(
    page,
    /sm:grid-cols-\[minmax\(8rem,1fr\)_minmax\(8rem,1fr\)_minmax\(8rem,1fr\)_auto\]/,
  );
});
