import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const script = join(repo, 'release-one80-recipe-guard-20260920/server-deploy.sh');
const rel = 'src/modules/inventory/products.service.ts';
const baseline = execFileSync('git', ['show', 'HEAD:backend/' + rel], { cwd: repo, encoding: 'utf8' });
const updated = readFileSync(join(repo, 'release-one80-recipe-guard-20260920/payload', rel), 'utf8');

function run(mode) {
  const root = mkdtempSync(join(tmpdir(), 'one80-recipe-deploy-test-'));
  const app = join(root, 'app');
  const bin = join(root, 'bin');
  for (const dir of ['src/modules/inventory', 'dist', 'node_modules/typescript/bin']) mkdirSync(join(app, dir), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(app, rel), mode === 'unknown-source' ? 'unreviewed source' : baseline);
  writeFileSync(join(app, 'dist/main.js'), 'old compiled main');
  writeFileSync(join(app, 'tsconfig.json'), '{}');
  writeFileSync(join(app, 'tsconfig.build.json'), '{}');
  writeFileSync(join(app, '.env'), 'untouched env');
  writeFileSync(join(app, 'node_modules/typescript/bin/tsc'), `
    if (process.env.TEST_MODE === 'build-failure') process.exit(17);
    const fs = require('fs');
    fs.mkdirSync('dist/modules/inventory', { recursive: true });
    fs.writeFileSync('dist/main.js', 'new compiled main');
    fs.writeFileSync('dist/modules/inventory/products.service.js', 'module.exports = {};');
  `);
  const commands = {
    pm2: 'if [ "$1" = restart ]; then echo restart >> "$TEST_ROOT/restarts"; fi\n',
    curl: 'if [ "$TEST_MODE" = health-failure ] && [ -f "$TEST_ROOT/restarts" ]; then exit 22; fi\n',
    flock: 'exit 0\n',
    sleep: 'exit 0\n',
    sha256sum: 'exec shasum -a 256 "$@"\n',
  };
  for (const [name, body] of Object.entries(commands)) {
    writeFileSync(join(bin, name), '#!/bin/bash\n' + body);
    chmodSync(join(bin, name), 0o755);
  }
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, ONE80_APP_DIR: app, TEST_ROOT: root, TEST_MODE: mode },
  });
  return { root, app, result };
}

test('deploys only the reviewed source and compiled code and retains backup', () => {
  const { root, app, result } = run('success');
  try {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(readFileSync(join(app, rel), 'utf8'), updated);
    assert.equal(readFileSync(join(app, 'dist/main.js'), 'utf8'), 'new compiled main');
    assert.equal(readFileSync(join(app, '.env'), 'utf8'), 'untouched env');
    const backup = join(app, 'backups', readdirSync(join(app, 'backups'))[0]);
    assert.equal(readFileSync(join(backup, 'products.service.ts'), 'utf8'), baseline);
    assert.equal(readFileSync(join(backup, 'dist/main.js'), 'utf8'), 'old compiled main');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const mode of ['unknown-source', 'build-failure', 'health-failure']) {
  test(`${mode} leaves or restores the prior live source and compiled code`, () => {
    const { root, app, result } = run(mode);
    try {
      assert.notEqual(result.status, 0, result.stdout);
      assert.equal(readFileSync(join(app, rel), 'utf8'), mode === 'unknown-source' ? 'unreviewed source' : baseline);
      assert.equal(readFileSync(join(app, 'dist/main.js'), 'utf8'), 'old compiled main');
      assert.equal(readFileSync(join(app, '.env'), 'utf8'), 'untouched env');
      if (mode === 'health-failure') assert.equal(readFileSync(join(root, 'restarts'), 'utf8'), 'restart\nrestart\n');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
