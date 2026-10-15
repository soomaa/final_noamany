import { ClubTrainersService } from './club-trainers.service';

function setup() {
  const prisma = {
    club_trainer_availability: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));
  const service = new ClubTrainersService(prisma as never, {} as never);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9, name: 'كابتن أحمد' } as never);
  return { prisma, service };
}

describe('trainer standalone availability', () => {
  it('replaces and normalizes the complete weekly set atomically', async () => {
    const { prisma, service } = setup();
    prisma.club_trainer_availability.findMany.mockResolvedValue([
      { id: 1, trainer_id: 9, weekday: 1, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
    ]);
    await expect(service.replaceAvailability(9, { slots: [{ weekday: 1, startTime: '9:00', endTime: '12:00' }] })).resolves.toEqual([
      { id: 1, trainerId: 9, weekday: 1, startTime: '09:00:00', endTime: '12:00:00', isActive: true },
    ]);
    expect(prisma.club_trainer_availability.deleteMany).toHaveBeenCalledWith({ where: { trainer_id: 9 } });
    expect(prisma.club_trainer_availability.createMany).toHaveBeenCalledWith({ data: [
      { trainer_id: 9, weekday: 1, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
    ] });
  });

  it('rejects invalid days, reversed times and overlapping windows before writing', async () => {
    const { prisma, service } = setup();
    await expect(service.replaceAvailability(9, { slots: [{ weekday: 7, startTime: '09:00', endTime: '12:00' }] })).rejects.toThrow('يوم التواجد غير صالح');
    await expect(service.replaceAvailability(9, { slots: [{ weekday: 1, startTime: '12:00', endTime: '09:00' }] })).rejects.toThrow('وقت النهاية يجب أن يكون بعد البداية');
    await expect(service.replaceAvailability(9, { slots: [
      { weekday: 1, startTime: '09:00', endTime: '12:00' },
      { weekday: 1, startTime: '11:00', endTime: '13:00' },
    ] })).rejects.toThrow('يوجد تداخل في مواعيد تواجد المدرب');
    expect(prisma.club_trainer_availability.deleteMany).not.toHaveBeenCalled();
  });
});
