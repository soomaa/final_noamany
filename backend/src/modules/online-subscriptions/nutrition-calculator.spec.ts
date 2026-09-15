import { calculateNutrition } from './nutrition-calculator';

describe('calculateNutrition', () => {
  it('calculates the documented Mifflin–St Jeor maintenance and balanced macros from metric input', () => {
    expect(calculateNutrition({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 'moderate', goal: 'maintain' }))
      .toEqual({
        formulaVersion: 'mifflin-st-jeor-v1',
        calories: 2759,
        proteinGrams: 144,
        fatGrams: 77,
        carbsGrams: 373,
      });
  });

  it('converts imperial input before calculating a fat-loss target', () => {
    const result = calculateNutrition({ sex: 'female', age: 28, weightLb: 132.3, heightFt: 5, heightIn: 5, activity: 'light', goal: 'lose' });
    expect(result.formulaVersion).toBe('mifflin-st-jeor-v1');
    expect(result.calories).toBe(1430);
    expect(result.proteinGrams).toBe(120);
  });

  it.each([
    [{ sex: 'unknown' }, 'النوع'],
    [{ activity: 'sometimes' }, 'مستوى النشاط'],
    [{ goal: 'bulk-fast' }, 'الهدف'],
  ])('rejects an unsupported nutrition enum instead of silently calculating it', (change, message) => {
    expect(() => calculateNutrition({
      sex: 'male',
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activity: 'moderate',
      goal: 'maintain',
      ...change,
    } as any)).toThrow(message);
  });

  it('rejects mixed or incomplete unit systems so no field is silently ignored', () => {
    expect(() => calculateNutrition({
      sex: 'male', age: 30, weightKg: 80, heightCm: 180, weightLb: 176,
      activity: 'moderate', goal: 'maintain',
    })).toThrow('نظام قياس واحد');

    expect(() => calculateNutrition({
      sex: 'female', age: 28, weightLb: 132.3, heightFt: 5,
      activity: 'light', goal: 'lose',
    })).toThrow('القدم والبوصة');
  });
});
