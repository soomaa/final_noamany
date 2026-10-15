/** Format a displayed quantity without rounding or changing its stored value. */
export function formatDisplayNumber(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '—';
  const text = String(value);
  if (typeof value === 'number' && Math.abs(value) >= 1e21) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 }).format(value);
  }
  const match = /^([+-]?)(\d+)(\.\d+)?$/.exec(text);
  if (!match) return text;
  const [, sign, integer, fraction = ''] = match;
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction}`;
}

/** Identifiers are read/copied as codes, rather than as measured quantities. */
export function isIdentifierColumn(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (words.startsWith('number_of_')) return false;
  return /(?:^|_)(?:id|ids|code|number|phone|mobile|tel|barcode|scanner|card|account|iban|reference|date|time|year|lat|lng|latitude|longitude)(?:_|$)/.test(words);
}
