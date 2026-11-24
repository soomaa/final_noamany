/** Pure helpers for WhatsApp campaigns — phone format, template rendering, recipient filtering. */

export const TEMPLATE_VARIABLES = ['name', 'first_name', 'end_date', 'days', 'package', 'branch', 'code', 'age', 'last_visit'] as const;
export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string>>;

/**
 * Stored phone → the international digits WhatsApp's /send?phone= expects. Egyptian mobiles
 * (010/011/012/015) get the 20 prefix; anything already international (8–15 digits, no
 * leading 0) is kept. Landlines and malformed values return null — they can't be on WhatsApp.
 */
export function toWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  digits = digits.replace(/\D/g, '');
  if (/^01[0125]\d{8}$/.test(digits)) return `2${digits}`;
  if (/^1[0125]\d{8}$/.test(digits)) return `20${digits}`;
  if (digits.startsWith('20')) return /^201[0125]\d{8}$/.test(digits) ? digits : null;
  if (digits.startsWith('0')) return null;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** 2010xxxxxxxx → 010xxxxxxxx for display; other countries keep a leading +. */
export function displayPhone(international: string): string {
  return /^201\d{9}$/.test(international) ? `0${international.slice(2)}` : `+${international}`;
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value === undefined ? match : value;
  });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** 2026-10-21 → 21/10/2026 */
export function formatDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400_000);
}

export type SkipReason =
  | 'no_phone'
  | 'invalid_phone'
  | 'opted_out'
  | 'duplicate_phone'
  | 'recently_messaged'
  | 'not_on_whatsapp'
  | 'already_greeted'
  | 'excluded_manually';

export interface Candidate {
  memberId: number;
  phoneRaw: string | null;
}

/**
 * Decide, in order, which candidates get a message. First occurrence of a phone wins, so a
 * family sharing one number gets one message.
 */
export function classifyRecipients<T extends Candidate>(
  candidates: T[],
  ctx: { optedOut: Set<string>; recentlyMessaged: Set<string>; excludedMemberIds: Set<number>; notOnWhatsApp?: Set<string>; alreadyGreeted?: Set<number> },
): Array<T & { phone: string | null; skip: SkipReason | null }> {
  const seen = new Set<string>();
  return candidates.map((c) => {
    const phone = toWhatsAppPhone(c.phoneRaw);
    let skip: SkipReason | null = null;
    if (ctx.excludedMemberIds.has(c.memberId)) skip = 'excluded_manually';
    else if (!c.phoneRaw?.trim()) skip = 'no_phone';
    else if (!phone) skip = 'invalid_phone';
    else if (ctx.optedOut.has(phone)) skip = 'opted_out';
    else if (ctx.notOnWhatsApp?.has(phone)) skip = 'not_on_whatsapp';
    else if (ctx.alreadyGreeted?.has(c.memberId)) skip = 'already_greeted';
    else if (seen.has(phone)) skip = 'duplicate_phone';
    else if (ctx.recentlyMessaged.has(phone)) skip = 'recently_messaged';
    if (phone && !skip) seen.add(phone);
    return { ...c, phone, skip };
  });
}

// ── birthdays ─────────────────────────────────────────────────────────────────

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The `-MM-DD` endings of a `YYYY-MM-DD` date of birth that have their birthday on `today`.
 * On 28 February of a non-leap year, people born on 29 February are greeted too.
 */
export function birthdaySuffixes(today: string): string[] {
  const [y, md] = [Number(today.slice(0, 4)), today.slice(5)];
  return md === '02-28' && !isLeapYear(y) ? ['-02-28', '-02-29'] : [`-${md}`];
}

/** Age reached on `today`, or null when the stored date is not a believable date of birth. */
export function ageOn(dateOfBirth: string | null | undefined, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!m || dateOfBirth === '1970-01-01') return null;
  const [, y, mo, d] = m;
  const age = Number(today.slice(0, 4)) - Number(y) - (`${mo}-${d}` > today.slice(5) && !(today.slice(5) === '02-28' && `${mo}-${d}` === '02-29') ? 1 : 0);
  // Migrated data holds placeholders such as 1112-… or 2222-…; nobody that age gets a greeting.
  return age >= 3 && age <= 100 ? age : null;
}

// ── human-like variation ──────────────────────────────────────────────────────

/** A line holding only `---` splits a template into alternative versions of the same message. */
const VERSION_SEPARATOR = /\n[ \t]*-{3,}[ \t]*(?:\n|$)/;
/**
 * `{أهلًا|إزيك|مساء الخير}` → one of the choices. Variables such as `{first_name}` have no `|` and are
 * left alone — also inside a choice: `{في {branch}|معانا}` works.
 */
