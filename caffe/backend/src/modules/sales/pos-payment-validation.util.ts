import { BadRequestException } from '@nestjs/common';
import { SalesPaymentMethod } from '@prisma/client';
import { assertWithinCap, assertWithinRange } from '../../common/validators';

export interface PosPaymentMethodRule {
  code: string;
  baseMethod: SalesPaymentMethod;
  name: string;
  minAmount: number | null;
  maxAmount: number | null;
  requiresApproval: boolean;
  approvalThreshold: number | null;
  isEnabled: boolean;
}

/** Map POS catalog code → Prisma SalesPaymentMethod enum. */
export function catalogCodeToMethod(code: string): SalesPaymentMethod | null {
  const c = code.trim().toLowerCase();
  if (c === 'cash') return SalesPaymentMethod.cash;
  if (c === 'wallet') return SalesPaymentMethod.wallet;
  if (c === 'transfer' || c === 'bank_transfer') return SalesPaymentMethod.transfer;
  if (['card', 'mada', 'visa', 'mastercard', 'apple_pay', 'credit'].includes(c)) {
    return SalesPaymentMethod.card;
  }
  return null;
}

export function methodToCatalogCode(method: SalesPaymentMethod): string {
  switch (method) {
    case SalesPaymentMethod.cash:
      return 'cash';
    case SalesPaymentMethod.wallet:
      return 'wallet';
    case SalesPaymentMethod.transfer:
      return 'transfer';
    default:
      return 'card';
  }
}

export function findRuleForPayment(
  rules: PosPaymentMethodRule[],
  method: SalesPaymentMethod,
): PosPaymentMethodRule | undefined {
  const code = methodToCatalogCode(method);
  const candidates = rules.filter((r) => r.baseMethod === method || r.code.toLowerCase() === code || catalogCodeToMethod(r.code) === method);
  return candidates.find((rule) => rule.isEnabled) ?? candidates[0];
}

export function assertPaymentMethodRules(
  amount: number,
  method: SalesPaymentMethod,
  rule: PosPaymentMethodRule | undefined,
  opts?: { paymentApproved?: boolean },
): void {
  if (rule && !rule.isEnabled) {
    throw new BadRequestException(`طريقة الدفع «${rule.name}» غير مفعّلة`);
  }
  const label = rule?.name ?? method;
  assertWithinRange(amount, rule?.minAmount ?? null, rule?.maxAmount ?? null, `مبلغ ${label}`);
  if (
    rule?.requiresApproval &&
    rule.approvalThreshold != null &&
    amount >= rule.approvalThreshold &&
    !opts?.paymentApproved
  ) {
    throw new BadRequestException(
      `مبلغ ${amount} يتجاوز حد الموافقة (${rule.approvalThreshold}) لطريقة «${label}»`,
    );
  }
}
