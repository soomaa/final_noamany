import { BadRequestException, Injectable } from "@nestjs/common";
import { SalesPaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
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
    private readonly prisma?: PrismaService,
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

  /**
   * House hospitality sale (ضيافة المكان): the guest pays nothing and no receivable
   * is created. The only real cost to the business is the goods consumed, so we book
   * that at COST as a hospitality operating expense against inventory. No revenue, no
   * tax, no payment lines. If nothing was consumed (inventory tracking off / zero cost)
   * there is nothing to post.
   */
  async postHospitalitySale(
    input: {
      saleNumber: string;
      branchId: number;
      saleDate: string;
      cogsAmount: number;
      hostName?: string | null;
      createdBy: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const cogsAmount = roundMoney(input.cogsAmount ?? 0);
    if (cogsAmount <= 0) return;
    await this.ensureChart();
    await this.ledger.postEntry(
      {
        sourceModule: "sales",
        sourceDocType: "quick_sale",
        sourceDocId: input.saleNumber,
        branchId: input.branchId,
        date: input.saleDate,
        description: input.hostName
          ? `ضيافة المكان ${input.saleNumber} — بتوجيه ${input.hostName}`
          : `ضيافة المكان ${input.saleNumber}`,
        lines: [
          { accountCode: "hospitality_expense", debit: cogsAmount, credit: 0 },
          { accountCode: "inventory", debit: 0, credit: cogsAmount },
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  /**
   * Keep the original sale journal immutable and post only the account deltas.
   * The invoice lock/version is owned by the caller; the revision source also
   * makes posting this correction idempotent inside LedgerService.
   */
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
        : collected > 0 ? [{ method: snapshot.paymentMethod, amount: collected }] : [];
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
      amount === 0 ? [] : [{ accountCode, debit: Math.max(0, amount), credit: Math.max(0, -amount) }],
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

  /** Recover a hospitality invoice's retail value. Its original stock/cost entry stays intact. */
  async postHospitalitySettlement(input: {
    statementNumber: string; branchId: number; date: string; amount: number;
    taxAmount: number; partnerAccount: boolean; paymentMethod?: SalesPaymentMethod; createdBy: number;
  }, tx: Tx): Promise<void> {
    const amount = roundMoney(input.amount);
    const tax = roundMoney(input.taxAmount);
    if (amount <= 0 || tax < 0 || tax > amount) throw new BadRequestException('قيمة كشف الضيافة غير صالحة للتسوية');
    await this.ledger.postEntry({
      sourceModule: 'sales', sourceDocType: 'hospitality_settlement', sourceDocId: input.statementNumber,
      branchId: input.branchId, date: input.date, createdBy: input.createdBy, entryPrefix: 'A',
      description: `تسوية ضيافة ${input.statementNumber}${input.partnerAccount ? ' على حساب شريك' : ' بتحصيل مباشر'}`,
      lines: [
        { accountCode: input.partnerAccount ? 'accounts_receivable' : this.paymentKeyFromSalesMethod(input.paymentMethod ?? SalesPaymentMethod.cash), debit: amount, credit: 0 },
        { accountCode: 'sales_revenue', debit: 0, credit: roundMoney(amount - tax) },
        ...(tax > 0 ? [{ accountCode: 'vat_output', debit: 0, credit: tax }] : []),
      ],
    }, tx);
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
      paidAmount?: number;
      payments?: { method: string; amount: number }[];
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
        date: input.expenseDate.slice(0, 10),
        description: `اعتماد مصروف ${input.expenseNumber}`,
        lines: [
          { accountCode: "operating_expense", debit: amount, credit: 0 },
          ...(input.payments?.length ? input.payments.map((payment) => ({
            accountCode: this.paymentKeyFromString(payment.method), debit: 0, credit: roundMoney(payment.amount),
          })) : (input.paidAmount ?? amount) > 0 ? [{ accountCode: payKey, debit: 0, credit: input.paidAmount ?? amount }] : []),
          ...((input.paidAmount ?? amount) < amount ? [{
            accountCode: "accounts_payable", debit: 0, credit: roundMoney(amount - (input.paidAmount ?? amount)),
          }] : []),
        ],
        createdBy: input.createdBy,
        entryPrefix: "A",
      },
      tx,
    );
  }

  async syncExpense(
    input: Parameters<ModuleLedgerService['postExpenseApproval']>[0] & { post: boolean },
    tx: Tx,
  ) {
    const entry = await tx.acc_journal_entries.findFirst({
      where: { source_module: 'finance', source_doc_type: 'expense',
        source_doc_id: String(input.expenseId), status: 'posted', reversed_by_id: null },
    });
    if (entry) await this.ledger.reverseEntry(entry.id, 'تعديل أو حذف مصروف', input.createdBy, tx);
    if (input.post) await this.postExpenseApproval(input, tx);
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
      incomeTax?: number;
      cafeDeductions?: number;
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
    const incomeTax = roundMoney(input.incomeTax ?? 0);
    const cafeDeductions = roundMoney(input.cafeDeductions ?? 0);
    const otherDeductions = roundMoney(input.nonLiabilityDeductions);
    const debitTotal = roundMoney(gross + employerInsurance);
    const creditTotal = roundMoney(
      net + employeeInsurance + employerInsurance + loans + incomeTax + cafeDeductions + otherDeductions,
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
    if (incomeTax > 0) {
      lines.push({ accountCode: "payroll_income_tax_payable", debit: 0, credit: incomeTax });
    }
    if (cafeDeductions > 0) lines.push({ accountCode: "accounts_receivable", debit: 0, credit: cafeDeductions });
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

  async postFinalSettlementAccrual(
    input: {
      settlementNumber: number;
      branchId?: number;
      date: string;
      grossEarnings: number;
      netPay: number;
      employeeInsurance: number;
      employerInsurance: number;
      loanRecovery: number;
      incomeTax: number;
      nonLiabilityDeductions: number;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const gross = roundMoney(input.grossEarnings);
    const net = roundMoney(input.netPay);
    const empInsurance = roundMoney(input.employeeInsurance);
    const employerInsurance = roundMoney(input.employerInsurance);
    const loan = roundMoney(input.loanRecovery);
    const tax = roundMoney(input.incomeTax);
    const other = roundMoney(input.nonLiabilityDeductions);
    const debit = roundMoney(gross + employerInsurance);
    const credit = roundMoney(net + empInsurance + employerInsurance + loan + tax + other);
    if (debit <= 0 || Math.abs(debit - credit) > 0.01) {
      throw new BadRequestException(`قيد التسوية النهائية ${input.settlementNumber} غير متوازن`);
    }
    const lines: LedgerLineInput[] = [{ accountCode: 'salary_expense', debit, credit: 0 }];
    if (other > 0) lines.push({ accountCode: 'salary_expense', debit: 0, credit: other });
    if (empInsurance + employerInsurance > 0) lines.push({ accountCode: 'social_insurance_payable', debit: 0, credit: roundMoney(empInsurance + employerInsurance) });
    if (loan > 0) lines.push({ accountCode: 'employee_advances', debit: 0, credit: loan });
    if (tax > 0) lines.push({ accountCode: 'payroll_income_tax_payable', debit: 0, credit: tax });
    if (net > 0) lines.push({ accountCode: 'salaries_payable', debit: 0, credit: net });
    await this.ledger.postEntry({
      sourceModule: 'payroll', sourceDocType: 'final_settlement_accrual',
      sourceDocId: String(input.settlementNumber), branchId: input.branchId,
      date: input.date, description: `استحقاق تسوية نهائية ${input.settlementNumber}`,
      lines, createdBy: input.createdBy, entryPrefix: 'A',
    }, tx);
  }

  async postFinalSettlementPayment(
    input: { settlementNumber: number; branchId?: number; date: string; netPay: number; createdBy?: number },
    tx?: Tx,
  ): Promise<void> {
    const amount = roundMoney(input.netPay);
    if (amount <= 0) return;
    await this.ledger.postEntry({
      sourceModule: 'payroll', sourceDocType: 'final_settlement_payment',
      sourceDocId: String(input.settlementNumber), branchId: input.branchId,
      date: input.date, description: `صرف تسوية نهائية ${input.settlementNumber}`,
      lines: [
        { accountCode: 'salaries_payable', debit: amount, credit: 0 },
        { accountCode: 'bank', debit: 0, credit: amount },
      ], createdBy: input.createdBy, entryPrefix: 'A',
    }, tx);
  }

  /** Reverse every posted payroll accrual/payment journal for a run (unpost). */
  async reversePayrollRun(
    input: { payrollNumber: number; reason: string; userId?: number },
    tx?: Tx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    if (!client) {
      throw new BadRequestException("تعذر عكس قيود المسيرة");
    }
    const entries = await client.acc_journal_entries.findMany({
      where: {
        source_module: "payroll",
        source_doc_id: { startsWith: `${input.payrollNumber}:` },
        status: "posted",
        reversed_by_id: null,
      },
      select: { id: true },
    });
    for (const entry of entries) {
      await this.ledger.reverseEntry(
        entry.id,
        input.reason,
        input.userId ?? 0,
        tx,
      );
    }
    return entries.length;
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

  async postClubServiceSale(
    input: {
      sourceType: string;
      sourceRef: string;
      branchId: number;
      date: string;
      totalAmount: number;
      collectedAmount: number;
      paymentMethod?: string | null;
      payments?: { method: string; amount: number }[];
      description?: string | null;
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const total = roundMoney(input.totalAmount);
    const collected = roundMoney(input.collectedAmount);
    if (total <= 0 || collected < 0 || collected > total) return;
    await this.ensureChart();
    const grouped = new Map<string, number>();
    const rows = input.payments?.length
      ? input.payments
      : collected > 0
        ? [{ method: input.paymentMethod ?? 'cash', amount: collected }]
        : [];
    for (const row of rows) {
      const amount = roundMoney(row.amount);
      if (amount <= 0) continue;
      const account = this.paymentKeyFromString(row.method);
      grouped.set(account, roundMoney((grouped.get(account) ?? 0) + amount));
    }
    const lines: LedgerLineInput[] = [...grouped].map(([accountCode, amount]) => ({ accountCode, debit: amount, credit: 0 }));
    const remaining = roundMoney(total - collected);
    if (remaining > 0) lines.push({ accountCode: 'accounts_receivable', debit: remaining, credit: 0 });
    lines.push({ accountCode: 'sales_revenue', debit: 0, credit: total });
    await this.ledger.postEntry({
      sourceModule: 'club-services',
      sourceDocType: `${input.sourceType}_sale`,
      sourceDocId: input.sourceRef,
      branchId: input.branchId,
      date: input.date,
      description: input.description ?? `بيع خدمة ${input.sourceRef}`,
      lines,
      createdBy: input.createdBy,
      entryPrefix: 'A',
    }, tx);
  }

  async postClubServiceDebtPayment(
    input: {
      receiptNumber: string;
      branchId: number;
      date: string;
      amount: number;
      paymentMethod?: string | null;
      payments?: { method: string; amount: number }[];
      createdBy?: number;
    },
    tx?: Tx,
  ): Promise<void> {
    const total = roundMoney(input.amount);
    if (total <= 0) return;
    await this.ensureChart();
    const grouped = new Map<string, number>();
    const rows = input.payments?.length ? input.payments : [{ method: input.paymentMethod ?? 'cash', amount: total }];
    for (const row of rows) {
      const amount = roundMoney(row.amount);
      if (amount <= 0) continue;
      const account = this.paymentKeyFromString(row.method);
      grouped.set(account, roundMoney((grouped.get(account) ?? 0) + amount));
    }
    await this.ledger.postEntry({
      sourceModule: 'club-services',
      sourceDocType: 'service_debt_payment',
      sourceDocId: input.receiptNumber,
      branchId: input.branchId,
      date: input.date,
      description: `سداد مديونية خدمة ${input.receiptNumber}`,
      lines: [
        ...[...grouped].map(([accountCode, amount]) => ({ accountCode, debit: amount, credit: 0 })),
        { accountCode: 'accounts_receivable', debit: 0, credit: total },
      ],
      createdBy: input.createdBy,
      entryPrefix: 'A',
    }, tx);
  }
}
