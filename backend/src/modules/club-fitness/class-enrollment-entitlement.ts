import { BadRequestException } from '@nestjs/common';
import { Prisma, club_classes } from '@prisma/client';
import { purchasedBenefits } from '../club-subscriptions/purchased-benefits';

/** Called with the class and member locked; bookings and attendance use the same source. */
export async function eligibleEnrollmentSource(tx: Prisma.TransactionClient, cls: club_classes, memberId: number, requestedId?: number, excludeEnrollmentId?: number) {
  const member = await tx.club_members.findFirst({ where: { id: memberId, branch_id: cls.branch_id, is_deleted: false, is_active: true, is_blocked: false } });
  if (!member) throw new BadRequestException('العضو غير نشط أو لا يتبع فرع الحصة');
  if ((cls.status !== 'scheduled' && !(excludeEnrollmentId && cls.status === 'completed')) || cls.is_deleted) throw new BadRequestException('الحصة غير متاحة');
  if ((cls.audience === 'men' && member.gender !== 'male') || (cls.audience === 'women' && member.gender !== 'female')) throw new BadRequestException('فئة العضو لا تطابق الحصة');
  const trainer = await tx.club_trainers.findFirst({ where: { id: cls.trainer_id, is_active: true, is_deleted: false } });
  if (!trainer && !excludeEnrollmentId) throw new BadRequestException('مدرب الحصة غير نشط؛ اختر مدربًا متاحًا');
  const subscriptions = await tx.club_subscriptions.findMany({ where: { member_id: memberId, branch_id: cls.branch_id, private_package_id: null,
    ...(requestedId ? { id: requestedId } : {}), status: { in: ['active', 'upcoming'] }, renewal_hold: false,
    subscription_start_date: { lte: cls.class_date }, subscription_end_date: { gte: cls.class_date }, freezes: { none: { is_active: true } }, remaining_amount: { lte: 0 } },
    include: { type: { include: { class_types: true } } }, orderBy: [{ subscription_end_date: 'asc' }, { id: 'asc' }] });
  const linked = Array.isArray(cls.linked_subscription_type_ids) ? cls.linked_subscription_type_ids.map(Number) : [];
  for (const sub of subscriptions) {
    const rights = purchasedBenefits(sub, sub.type);
    const classIds = rights.classTypeIds ?? sub.type?.class_types.map(row => row.class_type_id) ?? [];
    if (cls.class_type_id && !(sub.special_class_type_id === cls.class_type_id || (linked.length ? linked.includes(sub.subscription_type_id ?? -1) : classIds.includes(cls.class_type_id)))) continue;
    if (sub.is_linked_to_sessions && sub.sessions_count != null) {
      const reserved = await tx.club_class_enrollments.count({ where: { subscription_id: sub.id, attendance_status: 'registered', ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}) } });
      if (sub.sessions_used + reserved >= sub.sessions_count) continue;
    }
    return sub.id;
  }
  throw new BadRequestException('لا توجد باقة مؤهلة برصيد متاح في تاريخ الحصة؛ راجع التجميد والمديونية والحصص المحجوزة');
}
