import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const buildScript = resolve(here, '..', 'server-clean-build.sh');

function fixture(mode = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'one80-clean-build-'));
  const app = join(root, 'app');
  const shared = join(root, 'shared');
  const fakeBin = join(root, 'bin');
  mkdirSync(join(app, 'dist'), { recursive: true });
  mkdirSync(shared, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(app, 'dist', 'stale-only.js'), 'old compiled artifact\n');
  writeFileSync(join(app, 'dist', 'main.js'), 'old main\n');
  writeFileSync(join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
if [ "${mode}" = "fail" ]; then exit 17; fi
mkdir -p dist/modules/club-members
printf '%s\n' 'new main' > dist/main.js
if [ "${mode}" = "missing-route" ]; then
  printf '%s\n' 'compiled controller without the required endpoint' > dist/modules/club-members/club-members.controller.js
else
  printf '%s\n' "Get(':id/profile-summary')" > dist/modules/club-members/club-members.controller.js
fi
`);
  chmodSync(join(fakeBin, 'npm'), 0o755);
  return { root, app, shared, fakeBin };
}

function runBuild(ctx) {
  return spawnSync('bash', [buildScript, ctx.app, ctx.shared], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${ctx.fakeBin}:${process.env.PATH}` },
  });
}

test('clean build removes stale compiled artifacts and retains the previous dist as rollback', () => {
  const ctx = fixture();
  try {
    const result = runBuild(ctx);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(join(ctx.app, 'dist', 'main.js'), 'utf8'), 'new main\n');
    assert.equal(readdirSync(join(ctx.app, 'dist')).includes('stale-only.js'), false);
    const backups = readdirSync(join(ctx.shared, 'dist-backups'));
    assert.equal(backups.length, 1);
    assert.equal(
      readFileSync(join(ctx.shared, 'dist-backups', backups[0], 'stale-only.js'), 'utf8'),
      'old compiled artifact\n',
    );
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('failed build restores the previous dist', () => {
  const ctx = fixture('fail');
  try {
    const result = runBuild(ctx);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /backend build failed/);
    assert.equal(readFileSync(join(ctx.app, 'dist', 'main.js'), 'utf8'), 'old main\n');
    assert.equal(readFileSync(join(ctx.app, 'dist', 'stale-only.js'), 'utf8'), 'old compiled artifact\n');
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('build missing the profile route is rejected and previous dist is restored', () => {
  const ctx = fixture('missing-route');
  try {
    const result = runBuild(ctx);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /profile-summary/);
    assert.equal(readFileSync(join(ctx.app, 'dist', 'main.js'), 'utf8'), 'old main\n');
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});
