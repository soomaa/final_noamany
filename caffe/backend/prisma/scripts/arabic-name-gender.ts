/* eslint-disable no-console */
/**
 * Best-effort gender inference from an Arabic full name.
 *
 * The customer Excel has no gender column, so we guess from the first name:
 *   - known female name        -> female (confident)
 *   - "*الدين" compound / "عبد*" / known male name -> male (confident)
 *   - anything else            -> male (default), NOT confident -> caller flags it
 *
 * The dataset is ~95% male, so defaulting the unknown tail to male is correct far
 * more often than not; `confident:false` lets the importer tag those rows with a
 * note so staff can review the handful that matter.
 */

/** Strip tashkeel/tatweel and unify letter variants so spelling differences match. */
function normKey(raw: string): string {
  return String(raw)
    .replace(/[ً-ْٰٓ-ٕ]/g, '') // harakat
    .replace(/ـ/g, '') // tatweel ـ
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, '')
    .trim();
}

// Common Egyptian/Arabic female first names (Muslim + Coptic). Stored in any
// spelling — normKey() folds ة/ه, ى/ي, hamza variants, so we don't need every form.
const FEMALE_RAW = [
  'مريم','ملك','ملاك','ايمان','امنيه','منه','منةالله','جنى','جنه','جني','حبيبه','شهد','شيماء','الاء','اسراء',
  'رودينا','رودينه','فريده','ياسمين','ندى','نادين','ندين','سلمى','ساره','سما','سمر','سميه','رنا','رنيم','ريم',
  'دينا','دنيا','هبه','اسماء','شروق','رحمه','مي','ميار','ميرنا','روان','لينا','لين','هنا','هند','هدير','هاجر',
  'بسمله','كنزى','تسنيم','علياء','نجلاء','وفاء','عبير','نورهان','نيره','فرح','فرحه','جوري','جودي','ليان','لوجين',
  'جوان','تالا','تولين','ريتاج','رتاج','رهف','غاده','امل','اماني','احلام','نعمه','سعاد','سميره','سناء','صفاء',
  'عزيزه','فايزه','فوزيه','كريمه','لطيفه','ليلى','منال','منى','نبيله','نجوى','نرمين','نسمه','نهى','نهله','هناء',
  'زينب','سهير','سهام','شيرين','شرين','شمس','ضحى','عفاف','علا','غاليه','فاتن','كوثر','لميس','ماجده','مروه',
  'منيره','ناهد','هاله','هدى','يسرا','اروى','اسيل','انجى','بسنت','بتول','جميله','حنين','خلود','داليا','رزان',
  'رقيه','ريماس','زهراء','زهره','سلوى','سلسبيل','سيلين','عائشه','فاطمه','مايا','ماريا','مليكه','منار','ميرا',
  'نانسى','يمنى','ورده','لوليا','تقوى','ريناد','جيلان','ريهام','شهيره','صفيه','لبنى','لمياء','مادلين','ماريان',
  'مارينا','مونيكا','فيرينا','كارولين','كاترين','ديميانه','مارثا','فيبى','جوزيفين','كنزي','رودى','جنات','سديم',
  'رفيف','ريناد','لجين','ريتال','تيا','ميرال','ميرنا','هايدى','دميانه','مادونا','فيرونيا','انجيلا','كلارا',
];

// Frequent male first names from the file + common ones. Markers (عبد*, *الدين)
// cover the compound names, so this list just needs the standalone ones.
const MALE_RAW = [
  'محمد','احمد','يوسف','عمر','محمود','مصطفى','زياد','ابراهيم','عمرو','علي','ياسين','مروان','اسلام','كريم','ادهم',
  'سيف','فارس','حسن','خالد','ادم','مازن','اياد','مؤمن','مهند','حسام','بلال','حازم','معاذ','حمزه','مالك','وليد',
  'انس','اسامه','يحيى','هشام','طارق','عمار','شريف','حسين','معتز','رامي','ايمن','مينا','عادل','امير','سعيد','ايهاب',
  'بدر','شهاب','مهاب','علاء','اشرف','فهد','فادي','باسم','عماد','رمضان','جاسر','ياسر','صلاح','هاني','حمدي','زين',
  'سعد','عاصم','وائل','هيثم','جمال','لؤي','فتحي','تامر','اسماعيل','براء','فاروق','جابر','طه','ماجد','نادر','عصام',
  'مجدي','ساجد','جورج','كرلس','كيرلس','مرقس','بولا','جرجس','بيشوي','مينا','صالح','سليم','عز','سامح','وسيم','رفيق',
  'ابانوب','مقار','فيلوباتير','بطرس','بولس','متى','لوقا','رزق','شنوده','باخوم','رومانى','عبده','رفعت','عصمت',
  'زكريا','منصور','سلطان','فيصل','ماهر','نبيل','سمير','عاطف','ثروت','رأفت','مدحت','صبري','عادل','فوزي','لطفي',
];

const FEMALE = new Set(FEMALE_RAW.map(normKey));
const MALE = new Set(MALE_RAW.map(normKey));

// Genuinely ambiguous standalone names (both genders common). Default them to male
// but never mark confident, so they always get flagged for review.
const AMBIGUOUS = new Set(['نور', 'وسام', 'جهاد', 'تقي', 'صفا', 'نضال', 'رؤى'].map(normKey));

export type Gender = 'male' | 'female';
export interface GenderGuess {
  gender: Gender;
  /** false => caller should flag the row so staff can double-check. */
  confident: boolean;
}

export function inferGender(fullName: string): GenderGuess {
  const raw = String(fullName).trim();
  if (!raw) return { gender: 'male', confident: false };

  // "*الدين" (نور الدين / علاء الدين / سيف الدين ...) is always male.
  // normKey drops spaces, so this catches both "نور الدين" and "نورالدين".
  if (normKey(raw).includes('الدين')) return { gender: 'male', confident: true };

  // Tokenize on the RAW name first, then normalize just the first name — normKey
  // strips spaces, so normalizing the whole string first would fuse all tokens.
  const first = normKey(raw.split(/\s+/)[0]);
  if (!first) return { gender: 'male', confident: false };

  if (FEMALE.has(first)) return { gender: 'female', confident: true };
  if (AMBIGUOUS.has(first)) return { gender: 'male', confident: false };
  if (first.startsWith('عبد') || MALE.has(first)) return { gender: 'male', confident: true };

  // Unknown tail: in this dataset almost always male, but flag for review.
  return { gender: 'male', confident: false };
}
