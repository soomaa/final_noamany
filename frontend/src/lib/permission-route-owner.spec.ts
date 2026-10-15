import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionRouteOwner } from './permission-route-owner';

test('route ownership keeps exact, longest prefix and segment boundaries', () => {
  const routes = { '/club': 'club', '/club/reception': 'reception', '/club/reception/member': 'member' };
  assert.equal(permissionRouteOwner(routes, '/club/reception'), 'reception');
  assert.equal(permissionRouteOwner(routes, '/club/reception/member/7'), 'member');
  assert.equal(permissionRouteOwner(routes, '/club/receptionist'), 'club');
  assert.equal(permissionRouteOwner(routes, '/clubs'), null);
  assert.equal(permissionRouteOwner({}, '/club'), null);
});

test('shared lookups scan once, while refreshed permission payloads take effect', () => {
  let scans = 0;
  const routes = new Proxy({ '/club': 'old-owner' }, {
    ownKeys(target) { scans++; return Reflect.ownKeys(target); },
  });
  for (let i = 0; i < 100; i++) assert.equal(permissionRouteOwner(routes, '/club/reception'), 'old-owner');
  assert.equal(scans, 1);
  assert.equal(permissionRouteOwner({ '/club': 'new-owner' }, '/club/reception'), 'new-owner');
  assert.equal(permissionRouteOwner({}, '/club/reception'), null);
});

test('bounded cache keeps ownership correct across many record routes', () => {
  const routes = { '/club/reception': 'reception' };
  for (let id = 0; id < 600; id++) {
    assert.equal(permissionRouteOwner(routes, `/club/reception/${id}`), 'reception');
  }
  assert.equal(permissionRouteOwner(routes, '/club/reception/0'), 'reception');
  assert.equal(permissionRouteOwner(routes, '/missing'), null);
});
