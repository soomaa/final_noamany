import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClubReceiptDto } from './club-receipts.dto';

describe('CreateClubReceiptDto payment methods', () => {
  it.each(['cash', 'card', 'transfer'])('accepts the supported %s payment method', async (paymentMethod) => {
    const dto = plainToInstance(CreateClubReceiptDto, {
      memberName: 'عميل اختبار',
      amount: 60,
      paymentMethod,
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'paymentMethod')).toBeUndefined();
  });

  it('rejects a payment method outside the three supported choices', async () => {
    const dto = plainToInstance(CreateClubReceiptDto, {
      memberName: 'عميل اختبار',
      amount: 60,
      paymentMethod: 'visa',
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'paymentMethod')?.constraints?.isIn).toBeDefined();
  });
});
