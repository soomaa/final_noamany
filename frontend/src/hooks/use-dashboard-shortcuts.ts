import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

interface SavedShortcuts { routes: string[] }

export function useDashboardShortcuts(userId: number) {
  const qc = useQueryClient();
  const { ui } = useLocale();
  const queryKey = ['me', 'shortcuts', userId];
  const query = useQuery({
    queryKey,
    queryFn: async () => (await api.get<SavedShortcuts>('/me/shortcuts')).data,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const saving = useIsMutating({ mutationKey: queryKey }) > 0;
  const mutation = useMutation({
    mutationKey: queryKey,
    mutationFn: async (routes: string[]) => (await api.put<SavedShortcuts>('/me/shortcuts', { routes })).data,
    onMutate: async (routes) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<SavedShortcuts>(queryKey);
      qc.setQueryData<SavedShortcuts>(queryKey, { routes });
      return { previous };
    },
    onSuccess: (data) => qc.setQueryData(queryKey, data),
    onError: (error, _routes, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
      toast.error(apiError(error, ui('تعذر حفظ الاختصارات. حاول مرة أخرى.')));
      void qc.invalidateQueries({ queryKey: ['me', 'permissions'] });
    },
  });
  return { ...query, saving, save: (routes: string[]) => mutation.mutate(routes) };
}
