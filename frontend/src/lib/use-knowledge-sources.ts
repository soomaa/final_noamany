import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LEAD_META_QUERY_KEY, type LeadMeta } from './customer-sources.ts';

/**
 * The «مصدر المعرفة» options for lead forms and filters. Read through `/club-leads/meta` rather
 * than `/club-customer-sources` so a sales rep can fill the form without holding the admin
 * permission that edits the list.
 */
export function useKnowledgeSources() {
  const { data } = useQuery({
    queryKey: LEAD_META_QUERY_KEY,
    queryFn: async () => (await api.get<LeadMeta>('/club-leads/meta')).data,
    staleTime: 60_000,
  });
  return data?.knowledgeSources ?? [];
}
