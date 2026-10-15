export function normalizeKeypadDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660))).replace(/[٫,]/g, '.');
}

export function keyboardKeypadKey(key: string): string | null {
  if (key === 'Backspace') return 'backspace';
  if (key === 'Delete') return 'clear';
  const normalized = normalizeKeypadDigits(key === 'Decimal' ? '.' : key);
  return /^[0-9.]$/.test(normalized) ? normalized : null;
}

export function enterKey(value: string, key: string, options: { decimal?: boolean; decimalPlaces?: number; replace?: boolean; maxLength?: number } = {}) {
  if (key === 'clear') return '';
  if (key === 'backspace') return value.slice(0, -1);
  let next = options.replace ? '' : value;
  if (key === '.') {
    if (!options.decimal || next.includes('.')) return next;
    return next ? `${next}.` : '0.';
  }
  if (!/^\d$/.test(key)) return value;
  if (options.decimal && next.includes('.') && next.split('.')[1].length >= (options.decimalPlaces ?? 2)) return next;
  next = next === '0' && options.decimal ? key : next + key;
  return next.length > (options.maxLength ?? 12) ? value : next;
}


/** Radix shifts along the alignment axis; switch sides if neither horizontal side fits. */
export function preferredKeypadSide(viewportWidth: number, anchor: { left: number; right: number }): 'right' | 'bottom' {
  const keypadWidth = Math.min(360, Math.max(0, viewportWidth - 24));
  const horizontalSpace = Math.max(anchor.left, viewportWidth - anchor.right);
  return horizontalSpace >= keypadWidth + 20 ? 'right' : 'bottom';
}
