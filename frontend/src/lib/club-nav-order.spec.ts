import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUB_ROUTES } from './club-routes';
import { FITNESS_ROUTES } from './fitness-routes';
import { NAV_SECTIONS } from './nav';

const club = NAV_SECTIONS.find((section) => section.id === 'club');

test('club sidebar groups follow the requested running order', () => {
  assert.deepEqual((club?.groups ?? []).map((group) => group.id), [
    'club-membership',
    'club-subscriptions',
    'club-sales-management',
    'club-fitness-trainers',
    'club-lockers-mgmt',
    'financial-reports',
  ]);
});

test('subscriptions group lists packages first and drops the in-page duplicates', () => {
  const items = club?.groups?.find((group) => group.id === 'club-subscriptions')?.items ?? [];
  assert.deepEqual(items.map((item) => item.to), [
    CLUB_ROUTES.packages.settings,
    '/club/membership-add',
    CLUB_ROUTES.subscriptions.list,
    CLUB_ROUTES.subscriptions.new,
    CLUB_ROUTES.subscriptions.reports,
    CLUB_ROUTES.subscriptions.dailyCashier,
    CLUB_ROUTES.subscriptions.outstanding,
    CLUB_ROUTES.subscriptions.unifiedTreasury,
    FITNESS_ROUTES.inbody,
    FITNESS_ROUTES.facilities.spaInvoices,
    CLUB_ROUTES.subscriptions.customerSources,
  ]);
});

test('lockers stay on one page instead of separate add and settings links', () => {
  const items = club?.groups?.find((group) => group.id === 'club-lockers-mgmt')?.items ?? [];
  assert.deepEqual(items.map((item) => item.to), [CLUB_ROUTES.lockers.list]);
});

test('receipts, refunds, sales team and commission targets stay out of the sidebar', () => {
  const destinations = (club?.groups ?? []).flatMap((group) => group.items).map((item) => item.to);
  for (const hidden of [
    CLUB_ROUTES.subscriptions.receipts,
    CLUB_ROUTES.subscriptions.refunds,
    CLUB_ROUTES.sales.team,
    CLUB_ROUTES.sales.settings,
  ]) {
    assert.equal(destinations.includes(hidden), false, `${hidden} should not be in the sidebar`);
  }
});

test('payroll preparation and approval carry Arabic and English sidebar labels', async () => {
  const [ar, en] = await Promise.all([
    import('../locales/ar.json', { with: { type: 'json' } }).then((m) => m.default),
    import('../locales/en.json', { with: { type: 'json' } }).then((m) => m.default),
  ]);
  const arRoutes = (ar as { nav: { routes: Record<string, string> } }).nav.routes;
  const enRoutes = (en as { nav: { routes: Record<string, string> } }).nav.routes;
  for (const route of ['/finance/payroll-preparation', '/finance/payroll-approval', FITNESS_ROUTES.inbody]) {
    assert.ok(arRoutes[route], `${route} is missing an Arabic label`);
    assert.ok(enRoutes[route], `${route} is missing an English label`);
  }
  assert.match(arRoutes['/finance/payroll-preparation'], /[؀-ۿ]/);
  assert.match(arRoutes['/finance/payroll-approval'], /[؀-ۿ]/);
});
