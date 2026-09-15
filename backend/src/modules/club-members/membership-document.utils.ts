import { BadRequestException } from '@nestjs/common';

export const MEMBERSHIP_DOCUMENT_TYPES = [
  'national_id',
  'contract',
  'medical_clearance',
  'other',
] as const;

export type MembershipDocumentType = (typeof MEMBERSHIP_DOCUMENT_TYPES)[number];

export function normalizeMembershipDocumentType(value: string | null | undefined): MembershipDocumentType {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if ((MEMBERSHIP_DOCUMENT_TYPES as readonly string[]).includes(normalized)) {
    return normalized as MembershipDocumentType;
  }
  throw new BadRequestException('نوع المستند غير صالح');
}
