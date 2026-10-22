export interface QuickPurchaseOrderRow {
  id: number;
  orderNumber: string;
  supplierId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  warehouseId: number;
  branchId: number;
  status: string;
  notes?: string | null;
  stockPosted: boolean;
}

export interface PurchaseReturnRow {
  id: number;
  returnNumber: string;
  supplierId: number;
  supplierInvoiceId?: number | null;
  supplierInvoiceNumber?: string | null;
  warehouseId: number;
  branchId: number;
  returnDate?: string | null;
  createdByName?: string | null;
  status: string;
  totalAmount: number;
  notes?: string | null;
  items?: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export interface QuickSaleRow {
  targetEmployeeId?: number | null;
  collectedAmount?: number;
  id: number;
  saleNumber: string;
  dailyNumber: number;
  customerName: string;
  customerPhone?: string | null;
  gender?: 'male' | 'female' | null;
  cafeCategoryId?: number | null;
  saleType?: 'customer' | 'employee' | 'partner';
  employeeId?: number | null;
  partnerId?: number | null;
  branchId: number;
  shiftSessionId?: number | null;
  saleDate: string;
  saleTime: string;
  subtotal: number;
  discountAmount: number;
  discountPercentage?: number;
  taxAmount: number;
  taxPercentage?: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  receiptPrinted: boolean;
  receiptComment?: string | null;
  notes?: string | null;
  feedback?: { rating: number; comment?: string | null; date: string; invoiceId: number } | null;
  events?: Array<{ type: string; notes?: string | null; createdAt: string }>;
  items?: Array<{
    id: number;
    productId: number;
    cafeProductId?: number | null;
    cafeVariantId?: number | null;
    variantName?: string | null;
    itemNote?: string | null;
    productCode?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    feedback?: { rating: number; comment?: string | null; date: string } | null;
  }>;
}

export interface QuickSaleSummary {
  totalSales: number;
  completedSales: number;
  refundedSales: number;
  cancelledSales: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  byPaymentMethod: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface WarehouseOption {
  id: number;
  warehouseCode: string;
  nameAr: string;
  branchId: number;
  type?: 'main' | 'sub';
}

export interface ProcurementSettings {
  id: number;
  branchId: number | null;
  requireApproval: boolean;
  approvalThreshold: number;
  maxOrderAmount: number | null;
  requireVendorEvaluation: boolean;
  minQuotations: number;
  enableInventoryIntegration: boolean;
  enableThreeWayMatch: boolean;
  matchTolerancePercent: number;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyInSystem: boolean;
}

export interface SupplierCategoryRow {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  active: boolean;
}

export interface SupplyRegionRow {
  id: number;
  name: string;
  description?: string | null;
  country?: string | null;
  city?: string | null;
  active: boolean;
}

export interface PaymentTermRow {
  id: number;
  name: string;
  description?: string | null;
  days?: number | null;
  type?: string | null;
  discountPercentage?: number | null;
  active: boolean;
}

export interface RequisitionRow {
  id: number;
  requestNumber: string;
  requestingDepartment: string;
  requiredDate?: string | null;
  priority?: string | null;
  status: string;
  estimatedValue?: number | null;
  branchId: number;
  items?: Array<{ id: number; name: string; quantity: number; unit?: string | null }>;
}

export interface RfqRow {
  id: number;
  rfqNumber: string;
  subject: string;
  requestingDepartment: string;
  requiredDate?: string | null;
  status: string;
  estimatedBudget?: number | null;
  branchId: number;
}

export interface QuotationRow {
  id: number;
  rfqId: number;
  supplierId: number;
  totalPrice: number;
  deliveryTime?: string | null;
  paymentTerms?: string | null;
  status: string;
}

export interface PurchaseOrderRow {
  id: number;
  poNumber: string;
  supplierId: number;
  supplierName?: string | null;
  requisitionId?: number | null;
  status: string;
  totalAmount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentMethod?: string | null;
  supplierInvoiceId?: number | null;
  supplierInvoiceCode?: string | null;
  supplierInvoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoicePrintDate?: string | null;
  categoryId?: number | null;
  warehouseId?: number | null;
  branchId: number;
  expectedDeliveryDate?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  createdAt?: string;
  items?: Array<{ id: number; productId?: number | null; name: string; quantity: number; price: number; total: number }>;
}

export interface GoodsReceiptRow {
  id: number;
  grnNumber: string;
  purchaseOrderId: number;
  receiverName: string;
  receiptDate?: string | null;
  status: string;
  stockPosted: boolean;
  branchId: number;
  warehouseId?: number | null;
  items?: Array<{ id: number; productId?: number | null; name: string; orderedQty: number; receivedQty: number }>;
}

export interface PurchaseInvoiceRow {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName?: string | null;
  branchId?: number | null;
  invoiceDate?: string | null;
  status: string;
  matchingStatus?: string | null;
  invoiceAmount: number;
  purchaseOrderId?: number | null;
  goodsReceiptId?: number | null;
}

export interface DebitNoteRow {
  id: number;
  debitNumber: string;
  supplierId: number;
  reason: string;
  debitAmount: number;
  status: string;
  branchId: number;
}

export interface SupplierPaymentRow {
  id: number;
  paymentNumber: string;
  supplierId: number;
  supplierName?: string | null;
  branchId?: number | null;
  paymentAmount: number;
  paymentMethod: string;
  status: string;
  paymentDate?: string | null;
}

export interface SupplierDashboardStats {
  totalSuppliers: number;
  activeContracts: number;
  totalPurchaseOrders: number;
  totalPurchaseValue: number;
  totalInvoices: number;
  totalInvoiceValue: number;
  pendingPayments: number;
  overdueInvoices: number;
}

export interface SupplierReportRow {
  supplierId: number;
  nameAr: string;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  orderCount: number;
  totalOrderValue: number;
}

export interface QuickPoStatistics {
  totalOrders: number;
  totalAmount: number;
  ordersByStatus: Array<{ status: string; count: number; totalAmount: number }>;
}
