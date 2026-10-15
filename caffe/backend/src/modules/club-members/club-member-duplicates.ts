import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isValidNationalIdFormat,
  isValidPhoneFormat,
  normalizeCardNumber,
  normalizePhoneForStorage,
} from './club-member.utils';

export interface DuplicateHit {
  field: 'phone' | 'cardNumber';
  fieldLabel: string;
  memberId: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  phone: 'رقم الموبايل',
  cardNumber: 'الرقم القومي',
};

export async function findMemberDuplicates(
  prisma: PrismaService,
  opts: { phone?: string; cardNumber?: string; excludeMemberId?: number },
): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = [];
  const exclude = opts.excludeMemberId;
  const baseWhere: Prisma.club_membersWhereInput = { is_deleted: false };
  if (exclude) baseWhere.id = { not: exclude };

  if (opts.phone && isValidPhoneFormat(opts.phone)) {
    const stored = normalizePhoneForStorage(opts.phone);
    const row = await prisma.club_members.findFirst({
      where: { ...baseWhere, phone: stored },
      select: { id: true, member_code: true, name: true, phone: true, card_number: true },
    });
    if (row) {
      hits.push({
        field: 'phone',
        fieldLabel: FIELD_LABELS.phone,
        memberId: row.id,
        memberCode: row.member_code,
        name: row.name,
        phone: row.phone,
        cardNumber: row.card_number,
      });
    }
  }

  if (opts.cardNumber && isValidNationalIdFormat(opts.cardNumber)) {
    const stored = normalizeCardNumber(opts.cardNumber);
    const row = await prisma.club_members.findFirst({
      where: { ...baseWhere, card_number: stored },
      select: { id: true, member_code: true, name: true, phone: true, card_number: true },
    });
    if (row) {
      hits.push({
        field: 'cardNumber',
        fieldLabel: FIELD_LABELS.cardNumber,
        memberId: row.id,
        memberCode: row.member_code,
        name: row.name,
        phone: row.phone,
        cardNumber: row.card_number,
      });
    }
  }

  return hits;
}

export function buildDuplicateMessage(duplicates: DuplicateHit[], isUpdate = false): string {
  const action = isUpdate ? 'تحديث العضو' : 'إضافة العضو';
  const parts = duplicates.map((d) => {
    const label = d.fieldLabel;
    const ref = `${d.name} (${d.memberCode})`;
    return `${label} مكرر — مسجل مسبقاً: ${ref}`;
  });
  return `لا يمكن ${action}. ${parts.join(' | ')}`;
}
