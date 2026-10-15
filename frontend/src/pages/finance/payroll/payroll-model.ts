import type { PayrollAction, PayrollStatus } from './types';
import { uiStatic } from '@/lib/ui-static';

export const payrollStatusLabels: Record<PayrollStatus, string> = {
  draft: uiStatic('مسودة'), computed: uiStatic('محتسبة'), reviewing: uiStatic('قيد المراجعة'), approved: uiStatic('معتمدة'),
  posted: uiStatic('مرحّلة للمحاسبة'), bank_prepared: uiStatic('ملف البنك جاهز'), banked: uiStatic('تمت التسوية البنكية'), completed: uiStatic('مكتملة'),
};
export const payrollActionLabels: Record<PayrollAction, string> = {
  compute: uiStatic('إعادة احتساب الرواتب'), submit: uiStatic('إرسال للمراجعة'), approve: uiStatic('اعتماد المرتبات'),
  post: uiStatic('ترحيل مصروف الرواتب'), bank: uiStatic('تجهيز ملف البنك'), 'bank-sync': uiStatic('التحقق من التسوية البنكية'),
};
export const payrollActionDescriptions: Record<PayrollAction, string> = {
  compute: uiStatic('تُعاد قراءة الحضور والاستحقاقات والخصومات والضريبة وفق سياسة الرواتب الحالية.'),
  submit: uiStatic('يتحدث حساب الحضور والاستحقاقات مع الحفاظ على حركاتك، ثم تنتقل المرتبات للمراجعة قبل الاعتماد.'),
  approve: uiStatic('تُعتمد المرتبات بعد المراجعة. يُسجل مصروف الرواتب في خطوة الترحيل التالية.'),
  post: uiStatic('يُسجل مصروف الرواتب والقيد المحاسبي لكل فرع، مع تسوية الخصومات المرتبطة بالمرتبات.'),
  bank: uiStatic('يُجهز ملف البنك للاستيراد. تظل الرواتب بانتظار تأكيد التسوية البنكية.'),
  'bank-sync': uiStatic('يُتحقق من تأكيد البنك لتسوية كامل صافي الرواتب قبل تسجيل الصرف.'),
};
export function payrollActions(status: PayrollStatus, mode: 'preparation' | 'approval'): PayrollAction[] {
  if (mode === 'preparation') return status === 'draft' ? ['compute'] : status === 'computed' ? ['compute', 'submit'] : status === 'reviewing' ? ['compute'] : [];
  return status === 'reviewing' ? ['approve'] : status === 'approved' ? ['post'] : status === 'posted' ? ['bank'] : status === 'bank_prepared' ? ['bank-sync'] : [];
}
export function payrollActionPermission(action: PayrollAction) {
  return action === 'approve' ? 'payroll.runs:approve' : 'payroll.runs:execute';
}
export function payrollPeriodLabel(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return '';
  const [year, value] = month.split('-').map(Number);
  return `${month}-01 — ${month}-${new Date(Date.UTC(year, value, 0)).getUTCDate()}`;
}
