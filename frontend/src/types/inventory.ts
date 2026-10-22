export type InventorySection = 'general' | 'preparation_ingredients' | 'serving_packaging' | 'gym_operations' | 'ready_products';

export interface ProductListItem {
  id: number;
  productCode: string;
  nameAr: string;
  nameEn?: string | null;
  size?: string | null;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number | null;
  status: string;
  isDeleted?: boolean;
  categoryId?: number | null;
  brandId?: number | null;
  supplierId?: number | null;
  supplierName?: string | null;
  imageUrl?: string | null;
  reorderPoint: number;
  unitOfMeasure: string;
  currentStock?: number;
  minStock?: number;
  inventoryKind?: 'general' | 'raw_material' | 'ready_product' | 'manufactured_internal';
  inventorySection?: InventorySection;
  recipes?: Array<{
    ingredientId: number;
    quantity: number;
    unit: string;
    ingredientName?: string;
    isArchived?: boolean;
  }>;
}

export interface ProductFormData {
  nameAr: string;
  nameEn: string;
  productCode: string;
  sellingPrice: number;
  costPrice: number;
  categoryId?: number;
  brandId?: number;
  manufacturerId?: number;
  supplierId?: number;
  unitTemplateId?: number;
  imageUrl: string;
  status: string;
  barcode: string;
  description: string;
  size?: string;
  reorderPoint: number;
  applyToAllBranches: boolean;
  inventoryKind?: 'general' | 'raw_material' | 'ready_product' | 'manufactured_internal';
  inventorySection?: InventorySection;
  unitOfMeasure?: string;
  minStock?: number;
  initialStock?: number;
  initialTotalCost?: number;
  openingBranchId?: number;
  currentStock?: number;
  recipes?: Array<{ ingredientId: number; quantity: number; unit: string }>;
}

export interface InventoryDashboardSummary {
  branchId: string | null;
  totalProducts: number;
  totalWarehouses: number;
  totalStockValue: number;
  lowStockCount: number;
  lowStockItems: Array<{
    productId: number;
    productCode: string;
    name: string;
    size?: string | null;
    unit: string;
    currentStock: number;
    alertQuantity: number;
    supplierName: string | null;
  }>;
  movementCount: number;
  stockedProductCount: number;
  zeroStockCount: number;
  todayIncomingMovements: number;
  todayOutgoingMovements: number;
  movementsByType: Record<string, number>;
  topItems: Array<{
    productId: number;
    productName: string | null;
    productSize?: string | null;
    warehouseId: number;
    currentStock: number;
    stockValue: number;
  }>;
}

export interface NamedEntity {
  id: number;
  nameAr?: string;
  nameEn?: string;
  name?: string;
  isActive?: boolean;
}

export interface StockBalanceRow {
  id: number;
  productId: number;
  warehouseId: number;
  currentStock: number;
  reorderPoint: number;
  product?: { nameAr: string; productCode: string };
  warehouse?: { nameAr: string; warehouseCode: string };
}

export interface InventoryTransactionRow {
  recipientName?: string | null;
  reason?: string | null;
  businessClassification?: string | null;
  id: number;
  reference: string;
  txnType: string;
  status: string;
  txnDate: string;
  branchId: number;
  totalAmount: number;
  notes?: string | null;
  sourceWarehouseId?: number | null;
  targetWarehouseId?: number | null;
  rejectionReason?: string | null;
  items?: Array<{ id: number; itemName: string; quantity: number; unit?: string | null; price: number; total: number }>;
}

export interface InventoryMovementRow {
  id: number;
  movementDate: string;
  txnType: string;
  direction: string;
  quantity: number;
  balanceAfter: number;
  unitCost: number;
  docType?: string | null;
  docRef?: string | null;
  notes?: string | null;
  createdBy?: number | null;
  actorName?: string | null;
  product?: { nameAr: string; size?: string | null };
  warehouse?: { nameAr: string };
}
