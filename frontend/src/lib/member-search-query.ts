/** Numeric codes search from the first digit; names still need two characters. */
export function isMemberSearchReady(value: string): boolean {
  const query = value.trim();
  return /^[0-9\u0660-\u0669\u06f0-\u06f9]+$/.test(query) || query.length >= 2;
}
