export interface AuditLabelRegistry {
  entityLabels: Record<string, string>;
  referenceLabels: Record<string, string>;
  actionLabels: Record<string, string>;
}

const portableRegistry: AuditLabelRegistry = {
  entityLabels: {
    employee: 'موظف',
    payroll_run: 'مسيرة رواتب',
    final_settlement: 'تسوية نهائية',
    leave: 'إجازة',
    request: 'طلب موظف',
    private_file: 'ملف خاص',
  },
  referenceLabels: {
    employee: 'رقم الموظف',
    payroll_run: 'رقم المسيرة',
    final_settlement: 'رقم التسوية',
    leave: 'رقم الإجازة',
    request: 'رقم الطلب',
    private_file: 'معرّف الملف',
  },
  actionLabels: {
    create: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
    upsert: 'حفظ الإعدادات',
    approve: 'اعتماد',
    reject: 'رفض',
    post: 'ترحيل',
    pay: 'صرف',
    reverse: 'عكس',
    'create.failed': 'فشل الإضافة',
    'update.failed': 'فشل التعديل',
    'delete.failed': 'فشل الحذف',
  },
};

let registry = portableRegistry;

export function registerAuditLabelRegistry(extension: Partial<AuditLabelRegistry>): void {
  registry = {
    entityLabels: { ...portableRegistry.entityLabels, ...extension.entityLabels },
    referenceLabels: { ...portableRegistry.referenceLabels, ...extension.referenceLabels },
    actionLabels: { ...portableRegistry.actionLabels, ...extension.actionLabels },
  };
}

export const auditEntityFilters = () => Object.entries(registry.entityLabels);
export const auditEntityLabel = (key: string) => registry.entityLabels[key] ?? 'سجل تشغيلي';
export const auditReferenceLabel = (key: string) => registry.referenceLabels[key] ?? 'مرجع العملية';
export const auditActionLabel = (key: string) => registry.actionLabels[key] ?? 'إجراء تشغيلي';
