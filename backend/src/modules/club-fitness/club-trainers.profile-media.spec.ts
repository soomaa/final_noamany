import { BadRequestException } from '@nestjs/common';
import { ClubTrainersService } from './club-trainers.service';
import { joinSpecializations, splitSpecializations } from './club-fitness.utils';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 9, employee_id: null, name: 'كابتن أحمد', email: null, phone: null, specialization: null, color: null,
  experience: null, bio: null, image_url: null, rating_avg: 0, is_active: true,
  created_at: new Date(), updated_at: new Date(), ...overrides,
});

function setup() {
  const prisma = {
    club_trainers: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    },
  };
  const service = new ClubTrainersService(prisma as never, {} as never);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9 } as never);
  return { prisma, service };
}

describe('trainer photo and multiple specializations', () => {
  it('splits and joins the single specialization column', () => {
    expect(splitSpecializations('قوة، كارديو / يوجا')).toEqual(['قوة', 'كارديو', 'يوجا']);
    expect(joinSpecializations([' قوة ', '', 'كارديو'])).toBe('قوة، كارديو');
    expect(joinSpecializations([])).toBeNull();
    expect(() => joinSpecializations('قوة')).toThrow(BadRequestException);
    expect(() => joinSpecializations(['x'.repeat(201)])).toThrow(BadRequestException);
  });

  it('stores the chips list and a public photo reference, and returns the list shape', async () => {
    const { prisma, service } = setup();
    const created = await service.create({
      name: 'كابتن أحمد',
      specializations: ['قوة', 'كارديو'],
      specialization: 'ignored when the list is sent',
      imageUrl: 'public-file:3f2a',
    });
    expect(prisma.club_trainers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ specialization: 'قوة، كارديو', image_url: 'public-file:3f2a' }),
    });
    expect(created).toMatchObject({ specializations: ['قوة', 'كارديو'], imageUrl: 'public-file:3f2a' });
  });

  it('leaves absent fields alone on update and clears the photo when null is sent', async () => {
    const { prisma, service } = setup();
    await service.update(9, { imageUrl: null });
    const data = prisma.club_trainers.update.mock.calls[0][0].data;
    expect(data).toEqual({ image_url: null });
    expect(data).not.toHaveProperty('specialization');
  });

  it('refuses private or overlong photo references', async () => {
    const { service } = setup();
    await expect(service.update(9, { imageUrl: 'file:private' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(9, { imageUrl: `public-file:${'x'.repeat(260)}` })).rejects.toBeInstanceOf(BadRequestException);
  });
});
