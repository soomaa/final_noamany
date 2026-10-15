import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from '../backend/node_modules/typescript/lib/typescript.js';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '..', 'backend');

test('backend build scope excludes TypeScript files left by old nested releases', () => {
  const root = mkdtempSync(join(tmpdir(), 'one80-build-scope-'));
  try {
    writeFileSync(join(root, 'tsconfig.json'), readFileSync(join(backend, 'tsconfig.json')));
    writeFileSync(join(root, 'tsconfig.build.json'), readFileSync(join(backend, 'tsconfig.build.json')));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'one80-full-code-old', 'app', 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'main.ts'), 'export const current = true;\n');
    writeFileSync(
      join(root, 'one80-full-code-old', 'app', 'src', 'main.ts'),
      'export const stale = true;\n',
    );

    const parsed = ts.getParsedCommandLineOfConfigFile(
      join(root, 'tsconfig.build.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic(diagnostic) {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
      },
    );
    assert.ok(parsed);
    assert.deepEqual(
      parsed.fileNames.map((file) => relative(root, file)).sort(),
      ['src/main.ts'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
