import { BadRequestException } from '@nestjs/common';

/** Equipment photos uploaded through the gym's own upload area (`equipment` category). */
const EQUIPMENT_UPLOAD = /^\/?(?:uploads\/)?(club\/equipment\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif))$/i;

/**
 * Canonical upload path (`club/equipment/<file>`) of a stored equipment photo, or null when the
 * reference is an external https URL / empty. Used to confirm the file was really uploaded for
 * this gym before it is linked to a machine.
 */
export function equipmentUploadPath(reference: string | null | undefined): string | null {
  const match = reference ? EQUIPMENT_UPLOAD.exec(reference.trim()) : null;
  return match ? match[1] : null;
}

/** Stored as `/uploads/club/equipment/<file>` (served per gym) or an absolute https URL. */
export function equipmentPhoto(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1000) throw new BadRequestException('رابط صورة الجهاز غير صالح');
  const url = value.trim();
  if (!url.includes('..')) {
    const path = equipmentUploadPath(url);
    if (path) return `/uploads/${path}`;
  }
  try { if (new URL(url).protocol === 'https:') return url; } catch { /* validation below */ }
  throw new BadRequestException('اختر صورة مرفوعة أو رابط HTTPS للصورة');
}

export function exerciseEquipmentIds(value: unknown): number[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10 || value.some(id => !Number.isSafeInteger(id) || id < 1)) throw new BadRequestException('اختر أجهزة صالحة للتمرين');
  return [...new Set(value as number[])];
}

/** Groups used by the training equipment library. NULL means "other". */
export const EQUIPMENT_CATEGORIES = ['cardio', 'machines', 'free_weights', 'accessories', 'functional'] as const;
export type EquipmentCategory = typeof EQUIPMENT_CATEGORIES[number];

export function equipmentCategory(value: unknown): EquipmentCategory | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !(EQUIPMENT_CATEGORIES as readonly string[]).includes(value)) throw new BadRequestException('تصنيف الجهاز غير صالح');
  return value as EquipmentCategory;
}
