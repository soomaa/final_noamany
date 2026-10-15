import { BadRequestException } from '@nestjs/common';

export function equipmentPhoto(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1000) throw new BadRequestException('رابط صورة الجهاز غير صالح');
  const url = value.trim();
  if (/^public-file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(url)) return url;
  if (/^\/uploads\/[a-zA-Z0-9/_% .-]+$/.test(url) && !url.includes('..')) return url;
  try { if (new URL(url).protocol === 'https:') return url; } catch { /* validation below */ }
  throw new BadRequestException('اختر صورة مرفوعة أو رابط HTTPS للصورة');
}

export function exerciseEquipmentIds(value: unknown): number[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10 || value.some(id => !Number.isSafeInteger(id) || id < 1)) throw new BadRequestException('اختر أجهزة صالحة للتمرين');
  return [...new Set(value as number[])];
}
