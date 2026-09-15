/* eslint-disable no-console */
/**
 * Idempotent reference-catalog seed — safe to run on production after migrate.
 * Fills dropdown catalogs when tables are empty or missing expected rows.
 * Does NOT truncate operational data.
 */
import { prisma, log } from './_shared';

type DeptSection = { parentTitle: string; title: string; fromCode: number; toCode: number; order: number };

const DEPT_SECTIONS: DeptSection[] = [
  { parentTitle: 'الإدارة العليا', title: 'مكتب المدير العام', fromCode: 101, toCode: 109, order: 1 },
  { parentTitle: 'الموارد البشرية', title: 'قسم التوظيف', fromCode: 201, toCode: 209, order: 1 },
  { parentTitle: 'الموارد البشرية', title: 'قسم الرواتب', fromCode: 210, toCode: 219, order: 2 },
  { parentTitle: 'الموارد البشرية', title: 'قسم الشؤون الإدارية', fromCode: 220, toCode: 229, order: 3 },
  { parentTitle: 'المالية والحسابات', title: 'قسم المحاسبة', fromCode: 301, toCode: 309, order: 1 },
  { parentTitle: 'المالية والحسابات', title: 'قسم الخزينة', fromCode: 310, toCode: 319, order: 2 },
  { parentTitle: 'التشغيل والصالات', title: 'قسم تشغيل الصالة', fromCode: 401, toCode: 409, order: 1 },
  { parentTitle: 'التشغيل والصالات', title: 'قسم المعدات', fromCode: 410, toCode: 419, order: 2 },
  { parentTitle: 'المبيعات والاستقبال', title: 'قسم الاستقبال', fromCode: 501, toCode: 509, order: 1 },
  { parentTitle: 'المبيعات والاستقبال', title: 'قسم المبيعات', fromCode: 510, toCode: 519, order: 2 },
  { parentTitle: 'التدريب واللياقة', title: 'قسم التدريب الشخصي', fromCode: 601, toCode: 609, order: 1 },
  { parentTitle: 'التدريب واللياقة', title: 'قسم الحصص الجماعية', fromCode: 610, toCode: 619, order: 2 },
  { parentTitle: 'المخازن والمشتريات', title: 'قسم المستودعات', fromCode: 701, toCode: 709, order: 1 },
  { parentTitle: 'المخازن والمشتريات', title: 'قسم المشتريات', fromCode: 710, toCode: 719, order: 2 },
  { parentTitle: 'الصيانة والمرافق', title: 'قسم الصيانة', fromCode: 801, toCode: 809, order: 1 },
  { parentTitle: 'الصيانة والمرافق', title: 'قسم النظافة', fromCode: 810, toCode: 819, order: 2 },
];

const NATIONALITIES: Array<{ title: string; order: number }> = [
  { title: 'مصري', order: 1 },
  { title: 'سوري', order: 2 },
  { title: 'يمني', order: 3 },
  { title: 'أردني', order: 4 },
  { title: 'فلسطيني', order: 5 },
  { title: 'لبناني', order: 6 },
  { title: 'عراقي', order: 7 },
  { title: 'سوداني', order: 8 },
  { title: 'تونسي', order: 9 },
  { title: 'جزائري', order: 10 },
  { title: 'مغربي', order: 11 },
  { title: 'ليبي', order: 12 },
  { title: 'فلبيني', order: 13 },
  { title: 'هندي', order: 14 },
  { title: 'باكستاني', order: 15 },
  { title: 'بنجلاديشي', order: 16 },
  { title: 'نيبالي', order: 17 },
  { title: 'إندونيسي', order: 18 },
  { title: 'سريلانكي', order: 19 },
  { title: 'تركي', order: 20 },
  { title: 'إيراني', order: 21 },
  { title: 'أفغاني', order: 22 },
  { title: 'إثيوبي', order: 23 },
  { title: 'إريتري', order: 24 },
  { title: 'نيجيري', order: 25 },
  { title: 'أمريكي', order: 26 },
  { title: 'بريطاني', order: 27 },
  { title: 'فرنسي', order: 28 },
  { title: 'أخرى', order: 99 },
];

