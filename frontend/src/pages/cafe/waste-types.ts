export type WasteCatalogKind = 'all' | 'raw_material' | 'ready_product' | 'prepared_product' | 'packaging';

export interface WastePackageOption {
  id: number;
  label: string;
  baseQuantity: number;
}

export interface WasteVariantOption {
  id: number;
  name: string;
}

export interface WasteCatalogItem {
  sourceKind: 'inventory' | 'cafe_product';
  sourceId: number;
  name: string;
  code: string;
  imageUrl: string | null;
  kind: Exclude<WasteCatalogKind, 'all'>;
  inventoryKind: string | null;
  inventorySection: string | null;
  unit: string;
  stock: number | null;
  packages: WastePackageOption[];
  variants: WasteVariantOption[];
}

export interface WasteComponent {
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
  currentStock: number;
  afterStock: number;
  shortage: boolean;
}

export interface WastePreview {
  source: {
    kind: 'inventory' | 'cafe_product';
    id: number;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unit: string;
    variantId: number | null;
    packageId: number | null;
    packageLabel: string | null;
    inventoryProductId: number | null;
    cafeProductId: number | null;
  };
  branchId: number;
  warehouseId: number;
  components: WasteComponent[];
  totalCost: number;
  hasShortage: boolean;
}

export interface WasteReason {
  id: number;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface WasteRecord {
  id: number;
  reference: string;
  branchId: number;
  warehouseId: number;
  sourceKind: string;
  sourceName: string;
  quantity: number;
  unit: string;
  packageId: number | null;
  packageLabel: string | null;
  reasonId: number | null;
  reasonName: string;
  notes: string | null;
  totalCost: number;
  status: 'active' | 'reversed';
  allowNegative: boolean;
  shiftSessionId: number | null;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
  reversedBy: number | null;
  reversedByName: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  components: Array<Pick<WasteComponent, 'productId' | 'name' | 'quantity' | 'unit' | 'unitCost' | 'cost'>>;
}

export interface WasteAnalyticsRow {
  key: string | number;
  label: string;
  count: number;
  cost: number;
}

export interface WasteAnalytics {
  totalCost: number;
  recordCount: number;
  averageCost: number;
  byReason: WasteAnalyticsRow[];
  byItem: WasteAnalyticsRow[];
  byUser: WasteAnalyticsRow[];
  byBranch: WasteAnalyticsRow[];
  byDay: WasteAnalyticsRow[];
  topComponents: Array<{ productId: number; name: string; quantity: number; unit: string | null; cost: number }>;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
