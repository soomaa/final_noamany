const INTERNAL_PATH_MAX_LENGTH = 2_048;
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001F\u007F]/;
const ENCODED_CONTROL_OR_BACKSLASH = /%(?:00|0a|0d|5c)/i;
const APP_ORIGIN = 'https://hr-app.invalid';

function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > INTERNAL_PATH_MAX_LENGTH) {
    return false;
  }
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (CONTROL_OR_BACKSLASH.test(value) || ENCODED_CONTROL_OR_BACKSLASH.test(value)) return false;

  try {
    const parsed = new URL(value, APP_ORIGIN);
    return parsed.origin === APP_ORIGIN && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

/**
 * Accepts only an app-local absolute path. Use this at API/storage trust boundaries
 * before passing a dynamic value to React Router navigation primitives.
 */
export function safeInternalPath(value: unknown, fallback = '/profile'): string {
  if (isSafeInternalPath(value)) return value;
  return isSafeInternalPath(fallback) ? fallback : '/profile';
}
