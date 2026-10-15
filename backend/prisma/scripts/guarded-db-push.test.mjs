import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDbPushAllowed,
  parseGuardedDbPushMode,
} from './guarded-db-push.mjs';

const localDev = 'mysql://user:secret@localhost:3306/one80_hr_dev';

test('db push requires the exact local-only acknowledgement', () => {
  assert.throws(
    () =>
      assertDbPushAllowed({
        allowFlag: undefined,
        nodeEnv: 'development',
        databaseUrl: localDev,
      }),
    /ALLOW_PRISMA_DB_PUSH=local-only is required/,
  );
});

test('db push is forbidden in production even with an acknowledgement', () => {
  assert.throws(
    () =>
      assertDbPushAllowed({
        allowFlag: 'local-only',
        nodeEnv: 'production',
        databaseUrl: localDev,
      }),
    /db push is forbidden in production/,
  );
});

test('db push refuses an unqualified database name', () => {
  assert.throws(
    () =>
      assertDbPushAllowed({
        allowFlag: 'local-only',
        nodeEnv: 'development',
        databaseUrl: 'mysql://user:secret@localhost:3306/one80_hr',
      }),
    /database name must end in _dev or _e2e/,
  );
});

test('db push refuses a remote database host', () => {
  assert.throws(
    () =>
      assertDbPushAllowed({
        allowFlag: 'local-only',
        nodeEnv: 'development',
        databaseUrl: 'mysql://user:secret@db.internal:3306/one80_hr_dev',
      }),
    /database host must be loopback/,
  );
});

test('db push accepts explicit local development and e2e databases', () => {
  assert.deepEqual(
    assertDbPushAllowed({
      allowFlag: 'local-only',
      nodeEnv: 'development',
      databaseUrl: localDev,
    }),
    { databaseName: 'one80_hr_dev', host: 'localhost' },
  );
  assert.deepEqual(
    assertDbPushAllowed({
      allowFlag: 'local-only',
      nodeEnv: 'test',
      databaseUrl: 'mysql://user:secret@127.0.0.1:3306/one80_hr_e2e',
    }),
    { databaseName: 'one80_hr_e2e', host: '127.0.0.1' },
  );
});

test('guarded db push accepts no mode or the exact internal reseed mode only', () => {
  assert.equal(parseGuardedDbPushMode([]), 'push');
  assert.equal(parseGuardedDbPushMode(['--reseed']), 'reseed');
  assert.throws(() => parseGuardedDbPushMode(['--force-reset']), /unsupported guarded db push arguments/);
});
