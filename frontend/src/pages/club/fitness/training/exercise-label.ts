import type { Exercise } from './model';
// Localized standard movement names. Stored names and custom coach text stay intact.
const standardNames = [
  ['ضغط الصدر بالبار', 'Barbell bench press'],
  ['السكوات', 'Squat'],
  ['الرفعة المميتة', 'Deadlift'],
  ['العقلة', 'Pull-up'],
  ['تمرين البلانك', 'Plank'],
  ['الجري على السير', 'Treadmill running'],
  ['ضغط الكتف', 'Shoulder press'],
  ['تمرين العضلة الأمامية', 'Biceps curl'],
  ['دفع الأرجل', 'Leg press'],
  ['تمارين البطن العلوية', 'Crunches'],
  ['ضغط صدر بالدمبل', 'Dumbbell chest press'],
  ['سحب ظهر', 'Back row'],
  ['توازن على ساق واحدة', 'Single-leg balance'],
  ['إطالة الصدر', 'Chest stretch'],
  ['ضغط بنش مستوي', 'Barbell bench press'],
  ['ضغط بنش مائل', 'Incline bench press'],
  ['سحب أرضي', 'Seated row'],
  ['عقلة', 'Pull-up'],
  ['سكوات', 'Squat'],
  ['رفرفة جانبي', 'Lateral raise'],
  ['ضغط كتف', 'Shoulder press'],
  ['جري على الجهاز', 'Treadmill running'],
  ['دراجة ثابتة', 'Stationary bike'],
  ['المعدة العلوية', 'Crunches'],
  ['ديدليفت', 'Deadlift'],
  ['لانجز', 'Lunge'],
] as const;
const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function exerciseLabel(exercise: Pick<Exercise, 'name'>, locale: string): string {
  const name = normalize(exercise.name);
  const standard = standardNames.find(pair => pair.some(label => normalize(label) === name));
  return standard ? standard[locale === 'ar' ? 0 : 1] : exercise.name;
}
export function matchesExercise(exercise: Exercise, query: string, locale: string): boolean {
  const term = normalize(query);
  return [exercise.name, exerciseLabel(exercise, locale)].some(name => normalize(name).includes(term));
}

export function exerciseInstructions(exercise: Pick<Exercise, 'instructions'>, locale: string): string {
  if (locale !== 'en') return exercise.instructions;
  const standard: Record<string, string> = {
    'حافظ على الوضعية الصحيحة وتنفس بانتظام': 'Maintain proper posture and breathe regularly.',
    'حافظ على وضعية الظهر السليمة وتنفس بانتظام أثناء التمرين.': 'Maintain proper back posture and breathe regularly during the exercise.',
  };
  return standard[exercise.instructions.trim()] ?? exercise.instructions;
}