const CHOICES = /\{((?:[^{}\n]|\{\w+\})*\|(?:[^{}\n]|\{\w+\})*)\}/g;

/** The non-empty versions of a template (one when it has no `---` line). */
export function templateVersions(body: string): string[] {
  const parts = (body ?? '').replace(/\r\n?/g, '\n').split(VERSION_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [(body ?? '').trim()];
}

/**
 * One concrete wording for one recipient: a random version, then a random choice inside every `{a|b}`.
 * Two members rarely get the exact same text, which is what makes a bulk send look like a bulk send.
 */
export function varyTemplate(body: string, rand: () => number = Math.random): string {
  const versions = templateVersions(body);
  const pick = <T>(items: T[]) => items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
  return pick(versions).replace(CHOICES, (_m, inner: string) => pick(inner.split('|')).trim());
}

const OPT_OUT_LINES = [
  'لو مش حابب توصلك رسايل مننا ابعت «إيقاف»',
  'لو مش عايز رسايل تانية ابعتلنا «إيقاف»',
  'ولو حابب نوقف الرسايل دي ابعت «إيقاف»',
];
const MENTIONS_OPT_OUT = /إيقاف|ايقاف|\bstop\b/i;

/** Adds a short, varied "reply إيقاف to stop" line unless the text already tells people how to stop. */
export function withOptOutLine(text: string, rand: () => number = Math.random): string {
  if (MENTIONS_OPT_OUT.test(text)) return text;
  const line = OPT_OUT_LINES[Math.min(OPT_OUT_LINES.length - 1, Math.floor(rand() * OPT_OUT_LINES.length))];
  return `${text.trimEnd()}\n\n${line}`;
}

const STOP_WORDS = new Set(['ايقاف', 'إيقاف', 'وقف', 'الغاء', 'إلغاء', 'stop', 'unsubscribe']);

/** A short reply that asks us to stop ("إيقاف", "stop", "ايقاف 🙏"). Longer messages are left for staff to read. */
export function isStopReply(text: string | null | undefined): boolean {
  const words = String(text ?? '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.some((w) => STOP_WORDS.has(w));
}

/** Plain links in a cold message are a strong spam signal; staff get a warning before sending. */
export function hasLink(text: string): boolean {
  return /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|eg|me|app|link|ly)\b/i.test(text ?? '');
}

// ── template fields ───────────────────────────────────────────────────────────

/** A template as staff edit it: one line per field, each with one or more wordings. */
export interface TemplateField {
  label: string;
  options: string[];
}

const MAX_FIELD_OPTIONS = 8;

/** One wording, safe inside a `{a|b}` group: no `|`, no line breaks, no stray braces around words. */
function cleanOption(text: string): string {
  return String(text ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim();
}

/** Fields → the stored body: a line per field, `{a|b|c}` when it has several wordings. */
export function fieldsToBody(fields: TemplateField[]): string {
  return fields
    .map((f) => [...new Set((f.options ?? []).map(cleanOption).filter(Boolean))])
    .filter((options) => options.length)
    .map((options) => (options.length > 1 ? `{${options.join('|')}}` : options[0]))
    .join('\n');
}

/** Every concrete wording of one line (inline choices expanded), capped. */
function expandLine(line: string): string[] {
  const match = new RegExp(CHOICES.source).exec(line);
  if (!match) return [line.trim()];
  const out: string[] = [];
  for (const choice of match[1].split('|')) {
    for (const rest of expandLine(line.slice(0, match.index) + choice.trim() + line.slice(match.index + match[0].length))) {
      if (out.length >= MAX_FIELD_OPTIONS) return out;
      out.push(rest.replace(/\s{2,}/g, ' ').trim());
    }
  }
  return out;
}

/**
 * A free-text body → fields, for templates written before the field editor. Line n of every
 * `---` version becomes the wordings of field n (versions written line by line read naturally).
 */
export function bodyToFields(body: string): TemplateField[] {
  const versions = templateVersions(body).map((v) => v.split('\n').map((l) => l.trim()).filter(Boolean));
  const lines = Math.max(0, ...versions.map((v) => v.length));
  const fields: TemplateField[] = [];
  for (let i = 0; i < lines; i += 1) {
    const options = [...new Set(versions.flatMap((v) => (v[i] ? expandLine(v[i]) : [])))].slice(0, MAX_FIELD_OPTIONS);
    if (options.length) fields.push({ label: `السطر ${i + 1}`, options });
  }
  return fields;
}
