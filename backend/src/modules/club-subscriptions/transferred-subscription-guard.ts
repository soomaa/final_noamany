import { BadRequestException } from '@nestjs/common';

/** Load transfer links as well as the money flag: a zero-credit transfer still closes its source. */
export const transferSourceRelations = {
  _count: { select: { plan_transfers_out: true } },
  member_transfer_source: { select: { id: true } },
} as const;

export function assertSubscriptionNotTransferred(sub: {
  transferred_out_amount?: unknown;
  _count?: { plan_transfers_out: number };
  member_transfer_source?: { id: number } | null;
}) {
  if (Number(sub.transferred_out_amount ?? 0) > 0 || (sub._count?.plan_transfers_out ?? 0) > 0 || sub.member_transfer_source) {
    throw new BadRequestException('تم تحويل حقوق هذا الاشتراك بالفعل؛ عدّل الاشتراك الناتج عن التحويل. يمكنك إضافة ملاحظة على الاشتراك القديم دون تغيير الباقة أو المدة أو الحصص.');
  }
}

/** Either end of a transfer is part of its permanent entitlement and financial history. */
export const transferDeletionRelations = {
  _count: { select: { plan_transfers_out: true, plan_transfers_in: true } },
  member_transfer_source: { select: { id: true } },
  member_transfer_destination: { select: { id: true } },
} as const;

export function assertSubscriptionCanBeDeleted(sub: {
  transferred_out_amount?: unknown;
  transferred_credit_amount?: unknown;
  _count?: { plan_transfers_out: number; plan_transfers_in: number };
  member_transfer_source?: { id: number } | null;
  member_transfer_destination?: { id: number } | null;
}) {
  if (Number(sub.transferred_out_amount ?? 0) > 0 || Number(sub.transferred_credit_amount ?? 0) > 0 ||
      (sub._count?.plan_transfers_out ?? 0) > 0 || (sub._count?.plan_transfers_in ?? 0) > 0 ||
      sub.member_transfer_source || sub.member_transfer_destination) {
    throw new BadRequestException('لا يمكن حذف اشتراك مرتبط بتحويل باقة أو عضوية، حتى لو قيمته صفر. الاشتراك القديم يُغلق عند التحويل ويظل في السجل لحفظ الحصص والمدفوعات. إذا ظهر القديم نشطًا، تواصل مع الدعم لتصحيح حالة التحويل.');
  }
}
