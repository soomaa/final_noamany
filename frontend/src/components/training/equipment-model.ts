import type { TrainingEquipment } from '@/pages/club/fitness/training/model';

export const equipmentCategories = [
  { id: 'cardio', ar: 'أجهزة الكارديو', en: 'Cardio' },
  { id: 'machines', ar: 'أجهزة المقاومة', en: 'Resistance machines' },
  { id: 'free_weights', ar: 'الأوزان الحرة', en: 'Free weights' },
  { id: 'functional', ar: 'التدريب الوظيفي', en: 'Functional training' },
  { id: 'accessories', ar: 'الإكسسوارات', en: 'Accessories' },
] as const;
const otherCategory = { id: 'other', ar: 'أخرى', en: 'Other' };

export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function groupEquipment<T extends Pick<TrainingEquipment, 'category'>>(items: T[]) {
  return [...equipmentCategories, otherCategory]
    .map(group => ({ group, items: items.filter(i => (equipmentCategories.some(c => c.id === i.category) ? i.category : 'other') === group.id) }))
    .filter(g => g.items.length);
}

/** Exercises are club-wide: show each machine name once, preferring the given branch. */
export function uniqueEquipment(items: TrainingEquipment[], preferBranch?: number) {
  const result = new Map<string, TrainingEquipment>();
  for (const item of items) {
    const current = result.get(nameKey(item.name));
    if (!current || (item.branchId === preferBranch && current.branchId !== preferBranch)) result.set(nameKey(item.name), item);
  }
  return [...result.values()];
}

/** Mirrors the server: the same machine in the program branch, matched by name. */
export function equipmentForBranch(defaults: TrainingEquipment[], library: TrainingEquipment[], branchId?: number) {
  if (!branchId) return defaults;
  const result = new Map<number, TrainingEquipment>();
  for (const item of defaults) {
    const match = library.find(l => l.branchId === branchId && (l.id === item.id || nameKey(l.name) === nameKey(item.name)));
    if (match) result.set(match.id, match);
  }
  return [...result.values()];
}
