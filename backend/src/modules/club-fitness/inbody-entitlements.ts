import { BadRequestException } from '@nestjs/common';

export type InbodyEntitlementCandidate = {
  id: number;
  expiresAt: string | null;
};

export function sortInbodyEntitlements<T extends InbodyEntitlementCandidate>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.expiresAt == null && right.expiresAt == null) return left.id - right.id;
    if (left.expiresAt == null) return 1;
    if (right.expiresAt == null) return -1;
    return left.expiresAt.localeCompare(right.expiresAt) || left.id - right.id;
  });
}

export type ValidatedInbodyOffer = {
  name: string;
  measurementCount: number;
  price: number;
  validityDays: number | null;
};

export function validateInbodyOffer(input: Record<string, unknown>): ValidatedInbodyOffer {
  const name = String(input.name ?? '').trim();
  if (!name) throw new BadRequestException('اسم باقة InBody مطلوب');

  const measurementCount = Number(input.measurementCount);
  if (!Number.isInteger(measurementCount)) {
    throw new BadRequestException('عدد القياسات يجب أن يكون رقمًا صحيحًا');
  }
  if (measurementCount <= 0) {
    throw new BadRequestException('عدد القياسات يجب أن يكون أكبر من صفر');
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new BadRequestException('سعر باقة InBody لا يمكن أن يكون سالبًا');
  }

  const hasValidity = input.validityDays !== undefined && input.validityDays !== null && input.validityDays !== '';
  const validityDays = hasValidity ? Number(input.validityDays) : null;
  if (validityDays != null && (!Number.isInteger(validityDays) || validityDays <= 0)) {
    throw new BadRequestException('مدة الصلاحية يجب أن تكون أكبر من صفر');
  }

  return { name, measurementCount, price, validityDays };
}
