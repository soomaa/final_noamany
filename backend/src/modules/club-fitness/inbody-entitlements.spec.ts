import {
  sortInbodyEntitlements,
  validateInbodyOffer,
} from './inbody-entitlements';

describe('InBody entitlement rules', () => {
  it('uses the entitlement with the nearest expiry first and keeps non-expiring balances last', () => {
    const ordered = sortInbodyEntitlements([
      { id: 8, expiresAt: null, source: 'package' },
      { id: 4, expiresAt: '2026-11-30', source: 'subscription' },
      { id: 7, expiresAt: '2026-09-15', source: 'package' },
      { id: 3, expiresAt: '2026-09-15', source: 'subscription' },
    ]);

    expect(ordered.map((item) => item.id)).toEqual([3, 7, 4, 8]);
  });

  it('does not mutate the entitlement collection supplied by the caller', () => {
    const input = [
      { id: 2, expiresAt: '2026-10-01' },
      { id: 1, expiresAt: '2026-09-01' },
    ];

    sortInbodyEntitlements(input);

    expect(input.map((item) => item.id)).toEqual([2, 1]);
  });

  it('normalizes a valid package offer', () => {
    expect(validateInbodyOffer({
      name: 'باقة 5 قياسات',
      measurementCount: '5',
      price: '750',
      validityDays: '90',
    })).toEqual({
      name: 'باقة 5 قياسات',
      measurementCount: 5,
      price: 750,
      validityDays: 90,
    });
  });

  it.each([
    [{ name: '', measurementCount: 1, price: 100 }, 'اسم باقة InBody مطلوب'],
    [{ name: 'قياس', measurementCount: 0, price: 100 }, 'عدد القياسات يجب أن يكون أكبر من صفر'],
    [{ name: 'قياس', measurementCount: 1.5, price: 100 }, 'عدد القياسات يجب أن يكون رقمًا صحيحًا'],
    [{ name: 'قياس', measurementCount: 1, price: -1 }, 'سعر باقة InBody لا يمكن أن يكون سالبًا'],
    [{ name: 'قياس', measurementCount: 1, price: 100, validityDays: 0 }, 'مدة الصلاحية يجب أن تكون أكبر من صفر'],
  ])('rejects an invalid offer %#', (input, message) => {
    expect(() => validateInbodyOffer(input)).toThrow(message as string);
  });
});
