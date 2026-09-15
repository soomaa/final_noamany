#!/usr/bin/env node
/**
 * Wraps clean Arabic string literals in TSX files with ui('...').
 * Adds useLocale() hook to function components when needed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function isCleanAr(s) {
  if (!s || s.length < 2 || s.length > 100) return false;
  if (/[\n\r<>{}$`\\]/.test(s)) return false;
  if (!/[\u0600-\u06FF]/.test(s)) return false;
  return /^[\u0600-\u06FF\s\u061F\u061B\u060C\u0660-\u0669\u06400-9A-Za-z&.,:؛\-—()%·+|/]+$/.test(s);
}

const SKIP_FILES = new Set([
  'sidebar.tsx',
  'topbar.tsx',
  'preference-toggles.tsx',
  'login.tsx',
]);

const files = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
}
walk(path.join(root, 'src/pages'));
walk(path.join(root, 'src/components'));
files.push(path.join(root, 'src/App.tsx'));

function transform(content, filePath) {
  const base = path.basename(filePath);
  if (SKIP_FILES.has(base)) return content;

  let out = content;

  // Skip if already has ui from useLocale
  const needsImport = !out.includes("from '@/store/locale'");

  // Replace JSX prop="arabic" -> prop={ui('arabic')}
  out = out.replace(
    /(\s)([a-zA-Z][\w-]*)=(['"])([^'"\n]*[\u0600-\u06FF][^'"\n]*)\3/g,
    (match, sp, prop, q, val) => {
      if (!isCleanAr(val.trim())) return match;
      if (prop === 'className' || prop === 'id' || prop === 'key' || prop === 'to' || prop === 'href') return match;
      return `${sp}${prop}={ui('${val.trim().replace(/'/g, "\\'")}')}`;
    },
  );

  // Replace JSX text >arabic<
  out = out.replace(/>([^<>{}\n]*[\u0600-\u06FF][^<>{}\n]*)</g, (match, text) => {
    const val = text.trim();
    if (!isCleanAr(val)) return match;
    return `>{ui('${val.replace(/'/g, "\\'")}')}<`;
  });

  // Replace standalone string literals in common positions: toast., title:, label:, header:, placeholder:
  // 'arabic' in object props -> ui('arabic') when clean
  out = out.replace(/(['"])([^'"\n]*[\u0600-\u06FF][^'"\n]*)\1/g, (match, q, val) => {
    const s = val.trim();
    if (!isCleanAr(s)) return match;
    // skip import paths and already wrapped
    const idx = out.indexOf(match);
    const before = out.slice(Math.max(0, idx - 4), idx);
    if (before.includes('ui(')) return match;
    return `ui('${s.replace(/'/g, "\\'")}')`;
  });

  if (out === content) return content;

  if (needsImport && !out.includes("import { useLocale }")) {
    const importLine = "import { useLocale } from '@/store/locale';\n";
    const lastImport = out.lastIndexOf('\nimport ');
    if (lastImport !== -1) {
      const end = out.indexOf('\n', lastImport + 1);
      out = out.slice(0, end + 1) + importLine + out.slice(end + 1);
    } else {
      out = importLine + out;
    }
  }

  // Inject const { ui } = useLocale() into exported function components
  if (!out.includes('useLocale()')) {
    out = out.replace(
      /export function (\w+)\([^)]*\)\s*\{/,
      (m) => `${m}\n  const { ui } = useLocale();`,
    );
  }

  return out;
}

let changed = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const next = transform(content, file);
  if (next !== content) {
    fs.writeFileSync(file, next, 'utf8');
    changed++;
    console.log('updated', path.relative(root, file));
  }
}
console.log('Done. Updated', changed, 'files');
