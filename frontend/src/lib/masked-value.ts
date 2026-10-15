/**
 * Recognising a value the API has already masked.
 *
 * The server replaces the hidden part with stars and keeps the length, so the client can
 * tell a masked value from a real one without being told separately — and without ever
 * holding the real value it is not allowed to show.
 */
export function isMaskedValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('*');
}

/**
 * True for a masked value exactly as the server sent it — stars, then at most the two digits
 * left readable. Anything else that contains a star was half-edited by hand.
 */
export function isPristineMaskedValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\*+[^*]{0,2}$/.test(value.trim());
}
