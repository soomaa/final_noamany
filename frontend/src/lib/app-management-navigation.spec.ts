import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_MANAGEMENT_ROUTES } from './app-management-routes';
import { NAV_SECTIONS } from './nav';

test('member notifications are a reachable app-management destination', () => {
  assert.equal(APP_MANAGEMENT_ROUTES.notifications, '/app/notifications');

  const section = NAV_SECTIONS.find((item) => item.id === 'app-management');
  const destinations = [
    ...(section?.items ?? []),
    ...(section?.groups ?? []).flatMap((group) => group.items),
  ].map((item) => item.to);

  assert.equal(destinations.includes('/app/notifications'), true);
});
