import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ListQueryParams {
  page: number;
  pageSize: number;
  search: string;
  sort?: string;
  order?: 'asc' | 'desc';
  filters: Record<string, string>;
}

export function useListQuery(defaults?: Partial<ListQueryParams>) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ListQueryParams>(() => {
    const filters: Record<string, string> = { ...(defaults?.filters ?? {}) };
    searchParams.forEach((value, key) => {
      if (!['page', 'pageSize', 'search', 'sort', 'order', 'tab'].includes(key)) {
        filters[key] = value;
      }
    });
    return {
      page: Number(searchParams.get('page') ?? defaults?.page ?? 1),
      pageSize: Number(searchParams.get('pageSize') ?? defaults?.pageSize ?? 25),
      search: searchParams.get('search') ?? defaults?.search ?? '',
      sort: searchParams.get('sort') ?? defaults?.sort,
      order: (searchParams.get('order') as 'asc' | 'desc') ?? defaults?.order,
      filters,
    };
  }, [searchParams, defaults]);

  const setParams = useCallback(
    (patch: Partial<ListQueryParams> & { filters?: Record<string, string> }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.page != null) next.set('page', String(patch.page));
      if (patch.pageSize != null) next.set('pageSize', String(patch.pageSize));
      if (patch.search != null) {
        if (patch.search) next.set('search', patch.search);
        else next.delete('search');
      }
      if (patch.sort != null) {
        if (patch.sort) next.set('sort', patch.sort);
        else next.delete('sort');
      }
      if (patch.order != null) {
        if (patch.order) next.set('order', patch.order);
        else next.delete('order');
      }
      if (patch.filters) {
        Object.entries(patch.filters).forEach(([k, v]) => {
          if (v) next.set(k, v);
          else next.delete(k);
        });
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return { params, setParams };
}

export function listQueryToApiParams(params: ListQueryParams): Record<string, string | number> {
  const api: Record<string, string | number> = {
    page: params.page,
    pageSize: params.pageSize,
  };
  if (params.search) api.search = params.search;
  if (params.sort) api.sort = params.sort;
  if (params.order) api.order = params.order;
  Object.entries(params.filters).forEach(([k, v]) => {
    if (v) api[k] = v;
  });
  return api;
}
