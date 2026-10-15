import { api } from '@/lib/api';

/** Fetch all rows from a paginated list endpoint (for reports). */
export async function fetchAllReportRows<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  // Keep this below production API validation caps while still fetching every page.
  pageSize = 200,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  while (true) {
    const { data: r } = await api.get<{ data: T[]; total: number }>(path, {
      params: { ...params, page, pageSize },
    });
    const batch = r.data ?? [];
    all.push(...batch);
    const total = r.total ?? all.length;
    if (all.length >= total || batch.length < pageSize) break;
    page += 1;
  }
  return all;
}
