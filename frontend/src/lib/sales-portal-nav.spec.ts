import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterNavSections } from './filter-nav';
import { NAV_SECTIONS, navSectionLandingPath } from './nav';

describe('personal sales navigation', () => {
  it('puts the personal sales workspace before the receptionist departments', () => {
    const allowed = new Set([
      '/sales-portal',
      '/sales-portal/leads',
      '/sales-portal/results',
      '/club/reception',
    ]);
    const sections = filterNavSections(NAV_SECTIONS, (path) => allowed.has(path));

    assert.equal(sections[0]?.id, 'personal-sales');
    assert.equal(navSectionLandingPath('personal-sales'), '/sales-portal');
    assert.deepEqual(sections[0]?.items?.map((item) => item.to), [
      '/sales-portal',
      '/sales-portal/leads',
      '/sales-portal/results',
    ]);
    assert.equal(sections[1]?.id, 'club');
  });
});
