import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** A branch's bar and the store that feeds it (POS settings → مخزن البيع / مخزن التوريد). */
export interface BarRoute {
  branchId: number;
  barWarehouseId: number;
  barName: string;
  storeWarehouseId: number | null;
  storeName: string | null;
  storeBranchId: number | null;
}

export interface CafeLocation {
  id: number;
  name: string;
  kind: 'store' | 'bar';
  /** The branch the warehouse belongs to (a bar: the branch that sells from it). */
  branchId: number;
}

export interface CafeStore extends CafeLocation {
  kind: 'store';
  /** Bars this store issues to: one for الجلاء / البر الشرقي, طنطا up and طنطا down for طنطا. */
  bars: CafeLocation[];
}

export interface CafeLocations {
  /** false while loading, or when no branch has its bar set in POS settings (then callers fall back). */
  ready: boolean;
  /** مخزن الجلاء، مخزن البر الشرقي، مخزن طنطا. */
  stores: CafeStore[];
  /** بار الجلاء، بار البر الشرقي، بار طنطا up، بار طنطا down. */
  bars: CafeLocation[];
  /** Stores then bars: the from/to choices of a stock movement. */
  all: CafeLocation[];
  /** Branches that own a store (طنطا، البر الشرقي، الجلاء): the branch choices of purchases and sales. */
  mainBranchIds: number[];
  /** The bars a main branch sells from (طنطا → طنطا up / طنطا down; the others → their own bar). */
  barsOfMainBranch: (branchId: number) => CafeLocation[];
  /** The main branch a selling branch belongs to (طنطا up → طنطا), or the branch itself. */
  mainBranchOf: (branchId: number) => number;
}

/**
 * The client works with 3 stores and 4 bars (Nov 2026). Both come from the POS settings each branch
 * already has: its bar (sale_warehouse_id) and the store that feeds it (store_warehouse_id).
 * One store feeding several bars (مخزن طنطا → طنطا up / طنطا down) makes its own branch a main
 * branch that sells only through those bars, so the main branch's own bar (بار طنطا) is not offered.
 */
export function buildCafeLocations(routes: BarRoute[]): CafeLocations {
  const storeFeeds = new Map<number, BarRoute[]>();
  for (const route of routes) {
    if (route.storeWarehouseId == null) continue;
    storeFeeds.set(route.storeWarehouseId, [...(storeFeeds.get(route.storeWarehouseId) ?? []), route]);
  }
  const isParentBar = (route: BarRoute) => {
    if (route.storeWarehouseId == null) return false;
    const fed = storeFeeds.get(route.storeWarehouseId) ?? [];
    return fed.length > 1 && route.storeBranchId === route.branchId;
  };
  const barOf = (route: BarRoute): CafeLocation => ({ id: route.barWarehouseId, name: route.barName, kind: 'bar', branchId: route.branchId });
  const stores: CafeStore[] = [...storeFeeds.entries()].map(([id, fed]) => ({
    id,
    name: fed[0].storeName ?? `#${id}`,
    kind: 'store',
    branchId: fed[0].storeBranchId ?? fed[0].branchId,
    bars: fed.filter((route) => !isParentBar(route)).map(barOf),
  }));
  const order = (a: CafeLocation, b: CafeLocation) => a.branchId - b.branchId || a.id - b.id;
  stores.sort(order);
  const bars = routes.filter((route) => !isParentBar(route)).map(barOf).sort(order);
  const mainBranchIds = [...new Set(stores.map((store) => store.branchId))];
  const mainBranchOf = (branchId: number) => {
    if (mainBranchIds.includes(branchId)) return branchId;
    const route = routes.find((r) => r.branchId === branchId);
    return route?.storeBranchId ?? branchId;
  };
  const barsOfMainBranch = (branchId: number) => {
    const store = stores.find((s) => s.branchId === branchId);
    return store ? store.bars : bars.filter((bar) => bar.branchId === branchId);
  };
  return { ready: stores.length > 0, stores, bars, all: [...stores, ...bars], mainBranchIds, barsOfMainBranch, mainBranchOf };
}

export function useCafeLocations(): CafeLocations {
  const { data: routes = [] } = useQuery({
    queryKey: ['inventory-transactions', 'bar-routes'],
    queryFn: async () => (await api.get<BarRoute[]>('/inventory-transactions/bar-routes')).data,
    retry: false,
  });
  return useMemo(() => buildCafeLocations(routes), [routes]);
}
