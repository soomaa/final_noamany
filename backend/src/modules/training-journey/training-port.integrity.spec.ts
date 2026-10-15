import { TrainingService } from './training.service';
import { TrainingAdminController, TrainingMemberController } from './training.controller';
import { ClubFacilitiesService } from '../club-fitness/club-facilities.service';
import { One80FileCategoryAdapter } from '../../adapters/one80/files/one80-file-category.adapter';

describe('ported training workspace boundaries', () => {
  const staff = { sub: 1, branch: 10, level: 2, is_trainer: false } as never;
  const member = { sub: 5, memberId: 9, branchId: 20, type: 'member' } as never;
  it('passes authenticated staff and member scope into their exercise catalog', async () => {
    const service = { catalog: jest.fn() };
    new TrainingAdminController(service as never).catalog(staff);
    new TrainingMemberController(service as never).catalog(member);
    expect(service.catalog.mock.calls).toEqual([[staff], [member]]);
  });
  it('limits member machine media to their own branch and keeps catalog read-only', async () => {
    const db = { club_exercises: { findMany: async () => [{ id: 1, name: 'Press' }] }, am_exercises: { findMany: async () => [] },
      training_exercise_profiles: { findMany: async () => [] }, club_equipment: { findMany: jest.fn().mockResolvedValue([]) } };
    const result = await new TrainingService(db as never, { allowedBranchIds: () => [10] } as never).catalog(member);
    expect(db.club_equipment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true, branch_id: { in: [20] } } }));
    expect(result.exercises[0].editable).toBe(false);
  });
  it('accepts only uploaded equipment images from the equipment media category', async () => {
    const db = { private_file_metadata: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new ClubFacilitiesService(db as never, {} as never, {} as never);
    const key = 'public-file:00000000-0000-4000-8000-000000000001';
    await expect((service as any).validatedEquipmentPhoto(key)).rejects.toThrow('صورة جهاز');
    db.private_file_metadata.findFirst.mockResolvedValue({ id: key.slice(12) } as never);
    await expect((service as any).validatedEquipmentPhoto(key)).resolves.toBe(key);
    expect(db.private_file_metadata.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: key.slice(12), category: 'equipment-image', deleted_at: null } }));
    const policy = new One80FileCategoryAdapter().policy('equipment-image')!;
    expect(policy.publicMedia).toBe(true); expect(policy.allowedKinds.has('svg' as never)).toBe(false);
  });
});
