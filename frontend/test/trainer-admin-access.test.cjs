const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('a trainer with administrative permissions is not forced back to the trainer portal', () => {
  const router = fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8');

  assert.match(router, /hasAdministrativeAccess/);
  assert.doesNotMatch(
    router,
    /if \(user\?\.is_trainer && !TRAINER_ALLOWED_PATHS\.has\(normalizedPath\)\)/,
  );
});

test('the regular sidebar gives trainers a route back to their portal', () => {
  const sidebar = fs.readFileSync(path.join(root, 'src/components/layout/sidebar.tsx'), 'utf8');

  assert.match(sidebar, /function TrainerPortalNavLink/);
  assert.match(sidebar, /user\?\.is_trainer && <TrainerPortalNavLink/);
  assert.match(sidebar, /to="\/trainer"/);
});
