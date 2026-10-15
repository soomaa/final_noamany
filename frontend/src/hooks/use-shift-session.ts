import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ShiftSessionCurrent {
  id: number;
  sessionDate: string;
  shiftId: number;
  branchId: number | null;
  status: string;
  startTime: string;
  endTime: string | null;
  openingBalance: number;
  totalSales: number;
  totalCash: number;
  transactionsCount: number;
  expectedClosingBalance: number | null;
  userId: number;
  shift?: { id: number; shiftName: string; startTime: string; endTime: string; color: string; isLastShiftOfDay: boolean };
  drawerAdjustments?: number;
  transferredIn?: number;
}

export function useCurrentShiftSession(branchId?: string | number) {
  return useQuery({
    queryKey: ['shift-sessions', 'current', branchId],
    queryFn: async () => {
      const { data } = await api.get<ShiftSessionCurrent | null>('/shift-sessions/current', {
        params: branchId ? { branchId } : {},
      });
      return data;
    },
    enabled: !!branchId,
    refetchInterval: 30_000,
  });
}
