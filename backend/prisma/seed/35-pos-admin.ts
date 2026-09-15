/* eslint-disable no-console */
/**
 * POS admin configuration (sales/pos-admin): devices, payment methods, invoice &
 * report templates, notification rules, and key/value settings.
 */
import {
  prisma, clearTables, log, pick, getBranchIds, BASE,
} from './_shared';

export async function seedPosAdmin(): Promise<void> {
  console.log('▶ POS admin…');
  await clearTables([
    'sales_pos_settings', 'sales_pos_notification_rules', 'sales_pos_report_templates',
    'sales_pos_invoice_templates', 'sales_pos_payment_methods', 'sales_pos_devices',
  ]);

  const branchIds = await getBranchIds();

  // Devices
  const devices = [
    { name: 'كاشير الاستقبال - رئيسي', type: 'terminal', printer: 'thermal' },
    { name: 'كاشير المتجر', type: 'desktop', printer: 'receipt' },
    { name: 'جهاز لوحي - المبيعات', type: 'tablet', printer: 'thermal' },
    { name: 'كاشير فرع السيدات', type: 'terminal', printer: 'thermal' },
  ];
  for (let i = 0; i < devices.length; i++) {
    await prisma.sales_pos_devices.create({
      data: {
        name: devices[i].name,
        serial_number: `POS-${1000 + i}`,
        device_type: devices[i].type as any,
        branch_id: branchIds[i % branchIds.length],
        cash_drawer_id: `DRW-${i + 1}`,
        ip_address: `192.168.1.${10 + i}`,
        printer_type: devices[i].printer as any,
        operating_system: pick(['Windows 11', 'Android 13', 'iPadOS 17']),
        software_version: '2.4.1',
        is_active: i !== 3 ? true : false,
        last_sync: BASE,
      },
    });
  }

  // Payment methods
  const methods = [
    { name: 'نقداً', code: 'cash', icon: 'cash' },
    { name: 'مدى', code: 'mada', icon: 'card' },
    { name: 'فيزا / ماستركارد', code: 'visa', icon: 'card' },
    { name: 'Apple Pay', code: 'apple_pay', icon: 'apple' },
    { name: 'تحويل بنكي', code: 'bank_transfer', icon: 'bank' },
    { name: 'محفظة العميل', code: 'wallet', icon: 'wallet' },
  ];
  for (let i = 0; i < methods.length; i++) {
    await prisma.sales_pos_payment_methods.create({
      data: {
        name: methods[i].name,
        name_en: methods[i].code,
        code: methods[i].code,
        icon: methods[i].icon,
        fees: methods[i].code === 'visa' ? 2.5 : 0,
        supports_mixed_payment: true,
        is_enabled: true,
        sort_order: i,
      },
    });
  }

  // Invoice templates
  await prisma.sales_pos_invoice_templates.create({
    data: {
      name: 'إيصال العميل', template_type: 'thermal', paper_size: '80mm',
      include_logo: true, include_footer: true, include_qr: false,
      header_text: 'إيصال بيع', footer_text: 'شكراً لزيارتكم',
      layout_config: {
        documentType: 'customer_receipt', autoPrint: true, copies: 1,
        printerName: 'طابعة إيصال العميل', showCustomer: false, showPrices: true,
        showPaymentMethod: true, showReceiptComment: true, fontScale: 'normal',
      },
      is_default: true, is_active: true, sort_order: 0,
    },
  });
  await prisma.sales_pos_invoice_templates.create({
    data: {
      name: 'تذكرة تحضير الكافيه', template_type: 'thermal', paper_size: '80mm',
      include_logo: false, include_footer: true, include_qr: false,
      header_text: 'طلب تحضير جديد', footer_text: 'تم الاستلام بواسطة فريق التحضير',
      layout_config: {
        documentType: 'kitchen_ticket', autoPrint: true, copies: 1,
        printerName: 'طابعة تحضير الكافيه', showCustomer: false, showPrices: false,
        showPaymentMethod: false, showReceiptComment: true, fontScale: 'large',
      },
      is_default: false, is_active: true, sort_order: 1,
    },
  });

  // Report templates
  const reports = [
    { name: 'تقرير المبيعات اليومي', type: 'sales', freq: 'daily', fmt: 'excel' },
    { name: 'تقرير الورديات', type: 'operational', freq: 'daily', fmt: 'pdf' },
    { name: 'تقرير المخزون الشهري', type: 'inventory', freq: 'monthly', fmt: 'excel' },
    { name: 'التقرير المالي الشهري', type: 'financial', freq: 'monthly', fmt: 'pdf' },
  ];
  for (let i = 0; i < reports.length; i++) {
    await prisma.sales_pos_report_templates.create({
      data: {
        name: reports[i].name,
        report_type: reports[i].type as any,
        frequency: reports[i].freq as any,
        format: reports[i].fmt as any,
        auto_generate: i < 2,
        retention_days: 90,
        is_active: true,
        sort_order: i,
      },
    });
  }

  // Notification rules
  const rules = [
    { name: 'تنبيه مبيعة كبيرة', type: 'transaction', trigger: 'sale_completed', prio: 'normal' },
    { name: 'تنبيه نقص المخزون', type: 'inventory', trigger: 'low_stock', prio: 'high' },
    { name: 'تنبيه إغلاق الوردية', type: 'system', trigger: 'shift_closed', prio: 'normal' },
  ];
  for (let i = 0; i < rules.length; i++) {
    await prisma.sales_pos_notification_rules.create({
      data: {
        name: rules[i].name,
        notification_type: rules[i].type as any,
        trigger: rules[i].trigger,
        channels: ['inapp', 'email'],
        priority: rules[i].prio as any,
        is_active: true,
        sort_order: i,
      },
    });
  }

  // Settings (key/value)
  const settings = [
    { cat: 'general', key: 'currency', val: 'EGP', type: 'string', grp: 'عام' },
    { cat: 'general', key: 'tax_rate', val: '15', type: 'number', grp: 'الضريبة' },
    { cat: 'general', key: 'enable_tax', val: 'true', type: 'boolean', grp: 'الضريبة' },
    { cat: 'receipt', key: 'receipt_footer', val: 'شكراً لزيارتكم Noamany Fitness Center', type: 'string', grp: 'الإيصال' },
    { cat: 'receipt', key: 'print_auto', val: 'true', type: 'boolean', grp: 'الإيصال' },
    { cat: 'shift', key: 'require_open_count', val: 'true', type: 'boolean', grp: 'الورديات' },
    { cat: 'shift', key: 'max_cash_variance', val: '50', type: 'number', grp: 'الورديات' },
  ];
  for (let i = 0; i < settings.length; i++) {
    await prisma.sales_pos_settings.create({
      data: {
        branch_id: null,
        category: settings[i].cat,
        setting_key: settings[i].key,
        setting_value: settings[i].val,
        setting_type: settings[i].type as any,
        group_name: settings[i].grp,
        is_system: settings[i].key === 'currency',
        is_active: true,
        sort_order: i,
      },
    });
  }

  log('pos-admin', `devices: ${devices.length}, methods: ${methods.length}, invoice tpls: 2, report tpls: ${reports.length}, rules: ${rules.length}, settings: ${settings.length}`);
  console.log('✔ POS admin done');
}

if (require.main === module) {
  seedPosAdmin()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
