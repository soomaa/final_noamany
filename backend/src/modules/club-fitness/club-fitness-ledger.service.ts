import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

type Tx = Prisma.TransactionClient;

export interface FitnessLedgerPaymentPayload {
  invoiceId: number;
  invoiceNumber: string;
  memberId?: number;
  amount: number;
  branchId: number;
  description?: string;
  invoiceDate?: string;
  paymentMethod?: string;
  createdBy?: number;
}

@Injectable()
export class ClubFitnessLedgerService {
  constructor(private readonly moduleLedger: ModuleLedgerService) {}

  /**
   * Post the GL payment for a wellness (InBody/SPA) invoice. When called inside a
   * prisma.$transaction, pass `tx` so the GL write commits atomically with the invoice
   * insert/update — otherwise postEntry opens its own transaction and the two can diverge.
   */
  async postPayment(payload: FitnessLedgerPaymentPayload, tx?: Tx): Promise<void> {
    await this.moduleLedger.postFitnessPayment(
      {
        invoiceNumber: payload.invoiceNumber,
        branchId: payload.branchId,
        invoiceDate: payload.invoiceDate ?? new Date().toISOString().slice(0, 10),
        amount: payload.amount,
        description: payload.description,
        paymentMethod: payload.paymentMethod,
        createdBy: payload.createdBy,
      },
      tx,
    );
  }
}
