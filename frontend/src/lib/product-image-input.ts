export type ProductImageInputValidation = {
  value: string;
  error: 'invalid' | null;
};

const SAFE_STORED_UPLOAD = /^(?=.*\/)[/]?(?:uploads\/)?[a-zA-Z0-9._/-]+$/;

/** Accept secure remote images and the relative upload paths already stored by ONE80. */
export function validateProductImageInput(input?: string | null): ProductImageInputValidation {
  const value = input?.trim() ?? '';
  if (!value) return { value: '', error: null };

  if (/^public-file:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { value, error: null };
  }

  if (SAFE_STORED_UPLOAD.test(value) && !value.includes('..')) {
    return { value, error: null };
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      ? { value: url.toString(), error: null }
      : { value, error: 'invalid' };
  } catch {
    return { value, error: 'invalid' };
  }
}
