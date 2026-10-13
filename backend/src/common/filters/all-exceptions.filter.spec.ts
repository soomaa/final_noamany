import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  it('preserves structured HttpException details needed by interactive clients', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
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
      code: 'CAFE_STOCK_SHORTAGE',
      canContinueWithNegative: true,
      shortages: [{ ingredientId: 7, shortage: 1 }],
    });
  });

  it('includes the Prisma error code in development so a database failure can be diagnosed', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const error = new Prisma.PrismaClientKnownRequestError('Query failed', {
      code: 'P2010',
      clientVersion: '5.22.0',
    });

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'خطأ في قاعدة البيانات (P2010)',
    });
  });
});
