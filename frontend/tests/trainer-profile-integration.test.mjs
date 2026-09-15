import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('registers the real trainer directory and nested manager profile without a duplicate sidebar page', async () => {
  const [router, lazyPages, routePages, trainerList, trainerPayments] = await Promise.all([
    readFrontend('../src/app/router.tsx'),
    readFrontend('../src/app/lazy-pages.ts'),
    readFrontend('../src/pages/club/fitness/route-pages.tsx'),
    readFrontend('../src/pages/club/fitness/trainers/index.tsx'),
    readFrontend('../src/pages/club/fitness/trainers/payments.tsx'),
  ]);

  assert.match(routePages, /export \{ FitnessTrainerProfilePage \} from '\.\/trainers\/profile';/);
  assert.match(lazyPages, /export const FitnessTrainerProfilePage\b/);
  assert.match(
    router,
    /<Route path="club\/fitness\/trainers" element=\{<Lazy><FitnessTrainersPage \/><\/Lazy>\} \/>/,
  );
  assert.match(
    router,
    /<Route path="club\/fitness\/trainers\/:id" element=\{<Lazy><FitnessTrainerProfilePage \/><\/Lazy>\} \/>/,
  );
  assert.equal((router.match(/path="club\/fitness\/trainers\/:id"/g) ?? []).length, 1);
  assert.match(trainerList, /profilePath\(row\.original\.id\)/);
  assert.match(trainerList, /عرض ملف المدرب/);
  assert.match(trainerPayments, /can\('club\.fitness\.trainer_payments:create'\)/);
  assert.match(trainerPayments, /actions=\{canCreate \?/);
});
