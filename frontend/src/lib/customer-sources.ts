export type CustomerSource = {
  id: number;
  name: string;
  isActive: boolean;
};

export function selectableCustomerSources(sources: CustomerSource[]) {
  return sources.filter((source) => source.isActive);
}

/** Shared cache key so editing the list on the «مصادر المعرفة» tab refreshes every select. */
export const LEAD_META_QUERY_KEY = ['club-leads', 'meta'] as const;

export type LeadMeta = {
  sources: Array<{ value: string; label: string }>;
  statuses: Array<{ value: string; label: string }>;
  /** «مصدر المعرفة» — the active entries of the admin-managed customer-sources list. */
  knowledgeSources: Array<{ id: number; name: string }>;
};
