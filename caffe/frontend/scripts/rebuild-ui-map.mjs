#!/usr/bin/env node
/**
 * Collect Arabic strings from ui('...'), uiStatic('...'), and locale JSON;
 * merge into ui-map.json (preserve existing English translations).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const mapPath = path.join(root, 'src/locales/ui-map.json');

const existing = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(tsx?|json)$/.test(f)) out.push(p);
  }
  return out;
}

const strings = new Set();

for (const file of walk(src)) {
  if (file.includes('ui-map.json')) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const re of [/ui\(\s*['"`]([^'"`]+)['"`]/g, /uiStatic\(\s*['"`]([^'"`]+)['"`]/g]) {
    let m;
    while ((m = re.exec(content))) {
      if (/[\u0600-\u06FF]/.test(m[1])) strings.add(m[1]);
    }
  }
  // Arabic in shared locale values
  if (file.endsWith('.json') && file.includes('locales')) {
    try {
      const json = JSON.parse(content);
      const collect = (obj) => {
        if (typeof obj === 'string' && /[\u0600-\u06FF]/.test(obj)) strings.add(obj);
        else if (obj && typeof obj === 'object') Object.values(obj).forEach(collect);
      };
      collect(json);
    } catch {
      /* skip */
    }
  }
}

// Basic fallback translations for common patterns
const fallbacks = {
  'إضافة': 'Add',
  'تعديل': 'Edit',
  'حذف': 'Delete',
  'حفظ': 'Save',
  'إلغاء': 'Cancel',
  'بحث': 'Search',
  'جارٍ التحميل…': 'Loading…',
  'جارٍ الحفظ…': 'Saving…',
  'جارٍ الرفع…': 'Uploading…',
  'لا توجد نتائج': 'No results',
  'م': '#',
  'د': 'min',
  'يوم': 'day',
  'نعم': 'Yes',
  'لا': 'No',
  'الكل': 'All',
  'مقروء': 'Read',
  'جديد': 'New',
  'صباح الخير': 'Good morning',
  'مساء الخير': 'Good afternoon',
  'مساء النور': 'Good evening',
  'مرحباً': 'Welcome',
};

const next = { ...existing };
let added = 0;
for (const s of [...strings].sort()) {
  if (!next[s]) {
    next[s] = fallbacks[s] ?? existing[s] ?? s; // keep Arabic as placeholder if unknown
    added++;
  }
}

fs.writeFileSync(mapPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log(`ui-map: ${Object.keys(next).length} entries (+${added} new)`);