const EMPLOYEE_LOOKUPS: Array<{ title: string; type: number; type_name: string; order: number }> = [
  { title: 'ذكر', type: 1, type_name: 'الجنس', order: 1 },
  { title: 'أنثى', type: 1, type_name: 'الجنس', order: 2 },
  ...NATIONALITIES.map((n) => ({ title: n.title, type: 2, type_name: 'الجنسية', order: n.order })),
  { title: 'مسلم', type: 3, type_name: 'الديانة', order: 1 },
  { title: 'مسيحي', type: 3, type_name: 'الديانة', order: 2 },
  { title: 'أعزب', type: 4, type_name: 'الحالة الاجتماعية', order: 1 },
  { title: 'متزوج', type: 4, type_name: 'الحالة الاجتماعية', order: 2 },
  { title: 'مطلق', type: 4, type_name: 'الحالة الاجتماعية', order: 3 },
  { title: 'أرمل', type: 4, type_name: 'الحالة الاجتماعية', order: 4 },
  { title: 'بطاقة الرقم القومي', type: 5, type_name: 'نوع الهوية', order: 1 },
  { title: 'جواز سفر', type: 5, type_name: 'نوع الهوية', order: 2 },
  { title: 'بطاقة شخصية', type: 5, type_name: 'نوع الهوية', order: 3 },
  { title: 'مصلحة الأحوال المدنية', type: 6, type_name: 'جهات إصدار الهوية', order: 1 },
  { title: 'جوازات و الهجرة', type: 6, type_name: 'جهات إصدار الهوية', order: 2 },
  { title: 'دوام صباحي', type: 9, type_name: 'الدوامات', order: 1 },
  { title: 'دوام مسائي', type: 9, type_name: 'الدوامات', order: 2 },
  { title: 'دوام كامل', type: 9, type_name: 'الدوامات', order: 3 },
  { title: 'عقد دوام كامل', type: 10, type_name: 'العقود', order: 1 },
  { title: 'عقد جزئي', type: 10, type_name: 'العقود', order: 2 },
  { title: 'عقد مؤقت', type: 10, type_name: 'العقود', order: 3 },
  { title: 'بكالوريوس', type: 14, type_name: 'الدرجات العلمية', order: 1 },
  { title: 'ماجستير', type: 14, type_name: 'الدرجات العلمية', order: 2 },
  { title: 'دبلوم', type: 14, type_name: 'الدرجات العلمية', order: 3 },
  { title: 'ثانوي', type: 14, type_name: 'الدرجات العلمية', order: 4 },
  { title: 'بكالوريوس', type: 15, type_name: 'المؤهل العلمي', order: 1 },
  { title: 'دبلوم', type: 15, type_name: 'المؤهل العلمي', order: 2 },
  { title: 'ثانوي', type: 15, type_name: 'المؤهل العلمي', order: 3 },
];

const DEFINED_SETTINGS: Array<{ title: string; type: number; typeTitle: string; order: number }> = [
  { title: 'بدل سكن', type: 1, typeTitle: 'allowances', order: 1 },
  { title: 'بدل نقل', type: 1, typeTitle: 'allowances', order: 2 },
  { title: 'بدل هاتف', type: 1, typeTitle: 'allowances', order: 3 },
  { title: 'بدل طبيعة عمل', type: 1, typeTitle: 'allowances', order: 4 },
  { title: 'حافز أداء', type: 1, typeTitle: 'allowances', order: 5 },
  { title: 'خصم تأمينات', type: 2, typeTitle: 'deduction', order: 1 },
  { title: 'خصم سلفة', type: 2, typeTitle: 'deduction', order: 2 },
  { title: 'خصم غياب', type: 2, typeTitle: 'deduction', order: 3 },
  { title: 'خصم تأخير', type: 2, typeTitle: 'deduction', order: 4 },
  { title: 'خصم جزاءات', type: 2, typeTitle: 'deduction', order: 5 },
  { title: 'عقد دائم', type: 3, typeTitle: 'type_contract', order: 1 },
  { title: 'عقد مؤقت', type: 3, typeTitle: 'type_contract', order: 2 },
  { title: 'مدرب', type: 4, typeTitle: 'job_role', order: 1 },
  { title: 'موظف استقبال', type: 4, typeTitle: 'job_role', order: 2 },
  { title: 'محاسب', type: 4, typeTitle: 'job_role', order: 3 },
];

