import { BadRequestException } from '@nestjs/common';

export type NutritionInput = {
  sex: 'male' | 'female'; age: number; activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'; goal: 'lose' | 'maintain' | 'gain';
  weightKg?: number; heightCm?: number; weightLb?: number; heightFt?: number; heightIn?: number;
};

const ACTIVITY: Record<NutritionInput['activity'], number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const GOAL_ADJUSTMENT: Record<NutritionInput['goal'], number> = { lose: -400, maintain: 0, gain: 300 };

/**
 * Mifflin–St Jeor v1: BMR = 10W + 6.25H − 5A + sex constant; TDEE=BMR×activity.
 * Goal adjustment is deliberately conservative. Protein=2g/kg (loss), 1.8g/kg otherwise,
 * fat=25% calories and the remaining calories are carbohydrates.
 */
export function calculateNutrition(input: NutritionInput) {
  if (!input || typeof input !== 'object') throw new BadRequestException('بيانات حاسبة السعرات مطلوبة');
  if (!['male', 'female'].includes(input.sex)) throw new BadRequestException('النوع يجب أن يكون ذكرًا أو أنثى');
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY, input.activity)) throw new BadRequestException('مستوى النشاط غير صحيح');
  if (!Object.prototype.hasOwnProperty.call(GOAL_ADJUSTMENT, input.goal)) throw new BadRequestException('الهدف غير صحيح');

  const present = (value: unknown) => value !== undefined && value !== null && value !== '';
  const metricParts = [input.weightKg, input.heightCm].filter(present).length;
  const imperialParts = [input.weightLb, input.heightFt, input.heightIn].filter(present).length;
  if (metricParts > 0 && imperialParts > 0) throw new BadRequestException('استخدم نظام قياس واحد فقط: المتري أو الإنجليزي');
  if (metricParts !== 0 && metricParts !== 2) throw new BadRequestException('أدخل الوزن بالكيلوجرام والطول بالسنتيمتر معًا');
  if (imperialParts !== 0 && imperialParts !== 3) throw new BadRequestException('أدخل الوزن بالرطل والطول بالقدم والبوصة كاملًا');
  if (metricParts === 0 && imperialParts === 0) throw new BadRequestException('أدخل الوزن والطول');

  if (imperialParts === 3) {
    const feet = Number(input.heightFt);
    const inches = Number(input.heightIn);
    if (!Number.isInteger(feet) || feet < 3 || feet > 7 || !Number.isFinite(inches) || inches < 0 || inches >= 12) {
      throw new BadRequestException('الطول بالقدم والبوصة غير صحيح');
    }
  }

  const metric = metricParts === 2
    ? { weightKg: Number(input.weightKg), heightCm: Number(input.heightCm) }
    : { weightKg: Number(input.weightLb) * 0.45359237, heightCm: (Number(input.heightFt) * 12 + Number(input.heightIn)) * 2.54 };
  if (!Number.isFinite(metric.weightKg) || metric.weightKg < 25 || metric.weightKg > 350) throw new BadRequestException('الوزن يجب أن يكون بين 25 و350 كجم');
  if (!Number.isFinite(metric.heightCm) || metric.heightCm < 120 || metric.heightCm > 230) throw new BadRequestException('الطول يجب أن يكون بين 120 و230 سم');
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 14 || age > 100) throw new BadRequestException('العمر يجب أن يكون بين 14 و100 سنة');
  const bmr = 10 * metric.weightKg + 6.25 * metric.heightCm - 5 * age + (input.sex === 'male' ? 5 : -161);
  const calories = Math.max(1200, Math.round(bmr * ACTIVITY[input.activity] + GOAL_ADJUSTMENT[input.goal]));
  const proteinGrams = Math.round(metric.weightKg * (input.goal === 'lose' ? 2 : 1.8));
  const fatGrams = Math.round((calories * 0.25) / 9);
  const carbsGrams = Math.max(0, Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4));
  return { formulaVersion: 'mifflin-st-jeor-v1', calories, proteinGrams, fatGrams, carbsGrams };
}
