type BasePaymentMethod = 'cash' | 'card' | 'wallet' | 'transfer' | 'mixed' | string;

export interface ShiftClosePaymentLine {
  baseMethod: BasePaymentMethod;
  amount: number;
  methodCode?: string | null;
  methodName?: string | null;
}

export interface ShiftCloseProductLine {
  key: string;
  itemType: string;
  name: string;
  variantName?: string | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

export interface ShiftCloseSaleInput {
  invoiceNumber?: string;
  saleDate?: string;
  saleTime?: string;
  customerName?: string | null;
  status?: string;
  subtotalAmount?: number;
  totalAmount: number;
  collectedAmount: number;
  discountAmount: number;
  taxAmount: number;
  saleType: string;
  paymentMethod: BasePaymentMethod;
  payments: ShiftClosePaymentLine[];
  items?: ShiftCloseProductLine[];
}

export interface ShiftCloseAdjustmentInput {
  eventType: string;
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  paymentLines: ShiftClosePaymentLine[];
  internalAccountAmount: number;
  items?: ShiftCloseProductLine[];
}

export interface ShiftCloseAccountSettlementInput {
  statementNumber: string;
  settledAt?: Date | string | null;
  accountType: string;
  accountName?: string | null;
  totalAmount: number;
  settlementMethod: string;
  paymentMethod?: BasePaymentMethod | null;
}

interface PaymentAccumulator {
  code: string;
  name: string;
  baseMethod: string;
  saleCount: number;
  refundCount: number;
  cancellationCount: number;
  grossCents: number;
  refundCents: number;
  cancellationCents: number;
}

interface ProductAccumulator {
  key: string;
  name: string;
  variantName: string | null;
  orderCount: number;
  soldHundredths: number;
  refundHundredths: number;
  cancellationHundredths: number;
  grossCents: number;
  refundCents: number;
  cancellationCents: number;
}

const LEGACY_PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة / فيزا',
  wallet: 'محفظة إلكترونية',
  transfer: 'تحويل بنكي',
};

const cents = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100);
const money = (value: number) => Math.round(value) / 100;
const quantity = (value: number) => Math.round(value) / 100;

const RAW_ITEM_TYPES = new Set(['ingredient', 'raw', 'raw_material', 'material']);

function normalizedProductLine(line: ShiftCloseProductLine) {
  const itemType = String(line.itemType || 'product').trim().toLowerCase();
  if (RAW_ITEM_TYPES.has(itemType)) return null;
  const name = String(line.name || '').trim();
  const quantityHundredths = Math.max(
    0,
    Math.round((Number.isFinite(line.quantity) ? line.quantity : 0) * 100),
  );
  if (!name || quantityHundredths === 0) return null;
  const variantName = line.variantName?.trim() || null;
  const lineTotalCents = Math.max(
    0,
    cents(line.lineTotal ?? (line.unitPrice ?? 0) * line.quantity),
  );
  return {
    key: line.key?.trim() || `${itemType}:${name}:${variantName ?? ''}`,
    name,
    variantName,
    quantityHundredths,
    lineTotalCents,
  };
}

function normalizedPaymentLine(
  line: ShiftClosePaymentLine,
): Required<Pick<ShiftClosePaymentLine, 'baseMethod'>> & {
  amount: number;
  methodCode: string;
  methodName: string;
} {
  const baseMethod = String(line.baseMethod || 'cash');
  return {
    baseMethod,
    amount: line.amount,
    methodCode: line.methodCode?.trim() || baseMethod,
    methodName:
      line.methodName?.trim() || LEGACY_PAYMENT_LABELS[baseMethod] || baseMethod,
  };
}

