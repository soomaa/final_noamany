#!/usr/bin/env node
/**
 * Wrap remaining Arabic UI text with ui('...') across src/.
 * - JSX text nodes
 * - Icon sibling text: /> Arabic
 * - Common prop strings
 * Adds useLocale() to components that need it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src');

const SKIP = new Set([
  'locale.tsx',
  'ui-map.json',
  'ar.json',
  'en.json',
  'shared.ar.json',
  'shared.en.json',
  'ui-translate.ts',
  'utils.ts',
  'api.ts',
  'formatters.ts',
  'preference-toggles.tsx',
]);

function isCleanAr(s) {
  const t = s.trim();
  if (!t || t.length < 1 || t.length > 200) return false;
  if (/[\n\r<>{}`\\]/.test(t)) return false;
  if (!/[\u0600-\u06FF]/.test(t)) return false;
  return true;
}

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'node_modules' || f === 'locales') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(f) && !SKIP.has(f)) out.push(p);
  }
  return out;
}

const SKIP_DIRS = new Set(['lib', 'types', 'hooks']);

function walkPagesOnly(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'node_modules' || f === 'locales' || SKIP_DIRS.has(f)) continue;
      walkPagesOnly(p, out);
    } else if (/\.tsx?$/.test(f) && !SKIP.has(f)) out.push(p);
  }
  return out;
}

function hasUiHook(content) {
  return /const\s*\{[^}]*\bui\b[^}]*\}\s*=\s*useLocale\(\)/.test(content);
}

function injectImport(content) {
  if (content.includes("from '@/store/locale'")) return content;
  const line = "import { useLocale } from '@/store/locale';\n";
  const m = content.match(/\nimport .+;\n/g);
  if (m?.length) {
    const last = content.lastIndexOf(m[m.length - 1]);
    const end = last + m[m.length - 1].length;
    return content.slice(0, end) + line + content.slice(end);
  }
  return line + content;
}

function injectHook(content) {
  if (hasUiHook(content)) return content;
  // export function Foo(
  let next = content.replace(
    /export function (\w+)\([^)]*\)\s*\{/g,
    (m, name) => (hasUiHook(content) ? m : `${m}\n  const { ui } = useLocale();`),
  );
  if (next !== content) return next;
  // function Foo(
  next = content.replace(
    /^function (\w+)\([^)]*\)\s*\{/gm,
    (m) => (hasUiHook(content) ? m : `${m}\n  const { ui } = useLocale();`),
  );
  return next;
}

function alreadyWrapped(before) {
  return /ui\(|uiStatic\(|t\(|getGreeting\(/.test(before.slice(-30));
}

function transform(content, filePath) {
  let out = content;
  let changed = false;

  // /> Arabic text (before </ or {)
  out = out.replace(/(\/>)\s+([^\s<{][^<\n{]*[\u0600-\u06FF][^<\n{]*)/g, (match, close, text) => {
    const val = text.trim();
    if (!isCleanAr(val)) return match;
    const idx = out.indexOf(match);
    if (alreadyWrapped(out.slice(Math.max(0, idx - 40), idx))) return match;
    changed = true;
    return `${close} {ui('${val.replace(/'/g, "\\'")}')}`;
  });

  // JSX >text< (pure Arabic text nodes)
  out = out.replace(/>([^<>{}\n]+)</g, (match, text) => {
    const val = text.trim();
    if (!isCleanAr(val)) return match;
    const idx = out.indexOf(match);
    if (alreadyWrapped(out.slice(Math.max(0, idx - 20), idx))) return match;
    if (val.startsWith('{')) return match;
    changed = true;
    return `>{ui('${val.replace(/'/g, "\\'")}')}<`;
  });

  // label="arabic" placeholder="arabic" title="arabic" etc (not yet wrapped)
  out = out.replace(
    /\b(placeholder|title|description|label|aria-label|confirmLabel|searchPlaceholder|emptyTitle|emptyDescription|header|message)=(['"])([^'"]*[\u0600-\u06FF][^'"]*)\2/g,
    (match, prop, q, val) => {
      if (!isCleanAr(val)) return match;
      const idx = out.indexOf(match);
      if (alreadyWrapped(out.slice(Math.max(0, idx - 10), idx))) return match;
      changed = true;
      return `${prop}={ui('${val.replace(/'/g, "\\'")}')}`;
    },
  );

  // toast.success('arabic'), confirm({ title: 'arabic' }), etc.
  out = out.replace(
    /(?<![\w])'([^'\n$]*[\u0600-\u06FF][^'\n$]*)'/g,
    (match, val) => {
      if (!isCleanAr(val)) return match;
      const idx = out.indexOf(match);
      if (alreadyWrapped(out.slice(Math.max(0, idx - 12), idx))) return match;
      // skip import paths and locale keys
      const after = out.slice(idx + match.length, idx + match.length + 5);
      if (after.startsWith('.json')) return match;
      changed = true;
      return `ui('${val.replace(/'/g, "\\'")}')`;
    },
  );

  if (!changed) return content;

  out = injectImport(out);
  out = injectHook(out);
  return out;
}

const files = walkPagesOnly(path.join(src, 'pages')).concat(walkPagesOnly(path.join(src, 'components')));
let count = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const next = transform(content, file);
  if (next !== content) {
    fs.writeFileSync(file, next, 'utf8');
    count++;
    console.log('updated', path.relative(root, file));
  }
}
console.log('Wrapped', count, 'files');
