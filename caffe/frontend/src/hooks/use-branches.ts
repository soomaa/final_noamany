import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Branch } from '@/types/org';

async function fetchBranchOptions(): Promise<Branch[]> {
  // Prefer /branches (always present). Club alias is gym-only and 404s on Ordera cafe.
  try {
    const { data } = await api.get<Branch[]>('/branches');
    if (Array.isArray(data) && data.length >= 0) return data;
  } catch {
    /* fall through */
  }
  try {
    const { data } = await api.get<Branch[]>('/club/branch-options');
    if (Array.isArray(data)) return data;
  } catch {
    /* ignore */
  }
  return [];
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'options'],
    queryFn: fetchBranchOptions,
    retry: false,
  });
}
