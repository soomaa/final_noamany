import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PosEmployee {
  id: number;
  employee: string | null;
  emp_code: number | null;
}

async function fetchPosEmployeeOptions(): Promise<PosEmployee[]> {
  // Benefits are keyed by employee ID; user IDs must never substitute for them.
  const { data } = await api.get<PosEmployee[]>('/pos/employee-options');
  return Array.isArray(data) ? data : [];
}

export function usePosEmployeeOptions(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'pos-options'],
    queryFn: async () => {
      const data = await fetchPosEmployeeOptions();
      return data.map((employee) => ({
        value: String(employee.id),
        label: employee.employee?.trim() || '—',
        description: `كود الموظف: ${employee.emp_code ?? '—'}`,
        searchText: `${employee.employee ?? ''} ${employee.emp_code ?? ''}`,
      }));
    },
    enabled,
    staleTime: 60_000,
  });
}
