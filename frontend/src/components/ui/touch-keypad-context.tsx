import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { usePermission } from '@/hooks/use-permission';

export const TouchKeypadContext = createContext(false);
export const useTouchKeypad = () => useContext(TouchKeypadContext);

export function TouchKeypadProvider({ children }: { children: ReactNode }) {
  const user = useAuth((state) => state.user);
  const { can } = usePermission();
  const { data: branches } = useBranches();
  const branchId = String(user?.branch || branches?.[0]?.id || '');
  const { data } = useQuery({
    queryKey: ['pos-settings', 'general', branchId],
    queryFn: async () => (await api.get<Array<{ key: string; value: unknown }>>('/pos-settings/general', { params: { branchId } })).data,
    enabled: !!branchId && (can('gym-sales.sales.new_receipt:view') || can('gym-sales.sales.pos_admin:view') || can('gym-sales.sales.drafts:print')),
    staleTime: 30_000,
  });
  return <TouchKeypadContext.Provider value={data?.find((item) => item.key === 'touch_keypad_enabled')?.value === true}>{children}</TouchKeypadContext.Provider>;
}
