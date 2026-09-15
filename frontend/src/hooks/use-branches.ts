import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Branch } from '@/types/org';

async function fetchBranchOptions(): Promise<Branch[]> {
  try {
    const { data } = await api.get<Branch[]>('/club/branch-options');
    if (Array.isArray(data)) return data;
  } catch {
    /* fall through to org branches */
  }
  const { data } = await api.get<Branch[]>('/branches');
  return Array.isArray(data) ? data : [];
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'options'],
    queryFn: fetchBranchOptions,
    retry: false,
  });
}
