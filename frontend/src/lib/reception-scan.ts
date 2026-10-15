import { isMemberSearchReady } from './member-search-query';

function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function isReceptionSearchReady(value: string): boolean {
  return isMemberSearchReady(value);
}

export function consumeReceptionScan(
  params: URLSearchParams,
  lastConsumed: string,
): { code: string; nextParams: URLSearchParams } | null {
  const code = params.get('scan')?.trim() ?? '';
  if (!code || code === lastConsumed) return null;
  const nextParams = new URLSearchParams(params);
  nextParams.delete('scan');
  return { code, nextParams };
}

/**
 * Keyboard-wedge barcode scanners "type" the code on whatever layout the PC is on. With the
 * Arabic layout active, the Latin branch letter of a Code 128 member code arrives as the
 * Arabic letter on the same key (A → ش, B → لا, often as two code points لا). Map those keys
 * back so «ش012253» is searched as A012253.
 */
const ARABIC_KEY_TO_LATIN: ReadonlyArray<readonly [string, string]> = [
  // Lam-alef first: one key, but usually two code points, and the shifted variants.
  ['لا', 'B'], ['لأ', 'B'], ['لإ', 'B'], ['لآ', 'B'], ['ﻻ', 'B'], ['ﻷ', 'B'], ['ﻹ', 'B'], ['ﻵ', 'B'],
  ['ش', 'A'], ['ؤ', 'C'], ['ي', 'D'], ['ث', 'E'], ['ب', 'F'], ['ل', 'G'], ['ا', 'H'], ['ه', 'I'],
  ['ت', 'J'], ['ن', 'K'], ['م', 'L'], ['ة', 'M'], ['ى', 'N'], ['خ', 'O'], ['ح', 'P'], ['ض', 'Q'],
  ['ق', 'R'], ['س', 'S'], ['ف', 'T'], ['ع', 'U'], ['ر', 'V'], ['ص', 'W'], ['ء', 'X'], ['غ', 'Y'],
  ['ئ', 'Z'],
];

const MEMBER_CODE_PATTERN = /^[A-Z]{1,3}\d{6}$/;
const MEMBER_CODE_DIGITS = /^\d{6}$/;

/** Same scheme as the server's member code generator: 1 → A, 2 → B … 27 → AA. */
export function memberCodePrefixForBranch(branchId: number): string {
  let n = Math.max(1, Math.floor(branchId));
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function arabicKeysToLatin(value: string): string | null {
  let rest = value;
  let out = '';
  while (rest) {
    const hit = ARABIC_KEY_TO_LATIN.find(([arabic]) => rest.startsWith(arabic));
    if (hit) {
      out += hit[1];
      rest = rest.slice(hit[0].length);
    } else if (/^[A-Za-z]/.test(rest)) {
      out += rest[0].toUpperCase();
      rest = rest.slice(1);
    } else {
      return null;
    }
  }
  return out;
}

export interface NormalizedReceptionScan {
  /** What to send to the search endpoint. */
  query: string;
  /** Member codes that count as the scanned member, best first; null → ordinary search. */
  exactCodes: string[] | null;
  /** True when only an exact code match may be opened (the code was rebuilt or is complete). */
  strict: boolean;
}

/**
 * Rebuilds a member code a keyboard scanner mangled, without touching ordinary search text:
 *  - a complete code in any case (a012253) → A012253;
 *  - a branch letter typed on the Arabic layout (ش012253 / لا012253) → A012253 / B012253;
 *  - a dropped branch letter (012253, or 012253 plus one stray scanner key) → the reception
 *    branch's prefix. A bare six-digit value may also be a legacy numeric code, so that exact
 *    code is tried first and ordinary search results remain the fallback.
 */
export function normalizeReceptionScanCode(
  rawQuery: string,
  branchId: number | null | undefined,
): NormalizedReceptionScan {
  const query = normalizeArabicDigits(rawQuery.trim());
  const plain: NormalizedReceptionScan = { query, exactCodes: null, strict: false };
  if (!query) return plain;

  if (MEMBER_CODE_PATTERN.test(query.toUpperCase())) {
    const code = query.toUpperCase();
    return { query: code, exactCodes: [code], strict: true };
  }

  const branchPrefix = branchId ? memberCodePrefixForBranch(branchId) : null;
  if (MEMBER_CODE_DIGITS.test(query)) {
    return {
      query,
      exactCodes: branchPrefix ? [query, `${branchPrefix}${query}`] : [query],
      strict: false,
    };
  }

  const shaped = query.match(/^(\D{1,4})(\d{6})$/) ?? query.match(/^(\d{6})(\D{1,2})$/);
  if (!shaped) return plain;
  const leading = /^\d/.test(shaped[1]) ? null : shaped[1];
  const digits = leading ? shaped[2] : shaped[1];

  if (leading) {
    const prefix = arabicKeysToLatin(leading);
    if (prefix && prefix.length <= 3) {
      const code = `${prefix}${digits}`;
      return { query: code, exactCodes: [code], strict: true };
    }
  }
  // One stray key next to the digits: the branch letter was lost on the way in.
  const stray = leading ?? shaped[2];
  if (stray.length <= 2 && branchPrefix) {
    const code = `${branchPrefix}${digits}`;
    return { query: code, exactCodes: [code], strict: true };
  }
  return plain;
}

/** Opens the scanned member only; never a similarly numbered one when the scan was exact. */
export function pickReceptionScanHit<T extends { memberCode: string }>(
  hits: readonly T[],
  topMatch: T | null | undefined,
  scan: NormalizedReceptionScan,
): T | null {
  if (scan.exactCodes) {
    for (const code of scan.exactCodes) {
      const exact = hits.find((hit) => hit.memberCode.trim().toUpperCase() === code);
      if (exact) return exact;
    }
    if (scan.strict) return null;
  }
  return topMatch ?? hits[0] ?? null;
}
