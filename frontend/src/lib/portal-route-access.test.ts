import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deniedRouteDestination,
  isSalesManagementRoute,
  personalPortalPermission,
} from './portal-route-access.ts';

test('authorizes the trainer portal from its permission even when the database route map is stale', () => {
  assert.equal(personalPortalPermission('/trainer', new Set(['trainer.portal:view'])), true);
  assert.equal(personalPortalPermission('/trainer', new Set()), false);
});

test('authorizes only the matching personal portal', () => {
  assert.equal(personalPortalPermission('/sales-portal', new Set(['sales.portal:view'])), true);
  assert.equal(personalPortalPermission('/sales-portal/leads', new Set(['sales.portal:view'])), true);
  assert.equal(personalPortalPermission('/sales-portal/results', new Set(['sales.portal:view'])), true);
  assert.equal(personalPortalPermission('/trainer', new Set(['sales.portal:view'])), false);
});

test('never redirects a denied route back to itself', () => {
  assert.equal(deniedRouteDestination('/trainer', '/trainer'), null);
  assert.equal(deniedRouteDestination('/employees', '/trainer'), '/trainer');
});

test('recognizes every direct sales management page without leaking into lead operations', () => {
  assert.equal(isSalesManagementRoute('/club/sales-dashboard'), true);
  assert.equal(isSalesManagementRoute('/club/sales-reports'), true);
  assert.equal(isSalesManagementRoute('/club/sales-settings'), true);
  assert.equal(isSalesManagementRoute('/club/leads'), false);
  assert.equal(isSalesManagementRoute('/club/members'), false);
});
