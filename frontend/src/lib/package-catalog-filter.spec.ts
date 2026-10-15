import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countByCategory,
  filterPackages,
  matchesPackageCategory,
  matchesPackageSearch,
} from './package-catalog-filter';

const PACKAGES = [
  { name: 'Gold Monthly', categories: ['general_gym', 'offers'] },
  { name: 'ladies morning', categories: ['women_gym'] },
  { name: 'Boxing 12', categories: ['combat'] },
  { name: 'Unlisted plan', categories: [] },
  { name: 'Legacy plan' }, // older row with no categories at all
];

test('a blank search keeps everything, including rows with no categories', () => {
  assert.equal(filterPackages(PACKAGES, '', 'all').length, 5);
  assert.equal(filterPackages(PACKAGES, '   ', 'all').length, 5);
});

test('search matches on a substring, ignoring case', () => {
  assert.deepEqual(filterPackages(PACKAGES, 'gold', 'all').map((p) => p.name), ['Gold Monthly']);
  assert.deepEqual(filterPackages(PACKAGES, 'LADIES', 'all').map((p) => p.name), ['ladies morning']);
  assert.deepEqual(filterPackages(PACKAGES, 'plan', 'all').map((p) => p.name), [
    'Unlisted plan',
    'Legacy plan',
  ]);
});

test('category filter keeps only packages published under that section', () => {
  assert.deepEqual(filterPackages(PACKAGES, '', 'combat').map((p) => p.name), ['Boxing 12']);
  assert.deepEqual(filterPackages(PACKAGES, '', 'offers').map((p) => p.name), ['Gold Monthly']);
});

test('a package with no categories is hidden by any specific section, shown under all', () => {
  assert.equal(matchesPackageCategory([], 'general_gym'), false);
  assert.equal(matchesPackageCategory(undefined, 'general_gym'), false);
  assert.equal(matchesPackageCategory([], 'all'), true);
  assert.equal(matchesPackageCategory(undefined, 'all'), true);
});

test('search and category narrow together, not separately', () => {
  // "Gold Monthly" matches the text but is not a women_gym package.
  assert.deepEqual(filterPackages(PACKAGES, 'gold', 'women_gym'), []);
  assert.deepEqual(filterPackages(PACKAGES, 'gold', 'offers').map((p) => p.name), ['Gold Monthly']);
});

test('a package in several sections shows under each of them', () => {
  assert.equal(matchesPackageSearch('Gold Monthly', ''), true);
  assert.deepEqual(filterPackages(PACKAGES, '', 'general_gym').map((p) => p.name), ['Gold Monthly']);
  assert.deepEqual(filterPackages(PACKAGES, '', 'offers').map((p) => p.name), ['Gold Monthly']);
});

test('counts tally every section a package belongs to, and omit empty ones', () => {
  const counts = countByCategory(PACKAGES);
  assert.equal(counts.get('general_gym'), 1);
  assert.equal(counts.get('offers'), 1);
  assert.equal(counts.get('women_gym'), 1);
  assert.equal(counts.get('combat'), 1);
  // Nothing is published under these, so the chip shows zero rather than a stale number.
  assert.equal(counts.get('men_gym'), undefined);
  assert.equal(counts.get('classes'), undefined);
});
