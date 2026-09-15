import { BadRequestException } from '@nestjs/common';

const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;

export interface OfflinePunchClock {
  capturedAt: Date;
  receivedAt: Date;
  actionDate: string;
  time: string;
}

/**
 * Validates the client-captured timestamp and converts it into the employee's
 * submitted IANA time zone. The resulting day/time is what the attendance
 * engine uses to choose a shift and calculate late/early minutes.
 */
export function resolveOfflinePunchClock(
  capturedAtUtc: string,
  timezone: string,
  receivedAt = new Date(),
): OfflinePunchClock {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(capturedAtUtc)) {
    throw new BadRequestException('وقت التقاط البصمة يجب أن يكون UTC بصيغة ISO-8601');
  }

  const capturedAt = new Date(capturedAtUtc);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new BadRequestException('وقت التقاط البصمة غير صحيح');
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(capturedAt);
  } catch {
    throw new BadRequestException('المنطقة الزمنية غير صحيحة');
  }

  const age = receivedAt.getTime() - capturedAt.getTime();
  if (age < 0) throw new BadRequestException('لا يمكن إرسال بصمة بوقت مستقبلي');
  if (age > MAX_OFFLINE_AGE_MS) throw new BadRequestException('انتهت مهلة مزامنة البصمة المؤجلة (24 ساعة)');

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const minute = value('minute');
  const dayPeriod = value('dayPeriod');
  if (!year || !month || !day || !hour || !minute || !dayPeriod) {
    throw new BadRequestException('تعذر تحويل وقت البصمة إلى المنطقة الزمنية');
  }

  return {
    capturedAt,
    receivedAt,
    actionDate: `${year}-${month}-${day}`,
    time: `${hour}:${minute} ${dayPeriod}`,
  };
}
