#!/usr/bin/env node
/**
 * Sync English translations into ui-map.json from locale JSON files
 * and a built-in HR glossary for common phrases.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const locales = path.join(root, 'src/locales');
const mapPath = path.join(locales, 'ui-map.json');

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}

const arFlat = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'ar.json'), 'utf8')));
const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'en.json'), 'utf8')));
const arShared = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'shared.ar.json'), 'utf8')));
const enShared = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'shared.en.json'), 'utf8')));
const arClub = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'club.ar.json'), 'utf8')));
const enClub = flatten(JSON.parse(fs.readFileSync(path.join(locales, 'club.en.json'), 'utf8')));

let synced = 0;
for (const [arDict, enDict] of [
  [arFlat, enFlat],
  [arShared, enShared],
  [arClub, enClub],
]) {
  for (const key of Object.keys(arDict)) {
    const ar = arDict[key];
    const en = enDict[key];
    if (ar && en && ar !== en && map[ar] === ar) {
      map[ar] = en;
      synced++;
    }
  }
}

const glossary = JSON.parse(fs.readFileSync(path.join(locales, 'ui-glossary.en.json'), 'utf8'));
const modulesGlossary = JSON.parse(fs.readFileSync(path.join(locales, 'modules-glossary.en.json'), 'utf8'));
const pagesGlossary = JSON.parse(fs.readFileSync(path.join(locales, 'pages-glossary.en.json'), 'utf8'));

let glossed = 0;
for (const [ar, en] of Object.entries({ ...glossary, ...modulesGlossary, ...pagesGlossary })) {
  if (!map[ar] || map[ar] === ar) {
    map[ar] = en;
    glossed++;
  }
}

/** Inline glossary for frequent UI fragments */
const inlineGlossary = {
  'إضافة مستخدم': 'Add user',
  'إضافة موظف': 'Add employee',
  'موظف جديد': 'New employee',
  'عضو جديد': 'New member',
  'فرع جديد': 'New branch',
  'مهمة جديدة': 'New task',
  'رسالة جديدة': 'New message',
  'تقرير جديد': 'New report',
  'ملف جديد': 'New file',
  'نشاط جديد': 'New activity',
  'عهدة جديدة': 'New custody item',
  'مبادرة جديدة': 'New initiative',
  'تعميم جديد': 'New circular',
  'إنذار جديد': 'New warning',
  'تقييم جديد': 'New evaluation',
  'سجل جديد': 'New record',
  'موقع جديد': 'New site',
  'وكيل جديد': 'New agent',
  'مستخدم جديد': 'New user',
  'وردية جديدة': 'New shift',
  'طلب جديد': 'New request',
  'دور جديد': 'New role',
  'مكون جديد': 'New component',
  'إدارة / قسم جديد': 'New department / section',
  'تسجيل يدوي': 'Manual check-in',
  'تسجيل دخول بالباركود / الكود': 'Barcode / code check-in',
  'إضافة أول عضو': 'Add first member',
  'معاينة الطباعة': 'Print preview',
  'بطاقة الموظف': 'Employee card',
  'حفظ المالية': 'Save finances',
  'حفظ العقد': 'Save contract',
  'حفظ التغييرات': 'Save changes',
  'مسح الكل': 'Clear all',
  'تراجع': 'Undo',
  'إعادة تسمية': 'Rename',
  'المستخدمون': 'Users',
  'تعليم الكل كمقروء': 'Mark all as read',
  'العودة للمسيرة': 'Back to payroll run',
  'لوحة متابعة الحضور والموارد البشرية — اطلع على أهم مؤشرات اليوم في لمحة واحدة':
    'Attendance and HR dashboard — see today\'s key metrics at a glance',
  'صباح الخير': 'Good morning',
  'مساء الخير': 'Good afternoon',
  'مساء النور': 'Good evening',
  'إرسال': 'Send',
  'إرسال الرد': 'Send reply',
  'إرسال للجميع': 'Send to all',
  'إخفاء كلمة المرور': 'Hide password',
  'إظهار كلمة المرور': 'Show password',
  'أعياد الميلاد': 'Birthdays',
  'إجازة سنوية': 'Annual leave',
  'إجازة مرضية': 'Sick leave',
  'إجازة طارئة': 'Emergency leave',
  'إخلاء الطرف': 'Clearance',
  'إخلاء طرف': 'Clearance',
  'أعد المحاولة': 'Try again',
  'أنشئ بواسطة': 'Created by',
  'إدارة الموظفين والحضور والرواتب — في مكان واحد':
    'Employee, attendance, and payroll management — in one place',
  'ONE80 Gym & Fitness Hub — الموارد البشرية': 'ONE80 Gym & Fitness Hub — Human Resources',
  'من معالج الموظف.': 'from the employee wizard.',
  'من:': 'From:',
  'كود:': 'Code:',
  'استحقاقات:': 'Earnings:',
  'استقطاعات:': 'Deductions:',
  'نتيجة التجربة:': 'Probation result:',
  'تقييم': 'Evaluation',
  'إخلاء طرف —': 'Clearance —',
  'المستخدمون على الدور': 'Users on role',
  'الرابط': 'Link',
  'من القائمة القديمة': 'from the legacy menu',
  'تصدير Excel — قريباً': 'Excel export — coming soon',
  'نوع الإجازة *': 'Leave type *',
  '؟': '?',
};

let inlineGlossed = 0;
for (const [ar, en] of Object.entries(inlineGlossary)) {
  if (!map[ar] || map[ar] === ar) {
    map[ar] = en;
    inlineGlossed++;
  }
}

// Pattern-based fixes for common prefixes/suffixes
for (const key of Object.keys(map)) {
  if (map[key] !== key || !/[\u0600-\u06FF]/.test(key)) continue;
  if (key.endsWith('…')) {
    const base = key.slice(0, -1);
    if (map[base] && map[base] !== base) map[key] = map[base] + '…';
  }
  if (key.startsWith('بحث في ')) map[key] = 'Search in ' + key.slice(7);
  if (key.startsWith('بحث ب')) map[key] = 'Search by ' + key.slice(5);
  if (key.startsWith('بحث ')) map[key] = 'Search ' + key.slice(4);
  if (key.startsWith('لا توجد بيانات في ')) map[key] = 'No data in ' + key.slice(17);
  if (key.endsWith(' — قيد الإعداد على الخادم')) {
    map[key] = key.slice(0, -' — قيد الإعداد على الخادم'.length) + ' — pending server setup';
  }
  if (key.startsWith('جارٍ ')) {
    map[key] = key
      .replace('جارٍ ', '')
      .replace('التحميل', 'Loading')
      .replace('الحفظ', 'Saving')
      .replace('الرفع', 'Uploading');
    if (!map[key].endsWith('…') && key.endsWith('…')) map[key] += '…';
  }
}

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');

let remaining = 0;
for (const [k, v] of Object.entries(map)) {
  if (k === v && /[\u0600-\u06FF]/.test(k)) remaining++;
}
console.log(`Synced ${synced} from locale files, ${glossed} from glossary file, ${inlineGlossed} inline, ${remaining} still untranslated`);
