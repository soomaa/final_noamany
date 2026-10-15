import { api } from '@/lib/api';
import type { ClubSearchHit } from '@/types/gym-ops';

export const MEMBER_SEARCH_MIN_CHARS = 2;
export const MEMBER_SEARCH_MAX_RESULTS = 5;

export interface ClubSearchResult {
  hits: ClubSearchHit[];
  topMatch: ClubSearchHit | null;
}

/** Search members by code, name, phone, or card — returns at most 5 hits. */
export async function searchClubMembers(q: string): Promise<ClubSearchResult> {
  const trimmed = q.trim();
  if (trimmed.length < MEMBER_SEARCH_MIN_CHARS) {
    return { hits: [], topMatch: null };
  }

  const { data } = await api.get<
    ClubSearchHit[] | { hits: ClubSearchHit[]; topMatch?: ClubSearchHit | null }
  >('/club/search', {
    params: { q: trimmed },
  });

  let hits: ClubSearchHit[];
  if (Array.isArray(data)) {
    hits = data;
  } else {
    hits = data.hits ?? [];
  }

  hits = hits.slice(0, MEMBER_SEARCH_MAX_RESULTS);
  return { hits, topMatch: hits[0] ?? null };
}
