import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('keeps client-facing evaluation report and daily-close deep links canonical', async () => {
  const [evaluations, router] = await Promise.all([
    readFrontend('../src/pages/hr/evaluation-workspace.tsx'),
    readFrontend('../src/app/router.tsx'),
  ]);

  assert.match(evaluations, /params\.get\('tab'\) === 'report' \? 'reports'/);
  assert.match(
    router,
    /<Route path="club\/subscriptions\/daily-cashier" element=\{<Navigate to="\/club\/subscriptions\/reports\?tab=daily-close" replace \/>\} \/>/,
  );
});

test('permission count formatting stays hook-free across conditional render paths', async () => {
  const permissions = await readFrontend('../src/pages/users/permissions.tsx');
  const helper = permissions.match(/function toArabicCount\([\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(permissions, /toArabicCount\(checked\.size, ui\('٠١٢٣٤٥٦٧٨٩'\)\)/);
  assert.match(helper, /function toArabicCount\(n: number, digits: string\)/);
  assert.doesNotMatch(helper, /\bui\s*\(/);
});

test('barcode workspace tabs scroll without wrapping into mobile content', async () => {
  const barcode = await readFrontend('../src/pages/club/barcode-management.tsx');

  assert.match(barcode, /TabsList className="[^"]*flex-nowrap[^"]*overflow-x-auto[^"]*"/);
  assert.match(barcode, /\[&_\[role=tab\]\]:shrink-0/);
});
