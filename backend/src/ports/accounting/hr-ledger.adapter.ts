import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const HR_LEDGER_ADAPTER = Symbol('HR_LEDGER_ADAPTER');
export type HrLedgerTransaction = Prisma.TransactionClient;

export interface PayrollAccrualInput {
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
}

export interface PayrollPaymentInput {
  payrollNumber: number;
  branchId?: number;
  date: string;
  netPay: number;
  createdBy?: number;
}

export interface FinalSettlementAccrualInput {
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
}

export interface FinalSettlementPaymentInput {
  settlementNumber: number;
  branchId?: number;
  date: string;
  netPay: number;
  createdBy?: number;
}

export interface EmployeeLoanDisbursementInput {
  loanNumber: number;
  branchId?: number;
  date: string;
  amount: number;
  employeeName?: string | null;
  createdBy?: number;
}

export interface EmployeeLoanRepaymentInput {
  installmentId: number;
  branchId?: number;
  date: string;
  amount: number;
  employeeName?: string | null;
  createdBy?: number;
}

export interface PayrollExpenseInput {
  invoiceNumber: string;
  date: string;
  category: string;
  subCategory: string;
  amount: number;
  description: string;
  branchId?: number;
  createdBy?: number;
  paymentMethod: string;
}

export interface PayrollReconciliationProjection {
  payrollGlPayable: number;
  bankPayment: number;
  salaryExpense: number;
}

export interface HrLedgerAdapter {
  ensureReady(): Promise<void>;
  getPayrollReconciliation(input: { payrollNumber: number }): Promise<PayrollReconciliationProjection>;
  postPayrollAccrual(input: PayrollAccrualInput, tx?: HrLedgerTransaction): Promise<void>;
  postPayrollPayment(input: PayrollPaymentInput, tx?: HrLedgerTransaction): Promise<void>;
  postFinalSettlementAccrual(input: FinalSettlementAccrualInput, tx?: HrLedgerTransaction): Promise<void>;
  postFinalSettlementPayment(input: FinalSettlementPaymentInput, tx?: HrLedgerTransaction): Promise<void>;
  reversePayrollRun(input: { payrollNumber: number; reason: string; userId?: number }, tx?: HrLedgerTransaction): Promise<number>;
  postEmployeeLoanDisbursement(input: EmployeeLoanDisbursementInput, tx?: HrLedgerTransaction): Promise<void>;
  postEmployeeLoanRepayment(input: EmployeeLoanRepaymentInput, tx?: HrLedgerTransaction): Promise<void>;
  recordPayrollExpense(input: PayrollExpenseInput, tx: HrLedgerTransaction): Promise<void>;
  reversePayrollExpense(invoiceNumber: string, reason: string, tx: HrLedgerTransaction): Promise<void>;
}

export class FailClosedHrLedgerAdapter implements HrLedgerAdapter {
  private unavailable(): never {
    throw new ServiceUnavailableException('تكامل المحاسبة/دفتر الأستاذ غير مهيأ');
  }

  async ensureReady(): Promise<void> { return this.unavailable(); }
  async getPayrollReconciliation(_input: { payrollNumber: number }): Promise<PayrollReconciliationProjection> { return this.unavailable(); }
  async postPayrollAccrual(): Promise<void> { return this.unavailable(); }
  async postPayrollPayment(): Promise<void> { return this.unavailable(); }
  async postFinalSettlementAccrual(): Promise<void> { return this.unavailable(); }
  async postFinalSettlementPayment(): Promise<void> { return this.unavailable(); }
  async reversePayrollRun(): Promise<number> { return this.unavailable(); }
  async postEmployeeLoanDisbursement(): Promise<void> { return this.unavailable(); }
  async postEmployeeLoanRepayment(): Promise<void> { return this.unavailable(); }
  async recordPayrollExpense(): Promise<void> { return this.unavailable(); }
  async reversePayrollExpense(): Promise<void> { return this.unavailable(); }
}
