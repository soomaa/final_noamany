/* eslint-disable no-console */
/**
 * Accounting + Finance + App-Management + System/Misc demo seed.
 *
 * Populates every page under:
 *   accounting/* (dashboard, chart-of-accounts, journal-entries, GL, trial-balance,
 *                 income-statement, balance-sheet, cash-flow, account-statement, settings)
 *   finance/*    (dashboard, expenses, revenues, reports, profit-loss, analysis)
 *   app-management/* (about, invitations, content-pages, offers/trainers/exercises/news/ads)
 *   agents, notifications, settings/{automation,webhooks,push,business-audit,app-users,backup},
 *   admin/audit, reports/*
 *
 * Journal entries are balanced (sum debit == sum credit per entry). Foundation
 * (branches/employees/users) is reused via loaders; RBAC is untouched.
 */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2, reseed,
  getBranchIds, getEmployees, getUsers,
  BASE, addDays, ymd, ymdhms,
  fullNameMale, fullNameFemale, phone as randPhone,
} from './_shared';
import { DEFAULT_CHART, seedAccountPayload } from '../../src/modules/accounting/accounts.seed';

// ---------------------------------------------------------------------------
export async function seedAccountingApp(): Promise<void> {
  console.log('▶ Accounting / Finance / App / System…');
  reseed(424242);

  // Children first.
  await clearTables([
    'automation_runs', 'automation_workflows',
    // accounting children -> parents
    'acc_journal_entry_lines', 'acc_journal_entries', 'acc_default_accounts',
    'acc_accounts', 'acc_accounting_periods', 'acc_settings',
    // finance
    'fin_expenses', 'fin_revenues',
    'finance_employes', 'contract_employe', 'bank_employes_details',
    // app-management
    'am_exercises', 'am_exercise_categories', 'am_trainers', 'am_offers',
    'am_news', 'am_ads', 'am_invitations', 'am_about_app', 'app_pages',
    // system / misc
    'permissions', 'pages',
    'users_notifications', 'tbl_notifications', 'tbl_sys_notifications_settings',
    'tbl_messages', 'tbl_agents', 'api_users', 'conf_area_setting',
    'webhook_deliveries', 'webhook_endpoints',
    'automation_runs', 'staff_tasks',
    'rbac_audit_log', 'business_audit_log',
  ]);

  const branchIds = await getBranchIds();
  const employees = await getEmployees();
  const users = await getUsers();
  const userIds = users.map((u) => u.user_id);
  const primaryBranch = branchIds[0] ?? 1;

  // =====================================================================
  // 1. ACCOUNTING
  // =====================================================================

  // 1a. settings (singleton, SAR)
  await prisma.acc_settings.create({
    data: {
      fiscal_year_start: '01-01',
      base_currency: 'EGP',
      currency_symbol: 'ج.م',
      require_approval: true,
      updated_at: BASE,
    },
  });

  // 1b. accounting periods — open period for 2026 + a couple of closed ones
  const periods = [
    { name: 'السنة المالية 2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' as const },
    { name: 'الربع الثاني 2026', start_date: '2026-04-01', end_date: '2026-06-30', status: 'open' as const },
    { name: 'السنة المالية 2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' as const },
  ];
  const periodRows: { id: number; start_date: string; end_date: string }[] = [];
  for (const p of periods) {
    const row = await prisma.acc_accounting_periods.create({
      data: {
        name: p.name,
        start_date: p.start_date,
        end_date: p.end_date,
        status: p.status,
        closed_by: p.status === 'closed' ? pick(userIds) : null,
        closed_at: p.status === 'closed' ? new Date('2026-01-05T10:00:00Z') : null,
        updated_at: BASE,
      },
    });
    periodRows.push({ id: row.id, start_date: row.start_date, end_date: row.end_date });
  }
  const openPeriod2026 = periodRows[0]; // full-year open period

  // 1c. chart of accounts — reuse the app's definitions (accounts.seed.ts)
  const codeToId = new Map<string, number>();
  for (const def of DEFAULT_CHART) {
    const parentId = def.parentCode ? codeToId.get(def.parentCode) ?? null : null;
    const payload = seedAccountPayload(def, parentId);
    const acc = await prisma.acc_accounts.create({
      data: { ...payload, updated_at: BASE },
    });
    codeToId.set(def.code, acc.id);
  }

  // 1d. default accounts (LedgerService key resolution) — from defaultKey markers
  for (const def of DEFAULT_CHART) {
    if (!def.defaultKey) continue;
    await prisma.acc_default_accounts.create({
      data: { key: def.defaultKey, account_code: def.code, branch_id: null, updated_at: BASE },
    });
  }

  // Helper: postable account id by code
  const accId = (code: string) => {
    const id = codeToId.get(code);
    if (!id) throw new Error(`account code not found: ${code}`);
    return id;
  };

  // 1e. journal entries — balanced, posted, spread across recent months.
  // Each spec: date, description, reference, source, and balanced lines.
  type Line = { code: string; debit: number; credit: number; desc: string };
  const jeSpecs: {
    daysAgo: number;
    description: string;
    reference: string;
    source_module: string;
    source_doc_type: string;
    lines: Line[];
    status?: 'posted' | 'draft';
  }[] = [
    {
      daysAgo: 150,
      description: 'رأس مال افتتاحي للنادي',
      reference: 'OPEN-2026',
      source_module: 'manual',
      source_doc_type: 'opening_balance',
      lines: [
        { code: '1.01.002', debit: 500000, credit: 0, desc: 'إيداع رأس المال في البنك' },
        { code: '3.01', debit: 0, credit: 500000, desc: 'رأس المال' },
      ],
    },
    {
      daysAgo: 120,
      description: 'إيراد اشتراكات - شهر مارس',
      reference: 'SUB-2026-03',
      source_module: 'subscriptions',
      source_doc_type: 'subscription_invoice',
      lines: [
        { code: '1.01.001', debit: 86250, credit: 0, desc: 'تحصيل اشتراكات نقدًا' },
        { code: '4.01', debit: 0, credit: 75000, desc: 'إيرادات الاشتراكات' },
        { code: '2.01.002', debit: 0, credit: 11250, desc: 'ضريبة القيمة المضافة - مخرجات' },
      ],
    },
    {
      daysAgo: 95,
      description: 'مبيعات مكملات ومنتجات',
      reference: 'POS-2026-04',
      source_module: 'sales',
      source_doc_type: 'pos_sale',
      lines: [
        { code: '1.01.003', debit: 28750, credit: 0, desc: 'مبيعات ببطاقات ائتمان' },
        { code: '4.02', debit: 0, credit: 25000, desc: 'إيرادات المبيعات' },
        { code: '2.01.002', debit: 0, credit: 3750, desc: 'ضريبة القيمة المضافة - مخرجات' },
      ],
    },
    {
      daysAgo: 80,
      description: 'رواتب الموظفين - شهر أبريل',
      reference: 'PAY-2026-04',
      source_module: 'payroll',
      source_doc_type: 'payroll_run',
      lines: [
        { code: '5.01.001', debit: 62000, credit: 0, desc: 'مصروف رواتب' },
        { code: '1.01.002', debit: 0, credit: 62000, desc: 'صرف الرواتب من البنك' },
      ],
    },
    {
      daysAgo: 60,
      description: 'إيراد اشتراكات - شهر مايو',
      reference: 'SUB-2026-05',
      source_module: 'subscriptions',
      source_doc_type: 'subscription_invoice',
      lines: [
        { code: '1.01.004', debit: 103500, credit: 0, desc: 'تحصيل اشتراكات إلكترونيًا' },
        { code: '4.01', debit: 0, credit: 90000, desc: 'إيرادات الاشتراكات' },
        { code: '2.01.002', debit: 0, credit: 13500, desc: 'ضريبة القيمة المضافة - مخرجات' },
      ],
    },
    {
      daysAgo: 45,
      description: 'مصروفات إيجار وكهرباء',
      reference: 'EXP-2026-05',
      source_module: 'finance',
      source_doc_type: 'expense',
      lines: [
        { code: '5.01.001', debit: 34000, credit: 0, desc: 'إيجار ومرافق' },
        { code: '1.01.001', debit: 0, credit: 34000, desc: 'صرف نقدي' },
      ],
    },
    {
      daysAgo: 30,
      description: 'شراء بضاعة من مورد بالأجل',
      reference: 'PO-2026-06',
      source_module: 'procurement',
      source_doc_type: 'purchase_invoice',
      lines: [
        { code: '1.01.005', debit: 40000, credit: 0, desc: 'مخزون بضاعة' },
        { code: '1.01.007', debit: 6000, credit: 0, desc: 'ضريبة القيمة المضافة - مدخلات' },
        { code: '2.01.001', debit: 0, credit: 46000, desc: 'الدائنون / الموردون' },
      ],
    },
    {
      daysAgo: 20,
      description: 'إيراد اشتراكات - شهر يونيو',
      reference: 'SUB-2026-06',
      source_module: 'subscriptions',
      source_doc_type: 'subscription_invoice',
      lines: [
        { code: '1.01.001', debit: 57500, credit: 0, desc: 'تحصيل نقدي' },
        { code: '1.01.003', debit: 46000, credit: 0, desc: 'تحصيل ببطاقات' },
        { code: '4.01', debit: 0, credit: 90000, desc: 'إيرادات الاشتراكات' },
        { code: '2.01.002', debit: 0, credit: 13500, desc: 'ضريبة القيمة المضافة - مخرجات' },
      ],
    },
    {
      daysAgo: 12,
      description: 'سداد جزء من مستحقات الموردين',
      reference: 'PAY-SUP-2026-06',
      source_module: 'finance',
      source_doc_type: 'supplier_payment',
      lines: [
        { code: '2.01.001', debit: 30000, credit: 0, desc: 'تسوية الدائنون' },
        { code: '1.01.002', debit: 0, credit: 30000, desc: 'سداد من البنك' },
      ],
    },
    {
      daysAgo: 5,
      description: 'مصروفات صيانة أجهزة',
      reference: 'EXP-2026-06',
      source_module: 'finance',
      source_doc_type: 'expense',
      lines: [
        { code: '5.01.001', debit: 12500, credit: 0, desc: 'صيانة معدات رياضية' },
        { code: '1.01.001', debit: 0, credit: 12500, desc: 'صرف نقدي' },
      ],
    },
    {
      daysAgo: 2,
      description: 'قيد يومية تحت المراجعة (مسودة)',
      reference: 'DRAFT-2026-07',
      source_module: 'manual',
      source_doc_type: 'manual_entry',
      status: 'draft',
      lines: [
        { code: '5.01.001', debit: 5000, credit: 0, desc: 'مصروف تسويقي' },
        { code: '1.01.001', debit: 0, credit: 5000, desc: 'صرف نقدي' },
      ],
    },
  ];

  let jeSeq = 1;
  for (const spec of jeSpecs) {
    const totalDebit = round2(spec.lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(spec.lines.reduce((s, l) => s + l.credit, 0));
    const d = addDays(BASE, -spec.daysAgo);
    const status = spec.status ?? 'posted';
    const entryNo = `JE-2026-${String(jeSeq++).padStart(4, '0')}`;
    const entry = await prisma.acc_journal_entries.create({
      data: {
        entry_no: entryNo,
        date: ymd(d),
        period_id: openPeriod2026.id,
        branch_id: pick(branchIds),
        description: spec.description,
        reference: spec.reference,
        status,
        source_module: spec.source_module,
        source_doc_type: spec.source_doc_type,
        source_doc_id: `${spec.reference}`,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: pick(userIds),
        posted_by: status === 'posted' ? pick(userIds) : null,
        posted_at: status === 'posted' ? d : null,
        created_at: d,
        updated_at: d,
      },
    });
    let lineOrder = 0;
    for (const l of spec.lines) {
      await prisma.acc_journal_entry_lines.create({
        data: {
          entry_id: entry.id,
          account_id: accId(l.code),
          debit: l.debit,
          credit: l.credit,
          description: l.desc,
          line_order: lineOrder++,
          created_at: d,
        },
      });
    }
  }

  // =====================================================================
  // 2. FINANCE
  // =====================================================================

  const EXPENSE_CATS: { cat: string; sub: string }[] = [
    { cat: 'رواتب وأجور', sub: 'رواتب الموظفين' },
    { cat: 'إيجارات', sub: 'إيجار الفروع' },
    { cat: 'مرافق', sub: 'كهرباء ومياه' },
    { cat: 'صيانة', sub: 'صيانة الأجهزة القاهرةية' },
    { cat: 'تسويق', sub: 'حملات إعلانية' },
    { cat: 'مستلزمات', sub: 'مستلزمات النظافة' },
    { cat: 'اتصالات', sub: 'إنترنت وهاتف' },
    { cat: 'مصروفات إدارية', sub: 'قرطاسية ومكتب' },
  ];
  const PAY_METHODS = ['نقدي', 'تحويل بنكي', 'بطاقة'];
  // Match the literals used by finance.utils / services so dashboards bucket correctly.
  const EXPENSE_APPROVED = 'موافق عليه';
  const REVENUE_PAID = 'مدفوع';
  const EXP_PAY_STATUS = [REVENUE_PAID, 'معلق', 'مدفوع جزئياً'];

  let expSeq = 1;
  for (let i = 0; i < 16; i++) {
    const c = EXPENSE_CATS[i % EXPENSE_CATS.length];
    const amount = round2(randInt(1500, 45000));
    const tax = round2(amount * 0.15);
    const approval = i < 11 ? EXPENSE_APPROVED : pick(['قيد المراجعة', 'مرفوض']);
    const d = addDays(BASE, -randInt(1, 160));
    await prisma.fin_expenses.create({
      data: {
        expense_number: `EXP-2026-${String(expSeq++).padStart(4, '0')}`,
        expense_date: ymd(d),
        category: c.cat,
        sub_category: c.sub,
        amount,
        tax_amount: tax,
        total_amount: round2(amount + tax),
        payment_method: pick(PAY_METHODS),
        payment_status: pick(EXP_PAY_STATUS),
        approval_status: approval,
        approved_by: approval === EXPENSE_APPROVED ? pick(userIds) : null,
        approved_at: approval === EXPENSE_APPROVED ? d : null,
        rejection_notes: approval === 'مرفوض' ? 'تجاوز الميزانية المعتمدة' : null,
        description: `${c.cat} - ${c.sub}`,
        vendor: chance(0.7) ? `مورد ${fullNameMale()}` : null,
        invoice_number: chance(0.6) ? `INV-${randInt(10000, 99999)}` : null,
        branch_id: pick(branchIds),
        department_id: null,
        notes: null,
        created_by: pick(userIds),
        is_deleted: false,
        created_at: d,
        updated_at: d,
      },
    });
  }

  const REVENUE_SOURCES: { src: string; sub: string }[] = [
    { src: 'اشتراكات', sub: 'اشتراكات شهرية' },
    { src: 'اشتراكات', sub: 'اشتراكات سنوية' },
    { src: 'مبيعات', sub: 'مكملات غذائية' },
    { src: 'مبيعات', sub: 'ملابس رياضية' },
    { src: 'حصص خاصة', sub: 'تدريب شخصي' },
    { src: 'خدمات', sub: 'رسوم دخول يومي' },
    { src: 'رعاية', sub: 'رعاية تجارية' },
  ];
  const REV_PAY_STATUS = [REVENUE_PAID, 'غير مدفوع'];

  let revSeq = 1;
  for (let i = 0; i < 16; i++) {
    const s = REVENUE_SOURCES[i % REVENUE_SOURCES.length];
    const amount = round2(randInt(2000, 60000));
    const discount = chance(0.4) ? round2(amount * 0.05) : 0;
    const tax = round2((amount - discount) * 0.15);
    const total = round2(amount + tax - discount);
    const d = addDays(BASE, -randInt(1, 160));
    await prisma.fin_revenues.create({
      data: {
        revenue_number: `REV-2026-${String(revSeq++).padStart(4, '0')}`,
        revenue_date: ymd(d),
        source: s.src,
        sub_source: s.sub,
        amount,
        tax_amount: tax,
        discount_amount: discount,
        total_amount: total,
        net_amount: round2(amount - discount),
        payment_method: pick(PAY_METHODS),
        payment_status: i < 12 ? REVENUE_PAID : pick(REV_PAY_STATUS),
        description: `${s.src} - ${s.sub}`,
        customer_name: chance(0.8) ? fullNameMale() : fullNameFemale(),
        invoice_number: `SINV-${randInt(10000, 99999)}`,
        receipt_number: `RCP-${randInt(10000, 99999)}`,
        source_module: pick(['subscriptions', 'sales', 'manual']),
        source_ref: `REF-${randInt(1000, 9999)}`,
        branch_id: pick(branchIds),
        notes: null,
        created_by: pick(userIds),
        is_deleted: false,
        created_at: d,
        updated_at: d,
      },
    });
  }

  // finance_employes / contract_employe / bank_employes_details for several employees
  const financeEmps = pickN(employees, Math.min(10, employees.length));
  for (const e of financeEmps) {
    await prisma.finance_employes.create({
      data: {
        emp_code: String(e.emp_code ?? '0'),
        markz: String(pick([1, 2, 3])),
        markz_name: pick(['مركز التكلفة العام', 'مركز الفرع', 'مركز الإدارة']),
        having_all_value: '1',
        having_tamin_value: '1',
        discut_all_value: round2(randInt(200, 900)),
        discut_tamin_value: String(randInt(100, 500)),
      },
    });
  }

  const contractEmps = pickN(employees, Math.min(8, employees.length));
  for (const e of contractEmps) {
    const salary = Number(e.basic_salary ?? 6000) || 6000;
    await prisma.contract_employe.create({
      data: {
        emp_code: String(e.emp_code ?? '0'),
        num_days_in_month: '30',
        hours_work: '8',
        hour_value: String(round2(salary / 30 / 8)),
        work_period_id_fk: '1',
        contract_nature: pick([0, 1]),
        job_type: pick(['دوام كامل', 'دوام جزئي']),
        pay_method_id_fk: '1',
        bank_id_fk: '1',
        bank_code: String(randInt(10, 99)),
        bank_account_num: `SA${randInt(1000000000, 9999999999)}`,
        year_vacation_num: '21',
        year_vacation_period: '1',
        casual_vacation_num: '7',
        travel_ticket: pick(['0', '1']),
        travel_type_fk: '0',
        travel_period: '1',
        reward_end_work: pick([0, 1]),
        vacation_previous_balance: randInt(0, 15),
        vacation_start_ar: ymd(addDays(BASE, -randInt(30, 200))),
        vacation_start_m: ymd(addDays(BASE, -randInt(30, 200))),
        vacation_start_h: null,
        travel_type_name: null,
      },
    });
  }

  const bankEmps = pickN(employees, Math.min(12, employees.length));
  for (const e of bankEmps) {
    await prisma.bank_employes_details.create({
      data: {
        emp_code: Number(e.emp_code ?? 0) || 0,
        bank_id_fk: pick([1, 2, 3]),
        bank_account_num: `SA${randInt(1000000000, 9999999999)}`,
        bank_code: String(randInt(10, 99)),
        approved_for_sarf: 1,
        emp_bank_name: pick(['بنك مصر', 'البنك الأهلي المصري', 'بنك القاهرة', 'بنك القاهرة']),
      },
    });
  }

  // =====================================================================
  // 3. APP MANAGEMENT (mobile CMS)
  // =====================================================================

  // about (singleton)
  await prisma.am_about_app.create({
    data: {
      app_name: 'Noamany Fitness Center',
      app_version: '2.4.1',
      description: 'تطبيق Noamany لإدارة الاشتراكات والحجوزات ومتابعة اللياقة.',
      features: 'حجز الحصص، متابعة الاشتراك، جدول التمارين، العروض والأخبار',
      contact_email: 'support@noamanycenter.test',
      contact_phone: '0112345678',
      website: 'https://noamanycenter.test',
      privacy_policy: 'سياسة الخصوصية الخاصة بتطبيق Noamany.',
      terms_of_service: 'شروط وأحكام استخدام تطبيق Noamany.',
      updated_at: BASE,
    },
  });

  // exercise categories -> exercises
  const CATS = [
    { name: 'تمارين الصدر', desc: 'تمارين تقوية عضلات الصدر' },
    { name: 'تمارين الظهر', desc: 'تمارين تقوية عضلات الظهر' },
    { name: 'تمارين الأرجل', desc: 'تمارين تقوية عضلات الأرجل' },
    { name: 'تمارين الكتفين', desc: 'تمارين الأكتاف والذراعين' },
    { name: 'تمارين الكارديو', desc: 'تمارين القلب وحرق الدهون' },
    { name: 'تمارين البطن', desc: 'تمارين شد عضلات البطن' },
  ];
  const catIds: number[] = [];
  for (const c of CATS) {
    const row = await prisma.am_exercise_categories.create({
      data: { name: c.name, description: c.desc, is_active: true, updated_at: BASE },
    });
    catIds.push(row.id);
  }

  const EXERCISES: { name: string; catIdx: number; diff: 'easy' | 'medium' | 'hard' }[] = [
    { name: 'ضغط بنش مستوي', catIdx: 0, diff: 'medium' },
    { name: 'ضغط بنش مائل', catIdx: 0, diff: 'hard' },
    { name: 'سحب أرضي', catIdx: 1, diff: 'medium' },
    { name: 'عقلة', catIdx: 1, diff: 'hard' },
    { name: 'سكوات', catIdx: 2, diff: 'medium' },
    { name: 'دفع الأرجل', catIdx: 2, diff: 'easy' },
    { name: 'رفرفة جانبي', catIdx: 3, diff: 'easy' },
    { name: 'ضغط كتف', catIdx: 3, diff: 'medium' },
    { name: 'جري على الجهاز', catIdx: 4, diff: 'easy' },
    { name: 'دراجة ثابتة', catIdx: 4, diff: 'easy' },
    { name: 'تمرين البلانك', catIdx: 5, diff: 'medium' },
    { name: 'المعدة العلوية', catIdx: 5, diff: 'easy' },
    { name: 'ديدليفت', catIdx: 1, diff: 'hard' },
    { name: 'لانجز', catIdx: 2, diff: 'medium' },
  ];
  for (const ex of EXERCISES) {
    await prisma.am_exercises.create({
      data: {
        name: ex.name,
        category_id: catIds[ex.catIdx],
        description: `تمرين ${ex.name} لتقوية العضلات المستهدفة.`,
        instructions: 'حافظ على وضعية الظهر السليمة وتنفس بانتظام أثناء التمرين.',
        duration: randInt(10, 45),
        difficulty: ex.diff,
        is_active: true,
        updated_at: BASE,
      },
    });
  }

  // trainers (link a few to real employees)
  const trainerEmps = pickN(employees, Math.min(6, employees.length));
  const SPECS = ['كمال أجسام', 'لياقة عامة', 'كارديو', 'كروس فيت', 'يوغا', 'تدريب شخصي'];
  for (let i = 0; i < 8; i++) {
    const linked = i < trainerEmps.length ? trainerEmps[i] : null;
    await prisma.am_trainers.create({
      data: {
        employee_id: linked ? linked.id : null,
        name: linked ? linked.employee ?? fullNameMale() : fullNameMale(),
        email: `trainer${i + 1}@noamanycenter.test`,
        phone: randPhone(),
        specialization: pick(SPECS),
        experience: randInt(1, 15),
        bio: 'مدرب معتمد بخبرة في تصميم البرامج التدريبية.',
        is_active: chance(0.85),
        updated_at: BASE,
      },
    });
  }

  // offers
  const OFFERS = [
    { title: 'عرض الصيف - خصم 30%', disc: 30 },
    { title: 'اشتراك سنوي بخصم 25%', disc: 25 },
    { title: 'باقة الأصدقاء 2+1', disc: 33 },
    { title: 'عرض الطلاب', disc: 20 },
    { title: 'عرض العائلة', disc: 15 },
    { title: 'خصم التدريب الشخصي', disc: 10 },
  ];
  for (let i = 0; i < OFFERS.length; i++) {
    const o = OFFERS[i];
    const start = addDays(BASE, -randInt(5, 40));
    const end = addDays(BASE, randInt(15, 90));
    await prisma.am_offers.create({
      data: {
        title: o.title,
        description: `${o.title} — استفد من العرض قبل انتهائه.`,
        discount: o.disc,
        start_date: ymd(start),
        end_date: ymd(end),
        is_active: i < 5,
        updated_at: BASE,
      },
    });
  }

  // news
  const NEWS = [
    'افتتاح فرع جديد في حي العليا',
    'إضافة أجهزة كارديو حديثة',
    'انطلاق تحدي اللياقة الصيفي',
    'جدول حصص جديد لشهر يوليو',
    'ورشة تغذية مجانية للأعضاء',
    'تحديث تطبيق Noamany بمزايا جديدة',
  ];
  for (let i = 0; i < NEWS.length; i++) {
    await prisma.am_news.create({
      data: {
        title: NEWS[i],
        content: `${NEWS[i]}. تفاصيل الخبر متاحة داخل التطبيق للأعضاء.`,
        publish_date: ymd(addDays(BASE, -randInt(0, 45))),
        is_published: i < 5,
        updated_at: BASE,
      },
    });
  }

  // ads
  const ADS = ['بروتين واي - خصم خاص', 'ملابس رياضية جديدة', 'عرض المكملات', 'اشترك الآن'];
  for (let i = 0; i < ADS.length; i++) {
    const start = addDays(BASE, -randInt(5, 30));
    const end = addDays(BASE, randInt(10, 60));
    await prisma.am_ads.create({
      data: {
        title: ADS[i],
        description: `${ADS[i]} — عرض حصري لأعضاء Noamany.`,
        link_url: 'https://noamanycenter.test/promo',
        start_date: ymd(start),
        end_date: ymd(end),
        is_active: i < 3,
        updated_at: BASE,
      },
    });
  }

  // invitations — spread across all statuses
  const INV_STATUS = ['pending', 'accepted', 'rejected', 'attended'] as const;
  for (let i = 0; i < 14; i++) {
    const status = INV_STATUS[i % INV_STATUS.length];
    const sent = addDays(BASE, -randInt(3, 40));
    await prisma.am_invitations.create({
      data: {
        invitation_code: `INV-${String(1000 + i)}`,
        recipient_name: chance(0.6) ? fullNameMale() : fullNameFemale(),
        recipient_email: `guest${i + 1}@example.com`,
        sent_date: sent,
        status,
        accepted_date: status === 'accepted' || status === 'attended' ? addDays(sent, 1) : null,
        rejected_date: status === 'rejected' ? addDays(sent, 1) : null,
        rejection_reason: status === 'rejected' ? 'غير مهتم حالياً' : null,
        attendance_date: status === 'attended' ? addDays(sent, 2) : null,
        branch_id: pick(branchIds),
        updated_at: BASE,
      },
    });
  }

  // app_pages (mobile screens)
  const APP_SCREENS = ['الرئيسية', 'اشتراكي', 'الحصص', 'التمارين', 'العروض', 'الأخبار', 'حسابي'];
  for (let i = 0; i < APP_SCREENS.length; i++) {
    await prisma.app_pages.create({
      data: {
        title: APP_SCREENS[i],
        active: 'yes',
        page_order: i + 1,
        screen_num: i + 1,
        icon_path: `/assets/icons/screen_${i + 1}.png`,
      },
    });
  }

  // =====================================================================
  // 4. SYSTEM / MISC
  // =====================================================================

  // pages (menu) — enough to make menu + permissions meaningful
  const PAGES = [
    { title: 'لوحة التحكم', link: '/dashboard', icon: 'dashboard' },
    { title: 'المحاسبة', link: '/accounting', icon: 'account_balance' },
    { title: 'دليل الحسابات', link: '/accounting/chart-of-accounts', icon: 'list_alt' },
    { title: 'القيود اليومية', link: '/accounting/journal-entries', icon: 'receipt_long' },
    { title: 'الميزان', link: '/accounting/trial-balance', icon: 'balance' },
    { title: 'المالية', link: '/finance', icon: 'payments' },
    { title: 'المصروفات', link: '/finance/expenses', icon: 'money_off' },
    { title: 'الإيرادات', link: '/finance/revenues', icon: 'attach_money' },
    { title: 'إدارة التطبيق', link: '/app-management', icon: 'phone_android' },
    { title: 'الوكلاء', link: '/agents', icon: 'support_agent' },
    { title: 'الإشعارات', link: '/notifications', icon: 'notifications' },
    { title: 'الإعدادات', link: '/settings', icon: 'settings' },
    { title: 'سجل التدقيق', link: '/admin/audit', icon: 'history' },
    { title: 'التقارير', link: '/reports', icon: 'assessment' },
  ];
  const pageIds: number[] = [];
  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    const row = await prisma.pages.create({
      data: {
        page_title: p.title,
        page_link: p.link,
        group_id_fk: i < 5 ? 1 : i < 8 ? 2 : 3,
        level: 1,
        page_order: i + 1,
        page_icon_code: p.icon,
        page_photo: '0',
      },
    });
    pageIds.push(row.page_id);
  }

  // permissions — grant a few users access to pages (composite PK user_id,page_id_fk)
  const permUsers = pickN(userIds, Math.min(4, userIds.length));
  const permSeen = new Set<string>();
  for (const uid of permUsers) {
    for (const pid of pageIds) {
      const k = `${uid}:${pid}`;
      if (permSeen.has(k)) continue;
      permSeen.add(k);
      await prisma.permissions.create({
        data: { user_id: uid, page_id_fk: pid, page_level: pick([1, 2, 3]) },
      });
    }
  }

  // notification settings -> notifications -> users_notifications
  const NOTIF_SETTINGS = [
    { code: 101, t_table: 'subscriptions', url: '/subscriptions', title: 'انتهاء اشتراك' },
    { code: 102, t_table: 'fin_expenses', url: '/finance/expenses', title: 'مصروف بانتظار الاعتماد' },
    { code: 103, t_table: 'am_invitations', url: '/app-management/invitations', title: 'دعوة جديدة' },
    { code: 104, t_table: 'staff_tasks', url: '/settings/automation', title: 'مهمة جديدة' },
    { code: 105, t_table: 'acc_journal_entries', url: '/accounting/journal-entries', title: 'قيد بانتظار الترحيل' },
  ];
  const settingIds: number[] = [];
  for (const s of NOTIF_SETTINGS) {
    const row = await prisma.tbl_sys_notifications_settings.create({
      data: { code: s.code, t_table: s.t_table, url: s.url, title: s.title },
    });
    settingIds.push(row.id);
  }

  for (let i = 0; i < 12; i++) {
    const d = addDays(BASE, -randInt(0, 20));
    await prisma.tbl_notifications.create({
      data: {
        from_user: pick(userIds),
        to_user: pick(userIds),
        date_ar: ymd(d),
        time_ar: ymdhms(d).slice(11),
        seen: chance(0.5) ? 1 : 0,
        seen_date: chance(0.5) ? ymd(d) : null,
        seen_time: null,
        fk_id: BigInt(randInt(1, 500)),
        notify_id_fk: pick(settingIds),
        n_code: pick(NOTIF_SETTINGS).code,
        test_num: 0,
      },
    });
  }

  const NOTIF_MSGS = [
    'اقترب موعد انتهاء اشتراك أحد الأعضاء',
    'يوجد مصروف بانتظار الاعتماد',
    'تم استلام دعوة جديدة',
    'تم إسناد مهمة جديدة لك',
    'يوجد قيد يومية بانتظار الترحيل',
    'تم ترحيل قيد بنجاح',
    'تم اعتماد مصروف',
    'تنبيه: رصيد مورد مستحق',
  ];
  for (let i = 0; i < 12; i++) {
    const d = addDays(BASE, -randInt(0, 20));
    const s = NOTIF_SETTINGS[i % NOTIF_SETTINGS.length];
    await prisma.users_notifications.create({
      data: {
        notify_id_fk: pick(settingIds),
        message: NOTIF_MSGS[i % NOTIF_MSGS.length],
        url: s.url,
        date: ymd(d),
        type: pick([0, 1, 2]),
        approved: chance(0.6) ? 1 : 0,
      },
    });
  }

  // tbl_messages
  for (let i = 0; i < 10; i++) {
    const d = addDays(BASE, -randInt(0, 30));
    const ended = chance(0.5);
    await prisma.tbl_messages.create({
      data: {
        msg_date: ymd(d),
        msg_time: ymdhms(d).slice(11),
        msg_title: pick(['استفسار عن الاشتراك', 'طلب دعم فني', 'شكوى', 'اقتراح', 'استفسار عن العروض']),
        msg_content: 'رسالة تجريبية من أحد الأعضاء عبر التطبيق.',
        user_phone: randPhone(),
        customer_id: randInt(1, 200),
        act_ended: ended ? 'read' : 'reading',
        act_ended_emp_id: ended ? pick(userIds) : null,
        act_ended_date: ended ? ymd(d) : null,
        act_ended_time: ended ? ymdhms(d).slice(11) : null,
      },
    });
  }

  // tbl_agents
  for (let i = 0; i < 6; i++) {
    const name = fullNameMale();
    await prisma.tbl_agents.create({
      data: {
        name,
        name_slug: `agent-${i + 1}`,
        gender: 'male',
        office_no: `011${randInt(1000000, 9999999)}`,
        mob: randPhone(),
        email: `agent${i + 1}@noamanycenter.test`,
        address: 'القاهرة - جمهورية مصر العربية',
        description: 'وكيل معتمد لتسويق اشتراكات النادي.',
        activity: i < 5 ? 'active' : 'notactive',
        view_details: 'yes',
        created: BASE,
        have_account: chance(0.4) ? 1 : 0,
      },
    });
  }

  // api_users (mobile app members)
  for (let i = 0; i < 12; i++) {
    await prisma.api_users.create({
      data: {
        user_name: chance(0.6) ? fullNameMale() : fullNameFemale(),
        user_phone: randPhone(),
        user_email: `member${i + 1}@example.com`,
        user_city: pick(['القاهرة', 'جدة', 'الدمام', 'مكة']),
        user_pass: 'hashed_demo_pass',
        status: i < 10 ? 1 : 0,
        rand_key: randInt(1000, 9999),
      },
    });
  }

  // conf_area_setting (countries/cities/regions)
  const country = await prisma.conf_area_setting.create({
    data: { name: 'جمهورية مصر العربية', type: 'country', from_id_fk: null, created: BASE },
  });
  const CITIES = ['القاهرة', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة'];
  for (const c of CITIES) {
    await prisma.conf_area_setting.create({
      data: { name: c, type: 'city', from_id_fk: country.main_id, created: BASE },
    });
  }

  // webhook endpoints -> deliveries
  const EVENTS = ['subscription.created', 'payment.received', 'member.checked_in', 'invitation.accepted'];
  const endpointIds: number[] = [];
  const ENDPOINTS = [
    { name: 'تكامل المحاسبة', url: 'https://hooks.noamanycenter.test/accounting' },
    { name: 'تكامل الرسائل', url: 'https://hooks.noamanycenter.test/sms' },
    { name: 'تكامل CRM', url: 'https://hooks.noamanycenter.test/crm' },
  ];
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const ep = await prisma.webhook_endpoints.create({
      data: {
        name: ENDPOINTS[i].name,
        url: ENDPOINTS[i].url,
        events: pickN(EVENTS, randInt(2, 4)),
        secret: `whsec_${randInt(100000, 999999)}`,
        is_active: i < 2,
        updated_at: BASE,
      },
    });
    endpointIds.push(ep.id);
  }
  // Canonical webhook delivery statuses used by the service: delivered | failed | pending
  for (let i = 0; i < 12; i++) {
    const st = i < 8 ? 'delivered' : pick(['failed', 'pending']);
    const d = addDays(BASE, -randInt(0, 15));
    const evt = pick(EVENTS);
    await prisma.webhook_deliveries.create({
      data: {
        endpoint_id: pick(endpointIds),
        event_type: evt,
        payload: { event: evt, id: randInt(1, 1000), ts: ymdhms(d) },
        status: st,
        attempts: st === 'failed' ? randInt(2, 5) : 1,
        response_code: st === 'delivered' ? 200 : st === 'failed' ? 500 : null,
        error_message: st === 'failed' ? 'Connection timeout' : null,
        created_at: d,
        delivered_at: st === 'delivered' ? d : null,
      },
    });
  }

  // automation_workflows (self-seeded so a clean force-reset has rows to reference)
  const WORKFLOW_DEFS: Array<{ key: string; ar: string; en: string; trigger: string }> = [
    { key: 'sub_expired_notify', ar: 'تنبيه انتهاء الاشتراك', en: 'Subscription expired notify', trigger: 'subscription_expired' },
    { key: 'sub_expiring_reminder', ar: 'تذكير قرب انتهاء الاشتراك', en: 'Subscription expiring reminder', trigger: 'subscription_expiring_soon' },
    { key: 'sub_renewed_thanks', ar: 'شكر على تجديد الاشتراك', en: 'Subscription renewed thanks', trigger: 'subscription_renewed' },
    { key: 'checkin_welcome', ar: 'ترحيب عند الحضور', en: 'Check-in welcome', trigger: 'member_checked_in' },
    { key: 'payment_outstanding_followup', ar: 'متابعة المدفوعات المتأخرة', en: 'Outstanding payment follow-up', trigger: 'payment_outstanding' },
    { key: 'manual_broadcast', ar: 'حملة يدوية', en: 'Manual broadcast', trigger: 'manual' },
  ];
  let wfId = 1;
  for (const w of WORKFLOW_DEFS) {
    await prisma.automation_workflows.create({
      data: {
        id: wfId++,
        key: w.key,
        name_ar: w.ar,
        name_en: w.en,
        trigger_type: w.trigger as any,
        trigger_config: { window_days: 3 },
        conditions: { branch: 'any' },
        actions: [{ type: 'notify', channel: 'push' }, { type: 'create_task' }],
        is_active: true,
        branch_id: pick(branchIds),
        updated_at: BASE,
      },
    });
  }

  // automation_runs for the seeded workflows
  const workflows = await prisma.automation_workflows.findMany({ select: { id: true, trigger_type: true } });
  const RUN_STATUS = ['success', 'failed', 'skipped'];
  for (let i = 0; i < 14; i++) {
    const wf = pick(workflows);
    const st = i < 10 ? 'success' : pick(['failed', 'skipped']);
    const d = addDays(BASE, -randInt(0, 25));
    await prisma.automation_runs.create({
      data: {
        workflow_id: wf.id,
        trigger_type: wf.trigger_type,
        entity_type: pick(['member', 'subscription', 'payment']),
        entity_id: String(randInt(1, 500)),
        status: st,
        detail: { matched: true, actions_run: randInt(1, 3) },
        error_message: st === 'failed' ? 'Action handler threw an error' : null,
        created_at: d,
      },
    });
  }

  // staff_tasks (spread across status/priority)
  const TASK_TYPES = ['follow_up', 'renewal_call', 'welcome_call', 'collect_payment', 'retention'];
  const TASK_STATUS = ['open', 'in_progress', 'completed', 'cancelled'] as const;
  const TASK_PRIORITY = ['low', 'medium', 'high'] as const;
  const TASK_TITLES = [
    'متابعة تجديد اشتراك',
    'اتصال ترحيبي بعضو جديد',
    'تحصيل رصيد مستحق',
    'متابعة عضو منقطع',
    'تأكيد حضور حصة',
  ];
  for (let i = 0; i < 14; i++) {
    const st = TASK_STATUS[i % TASK_STATUS.length];
    const d = addDays(BASE, -randInt(0, 20));
    await prisma.staff_tasks.create({
      data: {
        task_type: pick(TASK_TYPES),
        title: pick(TASK_TITLES),
        description: 'مهمة موظف تم إنشاؤها عبر أتمتة أو يدويًا.',
        member_id: randInt(1, 200),
        subscription_id: chance(0.6) ? randInt(1, 300) : null,
        assigned_to: pick(userIds),
        status: st,
        priority: pick(TASK_PRIORITY),
        due_date: ymd(addDays(BASE, randInt(-5, 15))),
        branch_id: pick(branchIds),
        closed_at: st === 'completed' || st === 'cancelled' ? d : null,
        closed_reason: st === 'completed' ? 'تم الإنجاز' : st === 'cancelled' ? 'أُلغيت' : null,
        created_by: pick(userIds),
        created_at: d,
        updated_at: d,
      },
    });
  }

  // rbac_audit_log (a few rows — do NOT touch other rbac_* tables)
  const RBAC_ACTIONS = ['role.assigned', 'role.revoked', 'permission.granted', 'login.success', 'user.updated'];
  for (let i = 0; i < 8; i++) {
    const d = addDays(BASE, -randInt(0, 30));
    await prisma.rbac_audit_log.create({
      data: {
        actor_user_id: pick(userIds),
        action: pick(RBAC_ACTIONS),
        target_type: pick(['user', 'role', 'permission']),
        target_id: String(randInt(1, 50)),
        detail: { note: 'demo audit entry' },
        created_at: d,
      },
    });
  }

  // business_audit_log (members/subscriptions/payments changes)
  const BIZ = [
    { et: 'member', ac: 'created' },
    { et: 'member', ac: 'updated' },
    { et: 'subscription', ac: 'renewed' },
    { et: 'subscription', ac: 'frozen' },
    { et: 'payment', ac: 'recorded' },
    { et: 'expense', ac: 'approved' },
  ];
  for (let i = 0; i < 10; i++) {
    const b = BIZ[i % BIZ.length];
    const d = addDays(BASE, -randInt(0, 30));
    const actor = pick(users);
    await prisma.business_audit_log.create({
      data: {
        entity_type: b.et,
        entity_id: String(randInt(1, 500)),
        action: b.ac,
        actor_user_id: actor.user_id,
        actor_name: actor.name ?? 'مستخدم',
        branch_id: pick(branchIds),
        before_json: b.ac === 'updated' ? { status: 'active' } : undefined,
        after_json: { status: 'active', updated: true },
        changed_fields: b.ac === 'updated' ? ['status'] : undefined,
        reason: 'تعديل تجريبي',
        ip_address: `192.168.1.${randInt(2, 254)}`,
        created_at: d,
      },
    });
  }

  log('accounting', `accounts: ${DEFAULT_CHART.length}, periods: ${periodRows.length}, journal entries: ${jeSpecs.length}`);
  log('finance', `expenses: 16, revenues: 16, finance_emps: ${financeEmps.length}, contracts: ${contractEmps.length}, bank: ${bankEmps.length}`);
  log('app', `exercises: ${EXERCISES.length}, trainers: 8, offers: ${OFFERS.length}, news: ${NEWS.length}, ads: ${ADS.length}, invitations: 14, app_pages: ${APP_SCREENS.length}`);
  log('system', `pages: ${PAGES.length}, permissions: ${permSeen.size}, notifications: 12, agents: 6, api_users: 12, webhooks: ${ENDPOINTS.length}, staff_tasks: 14`);
  console.log('✔ Accounting / Finance / App / System done');
}

// self-run for standalone testing
if (require.main === module) {
  seedAccountingApp()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
