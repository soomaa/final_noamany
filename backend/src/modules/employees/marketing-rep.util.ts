import { Prisma } from '@prisma/client';

/** Job title (المسمى الوظيفي) for club member «أخصائي مبيعات» dropdown + sales-scope filter. */
export const SALES_SPECIALIST_JOB_TITLE = 'أخصائي مبيعات';

/** Legacy title kept for matching existing employee rows. */
export const LEGACY_SALES_SPECIALIST_TITLES = ['مسؤول تسويق', 'مندوب المبيعات'] as const;

export const ARABIC_SALES_SPECIALIST_TITLES = [
  'اخصائي مبيعات',
  'مسؤول مبيعات',
  'مسئول مبيعات',
  'مندوب مبيعات',
  'سيلز',
  'سيلز مان',
] as const;

export const ENGLISH_SALES_SPECIALIST_TITLES = [
  'sales',
  'sales specialist',
  'sales representative',
] as const;

export const SALES_SPECIALIST_JOB_TITLES = [
  SALES_SPECIALIST_JOB_TITLE,
  ...LEGACY_SALES_SPECIALIST_TITLES,
  ...ARABIC_SALES_SPECIALIST_TITLES,
  ...ENGLISH_SALES_SPECIALIST_TITLES,
] as const;

/** @deprecated Use SALES_SPECIALIST_JOB_TITLE */
export const MARKETING_REP_JOB_TITLE = SALES_SPECIALIST_JOB_TITLE;

export const marketingRepJobTitleWhere: Prisma.department_jobsWhereInput = {
  OR: [
    ...[
      SALES_SPECIALIST_JOB_TITLE,
      ...LEGACY_SALES_SPECIALIST_TITLES,
      ...ARABIC_SALES_SPECIALIST_TITLES.filter((title) => title !== 'سيلز' && title !== 'سيلز مان'),
    ]
      .flatMap((title) => [{ name: title }, { name: { contains: title } }]),
    { name: 'سيلز' },
    { name: 'سيلز مان' },
    ...ENGLISH_SALES_SPECIALIST_TITLES.map((title) => ({ name: title })),
  ],
};

function normalizeJobTitle(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function isMarketingRepJobTitle(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const n = normalizeJobTitle(name);
  if (/(^|\s)(مدير|رئيس|رييس|مشرف)(\s|$)/.test(n) || /\b(manager|head|supervisor)\b/.test(n)) {
    return false;
  }
  if (ENGLISH_SALES_SPECIALIST_TITLES.includes(n as (typeof ENGLISH_SALES_SPECIALIST_TITLES)[number])) {
    return true;
  }
  return /(مبيعات|تسويق|سيلز)/.test(n);
}

export function marketingRepEmployeeWhere(jobIds: number[]): Prisma.employeesWhereInput {
  const titleMatch: Prisma.employeesWhereInput[] = [
    ...[
      SALES_SPECIALIST_JOB_TITLE,
      ...LEGACY_SALES_SPECIALIST_TITLES,
      ...ARABIC_SALES_SPECIALIST_TITLES.filter((title) => title !== 'سيلز' && title !== 'سيلز مان'),
    ]
      .flatMap((title) => [{ mosma_wazefy_n: title }, { mosma_wazefy_n: { contains: title } }]),
    { mosma_wazefy_n: 'سيلز' },
    { mosma_wazefy_n: 'سيلز مان' },
    ...ENGLISH_SALES_SPECIALIST_TITLES.map((title) => ({ mosma_wazefy_n: title })),
  ];
  return {
    OR: [...(jobIds.length ? [{ mosma_wazefy_code: { in: jobIds } }] : []), ...titleMatch],
  };
}
