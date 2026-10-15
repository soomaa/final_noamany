import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GlobalSettings } from '@/types/settings';

export function useGlobalSettings() {
  return useQuery({
    queryKey: ['settings', 'global'],
    queryFn: async () => {
      const { data } = await api.get<GlobalSettings | null>('/settings/global');
      return data;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
