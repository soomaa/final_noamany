/** Deep-merge locale dictionaries (later keys override earlier). */
export function mergeLocales(...parts: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        out[key] &&
        typeof out[key] === 'object' &&
        !Array.isArray(out[key])
      ) {
        out[key] = mergeLocales(out[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}
