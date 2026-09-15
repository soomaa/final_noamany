import { BadRequestException } from '@nestjs/common';
import { SalesPaymentMethod } from '@prisma/client';
import { assertWithinCap, assertWithinRange } from '../../common/validators';

export interface PosPaymentMethodRule {
  id: number;
  code: string;
  baseMethod: SalesPaymentMethod;
  name: string;
  minAmount: number | null;
  maxAmount: number | null;
  requiresApproval: boolean;
  approvalThreshold: number | null;
  supportsMixedPayment: boolean;
  requiresReference: boolean;
  isEnabled: boolean;
}

export interface ConfiguredPaymentInput {
  method: SalesPaymentMethod;
  amount: number;
  reference?: string;
  catalogPaymentMethodId?: number;
}

export interface ResolvedConfiguredPayment {
  method: SalesPaymentMethod;
  amount: number;
  reference?: string;
  catalogPaymentMethodId?: number;
  methodCode?: string;
  methodName?: string;
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

export function resolveConfiguredPayment(
  rules: PosPaymentMethodRule[],
  input: ConfiguredPaymentInput,
  opts?: { isMixed?: boolean; paymentApproved?: boolean },
): ResolvedConfiguredPayment {
  const selected = input.catalogPaymentMethodId != null
    ? rules.find((rule) => rule.id === input.catalogPaymentMethodId)
    : findRuleForPayment(rules, input.method);

  if (input.catalogPaymentMethodId != null && !selected) {
    throw new BadRequestException('طريقة الدفع المحددة غير موجودة');
  }
  if (selected && selected.baseMethod !== input.method) {
    throw new BadRequestException('نوع طريقة الدفع لا يطابق إعدادها المحاسبي');
  }
  if (opts?.isMixed && selected && !selected.supportsMixedPayment) {
    throw new BadRequestException(`طريقة الدفع «${selected.name}» لا تدعم تقسيم الدفع`);
  }
  if (selected?.requiresReference && !input.reference?.trim()) {
    throw new BadRequestException(`اكتب رقم المرجع لطريقة الدفع «${selected.name}»`);
  }
  assertPaymentMethodRules(input.amount, input.method, selected, {
    paymentApproved: opts?.paymentApproved,
  });

  return {
    method: input.method,
    amount: input.amount,
    ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
    ...(selected
      ? {
          catalogPaymentMethodId: selected.id,
          methodCode: selected.code,
          methodName: selected.name,
        }
      : {}),
  };
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

