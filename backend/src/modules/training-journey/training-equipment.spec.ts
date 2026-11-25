import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainingService } from './training.service';
import { EquipmentLibrary, equipmentPhotoUrl, withEquipmentPhotos } from './training-equipment';

const photo = '/uploads/club/equipment/eq-3f2b8a10.png';
const rows = [
  { id: 1, name: 'دراجة ثابتة', image_url: null, branch_id: 10, category: 'cardio' },
  { id: 2, name: 'دراجة ثابتة ', image_url: photo, branch_id: 10, category: null },
  { id: 3, name: 'دراجة ثابتة', image_url: null, branch_id: 20, category: 'cardio' },
  { id: 4, name: 'جهاز ضغط الصدر', image_url: 'https://cdn.example.com/chest.webp', branch_id: 10, category: 'machines' },
];

describe('Training equipment library', () => {
  const library = new EquipmentLibrary(rows);

  it('shows each machine once per branch, preferring the unit with a photo', () => {
    expect(library.items.map(i => [i.id, i.branchId])).toEqual(expect.arrayContaining([[2, 10], [3, 20], [4, 10]]));
    expect(library.items).toHaveLength(3);
    expect(library.resolve(1)).toMatchObject({ id: 2, category: 'cardio', photoUrl: photo });
  });

  it('builds member-app photo URLs and ignores paths outside the equipment upload folder', () => {
    expect(equipmentPhotoUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(equipmentPhotoUrl('club/equipment/a.png')).toBe('/uploads/club/equipment/a.png');
    expect(equipmentPhotoUrl('/uploads/a.png')).toBeNull();
    expect(equipmentPhotoUrl(null)).toBeNull();
  });

  it('maps exercise defaults onto the plan branch by name and drops machines the branch lacks', () => {
    expect(library.forBranch([{ id: 2 }, { id: 4 }], 20).map(i => i.id)).toEqual([3]);
    expect(library.forBranch([{ id: 1 }, { id: 2 }], 10).map(i => i.id)).toEqual([2]);
    expect(library.forBranch([{ id: 999, name: 'دراجة ثابتة' }], 20).map(i => i.id)).toEqual([3]);
  });

  it('dedupes club-wide exercise defaults by machine name', () => {
    expect(library.forExercise([1, 3, 4]).map(i => i.name)).toEqual(['دراجة ثابتة', 'جهاز ضغط الصدر']);
  });

  it('refreshes snapshot photos without renaming what the coach saved', () => {
    const [assignment] = withEquipmentPhotos([{ snapshot: { days: [{ exercises: [{ equipment: [{ id: 1, name: 'Bike', imageUrl: null }] }] }] } }], 'snapshot', library);
    const [withWarmup] = withEquipmentPhotos([{ snapshot: { days: [{ warmup: { equipment: '', equipmentItems: [{ id: 1, name: 'Bike', imageUrl: null }] } }] } }], 'snapshot', library);
    expect((withWarmup.snapshot.days[0].warmup.equipmentItems[0] as { photoUrl?: string }).photoUrl).toBe(photo);
    expect(assignment.snapshot.days[0].exercises[0]).toEqual({ equipment: [{ id: 1, name: 'Bike', imageUrl: photo, photoUrl: photo }] });
  });
});

describe('Program entry equipment', () => {
  const coach = { sub: 21, level: 2, branch: 10, is_trainer: true, trainer_id: 7 } as JwtUser;
  const scope = { isBranchAllowed: (_u: JwtUser, branch: number) => branch === 10, allowedBranchIds: () => [10] } as unknown as BranchScopeService;
  function fixture() {
    const db = {
      club_equipment: { findMany: jest.fn().mockResolvedValue(rows) },
      club_exercises: { findMany: jest.fn().mockResolvedValue([]) },
      am_exercises: { findMany: jest.fn().mockResolvedValue([]) },
      training_exercise_profiles: { findMany: jest.fn().mockResolvedValue([{ key: 'custom:bike', name: 'Bike sprint', kind: 'cardio', primary_muscles: ['quads'], secondary_muscles: [], instructions: '', video_url: null, equipment_ids: [3], created_by: 21, updated_by: 21 }]) },
      training_plans: { create: jest.fn(({ data }) => Promise.resolve(data)) },
    };
    return { db, service: new TrainingService(db as unknown as PrismaService, scope) };
  }
  const plan = (entry: Record<string, unknown>) => ({ name: 'P', goal: '', weeks: 4, status: 'draft', branchId: 10, days: [{ id: 'd1', name: '1', exercises: [{ key: 'custom:bike', rowId: 'r1', sets: 1, reps: 0, seconds: 60, rest: 30, note: '', ...entry }] }] });
  const saved = (data: { days: Array<{ exercises: Array<{ equipmentIds: number[]; equipment: Array<{ name: string }> }> }> }) => data.days[0].exercises[0];

  it('fills the exercise default, matched to the program branch', async () => {
    const { db, service } = fixture();
    await service.savePlan(plan({}), coach);
    expect(saved(db.training_plans.create.mock.calls[0][0].data)).toMatchObject({ equipmentIds: [2], equipment: [{ name: 'دراجة ثابتة' }] });
  });

  it('keeps the coach override for the entry, including clearing it', async () => {
    const { db, service } = fixture();
    await service.savePlan(plan({ equipmentIds: [4] }), coach);
    expect(saved(db.training_plans.create.mock.calls[0][0].data).equipmentIds).toEqual([4]);
    await service.savePlan(plan({ equipmentIds: [] }), coach);
    expect(saved(db.training_plans.create.mock.calls[1][0].data).equipmentIds).toEqual([]);
  });

  it('picks warm-up machines from the library for the program branch, keeping the free text', async () => {
    const { db, service } = fixture();
    const body = plan({});
    (body.days[0] as Record<string, unknown>).warmup = { equipment: 'Rope', equipmentIds: [3, 999], seconds: 300, note: '' };
    await service.savePlan(body, coach);
    expect(db.training_plans.create.mock.calls[0][0].data.days[0].warmup).toMatchObject({ equipment: 'Rope', equipmentIds: [2], equipmentItems: [{ id: 2, name: 'دراجة ثابتة' }], seconds: 300 });
  });

  it('rejects malformed equipment lists', async () => {
    const { service } = fixture();
    await expect(service.savePlan(plan({ equipmentIds: ['x'] }), coach)).rejects.toThrow();
  });
});
