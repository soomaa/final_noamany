import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EmployeeListItem } from '@/types/employees';

export function useEmployeeOptions(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'select-options'],
    queryFn: async () => {
      const { data } = await api.get<Pick<EmployeeListItem, 'id' | 'employee' | 'emp_code'>[]>('/employees/pos-options');
      return data.map((e) => ({
        value: String(e.id),
        label: `${e.employee ?? '—'} (${e.emp_code ?? '—'})`,
      }));
    },
    enabled,
    staleTime: 60_000,
  });
}
