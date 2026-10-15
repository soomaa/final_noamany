import { ArgumentsHost, BadRequestException } from '@nestjs/common';
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
});
