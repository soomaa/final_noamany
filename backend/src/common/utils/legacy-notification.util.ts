import { PrismaService } from '../prisma/prisma.service';
import { todayIso } from './legacy-date.util';

/**
 * Titles of the legacy notification codes (legacy tbl_sys_notifications_settings rows, plus the
 * warning codes). Used when that table has no row for a code, e.g. on a database where it is empty.
 */
export const LEGACY_NOTIFICATION_TITLES: Record<number, string> = {
  101: 'لديك طلب إجازة جديد',
  102: 'لديك طلب إذن جديد',
  103: 'هناك قرار إداري جديد',
  105: 'لديك طلب إجازة محوّل من المدير المباشر إلى مدير الإدارة',
  106: 'لديك طلب إجازة محوّل من مدير الإدارة إلى مسؤول الموارد البشرية',
  107: 'لديك طلب إجازة محوّل من مسؤول الموارد البشرية إلى المدير العام',
  110: 'تم قبول طلب الإجازة المقدم',
  111: 'تم رفض طلب الإجازة المقدم',
  115: 'لديك طلب إذن محوّل من المدير المباشر إلى مدير الإدارة',
  116: 'لديك طلب إذن محوّل من مدير الإدارة إلى مسؤول الموارد البشرية',
  117: 'لديك طلب إذن محوّل من مسؤول الموارد البشرية إلى المدير العام',
  118: 'تم تأكيد طلب الإجازة من مسؤول الموارد البشرية',
  119: 'تم قبول طلب الإذن المقدم',
  120: 'تم رفض طلب الإذن المقدم',
  125: 'هناك طلب إجازة لحين استكمال العمل مقدم من المدير المباشر',
  960: 'لديك إنذار جديد للمراجعة',
  961: 'لديك إنذار جديد',
};

/** Faithful replacement for the legacy insert_all_notification helper. */
export async function insertLegacyNotification(
  prisma: PrismaService,
  targetId: number,
  notificationCode: number,
  fromUser?: number | null,
  toUser?: number | null,
) {
  if (!toUser || toUser === fromUser) return;

  const setting = await prisma.tbl_sys_notifications_settings.findFirst({
    where: { code: notificationCode },
    select: { id: true },
  });
  const now = new Date();
  const hours = now.getHours();
  const displayHour = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';

  await prisma.tbl_notifications.create({
    data: {
      fk_id: BigInt(targetId),
      from_user: fromUser ?? null,
      to_user: toUser,
      date_ar: todayIso(),
      time_ar: `${String(displayHour).padStart(2, '0')}:${minutes} ${suffix}`,
      notify_id_fk: setting?.id ?? null,
      n_code: notificationCode,
    },
  });
}
