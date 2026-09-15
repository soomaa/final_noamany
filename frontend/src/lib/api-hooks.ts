import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { listQueryToApiParams, type ListQueryParams } from '@/lib/use-list-query';
import type { PaginatedResponse } from '@/components/common/data-table';
import { toast } from 'sonner';

/** Client-side pagination for endpoints that return a plain array. */
export function clientPaginate<T>(
  items: T[],
  params: ListQueryParams,
  opts?: {
    search?: (item: T, q: string) => boolean;
    filter?: (item: T, filters: Record<string, string>) => boolean;
  },
): PaginatedResponse<T> {
  let list = items;
  const q = params.search.trim().toLowerCase();
  if (q && opts?.search) list = list.filter((item) => opts.search!(item, q));
  if (opts?.filter) list = list.filter((item) => opts.filter!(item, params.filters));
  const total = list.length;
  const start = (params.page - 1) * params.pageSize;
  return {
    data: list.slice(start, start + params.pageSize),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export function useArrayResource<T>(resource: string, enabled = true) {
  return useQuery({
    queryKey: [resource, 'array'],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<T[] | { data: T[] }>(`/${resource}`, { signal });
      // Tolerate both bare-array and paginated ({ data, total, ... }) envelopes,
      // so endpoints that gain pagination don't break array consumers.
      return (Array.isArray(data) ? data : (data?.data ?? [])) as T[];
    },
    enabled,
    retry: false,
  });
}

export function usePaginatedList<T>(resource: string, params: ListQueryParams, enabled = true) {
  return useQuery({
    queryKey: [resource, params],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<PaginatedResponse<T>>(`/${resource}`, {
        params: listQueryToApiParams(params),
        signal,
      });
      return data;
    },
    enabled,
    // Keep the current table visible while a page/filter request is in flight.
    placeholderData: keepPreviousData,
  });
}

export function useResource<T>(resource: string, id?: string | number, sub?: string) {
  const path = sub ? `/${resource}/${id}/${sub}` : id ? `/${resource}/${id}` : `/${resource}`;
  return useQuery({
    queryKey: [resource, id, sub],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<T>(path, { signal });
      return data;
    },
    enabled: id != null || !sub,
  });
}

export function useLookups(type: string) {
  return useQuery({
    queryKey: ['lookups', type],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ id: number; title: string }[]>(`/lookups/${type}`, { signal });
      return data;
    },
  });
}

export function useMutationWithToast<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  options: { success?: string; invalidate?: string[]; onSuccess?: () => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (options.success) toast.success(options.success);
      options.invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      options.onSuccess?.();
    },
    onError: (e) => toast.error(apiError(e)),
  });
}

export function isNotImplemented(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 501 || status === 404;
}
