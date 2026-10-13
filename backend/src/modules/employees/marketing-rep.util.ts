import { Prisma } from '@prisma/client';

/** Job title (المسمى الوظيفي) for club member «أخصائي مبيعات» dropdown + sales-scope filter. */
export const SALES_SPECIALIST_JOB_TITLE = 'أخصائي مبيعات';

/** Legacy title kept for matching existing employee rows. */
export const LEGACY_SALES_SPECIALIST_TITLES = ['مسؤول تسويق', 'مندوب المبيعات'] as const;

export const SALES_SPECIALIST_JOB_TITLES = [SALES_SPECIALIST_JOB_TITLE, ...LEGACY_SALES_SPECIALIST_TITLES] as const;

/** @deprecated Use SALES_SPECIALIST_JOB_TITLE */
export const MARKETING_REP_JOB_TITLE = SALES_SPECIALIST_JOB_TITLE;

export const marketingRepJobTitleWhere: Prisma.department_jobsWhereInput = {
  OR: SALES_SPECIALIST_JOB_TITLES.flatMap((title) => [
    { name: title },
    { name: { contains: title } },
  ]),
};

export function isMarketingRepJobTitle(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const n = name.trim();
  return SALES_SPECIALIST_JOB_TITLES.some((title) => n === title || n.includes(title));
}

export function marketingRepEmployeeWhere(jobIds: number[]): Prisma.employeesWhereInput {
  const titleMatch = SALES_SPECIALIST_JOB_TITLES.flatMap((title) => [
    { mosma_wazefy_n: title },
    { mosma_wazefy_n: { contains: title } },
  ]);
  return {
    OR: [...(jobIds.length ? [{ mosma_wazefy_code: { in: jobIds } }] : []), ...titleMatch],
  };
}
