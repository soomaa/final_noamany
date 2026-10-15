import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Branch } from '@/types/org';
import { useAuth } from '@/store/auth';

async function fetchBranchOptions(): Promise<Branch[]> {
  try {
    const { data } = await api.get<Branch[]>('/branch-options');
    if (Array.isArray(data) && data.length >= 0) return data;
  } catch {
    /* ignore */
  }
  return [];
}

export function useBranches() {
  const userId = useAuth((state) => state.user?.sub);
  return useQuery({
    // The authenticated user is part of the cache identity; switching from admin to reception
    // must never reuse the admin's all-branches payload.
    queryKey: ['branches', 'options', userId ?? 'anonymous'],
    queryFn: fetchBranchOptions,
    enabled: userId != null,
    retry: false,
  });
}
