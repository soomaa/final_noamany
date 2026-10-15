import { api } from '@/lib/api';
import type { ClubSearchHit } from '@/types/gym-ops';
import { isMemberSearchReady } from './member-search-query';
export { isMemberSearchReady } from './member-search-query';

export const MEMBER_SEARCH_MAX_RESULTS = 5;

export interface ClubSearchResult {
  hits: ClubSearchHit[];
  topMatch: ClubSearchHit | null;
}

export function normalizeClubSearchResponse(
  data: ClubSearchHit[] | { hits: ClubSearchHit[]; topMatch?: ClubSearchHit | null },
  maxResults = MEMBER_SEARCH_MAX_RESULTS,
): ClubSearchResult {
  const hits = (Array.isArray(data) ? data : data.hits ?? []).slice(0, maxResults);
  return {
    hits,
    topMatch: Array.isArray(data) ? hits[0] ?? null : data.topMatch ?? hits[0] ?? null,
  };
}

/** Search members by code, name, phone, or card — returns at most 5 hits. */
export async function searchClubMembers(
  q: string,
  options: { branchId?: number; signal?: AbortSignal } = {},
): Promise<ClubSearchResult> {
  const trimmed = q.trim();
  if (!isMemberSearchReady(trimmed)) {
    return { hits: [], topMatch: null };
  }

  const { data } = await api.get<
    ClubSearchHit[] | { hits: ClubSearchHit[]; topMatch?: ClubSearchHit | null }
  >('/club/search', {
    params: { q: trimmed, branchId: options.branchId || undefined, brief: true, limit: MEMBER_SEARCH_MAX_RESULTS },
    signal: options.signal,
  });

  return normalizeClubSearchResponse(data);
}
