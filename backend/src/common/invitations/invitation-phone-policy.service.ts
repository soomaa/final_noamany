import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DUPLICATE_GUEST_MESSAGE =
  'هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم';

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
}

export function normalizeInvitationPhone(value: string): string {
  const compact = toAsciiDigits(value).replace(/[^\d+]/g, '').trim();
  const international = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.replace(/\D/g, '').replace(international ? /^00/ : /^$/, '');
  return `${international ? '+' : ''}${digits}`;
}

export function invitationPhoneIdentity(value: string): string {
  return normalizeInvitationPhone(value).replace(/^\+/, '');
}

@Injectable()
export class InvitationPhonePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  duplicateError(): BadRequestException {
    return new BadRequestException(DUPLICATE_GUEST_MESSAGE);
  }

  isPhoneUniqueViolation(error: unknown): boolean {
    return Boolean(
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'P2002'
      && 'meta' in error
      && JSON.stringify(error.meta).includes('recipient_phone_unique_key'),
    );
  }

  async prepare(
    rawPhone: string,
    excludeInvitationId?: number,
  ): Promise<{ phone: string; uniqueKey: string | null }> {
    const phone = normalizeInvitationPhone(rawPhone);
    const uniqueKey = invitationPhoneIdentity(rawPhone);
    if (uniqueKey.length < 6) {
      throw new BadRequestException('رقم هاتف الضيف غير صالح');
    }

    const policy = await this.prisma.club_gym_policies.findUnique({
      where: { id: 1 },
      select: { allow_same_guest_multiple_invitations: true },
    });
    if (policy?.allow_same_guest_multiple_invitations) {
      return { phone, uniqueKey: null };
    }

    const idFilter = excludeInvitationId ? { not: excludeInvitationId } : undefined;
    const direct = await this.prisma.am_invitations.findFirst({
      where: {
        ...(idFilter ? { id: idFilter } : {}),
        recipient_phone_unique_key: uniqueKey,
      },
      select: { id: true },
    });
    if (direct) throw this.duplicateError();

    // Rows created before the uniqueness-key migration stay untouched. Compare
    // their canonical phone in memory so upgrades preserve data and still enforce the rule.
    const legacyRows = await this.prisma.am_invitations.findMany({
      where: {
        ...(idFilter ? { id: idFilter } : {}),
        recipient_phone_unique_key: null,
        recipient_phone: { not: null },
      },
      select: { id: true, recipient_phone: true },
    });
    if (legacyRows.some((row) => row.recipient_phone && invitationPhoneIdentity(row.recipient_phone) === uniqueKey)) {
      throw this.duplicateError();
    }

    return { phone, uniqueKey };
  }
}

