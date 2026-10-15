import { BadRequestException } from '@nestjs/common';

/** Legacy dwam shift-type labels sent by the employee form. */
export const SHIFT_TYPE_LABELS: Record<string, number> = {
  fixed: 1,
  flexible: 2,
  shift: 3,
  part_time: 4,
};

const ID_TO_LABEL = Object.fromEntries(
  Object.entries(SHIFT_TYPE_LABELS).map(([k, v]) => [String(v), k]),
);

/** Parse UI shift_type (numeric id or label) → always_id_fk code. */
export function parseShiftType(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.trunc(raw);
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const mapped = SHIFT_TYPE_LABELS[s.toLowerCase()];
  if (mapped != null) return mapped;
  throw new BadRequestException(`نوع الدوام غير صالح: ${s}`);
}

/** Reverse map for GET dwam → form display. */
export function shiftTypeToLabel(code: number | null | undefined): string {
  if (code == null || code === 0) return 'fixed';
  return ID_TO_LABEL[String(code)] ?? String(code);
}
