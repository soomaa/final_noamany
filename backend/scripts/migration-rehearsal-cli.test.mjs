import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

function runRehearsal() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'prisma/scripts/migration-rehearsal.ts'],
      {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test(
  'migration rehearsal proves fresh deploy, legacy repair, zero drift, and exact cleanup',
  { skip: process.env.RUN_DB_MIGRATION_TESTS !== '1', timeout: 120_000 },
  async () => {
    const result = await runRehearsal();

    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepEqual(payload, {
      status: 'passed',
      freshMigrations: true,
      historyRepair: true,
      driftFree: true,
      databaseDropped: true,
    });
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /mysql:\/\//i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /DATABASE_URL=/i);
  },
);
