import { uiStatic } from '@/lib/ui-static';
export const REQUEST_TYPES = {
  leave: { key: 'leave', label: uiStatic('طلب إجازة'), path: '/requests/new/leave' },
  permission: { key: 'permission', label: uiStatic('طلب إذن'), path: '/requests/new/permission' },
  advance: { key: 'advance', label: uiStatic('طلب سلفة'), path: '/requests/new/advance' },
  loan: { key: 'loan', label: uiStatic('طلب قرض'), path: '/requests/new/loan' },
  allowance: { key: 'allowance', label: uiStatic('طلب بدل'), path: '/requests/new/allowance' },
  'salary-certificate': { key: 'salary-certificate', label: uiStatic('تعريف مرتب'), path: '/requests/new/salary-certificate', printable: true },
  resignation: { key: 'resignation', label: uiStatic('طلب استقالة'), path: '/requests/new/resignation' },
  transfer: { key: 'transfer', label: uiStatic('طلب نقل'), path: '/requests/new/transfer' },
  promotion: { key: 'promotion', label: uiStatic('طلب ترقية'), path: '/requests/new/promotion' },
  'data-change': { key: 'data-change', label: uiStatic('طلب تعديل بيانات'), path: '/requests/new/data-change' },
} as const;

export type RequestTypeKey = keyof typeof REQUEST_TYPES;

export const ALERT_TYPES = [
  { key: 'contractExpiring', label: uiStatic('انتهاء العقد'), icon: 'contract' },
  { key: 'residencyExpiring', label: uiStatic('انتهاء البطاقة'), icon: 'iqama' },
  { key: 'insuranceExpiring', label: uiStatic('انتهاء التأمين'), icon: 'insurance' },
  { key: 'probationEnding', label: uiStatic('انتهاء فترة التجربة'), icon: 'probation' },
  { key: 'birthdays', label: uiStatic('أعياد الميلاد'), icon: 'birthday' },
] as const;

export const PAYROLL_COMPONENTS = [
  { key: 'basic', label: uiStatic('الراتب الأساسي'), category: 'earning' },
  { key: 'housing', label: uiStatic('بدل السكن'), category: 'allowance' },
  { key: 'transport', label: uiStatic('بدل الانتقالات'), category: 'allowance' },
  { key: 'phone', label: uiStatic('بدل الهاتف'), category: 'allowance' },
  { key: 'food', label: uiStatic('بدل الطعام'), category: 'allowance' },
  { key: 'risk', label: uiStatic('بدل المخاطر'), category: 'allowance' },
  { key: 'rewards', label: uiStatic('المكافآت'), category: 'earning' },
  { key: 'commissions', label: uiStatic('العمولات'), category: 'earning' },
  { key: 'incentives', label: uiStatic('الحوافز'), category: 'earning' },
  { key: 'deductions', label: uiStatic('الخصومات'), category: 'deduction' },
  { key: 'advances', label: uiStatic('السلف'), category: 'deduction' },
  { key: 'penalties', label: uiStatic('الجزاءات'), category: 'deduction' },
  { key: 'insurance', label: uiStatic('التأمينات'), category: 'deduction' },
  { key: 'tax', label: uiStatic('الضرائب'), category: 'deduction' },
  { key: 'loans', label: uiStatic('القروض'), category: 'deduction' },
] as const;

export const ATTENDANCE_CHANNELS = [
  { key: 'device', label: uiStatic('جهاز البصمة') },
  { key: 'app', label: uiStatic('التطبيق') },
  { key: 'gps', label: 'GPS' },
  { key: 'qr', label: 'QR Code' },
  { key: 'nfc', label: 'NFC' },
  { key: 'face', label: 'Face Recognition' },
] as const;

export const ATTENDANCE_RULES = [
  { key: 'late', label: uiStatic('التأخير') },
  { key: 'early_leave', label: uiStatic('الانصراف المبكر') },
  { key: 'absence', label: uiStatic('الغياب') },
  { key: 'overtime', label: uiStatic('العمل الإضافي') },
  { key: 'weekly_rest', label: uiStatic('الراحة الأسبوعية') },
  { key: 'holidays', label: uiStatic('العطلات الرسمية') },
  { key: 'flexible_hours', label: uiStatic('ساعات العمل المرنة') },
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  device: uiStatic('بصمة'),
  app: uiStatic('تطبيق'),
  gps: 'GPS',
  qr: 'QR',
  nfc: 'NFC',
  face: 'Face',
};
