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
  warehouseId: number;
  branchId: number;
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

export interface InvoicePaymentAmount { key: string; method: string; label: string; amount: number }
export interface InvoicePaymentSummary { payments: InvoicePaymentAmount[]; total: number; collected: number; outstanding: number }

export interface QuickSaleRow {
  id: number;
  saleNumber: string;
  dailyNumber: number;
  customerName: string;
  customerPhone?: string | null;
  saleType?: 'customer' | 'employee' | 'partner';
  employeeId?: number | null;
  employeeName?: string | null;
  employeeFreeDrinks?: number;
  employeeBenefitDate?: string | null;
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
  collectedAmount?: number;
  paymentBreakdown?: InvoicePaymentAmount[];
  payments?: Array<{
    id: number;
    method: string;
    amount: number;
    reference?: string | null;
    catalogPaymentMethodId?: number | null;
    methodCode?: string | null;
    methodName?: string | null;
  }>;
  status: string;
  receiptPrinted: boolean;
  editRevision?: number;
  billingCycle?: 'immediate' | 'daily' | 'monthly' | null;
  inventoryPosted?: boolean;
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
    freeQuantity?: number;
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
  requisitionId?: number | null;
  status: string;
  totalAmount: number;
  branchId: number;
  expectedDeliveryDate?: string | null;
  paymentTerms?: string | null;
  items?: Array<{ id: number; name: string; quantity: number; price: number; total: number }>;
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
}

export interface PurchaseInvoiceRow {
  id: number;
  invoiceNumber: string;
  supplierId: number;
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