const CUSTOMER_SOURCES = [
  'Facebook',
  'Instagram',
  'صديق',
  'إعلان',
  'Google',
  'Walk-in',
  'زيارة مباشرة',
  'توصية مدرب',
];

const EVENT_CATEGORIES: Array<{
  nameAr: string;
  nameEn: string;
  kind: 'competition' | 'workshop' | 'open_day' | 'seminar' | 'community' | 'challenge';
  color: string;
}> = [
  { nameAr: 'بطولة', nameEn: 'Competition', kind: 'competition', color: '#ef4444' },
  { nameAr: 'ورشة تدريب', nameEn: 'Workshop', kind: 'workshop', color: '#3b82f6' },
  { nameAr: 'يوم مفتوح', nameEn: 'Open Day', kind: 'open_day', color: '#22c55e' },
  { nameAr: 'ندوة', nameEn: 'Seminar', kind: 'seminar', color: '#a855f7' },
  { nameAr: 'فعالية مجتمعية', nameEn: 'Community', kind: 'community', color: '#f59e0b' },
  { nameAr: 'تحدي لياقة', nameEn: 'Challenge', kind: 'challenge', color: '#06b6d4' },
];

const MEMBERSHIP_TYPES = [
  { name: 'عضوية شهرية', price: 300, duration_days: 30 },
  { name: 'عضوية ربع سنوية', price: 800, duration_days: 90 },
  { name: 'عضوية نصف سنوية', price: 1500, duration_days: 180 },
  { name: 'عضوية سنوية', price: 2700, duration_days: 365 },
  { name: 'عضوية طلابية', price: 200, duration_days: 30 },
];

const SUBSCRIPTION_TYPES = [
  { name: 'اشتراك شهر واحد', price: 350, days: 30, sessions: null as number | null },
  { name: 'اشتراك 3 أشهر', price: 900, days: 90, sessions: null },
  { name: 'اشتراك 6 أشهر', price: 1600, days: 180, sessions: null },
  { name: 'اشتراك سنوي VIP', price: 3000, days: 365, sessions: null },
  { name: 'باقة 12 حصة', price: 600, days: 30, sessions: 12 },
  { name: 'اشتراك طلابي', price: 250, days: 30, sessions: null },
  { name: 'عرض الصيف', price: 500, days: 60, sessions: null },
];

const LOCKER_TYPES = [
  { name: 'خزانة شهرية', meta: 100, mta: 50, days: 30 },
  { name: 'خزانة ربع سنوية', meta: 250, mta: 120, days: 90 },
  { name: 'خزانة سنوية', meta: 800, mta: 400, days: 365 },
];

const BOOKING_SERVICES = [
  { name: 'تدريب شخصي', price: 250 },
  { name: 'حجز صالة', price: 150 },
  { name: 'حصة جماعية', price: 80 },
];

const DISTRICTS_BY_CITY: Record<string, string[]> = {
  القاهرة: ['مدينة نصر', 'المعادي', 'مصر الجديدة', 'التجمع الخامس'],
  الجيزة: ['الدقي', 'المهندسين', '6 أكتوبر', 'الشيخ زايد'],
  الإسكندرية: ['سموحة', 'ستانلي', 'ميامي', 'العجمي'],
  '6 أكتوبر': ['حي أول', 'حي ثاني', 'الحصري'],
};

const EGYPTIAN_BANKS = [
  'البنك الأهلي المصري',
  'بنك مصر',
  'CIB',
  'QNB الأهلي',
  'بنك الإسكندرية',
  'بنك القاهرة',
  'بنك التعمير والإسكان',
];

async function ensureEgyptianCities() {
  const cityNames = ['القاهرة', 'الجيزة', 'الإسكندرية', '6 أكتوبر'];
  let added = 0;
  for (let i = 0; i < cityNames.length; i++) {
    const name = cityNames[i];
    const exists = await prisma.cities.findFirst({ where: { name, from_id_fk: 0 } });
    if (exists) continue;
    await prisma.cities.create({ data: { name, from_id_fk: 0, in_order: String(i) } });
    added += 1;
  }
  return added;
}

