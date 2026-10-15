import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClubSearchHit } from '@/types/gym-ops';
import { MEMBER_SEARCH_MAX_RESULTS, normalizeClubSearchResponse, isMemberSearchReady } from './club-member-search';

test('search starts from one English, Arabic or Persian digit, while names need two letters', () => {
  for (const query of ['0', '7', '٧', '۷', ' ١ ', '01', 'منى', 'A7']) {
    assert.equal(isMemberSearchReady(query), true, query);
  }
  for (const query of ['', ' ', 'م', 'a']) {
    assert.equal(isMemberSearchReady(query), false, query);
  }
});

function hit(id: number, name = `Member ${id}`): ClubSearchHit {
  return {
    id,
    memberCode: `A${String(id).padStart(6, '0')}`,
    name,
    phone: null,
    cardNumber: null,
    branchId: 1,
    gender: 'male',
    isActive: true,
    matchType: 'name',
    activeSubscriptionType: null,
    subscriptionStatus: 'active',
    remainingAmount: 0,
    lastCheckIn: null,
    score: 50,
  };
}

test('normalizes the direct array returned by the club search endpoint', () => {
  const result = normalizeClubSearchResponse([hit(1, 'Hussein Elhelalee')]);

  assert.equal(result.hits[0]?.name, 'Hussein Elhelalee');
  assert.equal(result.topMatch?.id, 1);
});

test('normalizes the entitlement response shape and keeps its explicit top match', () => {
  const first = hit(1);
  const preferred = hit(2);
  const result = normalizeClubSearchResponse({ hits: [first, preferred], topMatch: preferred });

  assert.equal(result.topMatch?.id, 2);
});

test('caps member-search results before rendering them in a combobox', () => {
  const result = normalizeClubSearchResponse(
    Array.from({ length: MEMBER_SEARCH_MAX_RESULTS + 3 }, (_, index) => hit(index + 1)),
  );

  assert.equal(result.hits.length, MEMBER_SEARCH_MAX_RESULTS);
});
