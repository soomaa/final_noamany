import { PrismaService } from '../prisma/prisma.service';
import { todayIso } from './legacy-date.util';

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
