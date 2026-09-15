export type ProductImageInputValidation = {
  value: string;
  error: 'invalid' | null;
};

const SAFE_STORED_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function isSafeStoredUpload(value: string): boolean {
  const normalized = value.startsWith('/uploads/') ? value.slice(1) : value;
  if (normalized.startsWith('/') || !normalized.includes('/')) return false;
  const segments = normalized.split('/');
  return segments.every((segment) => (
    segment !== ''
    && segment !== '.'
    && segment !== '..'
    && SAFE_STORED_SEGMENT.test(segment)
  ));
}

/** Accept secure remote images and the relative upload paths already stored by the application. */
export function validateProductImageInput(input?: string | null): ProductImageInputValidation {
  const value = input?.trim() ?? '';
  if (!value) return { value: '', error: null };

  if (isSafeStoredUpload(value)) {
    return { value, error: null };
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? { value: url.toString(), error: null }
      : { value, error: 'invalid' };
  } catch {
    return { value, error: 'invalid' };
  }
}
