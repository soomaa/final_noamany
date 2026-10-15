import { useQuery } from '@tanstack/react-query';
import { fetchAllReportRows } from '@/lib/report-fetch';
import type { EmployeeListItem } from '@/types/employees';

export function useEmployeeOptions(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'select-options'],
    queryFn: async () => {
      const data = await fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200);
      return data.map((e) => ({
        value: String(e.id),
        label: `${e.employee ?? '—'} (${e.emp_code ?? '—'})`,
      }));
    },
    enabled,
    staleTime: 60_000,
  });
}
