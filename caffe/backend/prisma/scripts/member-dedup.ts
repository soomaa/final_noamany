/* eslint-disable no-console */
/**
 * Same-person name matching + placeholder-phone generation for the customer importer.
 *
 * Two rows are treated as the SAME person only when they already share a phone number
 * AND their names are near-identical (a typo / truncation, e.g. "ماز محمد" ≈ "مازن محمد").
 * Different names on a shared number stay separate people.
 */

/** Normalize an Arabic name for comparison (keep word boundaries). */
export function normalizeForMatch(name: string): string {
  return String(name)
    .replace(/[ً-ْٰٓ-ٕ]/g, '') // harakat
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One name token close to another: equal, or a pure truncation (ماز ⊂ مازن).
 * Deliberately NOT a general edit-distance match — a one-letter *substitution*
 * usually means a different name (هدى vs ندى, عمر vs عمار), so we never merge on it.
 */
function tokenClose(x: string, y: string): boolean {
  if (x === y) return true;
  const [lo, hi] = x.length <= y.length ? [x, y] : [y, x];
  return lo.length >= 3 && hi.startsWith(lo);
}

/**
 * Same-person heuristic for two names that ALREADY share a phone number.
 * All aligned tokens must be close; one extra trailing token is allowed (truncated name).
 */
export function namesSimilar(aKey: string, bKey: string): boolean {
  if (aKey === bKey) return true;
  const ta = aKey.split(' ').filter(Boolean);
  const tb = bKey.split(' ').filter(Boolean);
  if (Math.abs(ta.length - tb.length) > 1) return false;
  const m = Math.min(ta.length, tb.length);
  if (m === 0) return false;
  for (let i = 0; i < m; i++) if (!tokenClose(ta[i], tb[i])) return false;
  return true;
}

/**
 * Factory for unique, EG-format placeholder numbers (e.g. "019" + 8 random digits).
 * `taken` seeds every number already used (DB + kept real numbers) and grows as we hand out.
 */
export function makePhoneGenerator(prefix: string, taken: Set<string>): () => string {
  const fill = 11 - prefix.length;
  return () => {
    for (let attempt = 0; attempt < 100000; attempt++) {
      let digits = '';
      for (let k = 0; k < fill; k++) digits += Math.floor(Math.random() * 10);
      const cand = prefix + digits;
      if (!taken.has(cand)) {
        taken.add(cand);
        return cand;
      }
    }
    for (let n = 0; ; n++) {
      const cand = prefix + String(n).padStart(fill, '0');
      if (!taken.has(cand)) {
        taken.add(cand);
        return cand;
      }
    }
  };
}