async function ensureBanks() {
  let added = 0;
  for (const name of EGYPTIAN_BANKS) {
    const exists = await prisma.banks.findFirst({ where: { bank_name: name } });
    if (exists) continue;
    await prisma.banks.create({ data: { bank_name: name } });
    added += 1;
  }
  return added;
}

/** Normalize currency/locale on existing installs (Saudi defaults → Egypt). */
async function ensureEgyptLocale() {
  await prisma.global_settings.updateMany({
    where: { OR: [{ currency: 'EGP' }, { currency_symbol: 'ج.م' }] },
    data: { currency: 'EGP', currency_symbol: 'ج.م', timezone: 'Africa/Cairo' },
  });
  await prisma.sales_pos_settings.updateMany({
    where: { setting_key: 'currency', setting_value: 'EGP' },
    data: { setting_value: 'EGP' },
  });
  await prisma.acc_settings.updateMany({
    where: { base_currency: 'EGP' },
    data: { base_currency: 'EGP' },
  });
  return 1;
}

async function ensureDeptSections() {
  let added = 0;
  for (const s of DEPT_SECTIONS) {
    const parent = await prisma.hr_edarat_aqsam.findFirst({
      where: { title: s.parentTitle, from_id_fk: 0 },
    });
    if (!parent) continue;
    const exists = await prisma.hr_edarat_aqsam.findFirst({
      where: { title: s.title, from_id_fk: parent.id },
    });
    if (exists) continue;
    await prisma.hr_edarat_aqsam.create({
      data: {
        title_id: 0,
        title_code: s.fromCode,
        title: s.title,
        from_id_fk: parent.id,
        trteeb: s.order,
        from_code: s.fromCode,
        to_code: s.toCode,
      },
    });
    added += 1;
  }
  return added;
}

async function ensureEmployeeLookups() {
  let added = 0;
  for (const row of EMPLOYEE_LOOKUPS) {
    const exists = await prisma.employees_settings.findFirst({
      where: { title_setting: row.title, type: row.type },
    });
    if (exists) continue;
    await prisma.employees_settings.create({
      data: {
        title_setting: row.title,
        type: row.type,
        type_name: row.type_name,
        in_order: row.order,
      },
    });
    added += 1;
  }
  return added;
}

async function ensureDefinedSettings() {
  let added = 0;
  for (const row of DEFINED_SETTINGS) {
    const exists = await prisma.all_defined_setting.findFirst({
      where: { defined_title: row.title, defined_type: row.type, defined_type_title: row.typeTitle },
    });
    if (exists) continue;
    await prisma.all_defined_setting.create({
      data: {
        defined_title: row.title,
        defined_type: row.type,
        defined_type_title: row.typeTitle,
        in_order: String(row.order),
      },
    });
    added += 1;
  }
  return added;
}

async function ensureDistricts() {
  let added = 0;
  for (const [cityName, districts] of Object.entries(DISTRICTS_BY_CITY)) {
    const city = await prisma.cities.findFirst({ where: { name: cityName, from_id_fk: 0 } });
    if (!city) continue;
    let order = 1;
    for (const d of districts) {
      const exists = await prisma.cities.findFirst({ where: { name: d, from_id_fk: city.id } });
      if (!exists) {
        await prisma.cities.create({ data: { name: d, from_id_fk: city.id, in_order: String(order) } });
        added += 1;
      }
      order += 1;
    }
  }
  return added;
}

async function ensureCustomerSources() {
  let added = 0;
  for (const name of CUSTOMER_SOURCES) {
    const exists = await prisma.club_customer_sources.findFirst({ where: { name } });
    if (!exists) {
      await prisma.club_customer_sources.create({ data: { name, is_active: true } });
      added += 1;
    }
  }
  return added;
}

