import { ServiceUnavailableException } from '@nestjs/common';

export const BANK_PAYMENT_ADAPTER = Symbol('BANK_PAYMENT_ADAPTER');

export type BankSettlementStatus =
  | 'not_configured'
  | 'prepared'
  | 'submitted'
  | 'accepted'
  | 'partially_settled'
  | 'settled'
  | 'rejected';

export interface PayrollBankSettlement {
  status: BankSettlementStatus;
  settledAmount: number;
  reference?: string | null;
  submittedAt?: Date | null;
  settledAt?: Date | null;
}

export interface BankPaymentAdapter {
  getPayrollSettlement(input: {
    payrollNumber: number;
    expectedAmount: number;
  }): Promise<PayrollBankSettlement>;
  getFinalSettlement(input: {
    settlementNumber: number;
    expectedAmount: number;
  }): Promise<PayrollBankSettlement>;
}

/** Portable default: file preparation is available, bank settlement is not inferred. */
export class DisabledBankPaymentAdapter implements BankPaymentAdapter {
  async getPayrollSettlement(): Promise<PayrollBankSettlement> {
    return { status: 'not_configured', settledAmount: 0 };
  }

  async getFinalSettlement(): Promise<PayrollBankSettlement> {
    return { status: 'not_configured', settledAmount: 0 };
  }

  unavailable(): never {
    throw new ServiceUnavailableException('تكامل تأكيد التحويل البنكي غير مهيأ');
  }
}
