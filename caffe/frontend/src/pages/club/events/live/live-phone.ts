/** تنسيق رقم الموبايل المصري — متوافق مع club-member.utils */
import { uiStatic } from '@/lib/ui-static';

export const EGYPT_PHONE_REGEX = /^(01[0-9]{9}|201[0-9]{9})$/;
export const EGYPT_PHONE_PLACEHOLDER = '01xxxxxxxxx';
export const EGYPT_PHONE_LABEL = uiStatic('رقم الموبايل');
export const EGYPT_PHONE_MAX_LEN = 11;
export const EGYPT_PHONE_ERROR =
  uiStatic('رقم الموبايل غير صحيح — يجب أن يكون 11 رقمًا ويبدأ بـ 01 (مثال: 01012345678)');

export function normalizeLivePhone(phone: string): string {
  const n = phone.trim().replace(/[\s\-()+]/g, '');
  if (n.startsWith('201')) return `0${n.slice(2)}`;
  return n;
}

export function isValidLivePhone(phone: string): boolean {
  return EGYPT_PHONE_REGEX.test(normalizeLivePhone(phone));
}

export function livePhoneValidationError(phone: string): string | null {
  const n = normalizeLivePhone(phone);
  if (!n) return uiStatic('رقم الموبايل مطلوب');
  if (/^0+$/.test(n)) return EGYPT_PHONE_ERROR;
  if (!isValidLivePhone(phone)) return EGYPT_PHONE_ERROR;
  return null;
}
