import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  it('preserves structured HttpException details needed by interactive clients', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ correlationId: 'request_test_123' }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(new BadRequestException({
      code: 'CAFE_STOCK_SHORTAGE',
      message: 'بعض خامات الطلب غير متوفرة بالكمية المطلوبة',
      canContinueWithNegative: true,
      shortages: [{ ingredientId: 7, shortage: 1 }],
    }), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'بعض خامات الطلب غير متوفرة بالكمية المطلوبة',
      correlationId: 'request_test_123',
      code: 'CAFE_STOCK_SHORTAGE',
      canContinueWithNegative: true,
      shortages: [{ ingredientId: 7, shortage: 1 }],
    });
  });

  it('tells the cashier a timed-out transaction saved nothing instead of a generic DB error', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ correlationId: 'request_tx_1' }) }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(new Prisma.PrismaClientKnownRequestError('Transaction already closed', { code: 'P2028', clientVersion: 'test' }), host);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, message: expect.stringContaining('لم تُحفظ العملية') }));
  });
});
