import type { ClassAudience } from '@/types/fitness';

/** Arabic source labels (translated at render time through ui()/uiStatic()). */
export const CLASS_AUDIENCE_OPTIONS: ReadonlyArray<{ value: ClassAudience; label: string }> = [
  { value: 'men', label: 'رجال' },
  { value: 'women', label: 'سيدات' },
  { value: 'kids', label: 'أطفال' },
  { value: 'mixed', label: 'مختلط' },
];

export function classAudienceLabel(audience: ClassAudience | null | undefined): string {
  return CLASS_AUDIENCE_OPTIONS.find((option) => option.value === (audience ?? 'mixed'))?.label ?? 'مختلط';
}
