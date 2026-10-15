import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DEFAULT_CLUB_PRINTING_POLICY, normalizeClubPrintingPolicy, shouldAutoPrint,
  type ClubPrintingPolicy, type ClubPrintTransactionType,
} from '@/lib/club-printing';

export function useClubPrintingPolicy() {
  const query = useQuery({
    queryKey: ['club-gym-policies', 'printing'],
    queryFn: async () => {
      const { data } = await api.get<Partial<ClubPrintingPolicy>>('/club/gym-policies');
      return normalizeClubPrintingPolicy(data);
    },
    staleTime: 60_000,
    retry: 1,
  });
  const policy = query.data ?? DEFAULT_CLUB_PRINTING_POLICY;
  const shouldPrint = useCallback(
    (type: ClubPrintTransactionType, amount: number, reference?: string | number | null) => shouldAutoPrint(policy, type, amount, reference),
    [policy],
  );
  return { policy, shouldPrint, isLoading: query.isLoading };
}
