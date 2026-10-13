import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PosEmployee {
  id: number;
  employee: string | null;
  emp_code: number | null;
}

interface PosUserFallback {
  id: number;
  name?: string | null;
  username?: string | null;
  employee?: string | null;
  emp_code?: number | null;
}

async function fetchPosEmployeeOptions(): Promise<PosEmployee[]> {
  try {
    const { data } = await api.get<PosEmployee[]>('/employees/pos-options');
    if (Array.isArray(data)) return data;
  } catch {
    /* cafe deploy has no EmployeesModule — try compat alias then users */
  }
  try {
    const { data } = await api.get<PosEmployee[]>('/pos/employee-options');
    if (Array.isArray(data)) return data;
  } catch {
    /* fall through */
  }
  try {
    const { data } = await api.get<PosUserFallback[]>('/users');
    if (!Array.isArray(data)) return [];
    return data.map((u) => ({
      id: u.id,
      employee: u.employee ?? u.name ?? u.username ?? null,
      emp_code: u.emp_code ?? null,
    }));
  } catch {
    return [];
  }
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
