import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DashboardSummary } from '@/types';

export function useDashboard(params: { branch?: number | 'all'; manWomen?: number }) {
  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: async () => {
      const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
        params: {
          branch: params.branch ?? 'all',
          manWomen: params.manWomen,
        },
      });
      return data;
    },
  });
}
