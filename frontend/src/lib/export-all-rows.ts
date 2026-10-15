import { api } from '@/lib/api';
import { listQueryToApiParams, type ListQueryParams } from '@/lib/use-list-query';
import type { PaginatedResponse } from '@/components/common/data-table';

/** Backend `PaginationDto` caps `pageSize` at 500, so page in the largest allowed chunks. */
const EXPORT_CHUNK_SIZE = 500;
/** Safety valve so a mis-filtered export can never pull an unbounded number of rows. */
const EXPORT_MAX_ROWS = 50_000;

/**
 * Every row matching the current filters/search — not just the page on screen.
 * Exports go through this so «تصدير» downloads the whole report.
 */
export async function fetchAllListRows<T>(
  resource: string,
  params: ListQueryParams,
): Promise<T[]> {
  const base = listQueryToApiParams(params);
  const rows: T[] = [];

  // Endpoints clamp `pageSize` to different ceilings (50, 100, 200, 500) and derive
  // their offset from the size they applied, so follow whatever the server hands back.
  let stride = EXPORT_CHUNK_SIZE;

  for (let page = 1; ; page += 1) {
    const { data } = await api.get<PaginatedResponse<T>>(`/${resource}`, {
      params: { ...base, page, pageSize: stride },
    });
    const chunk = Array.isArray(data?.data) ? data.data : [];
    rows.push(...chunk);

    const applied = typeof data?.pageSize === 'number' && data.pageSize > 0 ? data.pageSize : stride;
    stride = Math.min(stride, applied);

    const total = typeof data?.total === 'number' ? data.total : rows.length;
    if (chunk.length < stride || rows.length >= total || rows.length >= EXPORT_MAX_ROWS) {
      break;
    }
  }

  return rows.slice(0, EXPORT_MAX_ROWS);
}

/** Describes how a table pulls and shapes every row for export. */
export interface ExportSource<T = Record<string, unknown>> {
  resource: string;
  params: ListQueryParams;
  /** Maps an API row to the localized export shape (same keys as `exportColumns`). */
  project?: (row: T, index: number) => Record<string, unknown>;
}
