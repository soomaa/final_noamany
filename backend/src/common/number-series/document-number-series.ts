import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type NumberSeriesClient = Pick<Prisma.TransactionClient, 'document_number_series'>;

export async function allocateDocumentNumber(
  client: NumberSeriesClient,
  seriesKey: string,
  initialValue = 1,
): Promise<number> {
  if (!/^[a-z0-9_.:-]{3,80}$/i.test(seriesKey)) {
    throw new BadRequestException('مفتاح تسلسل المستند غير صالح');
  }
  if (!Number.isSafeInteger(initialValue) || initialValue < 1) {
    throw new BadRequestException('بداية تسلسل المستند غير صالحة');
  }
  const row = await client.document_number_series.upsert({
    where: { series_key: seriesKey },
    create: { series_key: seriesKey, next_value: BigInt(initialValue + 1) },
    update: { next_value: { increment: 1 } },
    select: { next_value: true },
  });
  const allocated = row.next_value - 1n;
  if (allocated > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestException('تم تجاوز الحد الآمن لتسلسل المستند');
  }
  return Number(allocated);
}
