/** Frontend request type keys ↔ hr_requests.type column values. */
export const REQUEST_TYPE_TO_DB: Record<string, string> = {
  leave: 'vacation',
  permission: 'ezn',
  advance: 'solaf',
  loan: 'loan',
  allowance: 'allowance',
  'salary-certificate': 'salary_cert',
  resignation: 'resignation',
  transfer: 'transfer',
  promotion: 'promotion',
  'data-change': 'data_change',
  overtime: 'overtime',
};

export const REQUEST_TYPE_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(REQUEST_TYPE_TO_DB).map(([k, v]) => [v, k]),
);

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: 'طلب إجازة',
  permission: 'طلب إذن',
  advance: 'طلب سلفة',
  loan: 'طلب قرض',
  allowance: 'طلب بدل',
  'salary-certificate': 'تعريف مرتب',
  resignation: 'طلب استقالة',
  transfer: 'طلب نقل',
  promotion: 'طلب ترقية',
  'data-change': 'طلب تعديل بيانات',
  overtime: 'طلب ساعات إضافية',
};

export function toDbRequestType(type: string): string {
  return REQUEST_TYPE_TO_DB[type] ?? type;
}

export function fromDbRequestType(type: string): string {
  return REQUEST_TYPE_FROM_DB[type] ?? type;
}

/**
 * Types that have their own approval chain: `POST /requests` hands them to that module
 * (leaves → LeavesService, permission → PermissionsService, overtime → OvertimeRequestsService)
 * instead of storing a flat hr_requests row.
 */
export const CHAIN_REQUEST_TYPES = ['leave', 'permission', 'overtime'] as const;
