/** Refresh stock changed by another till while a stock screen remains mounted. */
export const liveStockQueryOptions = {
  staleTime: 0,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function stockListQueryOptions(resource: string) {
  return ['stock', 'products', 'cafe-products', 'product-branches'].includes(resource)
    ? liveStockQueryOptions : {};
}
