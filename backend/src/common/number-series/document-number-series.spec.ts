import { BadRequestException } from '@nestjs/common';
import { allocateDocumentNumber } from './document-number-series';

describe('allocateDocumentNumber', () => {
  it('allocates from one atomic upsert result', async () => {
    const client = {
      document_number_series: { upsert: jest.fn().mockResolvedValue({ next_value: 42n }) },
    };
    await expect(allocateDocumentNumber(client as never, 'hr.request')).resolves.toBe(41);
    expect(client.document_number_series.upsert).toHaveBeenCalledWith({
      where: { series_key: 'hr.request' },
      create: { series_key: 'hr.request', next_value: 2n },
      update: { next_value: { increment: 1 } },
      select: { next_value: true },
    });
  });

  it('rejects unsafe keys and unsafe integer starts', async () => {
    await expect(allocateDocumentNumber({} as never, '../bad')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      allocateDocumentNumber({} as never, 'valid.key', Number.MAX_SAFE_INTEGER + 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
