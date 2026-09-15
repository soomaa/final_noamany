import { BadRequestException } from '@nestjs/common';

export const TREASURY_DETAIL_RANGE_LIMIT_DAYS = 90;

export function resolveTreasuryPeriod(input: {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  let dateFrom = (input.dateFrom || '').trim() || null;
  let dateTo = (input.dateTo || '').trim() || null;
  if (!dateFrom && !dateTo && input.date) {
    dateFrom = input.date;
    dateTo = input.date;
  }
  if (dateFrom && !dateTo) dateTo = dateFrom;
  if (dateTo && !dateFrom) dateFrom = dateTo;

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (
    (dateFrom && !isoDate.test(dateFrom)) ||
    (dateTo && !isoDate.test(dateTo)) ||
    (dateFrom && dateTo && dateFrom > dateTo)
  ) {
    throw new BadRequestException('نطاق التاريخ غير صحيح');
  }

  const periodMode = !dateFrom && !dateTo ? 'all' : dateFrom === dateTo ? 'day' : 'range';
  const inclusiveDays =
    dateFrom && dateTo
      ? Math.floor(
          (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) /
            86_400_000,
        ) + 1
      : null;
  if (inclusiveDays != null && (!Number.isFinite(inclusiveDays) || inclusiveDays < 1)) {
    throw new BadRequestException('نطاق التاريخ غير صحيح');
  }

  return {
    dateFrom,
    dateTo,
    periodMode,
    inclusiveDays,
    summaryOnly:
      inclusiveDays == null || inclusiveDays > TREASURY_DETAIL_RANGE_LIMIT_DAYS,
    detailRangeLimitDays: TREASURY_DETAIL_RANGE_LIMIT_DAYS,
  } as const;
}
