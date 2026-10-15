import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const archivePath = process.argv[2];

assert.ok(archivePath, 'Usage: node scripts/gate-agent-sdk-bundle.test.mjs <bundle.zip>');
assert.ok(existsSync(archivePath), `Gate Agent bundle does not exist: ${archivePath}`);

execFileSync('unzip', ['-t', archivePath], { stdio: 'pipe' });

const entries = execFileSync('zipinfo', ['-1', archivePath], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
const root = 'ONE80-GateAgent-Windows-1.0.0-with-ZKSDK/';
const requiredFiles = [
  'Collect-One80NetworkInfo.ps1',
  'ENGINEER-HANDOFF-AR.pdf',
  'INSTALLER-VALUES.template.txt',
  'Install-One80GateAgent.ps1',
  'MESSAGE-TO-INSTALLER-AR.txt',
  'One80.GateAgent.ps1',
  'PACKAGE-CONTENTS-AR.txt',
  'README.md',
  'SDK-PROVENANCE.txt',
  'Test-One80GateAgent.ps1',
  'config.example.json',
  'sdk/plcommpro.dll',
  'sdk/plcomms.dll',
  'sdk/plrscagent.dll',
  'sdk/plrscomm.dll',
  'sdk/pltcpcomm.dll',
];

for (const relativePath of requiredFiles) {
  assert.ok(entries.includes(`${root}${relativePath}`), `Missing required bundle file: ${relativePath}`);
}

const forbidden = entries.filter((entry) =>
  /(^|\/)(32bit|x86)(\/|$)|\.(exe|bat|pdb|suo|s3db)$|\.DS_Store$/i.test(entry),
);
assert.deepEqual(forbidden, [], `Unsafe or unnecessary SDK files included: ${forbidden.join(', ')}`);

const extractDir = mkdtempSync(join(tmpdir(), 'one80-gate-bundle-test-'));
try {
  execFileSync('unzip', ['-qq', archivePath, '-d', extractDir]);
  const sdkDir = join(extractDir, root, 'sdk');
  const plcommproPath = join(sdkDir, 'plcommpro.dll');
  const fileDescription = execFileSync('file', [plcommproPath], { encoding: 'utf8' });
  assert.match(fileDescription, /x86-64/, 'Bundled Pull SDK must be the 64-bit build');

  const exports = execFileSync('objdump', ['-p', plcommproPath], { encoding: 'utf8' });
  for (const functionName of [
    'Connect',
    'Disconnect',
    'ControlDevice',
    'SetDeviceData',
    'DeleteDeviceData',
    'GetRTLog',
    'GetDeviceData',
    'GetDeviceParam',
  ]) {
    assert.match(exports, new RegExp(`\\b${functionName}\\b`), `SDK export missing: ${functionName}`);
  }

  const provenance = readFileSync(join(extractDir, root, 'SDK-PROVENANCE.txt'), 'utf8');
  assert.match(provenance, /Pull component version:\s*2\.2\.0\.220/i);
  assert.match(provenance, /SHA-256:\s*ea28338da07864533a7bcc2142333b8398850dc62a5871fc8d6d5f6bc77d4ec6/i);
} finally {
  rmSync(extractDir, { recursive: true, force: true });
}

console.log('Gate Agent SDK bundle verification passed.');
