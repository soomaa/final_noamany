import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ModuleLedgerService } from '../../../modules/accounting/module-ledger.service';
import {
  EmployeeLoanDisbursementInput,
  EmployeeLoanRepaymentInput,
  FinalSettlementAccrualInput,
  FinalSettlementPaymentInput,
  HrLedgerAdapter,
  HrLedgerTransaction,
  PayrollAccrualInput,
  PayrollPaymentInput,
  PayrollExpenseInput,
} from '../../../ports/accounting/hr-ledger.adapter';
import { recordSystemExpense, reverseSystemExpense } from '../../../modules/finance/system-expense.util';

@Injectable()
export class One80HrLedgerAdapter implements HrLedgerAdapter {
  constructor(
    private readonly ledger: ModuleLedgerService,
    private readonly prisma: PrismaService,
  ) {}

  ensureReady() { return this.ledger.ensureChart(); }
  async getPayrollReconciliation(input: { payrollNumber: number }) {
    const defaults = await this.prisma.acc_default_accounts.findMany({
      where: { key: { in: ['salaries_payable', 'salary_expense', 'bank'] } },
      select: { key: true, account_code: true },
    });
    const codeByKey = new Map(defaults.map((item) => [item.key, item.account_code]));
    const payableCode = codeByKey.get('salaries_payable');
    const expenseCode = codeByKey.get('salary_expense');
    const bankCode = codeByKey.get('bank');
    if (!payableCode || !expenseCode || !bankCode) {
      throw new ServiceUnavailableException('إعدادات حسابات الرواتب غير مكتملة');
    }
    const entries = await this.prisma.acc_journal_entries.findMany({
      where: {
        source_module: 'payroll',
        source_doc_id: { startsWith: `${input.payrollNumber}:` },
        status: { in: ['posted', 'reversed'] },
      },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    let payrollGlPayable = 0;
    let bankPayment = 0;
    let salaryExpense = 0;
    const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    for (const entry of entries) {
      if (entry.status !== 'posted' || entry.reverses_id != null) continue;
      for (const line of entry.lines) {
        const code = line.account.code;
        if (entry.source_doc_type === 'payroll_accrual' && code === payableCode) {
          payrollGlPayable = money(payrollGlPayable + Number(line.credit) - Number(line.debit));
        }
        if (entry.source_doc_type === 'payroll_accrual' && code === expenseCode) {
          salaryExpense = money(salaryExpense + Number(line.debit) - Number(line.credit));
        }
        if (entry.source_doc_type === 'payroll_payment' && code === bankCode) {
          bankPayment = money(bankPayment + Number(line.credit) - Number(line.debit));
        }
      }
    }
    return { payrollGlPayable, bankPayment, salaryExpense };
  }
  postPayrollAccrual(input: PayrollAccrualInput, tx?: HrLedgerTransaction) { return this.ledger.postPayrollAccrual(input, tx); }
  postPayrollPayment(input: PayrollPaymentInput, tx?: HrLedgerTransaction) { return this.ledger.postPayrollPayment(input, tx); }
  postFinalSettlementAccrual(input: FinalSettlementAccrualInput, tx?: HrLedgerTransaction) { return this.ledger.postFinalSettlementAccrual(input, tx); }
  postFinalSettlementPayment(input: FinalSettlementPaymentInput, tx?: HrLedgerTransaction) { return this.ledger.postFinalSettlementPayment(input, tx); }
  reversePayrollRun(input: { payrollNumber: number; reason: string; userId?: number }, tx?: HrLedgerTransaction) { return this.ledger.reversePayrollRun(input, tx); }
  postEmployeeLoanDisbursement(input: EmployeeLoanDisbursementInput, tx?: HrLedgerTransaction) { return this.ledger.postEmployeeLoanDisbursement(input, tx); }
  postEmployeeLoanRepayment(input: EmployeeLoanRepaymentInput, tx?: HrLedgerTransaction) { return this.ledger.postEmployeeLoanRepayment(input, tx); }
  recordPayrollExpense(input: PayrollExpenseInput, tx: HrLedgerTransaction) { return recordSystemExpense(tx, input); }
  reversePayrollExpense(invoiceNumber: string, reason: string, tx: HrLedgerTransaction) { return reverseSystemExpense(tx, invoiceNumber, reason); }
}
