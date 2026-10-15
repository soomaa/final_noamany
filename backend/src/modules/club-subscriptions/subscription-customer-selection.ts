import { BadRequestException } from '@nestjs/common';

export function validateSubscriptionCustomerSelection(input: {
  memberId?: number;
  isWalkIn?: boolean;
  customerName?: string;
}): void {
  if (!input.memberId && input.isWalkIn !== true) {
    throw new BadRequestException('اختر عضوًا مسجلًا من نتائج البحث، أو فعّل «عميل عابر»');
  }
  if (input.memberId && input.isWalkIn === true) {
    throw new BadRequestException('لا يمكن اختيار عضو مسجل و«عميل عابر» في نفس الاشتراك');
  }
}
