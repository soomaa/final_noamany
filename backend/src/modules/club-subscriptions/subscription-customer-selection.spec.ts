import { BadRequestException } from '@nestjs/common';
import { validateSubscriptionCustomerSelection } from './subscription-customer-selection';

describe('validateSubscriptionCustomerSelection', () => {
  it('rejects a name-only subscription that was not explicitly marked as a walk-in', () => {
    expect(() => validateSubscriptionCustomerSelection({
      customerName: 'عضو مسجل مكتوب بالاسم فقط',
    })).toThrow(new BadRequestException(
      'اختر عضوًا مسجلًا من نتائج البحث، أو فعّل «عميل عابر»',
    ));
  });

  it('accepts an explicitly marked walk-in without a member id', () => {
    expect(() => validateSubscriptionCustomerSelection({
      customerName: 'عميل عابر',
      isWalkIn: true,
    })).not.toThrow();
  });

  it('rejects selecting a member and walk-in mode together', () => {
    expect(() => validateSubscriptionCustomerSelection({
      memberId: 45,
      isWalkIn: true,
    })).toThrow(new BadRequestException(
      'لا يمكن اختيار عضو مسجل و«عميل عابر» في نفس الاشتراك',
    ));
  });
});
