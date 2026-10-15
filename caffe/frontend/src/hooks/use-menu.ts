import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MenuNode } from '@/types';

export function useMenu() {
  return useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      const { data } = await api.get<MenuNode[]>('/me/menu');
      return data;
    },
  });
}
