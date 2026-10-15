import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { normalizeClubSearchResponse } from '@/lib/club-member-search';
import { isReceptionSearchReady } from '@/lib/reception-scan';
import type { ClubSearchHit } from '@/types/gym-ops';

export function receptionSearchOptions(raw: string, branchId?: string | number, gender?: string, brief = true) {
  const q = raw.trim();
  return {
    queryKey: ['club-universal-search', branchId || 'all', gender || 'all', q, brief ? 'brief' : 'details'],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { data } = await api.get<ClubSearchHit[] | { hits: ClubSearchHit[]; topMatch?: ClubSearchHit | null }>(
        '/club/search',
        { params: { q, branchId: branchId || undefined, gender, brief, limit: 10 }, signal, timeout: 10_000 },
      );
      return normalizeClubSearchResponse(data, 10);
    },
    staleTime: 10_000,
    retry: false,
  };
}

/** Show identities immediately; optional package labels never block selection. */
export function useReceptionMemberSearch(raw: string, branchId?: string | number, gender?: string, enabled = true) {
  const options = receptionSearchOptions(raw, branchId, gender);
  const ready = enabled && isReceptionSearchReady(raw);
  const search = useQuery({ ...options, enabled: ready });
  const ids = search.data?.hits.map(hit => hit.id).join(',') ?? '';
  const identity = JSON.stringify(options.queryKey);
  const [settledIdentity, setSettledIdentity] = useState<string | null>(null);
  const hasHits = !!search.data?.hits.length;

  // Avoid launching history reads for every intermediate query while typing.
  useEffect(() => {
    setSettledIdentity(null);
    if (!ready || !hasHits) return;
    const timer = setTimeout(() => setSettledIdentity(identity), 600);
    return () => clearTimeout(timer);
  }, [identity, ready, hasHits]);

  const details = useQuery({
    queryKey: ['club-search-labels', branchId || 'all', gender || 'all', ids],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<Array<{ id: number; activeSubscriptionType: string | null }>>(
        '/club/search/metadata',
        { params: { memberIds: ids, branchId: branchId || undefined, gender }, signal, timeout: 10_000 },
      );
      return data;
    },
    staleTime: 30_000,
    retry: false,
    enabled: ready && hasHits && settledIdentity === identity,
  });
  const metadata = new Map(details.data?.map(hit => [hit.id, hit]));
  const data = search.data && {
    ...search.data,
    // Keep the identity, ordering and scope from the current brief response.
    hits: search.data.hits.map(hit => ({
      ...hit,
      activeSubscriptionType: metadata.get(hit.id)?.activeSubscriptionType ?? null,
    })),
  };
  return { ...search, data };
}
