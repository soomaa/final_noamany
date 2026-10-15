import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('portable UI files contain no host routes or branding', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const files = [
    'src/hooks/use-branches.ts',
    'src/hooks/use-permission.ts',
    'src/pages/reports/hub.tsx',
    'src/pages/settings/business-audit.tsx',
    'src/components/brand/logo.tsx',
    'src/components/common/print-view.tsx',
    'src/store/locale.tsx',
  ];
  const source = files
    .map((file) => readFileSync(resolve(testDirectory, '..', file.replace(/^src\//, '')), 'utf8'))
    .join('\n');

  const forbidden = new RegExp([
    '/cl' + 'ub(?:/|[\'"`])',
    '/inven' + 'tory(?:/|[\'"`])',
    'gym' + '-sales',
    'ONE' + '80',
    'GYM\\s*&\\s*FIT' + 'NESS',
  ].join('|'), 'i');
  assert.doesNotMatch(source, forbidden);
});
