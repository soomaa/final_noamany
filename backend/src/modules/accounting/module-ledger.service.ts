import { BadRequestException, Injectable } from "@nestjs/common";
import { SalesPaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { roundMoney } from "./accounting.utils";
import { AccountsService } from "./accounts.service";
import { LedgerLineInput, LedgerService } from "./ledger.service";

type Tx = Prisma.TransactionClient;

interface QuickSaleEditAccountingSnapshot {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  collectedAmount: number;
  paymentMethod: SalesPaymentMethod;
  payments: { method: SalesPaymentMethod; amount: number }[];
  cogsAmount: number;
}

@Injectable()
export class ModuleLedgerService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
  ) {}

  async ensureChart(): Promise<void> {
    await this.accounts.ensureSeeded();
  }

  paymentKeyFromSalesMethod(method: SalesPaymentMethod): string {
    switch (method) {
      case SalesPaymentMethod.card:
        return "card";
      case SalesPaymentMethod.transfer:
        return "bank";
      case SalesPaymentMethod.wallet:
        return "online";
      default:
        return "cash";
    }
  }

  paymentKeyFromString(method?: string | null): string {
    const m = (method ?? "cash").toLowerCase();
    if (
      m.includes("bank") ||
      m.includes("transfer") ||
      m.includes("instapay") ||
      m.includes("تحويل") ||
      m.includes("إنستا") ||
      m.includes("انستا")
    )
      return "bank";
    if (m.includes("card") || m.includes("visa") || m.includes("بطاق"))
      return "card";
    if (
      m.includes("online") ||
      m.includes("electronic") ||
      m.includes("wallet") ||
      m.includes("محفظ")
    ) {
      return "online";
    }
    return "cash";
  }

  async postQuickSale(
    input: {
      saleNumber: string;
      branchId: number;
      saleDate: string;
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
      collectedAmount?: number;
      paymentMethod: SalesPaymentMethod;
      payments: { method: SalesPaymentMethod; amount: number }[];
      cogsAmount?: number;
      saleType?: "customer" | "employee" | "partner";
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    await this.ensureChart();
    const lines: LedgerLineInput[] = [];
    const collectedAmount = roundMoney(
      input.collectedAmount ?? input.totalAmount,
    );
    const cogsAmount = roundMoney(input.cogsAmount ?? 0);

    const payRows = input.payments.length
      ? input.payments
      : collectedAmount > 0
        ? [{ method: input.paymentMethod, amount: collectedAmount }]
        : [];

    for (const p of payRows) {
      const amt = roundMoney(p.amount);
      if (amt <= 0) continue;
      lines.push({
        accountCode: this.paymentKeyFromSalesMethod(p.method),
        debit: amt,
        credit: 0,
      });
    }
    const receivable = roundMoney(input.totalAmount - collectedAmount);
    if (receivable > 0) {
      lines.push({
        accountCode: "accounts_receivable",
        debit: receivable,
        credit: 0,
      });
    }
    if (input.discountAmount > 0) {
      lines.push({
        accountCode: "sales_discount",
        debit: roundMoney(input.discountAmount),
        credit: 0,
      });
    }
    lines.push({
      accountCode: "sales_revenue",
      debit: 0,
      credit: roundMoney(input.subtotal),
    });
    if (input.taxAmount > 0) {
      lines.push({
        accountCode: "vat_output",
        debit: 0,
        credit: roundMoney(input.taxAmount),
      });
    }
    if (cogsAmount > 0) {
      lines.push(
        { accountCode: "cost_of_goods_sold", debit: cogsAmount, credit: 0 },
        { accountCode: "inventory", debit: 0, credit: cogsAmount },
      );
    }

    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "quick_sale",
        sourceDocId: input.saleNumber,
        branchId: input.branchId,
        date: input.saleDate,
        description: `بيع سريع ${input.saleNumber}`,
        lines,
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Post only the balanced account deltas while preserving the original sale journal. */
  async postQuickSaleEdit(
    input: {
      saleNumber: string;
      revision: number;
      branchId: number;
      saleDate: string;
      createdBy: number;
      before: QuickSaleEditAccountingSnapshot;
      after: QuickSaleEditAccountingSnapshot;
    },
    tx?: Tx,
  ): Promise<void> {
    const balances = new Map<string, number>();
    const add = (account: string, amount: number) => {
      balances.set(account, roundMoney((balances.get(account) ?? 0) + amount));
    };
    for (const [snapshot, sign] of [[input.before, -1], [input.after, 1]] as const) {
      const collected = roundMoney(snapshot.collectedAmount);
      const payments = snapshot.payments.length
        ? snapshot.payments
        : collected > 0
          ? [{ method: snapshot.paymentMethod, amount: collected }]
          : [];
      for (const payment of payments) {
        add(this.paymentKeyFromSalesMethod(payment.method), sign * roundMoney(payment.amount));
      }
      add('accounts_receivable', sign * roundMoney(snapshot.totalAmount - collected));
      add('sales_discount', sign * roundMoney(snapshot.discountAmount));
      add('sales_revenue', -sign * roundMoney(snapshot.subtotal));
      add('vat_output', -sign * roundMoney(snapshot.taxAmount));
      add('cost_of_goods_sold', sign * roundMoney(snapshot.cogsAmount));
      add('inventory', -sign * roundMoney(snapshot.cogsAmount));
    }
    const lines: LedgerLineInput[] = [...balances].flatMap(([accountCode, amount]) =>
      amount === 0
        ? []
        : [{ accountCode, debit: Math.max(0, amount), credit: Math.max(0, -amount) }],
    );
    if (!lines.length) return;
    await this.ensureChart();
    await this.ledger.postEntry({
      sourceModule: 'sales',
      sourceDocType: 'quick_sale_edit',
      sourceDocId: `${input.saleNumber}:edit:${input.revision}`,
      branchId: input.branchId,
      date: input.saleDate,
      description: `تعديل فاتورة ${input.saleNumber} — المراجعة ${input.revision}`,
      lines,
      createdBy: input.createdBy,
      entryPrefix: 'A',
    }, tx);
  }

  async postDrawerMovement(
    input: {
      reference: string;
      branchId?: number | null;
      date: string;
      movementType: "petty_expense" | "custody_issue" | "custody_return";
      category?: string | null;
      amount: number;
      description: string;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const isReturn = input.movementType === "custody_return";
    const isCustody = input.movementType === "custody_issue" || isReturn;
    const expenseKey =
      input.category === "maintenance"
        ? "maintenance_expense"
        : "operating_expense";
    const lines: LedgerLineInput[] = isCustody
      ? isReturn
        ? [
            { accountCode: "cash", debit: amount, credit: 0 },
            { accountCode: "employee_advances", debit: 0, credit: amount },
          ]
        : [
            { accountCode: "employee_advances", debit: amount, credit: 0 },
            { accountCode: "cash", debit: 0, credit: amount },
          ]
      : [
          { accountCode: expenseKey, debit: amount, credit: 0 },
          { accountCode: "cash", debit: 0, credit: amount },
        ];
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: input.movementType,
        sourceDocId: input.reference,
        branchId: input.branchId ?? undefined,
        date: input.date,
        description: input.description,
        lines,
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postSalesStatementSettlement(
    input: {
      statementNumber: string;
      branchId?: number | null;
      date: string;
      amount: number;
      accountType: "employee" | "partner";
      settlementMethod:
        "direct_payment" | "payroll_deduction" | "profit_share_deduction";
      paymentMethod?: SalesPaymentMethod | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    let debitAccount = this.paymentKeyFromSalesMethod(
      input.paymentMethod ?? SalesPaymentMethod.cash,
    );
    if (input.settlementMethod === "payroll_deduction")
      debitAccount = "salaries_payable";
    if (input.settlementMethod === "profit_share_deduction")
      debitAccount = "partner_payable";
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "billing_statement_settlement",
        sourceDocId: input.statementNumber,
        branchId: input.branchId ?? undefined,
        date: input.date,
        description: `تسوية كشف ${input.accountType === "employee" ? "موظف" : "شريك"} ${input.statementNumber}`,
        lines: [
          { accountCode: debitAccount, debit: amount, credit: 0 },
          { accountCode: "accounts_receivable", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postQuickSaleRefund(
    input: {
      saleNumber: string;
      branchId: number;
      saleDate: string;
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
      collectedAmount?: number;
      paymentMethod: SalesPaymentMethod;
      payments: { method: SalesPaymentMethod; amount: number }[];
      returnedCogsAmount?: number;
      wasteCogsAmount?: number;
      operationType?: "refund" | "cancel";
      saleType?: "customer" | "employee" | "partner";
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    await this.ensureChart();
    const lines: LedgerLineInput[] = [];
    const returnedCogsAmount = roundMoney(input.returnedCogsAmount ?? 0);
    const wasteCogsAmount = roundMoney(input.wasteCogsAmount ?? 0);
    const operationType = input.operationType ?? "refund";
    // Partner orders use the same receivable/revenue entry as deferred employee
    // orders. Their refund must therefore reverse that exact entry as well; special
    // inventory-only handling would leave both partner debt and revenue overstated.
    lines.push({
      accountCode: "sales_revenue",
      debit: roundMoney(input.subtotal),
      credit: 0,
    });
    if (input.taxAmount > 0) {
      lines.push({
        accountCode: "vat_output",
        debit: roundMoney(input.taxAmount),
        credit: 0,
      });
    }
    if (input.discountAmount > 0) {
      lines.push({
        accountCode: "sales_discount",
        debit: 0,
        credit: roundMoney(input.discountAmount),
      });
    }
    const collectedAmount = roundMoney(
      input.collectedAmount ?? input.totalAmount,
    );
    const payRows = input.payments.length
      ? input.payments
      : collectedAmount > 0
        ? [{ method: input.paymentMethod, amount: collectedAmount }]
        : [];
    for (const p of payRows) {
      const amt = roundMoney(p.amount);
      if (amt <= 0) continue;
      lines.push({
        accountCode: this.paymentKeyFromSalesMethod(p.method),
        debit: 0,
        credit: amt,
      });
    }
    const receivable = roundMoney(input.totalAmount - collectedAmount);
    if (receivable > 0) {
      lines.push({
        accountCode: "accounts_receivable",
        debit: 0,
        credit: receivable,
      });
    }
    if (returnedCogsAmount > 0) {
      lines.push(
        { accountCode: "inventory", debit: returnedCogsAmount, credit: 0 },
        {
          accountCode: "cost_of_goods_sold",
          debit: 0,
          credit: returnedCogsAmount,
        },
      );
    }
    // Prepared products cannot be put back into stock after fulfilment. Their
    // historical COGS is reclassified as waste without creating a second stock-out.
    if (wasteCogsAmount > 0) {
      lines.push(
        { accountCode: "operating_expense", debit: wasteCogsAmount, credit: 0 },
        {
          accountCode: "cost_of_goods_sold",
          debit: 0,
          credit: wasteCogsAmount,
        },
      );
    }

    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType:
          operationType === "cancel"
            ? "quick_sale_cancel"
            : "quick_sale_refund",
        sourceDocId: input.saleNumber,
        branchId: input.branchId,
        date: input.saleDate,
        description: `${operationType === "cancel" ? "إلغاء" : "استرداد"} بيع ${input.saleNumber}`,
        lines,
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postGrnInventory(
    input: {
      grnNumber: string;
      branchId?: number;
      receiptDate: string;
      totalValue: number;
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.totalValue);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "procurement",
        sourceDocType: "goods_receipt",
        sourceDocId: input.grnNumber,
        branchId: input.branchId,
        date: input.receiptDate,
        description: `استلام بضائع ${input.grnNumber}`,
        lines: [
          { accountCode: "inventory", debit: amount, credit: 0 },
          { accountCode: "grn_clearing", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postPurchaseInvoiceApproved(
    input: {
      invoiceNumber: string;
      branchId?: number;
      invoiceDate: string;
      amount: number;
      hasGrn: boolean;
      createdBy?: number;
      sourceDocType?: string;
      sourceDocId?: string;
      description?: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const debitAccount = input.hasGrn ? "grn_clearing" : "inventory";
    await this.ledger.postEntry(
      {
        sourceModule: "procurement",
        sourceDocType: input.sourceDocType ?? "purchase_invoice",
        sourceDocId: input.sourceDocId ?? input.invoiceNumber,
        branchId: input.branchId,
        date: input.invoiceDate,
        description: input.description ?? `فاتورة شراء ${input.invoiceNumber}`,
        lines: [
          { accountCode: debitAccount, debit: amount, credit: 0 },
          { accountCode: "accounts_payable", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postSupplierPayment(
    input: {
      paymentNumber: string;
      branchId?: number;
      paymentDate: string;
      amount: number;
      paymentMethod?: string | null;
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const payKey = this.paymentKeyFromString(input.paymentMethod);
    await this.ledger.postEntry(
      {
        sourceModule: "procurement",
        sourceDocType: "supplier_payment",
        sourceDocId: input.paymentNumber,
        branchId: input.branchId,
        date: input.paymentDate,
        description: `دفعة مورد ${input.paymentNumber}`,
        lines: [
          { accountCode: "accounts_payable", debit: amount, credit: 0 },
          { accountCode: payKey, debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postExpenseApproval(
    input: {
      expenseId: number;
      expenseNumber: string;
      branchId?: number;
      expenseDate: string;
      totalAmount: number;
      paymentMethod?: string | null;
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.totalAmount);
    if (amount <= 0) return;
    await this.ensureChart();
    const payKey = this.paymentKeyFromString(input.paymentMethod);
    await this.ledger.postEntry(
      {
        sourceModule: "finance",
        sourceDocType: "expense",
        sourceDocId: input.expenseId,
        branchId: input.branchId,
        date: input.expenseDate,
        description: `اعتماد مصروف ${input.expenseNumber}`,
        lines: [
          { accountCode: "operating_expense", debit: amount, credit: 0 },
          { accountCode: payKey, debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postClubSubscription(
    input: {
      subscriptionNumber: string;
      // Unique per posting event (receipt no / refund invoice / transfer id). Without it, every
      // receipt on the same subscription collides on the GL idempotency key and only the first posts.
      sourceDocId: string;
      branchId: number;
      date: string;
      kind: string;
      sourceDocType: string;
      lines: LedgerLineInput[];
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "club",
        sourceDocType: input.sourceDocType,
        sourceDocId: input.sourceDocId,
        branchId: input.branchId,
        date: input.date,
        description: `اشتراك نادي — ${input.kind} — ${input.subscriptionNumber}`,
        lines: input.lines,
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /**
   * Post a balanced GL entry for miscellaneous / recurring (non-sale) revenue logged in
   * fin_revenues. Debit the cash/bank asset (by payment method), credit 'other_revenue'
   * (إيرادات أخرى). Idempotent per (finance / revenue / sourceRef) so the daily recurring cron
   * and manual creates never double-post. Sale/subscription/spa revenue is NOT routed here — it
   * already posts GL at its own source module.
   */
  async postOtherRevenue(
    input: {
      sourceRef: string;
      branchId?: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      description?: string;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const payKey = this.paymentKeyFromString(input.paymentMethod);
    await this.ledger.postEntry(
      {
        sourceModule: "finance",
        sourceDocType: "revenue",
        sourceDocId: input.sourceRef,
        branchId: input.branchId,
        date: input.date,
        description: input.description ?? `إيراد ${input.sourceRef}`,
        lines: [
          { accountCode: payKey, debit: amount, credit: 0 },
          { accountCode: "other_revenue", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postBookingRevenue(
    input: {
      bookingNumber: string;
      branchId: number;
      bookingDate: string;
      amount: number;
      createdBy: number;
      paymentMethod?: string | null;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "booking",
        sourceDocId: input.bookingNumber,
        branchId: input.branchId,
        date: input.bookingDate,
        description: `حجز مدفوع ${input.bookingNumber}`,
        lines: [
          {
            accountCode: this.paymentKeyFromString(input.paymentMethod),
            debit: amount,
            credit: 0,
          },
          { accountCode: "sales_revenue", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postBookingPayment(
    input: {
      paymentNumber: string;
      bookingNumber: string;
      branchId: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "booking_payment",
        sourceDocId: input.paymentNumber,
        branchId: input.branchId,
        date: input.date,
        description: `دفعة حجز ${input.bookingNumber} — ${input.paymentNumber}`,
        lines: [
          {
            accountCode: this.paymentKeyFromString(input.paymentMethod),
            debit: amount,
            credit: 0,
          },
          { accountCode: "sales_revenue", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postBookingRefund(
    input: {
      refundNumber: string;
      bookingNumber: string;
      branchId: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "booking_refund",
        sourceDocId: input.refundNumber,
        branchId: input.branchId,
        date: input.date,
        description: `استرداد حجز ${input.bookingNumber} — ${input.refundNumber}`,
        lines: [
          { accountCode: "sales_revenue", debit: amount, credit: 0 },
          {
            accountCode: this.paymentKeyFromString(input.paymentMethod),
            debit: 0,
            credit: amount,
          },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Reverse an existing manual-revenue GL entry (if any) and optionally repost with new values. */
  async syncOtherRevenue(
    input: {
      sourceRef: string;
      branchId?: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      description?: string;
      createdBy: number;
      post: boolean;
    },
    tx: Tx,
  ): Promise<void> {
    const existing = await tx.acc_journal_entries.findFirst({
      where: {
        source_module: "finance",
        source_doc_type: "revenue",
        source_doc_id: input.sourceRef,
        status: "posted",
        reversed_by_id: null,
      },
    });
    if (existing) {
      await this.ledger.reverseEntry(
        existing.id,
        "تعديل إيراد",
        input.createdBy,
        tx,
      );
    }
    if (input.post) {
      await this.postOtherRevenue(
        {
          sourceRef: input.sourceRef,
          branchId: input.branchId,
          date: input.date,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          description: input.description,
          createdBy: input.createdBy,
        },
        tx,
      );
    }
  }

  async postFitnessPayment(
    input: {
      invoiceNumber: string;
      branchId: number;
      invoiceDate: string;
      amount: number;
      description?: string;
      paymentMethod?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "club-fitness",
        sourceDocType: "wellness_invoice",
        sourceDocId: input.invoiceNumber,
        branchId: input.branchId,
        date: input.invoiceDate,
        description: input.description ?? `إيراد لياقة ${input.invoiceNumber}`,
        lines: [
          {
            accountCode: this.paymentKeyFromString(input.paymentMethod),
            debit: amount,
            credit: 0,
          },
          { accountCode: "sales_revenue", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /**
   * Post a club event ticket payment. Debit the payment-method account (cash/card/bank/online),
   * credit sales_revenue. Idempotent per paymentNumber (the payment's own doc number).
   */
  async postEventPayment(
    input: {
      paymentNumber: string;
      eventNumber: string;
      branchId: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const payKey = this.paymentKeyFromString(input.paymentMethod);
    await this.ledger.postEntry(
      {
        sourceModule: "club-events",
        sourceDocType: "event_payment",
        sourceDocId: input.paymentNumber,
        branchId: input.branchId,
        date: input.date,
        description: `دفعة فعالية ${input.eventNumber} — ${input.paymentNumber}`,
        lines: [
          { accountCode: payKey, debit: amount, credit: 0 },
          { accountCode: "sales_revenue", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /**
   * Post a club event ticket refund — reverses postEventPayment's lines. sourceDocId is the
   * refund's own payment_number (club_event_payments row with type='refund'), NOT the original
   * payment's number, so both entries co-exist without idempotency-key collisions.
   */
  async postEventRefund(
    input: {
      paymentNumber: string;
      eventNumber: string;
      branchId: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    const payKey = this.paymentKeyFromString(input.paymentMethod);
    await this.ledger.postEntry(
      {
        sourceModule: "club-events",
        sourceDocType: "event_refund",
        sourceDocId: input.paymentNumber,
        branchId: input.branchId,
        date: input.date,
        description: `مرتجع فعالية ${input.eventNumber} — ${input.paymentNumber}`,
        lines: [
          { accountCode: "sales_revenue", debit: amount, credit: 0 },
          { accountCode: payKey, debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Accrue one branch's payroll: net pay, employee advances and social insurance. */
  async postPayrollAccrual(
    input: {
      payrollNumber: number;
      branchId?: number;
      date: string;
      grossEarnings: number;
      netPay: number;
      employeeInsurance: number;
      employerInsurance: number;
      loanDeductions: number;
      nonLiabilityDeductions: number;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const gross = roundMoney(input.grossEarnings);
    const net = roundMoney(input.netPay);
    const employeeInsurance = roundMoney(input.employeeInsurance);
    const employerInsurance = roundMoney(input.employerInsurance);
    const loans = roundMoney(input.loanDeductions);
    const otherDeductions = roundMoney(input.nonLiabilityDeductions);
    const debitTotal = roundMoney(gross + employerInsurance);
    const creditTotal = roundMoney(
      net + employeeInsurance + employerInsurance + loans + otherDeductions,
    );
    if (debitTotal <= 0) return;
    if (Math.abs(debitTotal - creditTotal) > 0.01) {
      throw new BadRequestException(
        `قيد مسيّرة الرواتب ${input.payrollNumber} غير متوازن`,
      );
    }
    await this.ensureChart();
    const lines: LedgerLineInput[] = [
      { accountCode: "salary_expense", debit: debitTotal, credit: 0 },
    ];
    if (otherDeductions > 0) {
      lines.push({
        accountCode: "salary_expense",
        debit: 0,
        credit: otherDeductions,
      });
    }
    const insurancePayable = roundMoney(employeeInsurance + employerInsurance);
    if (insurancePayable > 0) {
      lines.push({
        accountCode: "social_insurance_payable",
        debit: 0,
        credit: insurancePayable,
      });
    }
    if (loans > 0) {
      lines.push({ accountCode: "employee_advances", debit: 0, credit: loans });
    }
    if (net > 0) {
      lines.push({ accountCode: "salaries_payable", debit: 0, credit: net });
    }
    await this.ledger.postEntry(
      {
        sourceModule: "payroll",
        sourceDocType: "payroll_accrual",
        sourceDocId: `${input.payrollNumber}:branch:${input.branchId ?? "global"}`,
        branchId: input.branchId,
        date: input.date,
        description: `استحقاق مسيرة رواتب ${input.payrollNumber}`,
        lines,
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Settle a posted branch payroll through the bank. */
  async postPayrollPayment(
    input: {
      payrollNumber: number;
      branchId?: number;
      date: string;
      netPay: number;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.netPay);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "payroll",
        sourceDocType: "payroll_payment",
        sourceDocId: `${input.payrollNumber}:branch:${input.branchId ?? "global"}`,
        branchId: input.branchId,
        date: input.date,
        description: `صرف مسيرة رواتب ${input.payrollNumber}`,
        lines: [
          { accountCode: "salaries_payable", debit: amount, credit: 0 },
          { accountCode: "bank", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postMaintenanceExpense(
    input: {
      maintenanceId: number;
      branchId: number;
      date: string;
      amount: number;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "club-fitness",
        sourceDocType: "equipment_maintenance",
        sourceDocId: input.maintenanceId,
        branchId: input.branchId,
        date: input.date,
        description: `مصروف صيانة رقم ${input.maintenanceId}`,
        lines: [
          { accountCode: "maintenance_expense", debit: amount, credit: 0 },
          { accountCode: "cash", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postTrainerEarningPayment(
    input: {
      paymentId: number;
      branchId?: number;
      date: string;
      amount: number;
      trainerName: string;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "club-fitness",
        sourceDocType: "trainer_earning_payment",
        sourceDocId: input.paymentId,
        branchId: input.branchId,
        date: input.date,
        description: `صرف أتعاب المدرب ${input.trainerName}`,
        lines: [
          {
            accountCode: "trainer_commission_expense",
            debit: amount,
            credit: 0,
          },
          { accountCode: "cash", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postEmployeeLoanDisbursement(
    input: {
      loanNumber: number;
      branchId?: number;
      date: string;
      amount: number;
      employeeName?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "hr",
        sourceDocType: "employee_loan",
        sourceDocId: input.loanNumber,
        branchId: input.branchId,
        date: input.date,
        description: `صرف سلفة موظف ${input.employeeName ?? input.loanNumber}`,
        lines: [
          { accountCode: "employee_advances", debit: amount, credit: 0 },
          { accountCode: "cash", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async postEmployeeLoanRepayment(
    input: {
      installmentId: number;
      branchId?: number;
      date: string;
      amount: number;
      employeeName?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "hr",
        sourceDocType: "employee_loan_repayment",
        sourceDocId: input.installmentId,
        branchId: input.branchId,
        date: input.date,
        description: `سداد قسط سلفة ${input.employeeName ?? input.installmentId}`,
        lines: [
          { accountCode: "cash", debit: amount, credit: 0 },
          { accountCode: "employee_advances", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Capitalise stock entered as a genuine opening balance; it is neither revenue nor an expense. */
  async postOpeningStock(
    input: {
      openingStockId: number;
      branchId?: number;
      date: string;
      amount: number;
      itemName?: string;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "inventory",
        sourceDocType: "opening_stock",
        sourceDocId: input.openingStockId,
        branchId: input.branchId,
        date: input.date,
        description: `رصيد افتتاحي للمخزون${input.itemName ? ` — ${input.itemName}` : ""}`,
        lines: [
          { accountCode: "inventory", debit: amount, credit: 0 },
          { accountCode: "opening_balance_equity", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Expense inventory consumed internally by the gym or written off as damaged. */
  async postInventoryConsumption(
    input: {
      transactionId: number;
      reference: string;
      branchId?: number;
      date: string;
      amount: number;
      kind: "issue" | "damage";
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.amount);
    if (amount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "inventory",
        sourceDocType:
          input.kind === "damage" ? "inventory_damage" : "internal_issue",
        sourceDocId: input.transactionId,
        branchId: input.branchId,
        date: input.date,
        description: `${input.kind === "damage" ? "هالك مخزون" : "صرف مخزون داخل الجيم"} — ${input.reference}`,
        lines: [
          { accountCode: "operating_expense", debit: amount, credit: 0 },
          { accountCode: "inventory", debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /** Post the value difference discovered by an approved physical stock count. */
  async postInventoryCountAdjustment(
    input: {
      adjustmentNumber: string;
      branchId?: number;
      date: string;
      gainAmount: number;
      lossAmount: number;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const gain = roundMoney(input.gainAmount);
    const loss = roundMoney(input.lossAmount);
    if (gain <= 0 && loss <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "inventory",
        sourceDocType: "stock_count_adjustment",
        sourceDocId: input.adjustmentNumber,
        branchId: input.branchId,
        date: input.date,
        description: `تسوية جرد مخزون ${input.adjustmentNumber}`,
        lines: [
          ...(gain > 0
            ? [
                { accountCode: "inventory", debit: gain, credit: 0 },
                { accountCode: "other_revenue", debit: 0, credit: gain },
              ]
            : []),
          ...(loss > 0
            ? [
                { accountCode: "operating_expense", debit: loss, credit: 0 },
                { accountCode: "inventory", debit: 0, credit: loss },
              ]
            : []),
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }
}