async function safeCount(fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function safeFindFirst<T>(fn: () => Promise<T | null>): Promise<T | null | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

async function ensureEventCategories() {
  let added = 0;
  for (const c of EVENT_CATEGORIES) {
    const exists = await safeFindFirst(() =>
      prisma.club_event_categories.findFirst({ where: { name_ar: c.nameAr } }),
    );
    if (exists === undefined) return 0;
    if (exists) continue;
    await prisma.club_event_categories.create({
      data: {
        name_ar: c.nameAr,
        name_en: c.nameEn,
        kind: c.kind,
        color: c.color,
        is_active: true,
        show_in_app: true,
      },
    });
    added += 1;
  }
  return added;
}

async function ensureMembershipTypes() {
  const count = await safeCount(() => prisma.club_membership_types.count());
  if (count === null || count > 0) return 0;
  for (const m of MEMBERSHIP_TYPES) {
    await prisma.club_membership_types.create({
      data: { name: m.name, price: m.price, duration_days: m.duration_days, is_active: true },
    });
  }
  return MEMBERSHIP_TYPES.length;
}

async function ensureSubscriptionTypes() {
  const count = await safeCount(() => prisma.club_subscription_types.count());
  if (count === null || count > 0) return 0;
  for (const t of SUBSCRIPTION_TYPES) {
    await prisma.club_subscription_types.create({
      data: {
        name: t.name,
        price: t.price,
        days: t.days,
        is_linked_to_sessions: t.sessions != null,
        sessions_count: t.sessions,
        is_active: true,
      },
    });
  }
  return SUBSCRIPTION_TYPES.length;
}

async function ensureLockerTypes() {
  const count = await safeCount(() => prisma.club_locker_subscription_types.count());
  if (count === null || count > 0) return 0;
  for (const l of LOCKER_TYPES) {
    await prisma.club_locker_subscription_types.create({
      data: {
        name: l.name,
        meta_value: l.meta,
        mta_value: l.mta,
        days: l.days,
        is_active: true,
      },
    });
  }
  return LOCKER_TYPES.length;
}

async function ensureInbodyServices() {
  // Prices are business-owned settings. Never insert placeholder prices into a real database.
  return 0;
}

async function ensureBookingServices() {
  let added = 0;
  for (const s of BOOKING_SERVICES) {
    const exists = await safeFindFirst(() => prisma.sales_booking_services.findFirst({ where: { name: s.name } }));
    if (exists === undefined) return 0;
    if (exists) continue;
    await prisma.sales_booking_services.create({
      data: { name: s.name, price: s.price, is_active: true },
    });
    added += 1;
  }
  return added;
}

/** Top-level departments when org table is completely empty (minimal bootstrap). */
async function ensureTopDepartments() {
  const count = await prisma.hr_edarat_aqsam.count();
  if (count > 0) return 0;
  const defs = [
    'الإدارة العليا',
    'الموارد البشرية',
    'المالية والحسابات',
    'التشغيل والصالات',
    'المبيعات والاستقبال',
    'التدريب واللياقة',
    'المخازن والمشتريات',
    'الصيانة والمرافق',
  ];
  let code = 100;
  for (let i = 0; i < defs.length; i++) {
    await prisma.hr_edarat_aqsam.create({
      data: {
        title_id: 0,
        title_code: code,
        title: defs[i],
        from_id_fk: 0,
        trteeb: i + 1,
        from_code: code,
        to_code: code + 99,
      },
    });
    code += 100;
  }
  return defs.length;
}

export async function seedReferenceCatalogs(): Promise<void> {
  console.log('▶ Reference catalogs (idempotent)…');
  const stats = {
    topDepts: await ensureTopDepartments(),
    sections: await ensureDeptSections(),
    lookups: await ensureEmployeeLookups(),
    defined: await ensureDefinedSettings(),
    banks: await ensureBanks(),
    egyptCities: await ensureEgyptianCities(),
    egyptLocale: await ensureEgyptLocale(),
    districts: await ensureDistricts(),
    customerSources: await ensureCustomerSources(),
    eventCategories: await ensureEventCategories(),
    membershipTypes: await ensureMembershipTypes(),
    subscriptionTypes: await ensureSubscriptionTypes(),
    lockerTypes: await ensureLockerTypes(),
    inbodyServices: await ensureInbodyServices(),
    bookingServices: await ensureBookingServices(),
  };
  log('reference', JSON.stringify(stats));
  console.log('✔ Reference catalogs done');
}

if (require.main === module) {
  seedReferenceCatalogs()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
