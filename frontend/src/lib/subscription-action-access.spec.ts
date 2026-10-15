import assert from 'node:assert/strict';
import test from 'node:test';

test('reception update permission allows confirming a subscription renewal', async () => {
  const module = await import('./subscription-action-access.ts').catch(() => ({
    canConfirmSubscriptionRenewal: undefined,
  }));

  assert.equal(typeof module.canConfirmSubscriptionRenewal, 'function');
  assert.equal(
    module.canConfirmSubscriptionRenewal!((key) => key === 'club.reception:update'),
    true,
  );
});

test('reception operation permissions keep every subscription action visible', async () => {
  const module = await import('./subscription-action-access.ts').catch(() => ({
    subscriptionActionAccess: undefined,
  }));
  assert.equal(typeof module.subscriptionActionAccess, 'function');

  const granted = new Set([
    'club.reception:create',
    'club.reception:update',
    'club.reception:delete',
    'club.reception:print',
  ]);
  const access = module.subscriptionActionAccess!((key) => granted.has(key));

  assert.deepEqual(access, {
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canPrint: true,
  });
});

test('view-only reception access does not expose subscription mutations', async () => {
  const { subscriptionActionAccess } = await import('./subscription-action-access.ts');
  const access = subscriptionActionAccess((key) => key === 'club.reception:view');

  assert.deepEqual(access, {
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canPrint: false,
  });
});
