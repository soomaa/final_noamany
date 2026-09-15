import { BadRequestException } from '@nestjs/common';
import { GymRatesService } from './gym-rates.service';

describe('GymRatesService legacy settings', () => {
  const prisma = {
    tbl_gym_setting: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new GymRatesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts the legacy target split 0/0 without forcing a 100% total', async () => {
    prisma.tbl_gym_setting.findFirst.mockResolvedValue(null);
    prisma.tbl_gym_setting.create.mockResolvedValue({ id: 1 });

    await expect(service.create({ ttype: 'target', forUser: 0, forGym: 0 }, 7, 'admin')).resolves.toEqual({ id: 1 });
    expect(prisma.tbl_gym_setting.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ttype: 'target', for_user: 0, for_gym: 0 }),
    }));
  });

  it('keeps employee and gym percentages independent, as in the legacy table', async () => {
    prisma.tbl_gym_setting.findFirst.mockResolvedValue(null);
    prisma.tbl_gym_setting.create.mockResolvedValue({ id: 2 });

    await expect(service.create({ ttype: 'classes', forUser: 40, forGym: 40 })).resolves.toEqual({ id: 2 });
  });

  it('rejects percentages outside the integer 0..100 database range', async () => {
    await expect(service.create({ ttype: 'proten', forUser: 7.5, forGym: 93 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ttype: 'proten', forUser: 7, forGym: 101 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
