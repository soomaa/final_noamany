import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backupScriptPath = fileURLToPath(new URL('backup-db.sh', import.meta.url));

async function runBackupFixture(t, databaseUrl, expectedPassword) {
  const root = await mkdtemp(join(tmpdir(), 'hr-backup-script-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });

  const scriptsDir = join(root, 'scripts');
  const binDir = join(root, 'bin');
  const backupsDir = join(root, 'backups');
  await Promise.all([
    mkdir(scriptsDir),
    mkdir(binDir),
    mkdir(backupsDir),
  ]);

  const sourceScript = await readFile(backupScriptPath, 'utf8');
  await writeFile(join(scriptsDir, 'backup-db.sh'), sourceScript, { mode: 0o700 });
  await writeFile(join(root, '.env'), `DATABASE_URL="${databaseUrl}"\n`);
  await writeFile(
    join(binDir, 'mysqldump'),
    '#!/usr/bin/env bash\n[ "${MYSQL_PWD-}" = "${EXPECTED_MYSQL_PWD-}" ] || exit 42\nprintf "%s\\n" "CREATE TABLE hr_backup_probe (id INT);"\n',
    { mode: 0o700 },
  );
  await Promise.all([
    writeFile(join(backupsDir, 'portable_hr_20260101T000000Z.sql.gz'), 'oldest'),
    writeFile(join(backupsDir, 'portable_hr_20260201T000000Z.sql.gz'), 'older'),
  ]);

  const result = spawnSync('/bin/bash', [join(scriptsDir, 'backup-db.sh')], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      BACKUP_DIR: backupsDir,
      BACKUP_KEEP: '2',
      EXPECTED_MYSQL_PWD: expectedPassword,
    },
    encoding: 'utf8',
  });

  return { result, backupsDir };
}

test('backup script runs on the system Bash and keeps only the configured newest backups', async (t) => {
  const { result, backupsDir } = await runBackupFixture(
    t,
    'mysql://user:password@127.0.0.1:3306/portable_hr',
    'password',
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /status=verified/);
  const files = (await readdir(backupsDir)).sort();
  assert.equal(files.some((name) => name.includes('20260101T000000Z')), false);
  assert.equal(files.some((name) => name.includes('20260201T000000Z')), true);
  assert.equal(files.filter((name) => name.endsWith('.sql.gz')).length, 2);
  assert.equal(files.filter((name) => name.endsWith('.sha256')).length, 1);
});

test('backup script preserves an empty database password without shifting connection fields', async (t) => {
  const { result } = await runBackupFixture(
    t,
    'mysql://user@127.0.0.1:3306/portable_hr',
    '',
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /status=verified/);
});

test('backup script decodes percent-encoded database credentials before invoking mysqldump', async (t) => {
  const { result } = await runBackupFixture(
    t,
    'mysql://user:p%40ss%3Aword@127.0.0.1:3306/portable_hr',
    'p@ss:word',
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /status=verified/);
});
