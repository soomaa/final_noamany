import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const CAFE_PAYROLL_ALLOCATION_ADAPTER = Symbol('CAFE_PAYROLL_ALLOCATION_ADAPTER');

/**
 * Host-owned boundary for monthly café deductions.
 * Implementations may query Noamany payroll state, but the sales module must not
 * depend on payroll tables or lifecycle enums directly.
 */
export abstract class CafePayrollAllocationAdapter {
  abstract isSaleAllocated(saleId: number, tx?: Prisma.TransactionClient): Promise<boolean>;
}

/** Safe default while Noamany's payroll lifecycle mapping is not configured. */
@Injectable()
export class DeferredCafePayrollAllocationAdapter extends CafePayrollAllocationAdapter {
  async isSaleAllocated(_saleId: number, _tx?: Prisma.TransactionClient): Promise<boolean> {
    return false;
  }
}
