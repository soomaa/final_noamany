import { BadRequestException } from '@nestjs/common';
import { SalesPaymentMethod } from '@prisma/client';
import {
  PosPaymentMethodRule,
  resolveConfiguredPayment,
} from './pos-payment-validation.util';

const rules: PosPaymentMethodRule[] = [
  {
    id: 1,
    code: 'cash',
    baseMethod: SalesPaymentMethod.cash,
    name: 'كاش',
    minAmount: null,
    maxAmount: null,
    requiresApproval: false,
    approvalThreshold: null,
    supportsMixedPayment: true,
    requiresReference: false,
    isEnabled: true,
  },
  {
    id: 7,
    code: 'instapay',
    baseMethod: SalesPaymentMethod.transfer,
    name: 'InstaPay',
    minAmount: null,
    maxAmount: null,
    requiresApproval: false,
    approvalThreshold: null,
    supportsMixedPayment: true,
    requiresReference: true,
    isEnabled: true,
  },
];

describe('resolveConfiguredPayment', () => {
  it('returns an immutable catalog snapshot for the exact selected method', () => {
    expect(resolveConfiguredPayment(rules, {
      method: SalesPaymentMethod.transfer,
      amount: 50,
      catalogPaymentMethodId: 7,
      reference: 'IP-2026-44',
    }, { isMixed: true })).toEqual({
      method: SalesPaymentMethod.transfer,
      amount: 50,
      reference: 'IP-2026-44',
      catalogPaymentMethodId: 7,
      methodCode: 'instapay',
      methodName: 'InstaPay',
    });
  });

  it('rejects a catalog id whose accounting base differs from the submitted method', () => {
    expect(() => resolveConfiguredPayment(rules, {
      method: SalesPaymentMethod.card,
      amount: 50,
      catalogPaymentMethodId: 7,
      reference: 'IP-2026-44',
    })).toThrow(BadRequestException);
  });

  it('requires a reference only when the selected method is configured to require one', () => {
    expect(() => resolveConfiguredPayment(rules, {
      method: SalesPaymentMethod.transfer,
      amount: 50,
      catalogPaymentMethodId: 7,
    })).toThrow('اكتب رقم المرجع');
  });

  it('preserves legacy clients by resolving an enabled rule from the base method', () => {
    expect(resolveConfiguredPayment(rules, {
      method: SalesPaymentMethod.cash,
      amount: 25,
    })).toEqual(expect.objectContaining({
      method: SalesPaymentMethod.cash,
      catalogPaymentMethodId: 1,
      methodCode: 'cash',
      methodName: 'كاش',
    }));
  });
});

