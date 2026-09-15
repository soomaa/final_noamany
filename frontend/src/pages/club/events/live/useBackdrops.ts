export interface BackdropRow {
  id: string;
  label: string;
  url: string;
  storage_path: string | null;
  sort_order: number;
}

let CACHE: BackdropRow[] = [];

export const getCachedBackdrops = () => CACHE;
export const findBackdropById = (id: string) => CACHE.find((b) => b.id === id) || null;

/** Backdrops are stored as URLs inside display settings — no separate table in club events. */
export const useBackdrops = () => {
  return { backdrops: CACHE, refresh: async () => {} };
};