export function buildShiftCloseReport(input: {
  sales: ShiftCloseSaleInput[];
  adjustments: ShiftCloseAdjustmentInput[];
  accountSettlements?: ShiftCloseAccountSettlementInput[];
}) {
  const methods = new Map<string, PaymentAccumulator>();
  const products = new Map<string, ProductAccumulator>();

  const addProductLines = (
    lines: ShiftCloseProductLine[] | undefined,
    kind: 'sale' | 'refund' | 'cancel',
  ) => {
    const countedOrders = new Set<string>();
    for (const line of lines ?? []) {
      const normalized = normalizedProductLine(line);
      if (!normalized) continue;
      const current = products.get(normalized.key) ?? {
        key: normalized.key,
        name: normalized.name,
        variantName: normalized.variantName,
        orderCount: 0,
        soldHundredths: 0,
        refundHundredths: 0,
        cancellationHundredths: 0,
        grossCents: 0,
        refundCents: 0,
        cancellationCents: 0,
      };
      if (kind === 'sale') {
        current.soldHundredths += normalized.quantityHundredths;
        current.grossCents += normalized.lineTotalCents;
        if (!countedOrders.has(current.key)) {
          current.orderCount += 1;
          countedOrders.add(current.key);
        }
      } else if (kind === 'refund') {
        current.refundHundredths += normalized.quantityHundredths;
        current.refundCents += normalized.lineTotalCents;
      } else {
        current.cancellationHundredths += normalized.quantityHundredths;
        current.cancellationCents += normalized.lineTotalCents;
      }
      products.set(current.key, current);
    }
  };

  const addPayment = (
    line: ShiftClosePaymentLine,
    kind: 'sale' | 'refund' | 'cancel',
  ) => {
    const normalized = normalizedPaymentLine(line);
    const current = methods.get(normalized.methodCode) ?? {
      code: normalized.methodCode,
      name: normalized.methodName,
      baseMethod: normalized.baseMethod,
      saleCount: 0,
      refundCount: 0,
      cancellationCount: 0,
      grossCents: 0,
      refundCents: 0,
      cancellationCents: 0,
    };
    const amountCents = cents(normalized.amount);
    if (kind === 'sale') {
      current.saleCount += 1;
      current.grossCents += amountCents;
    } else if (kind === 'refund') {
      current.refundCount += 1;
      current.refundCents += amountCents;
    } else {
      current.cancellationCount += 1;
      current.cancellationCents += amountCents;
    }
    methods.set(current.code, current);
  };

  let grossSalesCents = 0;
  let refundCents = 0;
  let cancellationCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let internalGrossCents = 0;
  let internalRefundCents = 0;
  let internalCancellationCents = 0;
  let internalSaleCount = 0;
  let internalRefundCount = 0;

  const invoices = input.sales.map((sale, index) => {
    const paymentLines = sale.payments.length
      ? sale.payments
      : sale.collectedAmount > 0
        ? [{ baseMethod: sale.paymentMethod, amount: sale.collectedAmount }]
        : [];
    const payments = paymentLines.map((line) => {
      const normalized = normalizedPaymentLine(line);
      return {
        code: normalized.methodCode,
        name: normalized.methodName,
        baseMethod: normalized.baseMethod,
        amount: money(cents(normalized.amount)),
      };
    });
    const internalAmount = Math.max(
      0,
      cents(sale.totalAmount) - cents(sale.collectedAmount),
    );
    if (
      internalAmount > 0
      && (sale.saleType === 'employee' || sale.saleType === 'partner')
    ) {
      payments.push({
        code: 'cl',
        name: 'CL — حساب موظف/شريك',
        baseMethod: 'internal',
        amount: money(internalAmount),
      });
    }
    return {
      invoiceNumber: sale.invoiceNumber?.trim() || String(index + 1),
      saleDate: sale.saleDate || '',
      saleTime: sale.saleTime || '',
      customerName: sale.customerName?.trim() || 'عميل نقدي',
      status: sale.status || 'completed',
      subtotalAmount: money(cents(sale.subtotalAmount ?? sale.totalAmount)),
      discountAmount: money(cents(sale.discountAmount)),
      taxAmount: money(cents(sale.taxAmount)),
      totalAmount: money(cents(sale.totalAmount)),
      payments,
    };
  });

  for (const sale of input.sales) {
    grossSalesCents += cents(sale.totalAmount);
    discountCents += cents(sale.discountAmount);
    taxCents += cents(sale.taxAmount);

    const internalAmount = Math.max(0, cents(sale.totalAmount) - cents(sale.collectedAmount));
    if (internalAmount > 0 && (sale.saleType === 'employee' || sale.saleType === 'partner')) {
      internalGrossCents += internalAmount;
      internalSaleCount += 1;
    }

    const lines = sale.payments.length
      ? sale.payments
      : sale.collectedAmount > 0
        ? [{ baseMethod: sale.paymentMethod, amount: sale.collectedAmount }]
        : [];
    for (const line of lines) addPayment(line, 'sale');
    addProductLines(sale.items, 'sale');
  }

  for (const adjustment of input.adjustments) {
    const isRefund = adjustment.eventType === 'refund' || adjustment.eventType === 'refunded';
    const kind = isRefund ? 'refund' : 'cancel';
    if (isRefund) refundCents += cents(adjustment.totalAmount);
    else cancellationCents += cents(adjustment.totalAmount);
    discountCents -= cents(adjustment.discountAmount);
    taxCents -= cents(adjustment.taxAmount);
    if (isRefund) {
      internalRefundCents += cents(adjustment.internalAccountAmount);
      if (adjustment.internalAccountAmount > 0) internalRefundCount += 1;
    } else {
      internalCancellationCents += cents(adjustment.internalAccountAmount);
    }
    for (const line of adjustment.paymentLines) addPayment(line, kind);
    addProductLines(adjustment.items, kind);
  }

  const accountSettlementEntries = (input.accountSettlements ?? []).map(
    (settlement) => {
      const isDirect = settlement.settlementMethod === 'direct_payment';
      if (isDirect && settlement.paymentMethod) {
        addPayment({
          baseMethod: settlement.paymentMethod,
          amount: settlement.totalAmount,
        }, 'sale');
      }
      return {
        statementNumber: settlement.statementNumber,
        settledAt: settlement.settledAt ?? null,
        accountType: settlement.accountType,
        accountName: settlement.accountName?.trim() || null,
        totalAmount: money(cents(settlement.totalAmount)),
        settlementMethod: settlement.settlementMethod,
        paymentMethod: settlement.paymentMethod ?? null,
      };
    },
  );
  const directSettlementCents = accountSettlementEntries.reduce(
    (sum, settlement) => sum + (
      settlement.settlementMethod === 'direct_payment'
        ? cents(settlement.totalAmount)
        : 0
    ),
    0,
  );
  const accountSettlementTotalCents = accountSettlementEntries.reduce(
    (sum, settlement) => sum + cents(settlement.totalAmount),
    0,
  );

  const paymentMethods = [...methods.values()].map((row) => ({
    code: row.code,
    name: row.name,
    baseMethod: row.baseMethod,
    saleCount: row.saleCount,
    refundCount: row.refundCount,
    cancellationCount: row.cancellationCount,
    grossAmount: money(row.grossCents),
    refundAmount: money(row.refundCents),
    cancellationAmount: money(row.cancellationCents),
    netAmount: money(row.grossCents - row.refundCents - row.cancellationCents),
  }));
  const collectedCents = [...methods.values()].reduce(
    (sum, row) => sum + row.grossCents - row.refundCents - row.cancellationCents,
    0,
  );
  const internalNetCents =
    internalGrossCents - internalRefundCents - internalCancellationCents;
  const productSummary = [...products.values()]
    .map((row) => {
      const netHundredths =
        row.soldHundredths - row.refundHundredths - row.cancellationHundredths;
      const netCents = row.grossCents - row.refundCents - row.cancellationCents;
      const unitPriceCents = netHundredths !== 0
        ? Math.round((netCents * 100) / netHundredths)
        : row.soldHundredths !== 0
          ? Math.round((row.grossCents * 100) / row.soldHundredths)
          : 0;
      return {
        key: row.key,
        name: row.name,
        variantName: row.variantName,
        orderCount: row.orderCount,
        soldQuantity: quantity(row.soldHundredths),
        refundQuantity: quantity(row.refundHundredths),
        cancellationQuantity: quantity(row.cancellationHundredths),
        netQuantity: quantity(netHundredths),
        unitPrice: money(unitPriceCents),
        grossAmount: money(row.grossCents),
        refundAmount: money(row.refundCents),
        cancellationAmount: money(row.cancellationCents),
        netAmount: money(netCents),
      };
    })
    .sort((a, b) =>
      b.netQuantity - a.netQuantity
      || b.soldQuantity - a.soldQuantity
      || a.name.localeCompare(b.name, 'ar'));

  return {
    counts: {
      invoices: input.sales.length,
      refunds: input.adjustments.filter((row) =>
        row.eventType === 'refund' || row.eventType === 'refunded').length,
      cancellations: input.adjustments.filter((row) =>
        row.eventType !== 'refund' && row.eventType !== 'refunded').length,
    },
    totals: {
      grossSales: money(grossSalesCents),
      refunds: money(refundCents),
      cancellations: money(cancellationCents),
      netSales: money(grossSalesCents - refundCents - cancellationCents),
      collected: money(collectedCents),
      internalAccounts: money(internalNetCents),
      discount: money(discountCents),
      tax: money(taxCents),
    },
    paymentMethods,
    invoices,
    products: productSummary,
    internalAccounts: {
      name: 'CL — حساب موظف/شريك',
      saleCount: internalSaleCount,
      refundCount: internalRefundCount,
      netAmount: money(internalNetCents),
    },
    accountSettlements: {
      count: accountSettlementEntries.length,
      totalAmount: money(accountSettlementTotalCents),
      directAmount: money(directSettlementCents),
      nonCashAmount: money(
        accountSettlementTotalCents - directSettlementCents,
      ),
      entries: accountSettlementEntries,
    },
  };
}

