import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

function runDoctor() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'prisma/scripts/migration-history-doctor.ts'],
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
  'history doctor dry-run inspects the real database without leaking its datasource URL',
  { skip: process.env.RUN_DB_MIGRATION_TESTS !== '1' },
  async () => {
    const result = await runDoctor();

    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.ok(
      ['clean', 'repairable'].includes(payload.status),
      `unexpected safe dry-run status: ${payload.status}`,
    );
    assert.equal(payload.changed, false);
    if (payload.status === 'repairable') {
      assert.equal(payload.legacyAlias, '20260707145000_hr_employment_type');
    } else {
      assert.equal(payload.legacyAlias, null);
    }
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /mysql:\/\//i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /DATABASE_URL=/i);
  },
);
