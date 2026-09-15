/* eslint-disable no-console */
/**
 * HR Affairs seed — recruitment/entdab, warnings/enzarat, rewards/mokafat,
 * requests/talabat + job-requests, circulars/ta3mem (+ messages), evaluations,
 * custody, disclaimers/clearance, daily-reports/takrer, activities/ansheta/
 * mobadrat/mosalat, legal-files/lawyeh, site-visits/zeyarat, sites, and settings.
 *
 * All rows link to real foundation entities (employees / branches / users) and
 * satisfy the list-filter conditions of the corresponding NestJS services so the
 * frontend HR pages render non-empty. Statuses are spread across each workflow.
 */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2, reseed,
  getBranchIds, getEmployees, getUsers, getDepartments,
  BASE, addDays, ymd, dmy, ymdhms, hms,
} from './_shared';

// suspend workflow values (mirrors src/common/utils/suspend-status.util.ts)
const SUS = { INCOMING: 0, APPROVED_L1: 1, REJECTED: 2, INVESTIGATING: 3, APPROVED: 4, CANCELLED: 5 } as const;
const SUS_SPREAD = [SUS.INCOMING, SUS.APPROVED_L1, SUS.REJECTED, SUS.INVESTIGATING, SUS.APPROVED, SUS.CANCELLED];

export async function seedHrAffairs(): Promise<void> {
  console.log('▶ HrAffairs…');
  reseed(20260701);

  // Children first, then parents. Only tables owned by THIS module.
  await clearTables([
    // legal files
    'hr_lawyeh_files_seens', 'hr_lawyeh_files',
    // circulars + messages
    'hr_ta3mem_attaches', 'hr_ta3mem_details', 'hr_ta3mem',
    'hr_ta3mem_msg_attaches', 'hr_ta3mem_msg_details', 'hr_ta3mem_msg',
    'hr_ta3mem_personal_msg_details', 'hr_ta3mem_personal_msg',
    // warnings + penalties
    'hr_enzarat_files', 'hr_enzarat_history', 'hr_enzarat',
    'hr_gezaat', 'penalty_bylaws',
    // rewards
    'hr_mokafat_details', 'hr_mokafat', 'hr_mokafat_types',
    // requests
    'hr_talabat_orders', 'hr_talabat_types', 'hr_ozonat_types', 'hr_requests',
    // job requests
    'job_request_orders', 'hr_job_request_details', 'hr_job_request',
    // evaluations
    'hr_ta3en_moaqt_evaluation_details', 'hr_ta3en_moaqt_evaluation_points',
    'hr_ta3en_moaqt_evaluation', 'hr_evaluation_setting',
    // custody
    'emp_custody', 'custody_devices',
    // daily reports
    'tbl_takrer_yawmi_details', 'tbl_takrer_yawmi_bnod', 'tbl_takrer_yawmi', 'hr_dialy_reports',
    // activities / initiatives / tasks (mosalat)
    'hr_ansheta_files', 'hr_ansheta', 'hr_mobadrat',
    'hr_mosalat_mokalfat', 'hr_mosalat',
    // site visits
    'tbl_emp_zeyarat', 'tbl_mohmat_3mal', 'tbl_sites', 'hr_locations_visits',
    // entdab (onboarding / mandate locations)
    'hr_entdab_history', 'hr_entdab', 'hr_entdab_amaken', 'hr_entdab_sysat_setting',
    // clearance / termination
    'hr_disclaimers', 'hr_tayi_qyed',
    // settings
    'hr_forms_settings', 'tbl_hr_forms_settings', 'hr_general_setting',
    'hr_insurance_settings', 'hr_egraat_emp_setting', 'hr_egraat_setting',
    // legacy employees
    'tbl_employees',
  ]);

  const branches = await getBranchIds();
  const rawEmployees = await getEmployees(); // {id, emp_code, employee, branch_id_fk, emp_type, basic_salary, phone}
  const users = await getUsers();            // {user_id, emp_code, name, level, branch_id_fk}
  const departments = await getDepartments();

  // Normalize nullable columns so downstream code has concrete types.
  const employees = rawEmployees.map((e, idx) => ({
    id: e.id,
    emp_code: e.emp_code ?? 9000 + idx,
    employee: e.employee ?? `موظف ${e.id}`,
    branch_id_fk: e.branch_id_fk ?? branches[0],
    emp_type: e.emp_type ?? 1,
    basic_salary: Number(e.basic_salary ?? 5000),
  }));

  const adminUser = users.find((u) => u.emp_code === 1001) ?? users[0];
  const hrUser = users.find((u) => u.emp_code === 1002) ?? users[1] ?? adminUser;
  const empByCode = new Map(employees.map((e) => [e.emp_code, e]));
  const userByEmpCode = new Map(users.map((u) => [u.emp_code, u]));

  const depId = (i: number) => departments[i % departments.length].id;
  const depTitle = (i: number) => departments[i % departments.length].title ?? `إدارة ${i + 1}`;
  const nowTime = hms(BASE);

  // Convenience: pick a random real employee
  const randEmp = () => pick(employees);

  // =========================================================================
  //  SETTINGS / LOOKUPS  (small handful the UI expects)
  // =========================================================================

  // hr_general_setting — warning types (ttype='enzar') read by hr-warnings listTypes
  const generalSettings: Array<{ title: string; ttype: string }> = [
    { title: 'إنذار كتابي أول', ttype: 'enzar' },
    { title: 'إنذار كتابي ثانٍ', ttype: 'enzar' },
    { title: 'إنذار نهائي', ttype: 'enzar' },
    { title: 'لفت نظر', ttype: 'laft_nazr' },
    { title: 'تكليف بمهام إضافية', ttype: 'mokalfat' },
  ];
  let gsId = 1;
  for (const g of generalSettings) {
    await prisma.hr_general_setting.create({
      data: {
        id_setting: gsId++,
        title_setting: g.title,
        ttype: g.ttype,
        form_id: 0,
        status_setting: 'active',
        details: `${g.title} — وفق لائحة الجزاءات المعتمدة`,
      },
    });
  }
  log('hr-affairs', `hr_general_setting: ${generalSettings.length}`);

  // hr_forms_settings — evaluation/appraisal form criteria (settings/forms page)
  const formsDefs = [
    { title: 'الالتزام بمواعيد العمل', type: 1, type_name: 'الانضباط الوظيفي' },
    { title: 'جودة الأداء وإنجاز المهام', type: 1, type_name: 'الانضباط الوظيفي' },
    { title: 'التعاون مع فريق العمل', type: 2, type_name: 'السلوك المهني' },
    { title: 'التعامل مع الأعضاء والعملاء', type: 2, type_name: 'السلوك المهني' },
    { title: 'المبادرة وتحمل المسؤولية', type: 3, type_name: 'المهارات القيادية' },
    { title: 'المظهر العام والنظافة', type: 3, type_name: 'المهارات القيادية' },
  ];
  for (let i = 0; i < formsDefs.length; i++) {
    const f = formsDefs[i];
    await prisma.hr_forms_settings.create({
      data: {
        title_setting: f.title,
        have_branch: 0,
        type: f.type,
        type_name: f.type_name,
        max_degree: String(pick([5, 10, 20])),
        form_id: 1,
        in_order: i + 1,
      },
    });
  }
  log('hr-affairs', `hr_forms_settings: ${formsDefs.length}`);

  // tbl_hr_forms_settings — legacy colour-coded form-type lookup
  const tblForms = [
    { title: 'إجازة', ttype: 1, ttype_name: 'طلبات', color: '#4caf50' },
    { title: 'إذن', ttype: 1, ttype_name: 'طلبات', color: '#2196f3' },
    { title: 'إنذار', ttype: 2, ttype_name: 'جزاءات', color: '#f44336' },
    { title: 'مكافأة', ttype: 3, ttype_name: 'حوافز', color: '#ff9800' },
  ];
  for (const t of tblForms) {
    await prisma.tbl_hr_forms_settings.create({
      data: { fk_id: 0, title: t.title, ttype: t.ttype, ttype_name: t.ttype_name, color: t.color },
    });
  }

  // hr_insurance_settings — GOSI averages per nationality (settings/insurance)
  // nationality_type: 1=Saudi, 2=Non-Saudi ; setting_id_fk keys the coverage component
  const insuranceDefs = [
    { nat: 1, setting: 1, emp: '9.75', soc: '11.75' },
    { nat: 1, setting: 2, emp: '0', soc: '2' },
    { nat: 2, setting: 1, emp: '0', soc: '2' },
    { nat: 2, setting: 2, emp: '0', soc: '2' },
  ];
  for (const ins of insuranceDefs) {
    await prisma.hr_insurance_settings.create({
      data: {
        nationality_type: ins.nat,
        setting_id_fk: String(ins.setting),
        emp_average: ins.emp,
        society_average: ins.soc,
        date: ymd(BASE),
        date_s: ymd(BASE),
      },
    });
  }
  log('hr-affairs', `hr_insurance_settings: ${insuranceDefs.length}`);

  // hr_egraat_setting — approval-flow grade levels (action-screen listGrades)
  const egraatGrades = [
    { code: 10, title: 'المدير المباشر', tarteb: 1, main_type: 0 },
    { code: 20, title: 'مدير الإدارة', tarteb: 2, main_type: 0 },
    { code: 30, title: 'إدارة الموارد البشرية', tarteb: 3, main_type: 0 },
    { code: 40, title: 'المدير العام', tarteb: 4, main_type: 0 },
  ];
  const egraatIds: number[] = [];
  for (const g of egraatGrades) {
    const row = await prisma.hr_egraat_setting.create({
      data: {
        code: g.code,
        title: g.title,
        main_type: g.main_type,
        tarteb: g.tarteb,
        min_num: 1,
        max_num: 1,
        date: ymd(BASE),
        date_ar: dmy(BASE),
        time: nowTime,
        publisher_name: adminUser?.name ?? 'النظام',
        publisher: adminUser?.user_id ?? 1,
        edara: 0,
        qsm: 0,
        job_number: 0,
        marg3_mobasher: 1,
      },
    });
    egraatIds.push(row.id);
  }

  // hr_egraat_emp_setting — employees mapped into approval grades (action-screen list)
  for (let i = 0; i < 10; i++) {
    const e = employees[i % employees.length];
    const g = egraatGrades[i % egraatGrades.length];
    await prisma.hr_egraat_emp_setting.create({
      data: {
        job_title_id_fk: (i % 5) + 1,
        job_title_code_fk: g.code,
        job_title_n: g.title,
        person_type: 1,
        person_id: e.id,
        person_code: String(e.emp_code),
        person_name: e.employee,
        person_qsm: depTitle(i),
        person_edara: depTitle(i),
        person_private_name: e.employee,
        person_img: '',
        person_suspend: 0,
        from_date: ymd(addDays(BASE, -randInt(30, 200))),
        to_date: ymd(addDays(BASE, 365)),
        from_date_str: dmy(addDays(BASE, -randInt(30, 200))),
        to_date_str: dmy(addDays(BASE, 365)),
        date: Math.floor(BASE.getTime() / 1000),
        date_ar: dmy(BASE),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
        web_display: 1,
      },
    });
  }
  log('hr-affairs', `hr_egraat_setting: ${egraatGrades.length}, hr_egraat_emp_setting: 10`);

  // hr_entdab_sysat_setting — mandate policy settings
  const entdabPolicies = [
    { title: 'سياسة الانتداب الداخلي', ttype: 1 },
    { title: 'سياسة التكليف الخارجي', ttype: 2 },
    { title: 'سياسة بدل السكن', ttype: 3 },
  ];
  for (const p of entdabPolicies) {
    await prisma.hr_entdab_sysat_setting.create({
      data: {
        title: p.title,
        ttype: p.ttype,
        hours_out_work_days: 8,
        hours_out_vacation_days: 4,
        taklef_moda_minmum: 1,
        taklef_moda_maxmum: 30,
        taklef_badel_minmum: 100,
        taklef_badel_maxmum: 500,
        mostwa_wazefy: 1,
        badal_value_part_day: 150,
        badal_value_full_day: 300,
      },
    });
  }

  // hr_entdab_amaken — mandate destination places
  const amakenDefs = [
    { mkan: 'مقر الشركة - العليا', distance: 0 },
    { mkan: 'فرع جدة', distance: 950 },
    { mkan: 'فرع الدمام', distance: 400 },
    { mkan: 'مكتب العمل - الرياض', distance: 15 },
    { mkan: 'التأمينات الاجتماعية', distance: 20 },
  ];
  const makanIds: number[] = [];
  for (const a of amakenDefs) {
    const row = await prisma.hr_entdab_amaken.create({ data: { mkan: a.mkan, distance: a.distance } });
    makanIds.push(row.id);
  }
  log('hr-affairs', `hr_entdab settings + amaken seeded`);

  // hr_evaluation_setting — probation evaluation criteria tree (used in eval detail)
  const evalSettingDefs = [
    { title: 'الالتزام والانضباط', degree: '20' },
    { title: 'جودة العمل', degree: '20' },
    { title: 'التعاون والعمل الجماعي', degree: '20' },
    { title: 'المهارات الفنية', degree: '20' },
    { title: 'التطور والتحسن', degree: '20' },
  ];
  const evalSettingIds: number[] = [];
  for (const es of evalSettingDefs) {
    const row = await prisma.hr_evaluation_setting.create({
      data: { title: es.title, from_id: 0, degree: es.degree },
    });
    evalSettingIds.push(row.id);
  }

  // hr_talabat_types + hr_ozonat_types — request/permission type lookups
  const talabTypes = ['طلب إجازة', 'طلب إذن', 'طلب سلفة', 'طلب تعريف مرتب', 'طلب نقل'];
  for (let i = 0; i < talabTypes.length; i++) {
    await prisma.hr_talabat_types.create({ data: { id: i + 1, title: talabTypes[i] } });
  }
  const oznTypes = ['إذن خروج', 'إذن تأخير', 'إذن مغادرة', 'إذن استئذان'];
  for (const t of oznTypes) {
    await prisma.hr_ozonat_types.create({ data: { ezn_name: t.slice(0, 15) } });
  }

  // hr_mokafat_types — reward catalog
  const mokafatTypeDefs = ['مكافأة أداء متميز', 'حافز شهري', 'مكافأة تحقيق هدف', 'مكافأة نهاية عام'];
  const mokafatTypeIds: number[] = [];
  for (let i = 0; i < mokafatTypeDefs.length; i++) {
    const row = await prisma.hr_mokafat_types.create({
      data: { mokafa_code: BigInt(500 + i), title: mokafatTypeDefs[i] },
    });
    mokafatTypeIds.push(row.id);
  }

  // custody_devices — asset catalog (tree with parent via from_id)
  const custodyCats = [
    { title: 'أجهزة إلكترونية', from_id: 0, level: 1 },
    { title: 'أثاث مكتبي', from_id: 0, level: 1 },
    { title: 'معدات رياضية', from_id: 0, level: 1 },
  ];
  const catIds: number[] = [];
  for (const c of custodyCats) {
    const row = await prisma.custody_devices.create({ data: c });
    catIds.push(row.id);
  }
  const custodyItems = [
    { title: 'جهاز لابتوب Dell', parent: 0 },
    { title: 'هاتف مكتبي', parent: 0 },
    { title: 'كرسي مكتب', parent: 1 },
    { title: 'ساعة بصمة', parent: 0 },
    { title: 'جهاز جري كهربائي', parent: 2 },
    { title: 'مفاتيح المستودع', parent: 1 },
  ];
  const custodyItemIds: number[] = [];
  for (const it of custodyItems) {
    const row = await prisma.custody_devices.create({
      data: { title: it.title, from_id: catIds[it.parent], level: 2 },
    });
    custodyItemIds.push(row.id);
  }
  log('hr-affairs', `custody_devices: ${custodyCats.length + custodyItems.length}`);

  // =========================================================================
  //  WARNINGS / PENALTIES
  // =========================================================================

  // penalty_bylaws — penalty bylaw catalog (penalties/bylaw page)
  const bylawDefs = [
    { code: 'B01', title: 'التأخر عن مواعيد العمل', action: 'deduction', ded_days: 0.5, ded_amount: 0, susp: 0, thr: 3 },
    { code: 'B02', title: 'الغياب بدون إذن', action: 'deduction', ded_days: 2, ded_amount: 0, susp: 0, thr: 1 },
    { code: 'B03', title: 'الإهمال في أداء الواجبات', action: 'warning', ded_days: 0, ded_amount: 0, susp: 0, thr: 2 },
    { code: 'B04', title: 'مخالفة تعليمات السلامة', action: 'warning', ded_days: 0, ded_amount: 0, susp: 0, thr: 1 },
    { code: 'B05', title: 'إساءة معاملة الأعضاء', action: 'suspension', ded_days: 0, ded_amount: 0, susp: 3, thr: 1 },
    { code: 'B06', title: 'الخروج قبل انتهاء الدوام', action: 'deduction', ded_days: 1, ded_amount: 0, susp: 0, thr: 2 },
    { code: 'B07', title: 'استخدام الجوال أثناء العمل', action: 'warning', ded_days: 0, ded_amount: 0, susp: 0, thr: 3 },
    { code: 'B08', title: 'عدم الالتزام بالزي الرسمي', action: 'deduction', ded_days: 0, ded_amount: 50, susp: 0, thr: 2 },
  ];
  for (let i = 0; i < bylawDefs.length; i++) {
    const b = bylawDefs[i];
    await prisma.penalty_bylaws.create({
      data: {
        code: b.code,
        title: b.title,
        description: `${b.title} — الإجراء: ${b.action}`,
        action_type: b.action,
        threshold: b.thr,
        period_months: 12,
        deduction_days: b.ded_days,
        deduction_amount: b.ded_amount,
        suspension_days: b.susp,
        warning_template_id: (i % generalSettings.length) + 1,
        is_active: 1,
        sort_order: i + 1,
        publisher: adminUser?.user_id ?? 1,
        created_at: ymd(addDays(BASE, -randInt(60, 400))),
      },
    });
  }
  log('hr-affairs', `penalty_bylaws: ${bylawDefs.length}`);

  // hr_enzarat — warnings (hr/warnings page). actions_sends spread across enum.
  const enzarActions = ['start', 'send_to_hr', 'send_to_emp'];
  const enzarTypeList = generalSettings.filter((g) => g.ttype === 'enzar');
  const enzarIds: number[] = [];
  for (let i = 0; i < 14; i++) {
    const e = randEmp();
    const u = userByEmpCode.get(e.emp_code);
    const eDate = addDays(BASE, -randInt(1, 120));
    const typ = enzarTypeList[i % enzarTypeList.length];
    const row = await prisma.hr_enzarat.create({
      data: {
        emp_name: e.employee,
        emp_name_id: e.id,
        emp_user_id: u?.user_id ?? null,
        emp_edara: depTitle(i),
        emp_edara_id: depId(i),
        emp_qesm: depTitle(i),
        emp_qesm_id: depId(i),
        direct_manager_emp_id: employees[2].id,
        direct_manager_user_id: users.find((x) => x.emp_code === 1003)?.user_id ?? null,
        enzar_type: typ.title,
        enzar_type_id: (i % enzarTypeList.length) + 1,
        details: pick([
          'تكرر التأخر عن موعد بدء الدوام خلال الأسبوع.',
          'الغياب عن العمل ليوم كامل دون إذن مسبق.',
          'عدم الالتزام بالزي الرسمي المعتمد للنادي.',
          'إهمال في متابعة أجهزة الصالة الرياضية.',
        ]),
        enzar_time: hms(eDate),
        enzar_date: ymd(eDate),
        enzar_date_ar: dmy(eDate),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
        current_from_user_id: adminUser?.user_id ?? 1,
        current_from_user_name: adminUser?.name ?? 'النظام',
        current_to_user_id: hrUser?.user_id ?? null,
        current_to_user_name: hrUser?.name ?? null,
        send_to_hr: chance(0.5) ? 'yes' : 'no',
        send_to_emp: chance(0.4) ? 'yes' : 'no',
        actions_sends: enzarActions[i % enzarActions.length],
        hr_notes: chance(0.5) ? 'تمت مراجعة الإنذار من قبل الموارد البشرية.' : null,
      },
    });
    enzarIds.push(row.id);

    // history rows (a couple per warning)
    for (let h = 0; h < randInt(1, 2); h++) {
      await prisma.hr_enzarat_history.create({
        data: {
          talab_id_fk: row.id,
          from_user_id: adminUser?.user_id ?? 1,
          to_user_id: hrUser?.user_id ?? null,
          from_user_n: adminUser?.name ?? 'النظام',
          to_user_n: hrUser?.name ?? 'الموارد البشرية',
          from_mosma_wazefy_n: 'مدير مباشر',
          to_mosma_wazefy_n: 'موارد بشرية',
          process_title: pick(['إنشاء', 'إحالة', 'اعتماد']),
          date_ar: dmy(addDays(eDate, h)),
          time_ar: hms(addDays(eDate, h)),
          comment: 'تم تحويل الإنذار للإجراء المناسب.',
        },
      });
    }
    // file attachment on some
    if (chance(0.4)) {
      await prisma.hr_enzarat_files.create({
        data: {
          title: 'صورة الإنذار الموقّع',
          file: `uploads/enzarat/${row.id}.pdf`,
          main_id_fk: row.id,
          date: Math.floor(eDate.getTime() / 1000),
          date_ar: dmy(eDate),
          time: hms(eDate),
        },
      });
    }
  }
  log('hr-affairs', `hr_enzarat: ${enzarIds.length} (+history +files)`);

  // hr_gezaat — penalties (penalties/index page). suspend spread.
  const gezaTypes = [{ id: 1, n: 'خصم أيام' }, { id: 2, n: 'إنذار' }, { id: 3, n: 'إيقاف' }];
  for (let i = 0; i < 14; i++) {
    const e = randEmp();
    const gDate = addDays(BASE, -randInt(1, 150));
    const gt = gezaTypes[i % gezaTypes.length];
    await prisma.hr_gezaat.create({
      data: {
        emp_id: e.id,
        emp_code: e.emp_code,
        emp_name: e.employee,
        mosma_wazefy_id: (i % 5) + 1,
        mosma_wazefy_n: pick(['مدرب لياقة', 'موظف استقبال', 'مشرف صالة', 'أخصائي مبيعات']),
        edara_id_fk: depId(i),
        edara_n: depTitle(i),
        qsm_id_fk: depId(i),
        qsm_n: depTitle(i),
        details: pick([
          'خصم نصف يوم بسبب تكرار التأخير.',
          'إيقاف يومين بسبب الغياب غير المبرر.',
          'خصم يوم كامل لمخالفة تعليمات السلامة.',
        ]),
        geza_type: gt.id,
        geza_value: String(pick([0.5, 1, 2])),
        suspend: SUS_SPREAD[i % SUS_SPREAD.length],
        month: gDate.getMonth() + 1,
        year: gDate.getFullYear(),
        geza_date: ymd(gDate),
        geza_date_ar: dmy(gDate),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
      },
    });
  }
  log('hr-affairs', `hr_gezaat: 14`);

  // =========================================================================
  //  REWARDS  (rewards/index page reads hr_mokafat_details)
  // =========================================================================
  const mokafatHeaderIds: number[] = [];
  for (let i = 0; i < 6; i++) {
    const mDate = addDays(BASE, -randInt(5, 120));
    const rkm = 100 + i;
    const header = await prisma.hr_mokafat.create({
      data: {
        mokafa_rkm: rkm,
        mokafa_date: Math.floor(mDate.getTime() / 1000),
        month: mDate.getMonth() + 1,
        year: mDate.getFullYear(),
        mon_melady: String(mDate.getMonth() + 1),
        mokafa_date_ar: dmy(mDate),
        mokafa_value_type: pick([1, 2]), // 1=amount 2=percent
        mokafa_type: pick(mokafatTypeIds),
        total_value: String(randInt(1000, 8000)),
        presence_number: randInt(1, 4),
        publisher: adminUser?.user_id ?? 1,
        about: pick(['مكافأة عن أداء الربع الثاني', 'حافز تحقيق مستهدف المبيعات', 'مكافأة نهاية العام']),
        suspend: SUS_SPREAD[i % SUS_SPREAD.length],
      },
    });
    mokafatHeaderIds.push(rkm);

    // details: 2-4 employees per header
    const emps = pickN(employees, randInt(2, 4));
    for (const e of emps) {
      await prisma.hr_mokafat_details.create({
        data: {
          mokafa_rkm_fk: rkm,
          emp_code: e.emp_code,
          month: mDate.getMonth() + 1,
          year: mDate.getFullYear(),
          bank_responsible_national_num: String(1000000000 + e.emp_code),
          bank_responsible_name: e.employee,
          bank_account_num: `SA${randInt(10, 99)}${randInt(100000000, 999999999)}`,
          bank_code: String(randInt(10, 99)),
          value: round2(randInt(500, 3000)),
          mokafa_types: pick(mokafatTypeIds),
          mokafa_option: pick(['شهري', 'سنوي', 'استثنائي']),
          edara_n: depTitle(e.id),
          qsm_n: depTitle(e.id),
          mosma_wazefy_n: pick(['مدرب لياقة', 'موظف استقبال', 'مشرف صالة']),
          day: mDate.getDate(),
          suspend: SUS_SPREAD[i % SUS_SPREAD.length],
        },
      });
    }
  }
  log('hr-affairs', `hr_mokafat: ${mokafatHeaderIds.length} (+details)`);

  // =========================================================================
  //  REQUESTS  (requests/index reads hr_requests + hr_talabat_orders)
  // =========================================================================
  const reqTypes = ['vacation', 'ezn', 'solaf', 'loan', 'allowance', 'salary_cert', 'resignation', 'transfer', 'promotion', 'data_change'];
  const reqStatuses = [0, 1, 2, 4, 5];
  for (let i = 0; i < 16; i++) {
    const e = randEmp();
    const cDate = addDays(BASE, -randInt(1, 90));
    const type = reqTypes[i % reqTypes.length];
    const payload = JSON.stringify({
      reason: pick(['ظروف عائلية', 'مراجعة طبية', 'سفر خارج المدينة', 'إجراءات حكومية']),
      from: ymd(cDate),
      to: ymd(addDays(cDate, randInt(1, 10))),
      amount: type === 'loan' || type === 'solaf' ? randInt(1000, 10000) : undefined,
    });
    await prisma.hr_requests.create({
      data: {
        type,
        request_no: 1000 + i,
        emp_id_fk: e.id,
        emp_code_fk: e.emp_code,
        emp_name: e.employee,
        status: reqStatuses[i % reqStatuses.length],
        reason_action: pick(['قيد المراجعة', 'موافقة المدير المباشر', 'مرفوض لعدم اكتمال المستندات']),
        payload,
        created_at: ymdhms(cDate),
        publisher: userByEmpCode.get(e.emp_code)?.user_id ?? adminUser?.user_id ?? 1,
        publisher_name: e.employee,
        current_to_user_id: hrUser?.user_id ?? null,
      },
    });
  }
  log('hr-affairs', `hr_requests: 16`);

  // hr_talabat_orders — legacy general requests (also shown on requests page)
  for (let i = 0; i < 8; i++) {
    const e = randEmp();
    const tDate = addDays(BASE, -randInt(1, 60));
    await prisma.hr_talabat_orders.create({
      data: {
        talab_date_ar: dmy(tDate),
        talab_time: hms(tDate),
        emp_id_fk: e.id,
        for_month: tDate.getMonth() + 1,
        for_year: tDate.getFullYear(),
        no3_talab_id: (i % talabTypes.length) + 1,
        date_ar: dmy(tDate),
        publisher_name: e.employee,
        send_report: chance(0.5) ? 'yes' : 'no',
        suspend: SUS_SPREAD[i % SUS_SPREAD.length],
        notes: pick(['طلب صرف عهدة', 'طلب تعديل بيانات', 'طلب شهادة خبرة', 'طلب نقل فرع']),
        rad_notes: chance(0.3) ? 'تمت الموافقة على الطلب.' : null,
      },
    });
  }
  log('hr-affairs', `hr_talabat_orders: 8`);

  // =========================================================================
  //  JOB REQUESTS  (job-requests page)
  // =========================================================================
  const jobRequestIds: number[] = [];
  for (let i = 0; i < 8; i++) {
    const jDate = addDays(BASE, -randInt(3, 100));
    const header = await prisma.hr_job_request.create({
      data: {
        rkm_talab: 200 + i,
        date_talab: ymd(jDate),
        date_talab_ar: dmy(jDate),
        dep_id_fk: depId(i),
        sub_dep_id_fk: depId(i + 1),
        job_title_id_fk: (i % 5) + 1,
        num_for_job: randInt(1, 3),
        job_type: pick([1, 2]), // 1=full,2=part
        job_natural: pick([1, 2]),
        date: ymd(jDate),
        date_ar: dmy(jDate),
        publisher: adminUser?.user_id ?? 1,
      },
    });
    jobRequestIds.push(header.id);
    // details (requirements)
    const reqs = pickN(['خبرة سنتين على الأقل', 'إجادة اللغة الإنجليزية', 'شهادة تدريب معتمدة', 'مهارات تواصل عالية', 'القدرة على العمل بنظام الورديات'], randInt(2, 4));
    for (const r of reqs) {
      await prisma.hr_job_request_details.create({
        data: { job_request_id_fk: header.id, type: 1, title: r },
      });
    }
  }
  // job_request_orders — candidate applications
  const candidateNames = ['فيصل العتيبي', 'ريم القحطاني', 'سعد الحربي', 'نورة الدوسري', 'ماجد الشهري', 'لمى الغامدي', 'تركي المطيري', 'هند الزهراني'];
  for (let i = 0; i < candidateNames.length; i++) {
    const aDate = addDays(BASE, -randInt(1, 40));
    await prisma.job_request_orders.create({
      data: {
        name: candidateNames[i],
        national_num: String(1000000000 + i),
        gender_id_fk: i % 2 === 0 ? 1 : 2,
        nationality_id_fk: 1,
        date_birth: ymd(addDays(BASE, -randInt(8000, 12000))),
        place_birth: pick(['الرياض', 'جدة', 'الدمام']),
        social_status: pick([1, 2]),
        city: pick(['الرياض', 'جدة', 'الدمام']),
        hai: pick(['العليا', 'النخيل', 'الملقا']),
        job_request_id_fk: jobRequestIds[i % jobRequestIds.length],
        mob: `05${randInt(0, 9)}${randInt(1000000, 9999999)}`,
        email: `applicant${i}@mail.test`,
        work_now: pick([0, 1]),
        interview_date: chance(0.5) ? ymd(addDays(BASE, randInt(1, 15))) : null,
        determine_interview: pick([0, 1]),
        do_interview: pick([0, 1]),
        total_degree: chance(0.5) ? String(randInt(60, 95)) : null,
        date: ymd(aDate),
        date_ar: dmy(aDate),
      },
    });
  }
  log('hr-affairs', `hr_job_request: ${jobRequestIds.length}, job_request_orders: ${candidateNames.length}`);

  // =========================================================================
  //  CIRCULARS / ANNOUNCEMENTS  (circulars page)
  // =========================================================================
  const circularDefs = [
    { title: 'تعميم مواعيد الدوام في رمضان', type: 'circular', subject: 'يبدأ الدوام الساعة العاشرة صباحاً وينتهي الرابعة عصراً خلال شهر رمضان المبارك.' },
    { title: 'تعميم بروتوكول النظافة', type: 'circular', subject: 'يرجى الالتزام بتعقيم الأجهزة بعد كل استخدام والحفاظ على نظافة الصالات.' },
    { title: 'إعلان اجتماع الفريق الشهري', type: 'advertisement', subject: 'يعقد الاجتماع الشهري لمناقشة الأداء والمستهدفات.' },
    { title: 'تعميم سياسة الإجازات الجديدة', type: 'circular', subject: 'اعتماد سياسة الإجازات المحدثة اعتباراً من بداية الشهر القادم.' },
    { title: 'إعلان دورة تدريبية للمدربين', type: 'advertisement', subject: 'دورة تدريبية معتمدة لجميع مدربي اللياقة.' },
    { title: 'تعميم تحديث نظام البصمة', type: 'circular', subject: 'تم تحديث نظام الحضور والانصراف، يرجى تسجيل البصمة عند الدخول والخروج.' },
  ];
  for (let i = 0; i < circularDefs.length; i++) {
    const c = circularDefs[i];
    const cDate = addDays(BASE, -randInt(1, 60));
    const isAdv = c.type === 'advertisement';
    const circ = await prisma.hr_ta3mem.create({
      data: {
        ta3mem_date: ymd(cDate),
        subject: c.subject,
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.user_id ?? 1,
        date: Math.floor(cDate.getTime() / 1000),
        date_ar: Math.floor(cDate.getTime() / 1000),
        ta3mem_title: c.title,
        type: c.type,
        adv_from_date: isAdv ? ymd(addDays(cDate, 3)) : null,
        adv_to_date: isAdv ? ymd(addDays(cDate, 5)) : null,
        adv_place: isAdv ? 'قاعة التدريب - المقر الرئيسي' : null,
        adv_time: isAdv ? '10:00' : null,
        send_all_t3mem: chance(0.5) ? 1 : 0,
      },
    });
    // recipients (details) — some seen, some not
    const recips = pickN(employees, randInt(4, 8));
    for (const e of recips) {
      const seen = chance(0.6);
      const sDate = addDays(cDate, randInt(0, 3));
      await prisma.hr_ta3mem_details.create({
        data: {
          ta3mem_id_fk: circ.id,
          emp_id: e.id,
          emp_code: e.emp_code,
          emp_name: e.employee,
          seen: seen ? 1 : 0,
          seen_date: seen ? ymd(sDate) : null,
          seen_time: seen ? hms(sDate) : null,
          type: c.type,
        },
      });
    }
    // attachment on some
    if (chance(0.4)) {
      await prisma.hr_ta3mem_attaches.create({
        data: {
          ta3mem_id_fk: circ.id,
          title: 'مرفق التعميم',
          file: `uploads/ta3mem/${circ.id}.pdf`,
          date: ymd(cDate),
          date_ar: dmy(cDate),
          publisher: adminUser?.user_id ?? 1,
          publisher_name: adminUser?.name ?? 'النظام',
        },
      });
    }
  }
  log('hr-affairs', `hr_ta3mem: ${circularDefs.length} (+details +attaches)`);

  // hr_ta3mem_msg — broadcast messages (+ details + attaches)
  for (let i = 0; i < 4; i++) {
    const mDate = addDays(BASE, -randInt(1, 30));
    const msg = await prisma.hr_ta3mem_msg.create({
      data: {
        msg_date: ymd(mDate),
        msg_title: pick(['رسالة تحفيزية للفريق', 'تذكير باجتماع الصباح', 'تهنئة بالإنجاز', 'تنبيه صيانة']),
        subject: 'رسالة عامة موجهة لجميع الموظفين في الفروع.',
        msg_f2a: 0,
        start_time: '09:00',
        start_date: ymd(mDate),
        moda: '1',
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.user_id ?? 1,
        date: Math.floor(mDate.getTime() / 1000),
        date_ar: Math.floor(mDate.getTime() / 1000),
        send_all_t3mem: 1,
      },
    });
    const recips = pickN(employees, randInt(3, 6));
    for (const e of recips) {
      await prisma.hr_ta3mem_msg_details.create({
        data: {
          ta3mem_msg_id_fk: msg.id,
          emp_id: e.id,
          emp_code: e.emp_code,
          emp_name: e.employee,
          type: 0,
          seen: chance(0.5) ? 1 : 0,
          send_all_t3mem: 1,
        },
      });
    }
    if (chance(0.4)) {
      await prisma.hr_ta3mem_msg_attaches.create({
        data: {
          ta3mem_msg_id_fk: msg.id,
          title: 'مرفق الرسالة',
          file: `uploads/ta3mem_msg/${msg.id}.pdf`,
          date: ymd(mDate),
          date_ar: dmy(mDate),
          publisher: adminUser?.user_id ?? 1,
          publisher_name: adminUser?.name ?? 'النظام',
        },
      });
    }
  }

  // hr_ta3mem_personal_msg — inbox/sent (messages page: inbox = to admin, sent = from admin)
  for (let i = 0; i < 10; i++) {
    const mDate = addDays(BASE, -randInt(1, 40));
    // Alternate direction so both inbox (to admin) and sent (from admin) have data
    const toAdmin = i % 2 === 0;
    const other = randEmp();
    const otherUser = userByEmpCode.get(other.emp_code);
    const fromUserId = toAdmin ? (otherUser?.user_id ?? hrUser?.user_id ?? 2) : adminUser?.user_id ?? 1;
    const fromEmpId = toAdmin ? other.id : (empByCode.get(adminUser?.emp_code ?? 1001)?.id ?? employees[0].id);
    const toUserId = toAdmin ? (adminUser?.user_id ?? 1) : (otherUser?.user_id ?? hrUser?.user_id ?? 2);
    const toEmp = toAdmin ? empByCode.get(adminUser?.emp_code ?? 1001) ?? employees[0] : other;

    const pm = await prisma.hr_ta3mem_personal_msg.create({
      data: {
        msg_date: ymd(mDate),
        msg_time: hms(mDate),
        msg_title: pick(['استفسار عن الراتب', 'طلب مقابلة', 'ملاحظة على الجدول', 'شكر وتقدير', 'متابعة طلب']),
        for_month: mDate.getMonth() + 1,
        for_year: mDate.getFullYear(),
        from_user_id: fromUserId,
        from_emp_id: fromEmpId,
        subject: 'رسالة شخصية بين الموظف والإدارة.',
        message: pick(['أرجو التكرم بالنظر في طلبي.', 'هل يمكن تحديد موعد للمقابلة؟', 'شكراً على جهودكم المتميزة.']),
        msg_f2a: 0,
        publisher: fromUserId,
        publisher_name: users.find((u) => u.user_id === fromUserId)?.name ?? 'النظام',
        date: ymd(mDate),
        date_ar: dmy(mDate),
        send_all_t3mem: 0,
        deleted: 0,
      },
    });
    await prisma.hr_ta3mem_personal_msg_details.create({
      data: {
        ta3mem_msg_id_fk: pm.id,
        to_user_id: toUserId,
        to_emp_id: toEmp.id,
        emp_code: toEmp.emp_code,
        emp_name: toEmp.employee,
        type: 0,
        seen: chance(0.5) ? 1 : 0,
        send_all_t3mem: 0,
        send_date: ymd(mDate),
        send_time: hms(mDate),
        deleted: 0,
        for_month: mDate.getMonth() + 1,
        for_year: mDate.getFullYear(),
        for_c_year: mDate.getFullYear(),
      },
    });
  }
  log('hr-affairs', `hr_ta3mem_msg: 4, hr_ta3mem_personal_msg: 10`);

  // =========================================================================
  //  EVALUATIONS  (evaluations page)
  // =========================================================================
  const taqdeerOpts = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول'];
  for (let i = 0; i < 12; i++) {
    const e = randEmp();
    const evDate = addDays(BASE, -randInt(1, 100));
    const total = randInt(60, 98);
    const ev = await prisma.hr_ta3en_moaqt_evaluation.create({
      data: {
        emp_id_fk: String(e.id),
        edara_id_fk: String(depId(i)),
        qsm_id_fk: String(depId(i)),
        total_degree: String(total),
        result_tagraba: total >= 70 ? 'اجتاز فترة التجربة' : 'يحتاج متابعة',
        taqdeer: total >= 90 ? 'ممتاز' : total >= 80 ? 'جيد جداً' : total >= 70 ? 'جيد' : 'مقبول',
        date: Math.floor(evDate.getTime() / 1000),
        date_ar: dmy(evDate),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
      },
    });
    // detail per criterion
    for (let s = 0; s < evalSettingDefs.length; s++) {
      await prisma.hr_ta3en_moaqt_evaluation_details.create({
        data: {
          evaluation_order_id: String(ev.id),
          emp_id_fk: String(e.id),
          evaluate_id_fk: String(evalSettingIds[s]),
          title: evalSettingDefs[s].title,
          max_degree: evalSettingDefs[s].degree,
          emp_degree: String(randInt(12, 20)),
        },
      });
    }
    // strengths / weaknesses points (type 1=strength, 2=weakness)
    await prisma.hr_ta3en_moaqt_evaluation_points.create({
      data: { evaluate_id_fk: ev.id, emp_id_fk: e.id, title: 'التزام عالٍ وحضور منتظم', type: 1, type_n: 'نقاط القوة' },
    });
    await prisma.hr_ta3en_moaqt_evaluation_points.create({
      data: { evaluate_id_fk: ev.id, emp_id_fk: e.id, title: 'يحتاج لتطوير مهارات التقارير', type: 2, type_n: 'نقاط التحسين' },
    });
  }
  log('hr-affairs', `hr_ta3en_moaqt_evaluation: 12 (+details +points)`);

  // =========================================================================
  //  CUSTODY  (custody page — emp_custody, emp_code holds employee id)
  // =========================================================================
  for (let i = 0; i < 14; i++) {
    const e = randEmp();
    const cDate = addDays(BASE, -randInt(10, 300));
    const item = custodyItemIds[i % custodyItemIds.length];
    await prisma.emp_custody.create({
      data: {
        emp_code: e.id, // service resolves employee via findUnique({ id: emp_code })
        custody_id_fk: item,
        custody_title: custodyItems[i % custodyItems.length].title,
        num: randInt(1, 3),
        status: pick([1, 2]), // 1=in-hand 2=returned
        date_recived: dmy(cDate),
        transfered: chance(0.2) ? 1 : 0,
      },
    });
  }
  log('hr-affairs', `emp_custody: 14`);

  // =========================================================================
  //  DAILY REPORTS  (daily-reports page)
  // =========================================================================
  for (let i = 0; i < 14; i++) {
    const e = randEmp();
    const rDate = addDays(BASE, -randInt(0, 40));
    await prisma.hr_dialy_reports.create({
      data: {
        send_date_ar: dmy(rDate),
        send_time: hms(rDate),
        emp_id_fk: e.id,
        title: pick(['تقرير مبيعات اليوم', 'تقرير حالة الأجهزة', 'تقرير حضور الأعضاء', 'تقرير نظافة الصالة']),
        status: chance(0.5) ? 'done' : 'inprogress',
        notes: pick([
          'تم إنجاز جميع المهام المطلوبة لهذا اليوم.',
          'يوجد جهازان يحتاجان صيانة عاجلة.',
          'ارتفاع في عدد الأعضاء الجدد اليوم.',
        ]),
        for_month: rDate.getMonth() + 1,
        for_year: rDate.getFullYear(),
        suspend: 0,
        rad_notes: chance(0.3) ? 'تمت مراجعة التقرير.' : null,
      },
    });
  }
  log('hr-affairs', `hr_dialy_reports: 14`);

  // tbl_takrer_yawmi — structured daily report (with bnod + details)
  const bnodDefs = ['المهام المنجزة', 'المشاكل والمعوقات', 'المقترحات', 'خطة الغد'];
  const bnodIds: number[] = [];
  for (const b of bnodDefs) {
    const row = await prisma.tbl_takrer_yawmi_bnod.create({ data: { band: b } });
    bnodIds.push(row.id);
  }
  for (let i = 0; i < 8; i++) {
    const e = randEmp();
    const tDate = addDays(BASE, -randInt(0, 30));
    const takrer = await prisma.tbl_takrer_yawmi.create({
      data: {
        emp_id_fk: e.id,
        emp_name: e.employee.slice(0, 50),
        branch_id_fk: e.branch_id_fk,
        date: ymd(tDate),
        date_ar: dmy(tDate),
        inserted_date: ymdhms(tDate),
        publisher: userByEmpCode.get(e.emp_code)?.user_id ?? 1,
        publisher_name: e.employee.slice(0, 50),
        time: hms(tDate),
      },
    });
    for (let b = 0; b < bnodDefs.length; b++) {
      await prisma.tbl_takrer_yawmi_details.create({
        data: {
          takrer_id_fk: takrer.id,
          band_id_fk: bnodIds[b],
          band_name: bnodDefs[b].slice(0, 100),
          text1: pick(['تم', 'قيد التنفيذ', 'مؤجل']),
          text2: 'ملاحظة',
        },
      });
    }
  }
  log('hr-affairs', `tbl_takrer_yawmi: 8 (+bnod +details)`);

  // =========================================================================
  //  ACTIVITIES / INITIATIVES / TASKS
  // =========================================================================
  // hr_ansheta — activities (activities page)
  for (let i = 0; i < 12; i++) {
    const e = randEmp();
    const aDate = addDays(BASE, -randInt(0, 45));
    const act = await prisma.hr_ansheta.create({
      data: {
        emp_id: e.id,
        title: pick(['حملة توعية باللياقة', 'يوم رياضي للأعضاء', 'ورشة تغذية صحية', 'تحدي اللياقة الشهري']),
        send_date: ymd(aDate),
        send_time: hms(aDate),
        suspend: 0,
        notes: 'نشاط ترويجي لتعزيز التفاعل مع الأعضاء.',
        rad_notes: chance(0.3) ? 'نشاط ناجح بمشاركة واسعة.' : null,
      },
    });
    if (chance(0.4)) {
      await prisma.hr_ansheta_files.create({
        data: { main_id_fk: act.id, file_name: `uploads/ansheta/${act.id}.jpg`, uploaded_on: ymd(aDate) },
      });
    }
  }
  log('hr-affairs', `hr_ansheta: 12`);

  // hr_mobadrat — initiatives (initiatives page)
  for (let i = 0; i < 12; i++) {
    const e = randEmp();
    const mDate = addDays(BASE, -randInt(0, 60));
    await prisma.hr_mobadrat.create({
      data: {
        send_date_ar: dmy(mDate),
        send_time: hms(mDate),
        emp_id_fk: e.id,
        title: pick(['مبادرة توفير الطاقة', 'مبادرة تحسين تجربة العضو', 'مبادرة السلامة أولاً', 'مبادرة الفريق الأخضر']),
        notes: 'مبادرة مقترحة من الموظف لتحسين بيئة العمل.',
        for_month: mDate.getMonth() + 1,
        for_year: mDate.getFullYear(),
        suspend: chance(0.5) ? SUS.APPROVED : SUS.INCOMING,
        rad_notes: chance(0.3) ? 'مبادرة معتمدة للتنفيذ.' : null,
      },
    });
  }
  log('hr-affairs', `hr_mobadrat: 12`);

  // hr_mosalat — tasks/assignments (tasks page). action_moder_rad spread.
  const decisions = ['wait', 'accepted', 'refused'];
  for (let i = 0; i < 12; i++) {
    const e = randEmp();
    const u = userByEmpCode.get(e.emp_code);
    const sDate = addDays(BASE, -randInt(1, 50));
    const mosala = await prisma.hr_mosalat.create({
      data: {
        mosala_rkm: 300 + i,
        mosala_date_ar: dmy(sDate),
        mosala_time: hms(sDate),
        emp_name: e.employee,
        emp_name_id: e.id,
        emp_user_id: u?.user_id ?? null,
        emp_edara: depTitle(i),
        emp_edara_id: depId(i),
        emp_qesm: depTitle(i),
        emp_qesm_id: depId(i),
        direct_manager_emp_id: employees[2].id,
        direct_manager_user_id: users.find((x) => x.emp_code === 1003)?.user_id ?? null,
        details: pick(['تكليف بالإشراف على الوردية المسائية', 'تكليف بتدريب الموظفين الجدد', 'تكليف بمتابعة صيانة الأجهزة']),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
        current_from_user_id: adminUser?.user_id ?? 1,
        current_from_user_name: adminUser?.name ?? 'النظام',
        current_to_user_id: u?.user_id ?? null,
        current_to_user_name: e.employee,
        send_to_hr: 'no',
        send_to_emp: 'yes',
        actions_sends: 'send_to_emp',
        send_from: 'hr',
        for_year: sDate.getFullYear(),
        for_month: sDate.getMonth() + 1,
        action_moder_rad: decisions[i % decisions.length],
        action_moder_date: dmy(addDays(sDate, 1)),
        action_moder_time: hms(sDate),
        action_moder_notes: chance(0.5) ? 'تم الاطلاع والتنفيذ.' : null,
      },
    });
    // mokalfat sub-tasks
    const tasks = pickN(['إعداد تقرير أسبوعي', 'متابعة حضور الفريق', 'فحص أجهزة الكارديو', 'تنظيم جدول الحصص'], randInt(1, 3));
    for (const t of tasks) {
      await prisma.hr_mosalat_mokalfat.create({
        data: { mosala_id_fk: mosala.id, mokalfa_id: 0, mokalfa_name: t, mokalfa_notes: 'مطلوب إنجازها خلال الأسبوع.' },
      });
    }
  }
  log('hr-affairs', `hr_mosalat: 12 (+mokalfat)`);

  // =========================================================================
  //  LEGAL FILES  (legal-files page)
  // =========================================================================
  const lawyehDefs = [
    'لائحة تنظيم العمل',
    'لائحة الجزاءات والمخالفات',
    'سياسة الإجازات',
    'دليل السلامة والصحة المهنية',
    'سياسة استخدام أجهزة النادي',
    'ميثاق أخلاقيات العمل',
    'لائحة المكافآت والحوافز',
  ];
  const lawyehIds: number[] = [];
  for (let i = 0; i < lawyehDefs.length; i++) {
    const lDate = addDays(BASE, -randInt(30, 400));
    const row = await prisma.hr_lawyeh_files.create({
      data: {
        f_file: `uploads/lawyeh/${i + 1}.pdf`,
        title: lawyehDefs[i],
        user_id: adminUser?.user_id ?? 1,
        added_date: ymd(lDate),
        added_time: hms(lDate),
      },
    });
    lawyehIds.push(row.id);
    // seen tracking — some employees marked as having read
    const seers = pickN(employees, randInt(3, 7));
    for (const e of seers) {
      const seen = chance(0.6);
      const sDate = addDays(lDate, randInt(1, 20));
      await prisma.hr_lawyeh_files_seens.create({
        data: {
          layha_id_fk: row.id,
          emp_id_fk: e.id,
          user_id_fk: userByEmpCode.get(e.emp_code)?.user_id ?? null,
          seen: seen ? 1 : 0,
          seen_date: seen ? ymd(sDate) : null,
          seen_time: seen ? hms(sDate) : null,
        },
      });
    }
  }
  log('hr-affairs', `hr_lawyeh_files: ${lawyehIds.length} (+seens)`);

  // =========================================================================
  //  SITE VISITS  (sites/visits page — tbl_sites, + mohmat + zeyarat + visits)
  // =========================================================================
  const siteDefs = [
    { name: 'مقر مكتب العمل', lat: 24.7136, long: 46.6753, site_name: 'مهمة حكومية' },
    { name: 'مكتب التأمينات الاجتماعية', lat: 24.6877, long: 46.7219, site_name: 'مراجعة تأمينات' },
    { name: 'فرع جدة - الروضة', lat: 21.5810, long: 39.1690, site_name: 'زيارة فرع' },
    { name: 'مورد الأجهزة الرياضية', lat: 24.7743, long: 46.7386, site_name: 'استلام معدات' },
    { name: 'البنك - العليا', lat: 24.6944, long: 46.6852, site_name: 'إجراءات بنكية' },
  ];
  const siteIds: number[] = [];
  for (const s of siteDefs) {
    const row = await prisma.tbl_sites.create({
      data: {
        name: s.name,
        s_lat: s.lat,
        s_long: s.long,
        radius: pick([100, 150, 200]),
        date_ar: dmy(BASE),
        publisher: adminUser?.user_id ?? 1,
        site_name: s.site_name,
      },
    });
    siteIds.push(row.id);
  }
  // tbl_mohmat_3mal — tasks/missions at a site (site records)
  for (let i = 0; i < 10; i++) {
    const e = randEmp();
    const mDate = addDays(BASE, -randInt(1, 30));
    const siteIdx = i % siteIds.length;
    await prisma.tbl_mohmat_3mal.create({
      data: {
        emp_id_fk: e.id,
        emp_name: e.employee,
        mohma_name: pick(['تسليم مستندات', 'مراجعة إجراءات', 'استلام معدات', 'متابعة معاملة']),
        mohma_date: ymd(mDate),
        site_id: siteIds[siteIdx],
        site_name: siteDefs[siteIdx].name.slice(0, 150),
        date_ar: dmy(mDate),
        date_s: ymd(mDate),
        publisher: adminUser?.user_id ?? 1,
      },
    });
  }
  // tbl_emp_zeyarat — employee GPS check-ins at sites (mobile-sourced)
  for (let i = 0; i < 12; i++) {
    const e = randEmp();
    const zDate = addDays(BASE, -randInt(0, 20));
    const siteIdx = i % siteDefs.length;
    await prisma.tbl_emp_zeyarat.create({
      data: {
        emp_id: e.id,
        emp_code: e.emp_code,
        emp_name: e.employee,
        site_lat: siteDefs[siteIdx].lat + randInt(-5, 5) / 10000,
        site_long: siteDefs[siteIdx].long + randInt(-5, 5) / 10000,
        date: ymd(zDate),
        zeyara_date: ymd(zDate),
        zeyara_time: hms(zDate),
        emp_img: `uploads/zeyarat/${e.emp_code}.jpg`,
        site_id: siteIds[siteIdx],
        site_name: siteDefs[siteIdx].name,
        notes: pick(['وصول في الموعد', 'تمت المهمة بنجاح', 'زيارة متابعة']),
      },
    });
  }
  // hr_locations_visits — field location visits (mobile-sourced)
  for (let i = 0; i < 8; i++) {
    const e = randEmp();
    const vDate = addDays(BASE, -randInt(0, 25));
    const siteIdx = i % siteDefs.length;
    await prisma.hr_locations_visits.create({
      data: {
        send_date_ar: dmy(vDate),
        send_time: hms(vDate),
        emp_id_fk: e.id,
        lat: String(siteDefs[siteIdx].lat),
        long: String(siteDefs[siteIdx].long),
        img_path: `uploads/visits/${e.emp_code}.jpg`,
        notes: pick(['زيارة ميدانية', 'متابعة موقع', 'تفقد الفرع']),
      },
    });
  }
  log('hr-affairs', `tbl_sites: ${siteIds.length}, mohmat: 10, zeyarat: 12, visits: 8`);

  // =========================================================================
  //  ENTDAB  (onboarding / mandate requests) — hr_entdab (+history)
  // =========================================================================
  for (let i = 0; i < 10; i++) {
    const e = randEmp();
    const u = userByEmpCode.get(e.emp_code);
    const dDate = addDays(BASE, -randInt(1, 60));
    const fromD = addDays(dDate, randInt(1, 5));
    const toD = addDays(fromD, randInt(1, 10));
    const makanIdx = i % makanIds.length;
    const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000));
    const entdab = await prisma.hr_entdab.create({
      data: {
        rkm_talab: 400 + i,
        emp_id_fk: e.id,
        emp_code: e.emp_code,
        emp_name: e.employee.slice(0, 150),
        edara_id_fk: depId(i),
        qsm_id_fk: depId(i),
        direct_manager_id_fk: employees[2].id,
        direct_manager_n: employees[2].employee.slice(0, 150),
        job_title_id_fk: (i % 5) + 1,
        mandate_type_fk: pick([1, 2]),
        mandate_direction: amakenDefs[makanIdx].mkan,
        mandate_distance: String(amakenDefs[makanIdx].distance),
        mandate_purpose: pick(['تسليم مستندات لمكتب العمل', 'مراجعة التأمينات الاجتماعية', 'زيارة فرع جدة', 'استلام معدات']),
        from_date: ymd(fromD),
        to_date: ymd(toD),
        num_days: String(days),
        bdal_count_method: '1',
        bdal_value: '300',
        bdal_total: String(300 * days),
        date: ymd(dDate),
        date_s: ymd(dDate),
        date_ar: dmy(dDate),
        publisher: adminUser?.user_id ?? 1,
        publisher_name: adminUser?.name ?? 'النظام',
        current_from_id: adminUser?.user_id ?? 1,
        current_from_name: adminUser?.name ?? 'النظام',
        current_to_id: hrUser?.user_id ?? null,
        current_to_name: hrUser?.name ?? null,
        level: 0,
        suspend: SUS_SPREAD[i % SUS_SPREAD.length] > 3 ? 1 : 0,
        seen: chance(0.6) ? 1 : 0,
        action_emp: 0,
        makan_id_fk: makanIds[makanIdx],
        emp_user_id: u?.user_id ?? null,
        for_month: dDate.getMonth() + 1,
        for_year: dDate.getFullYear(),
      },
    });
    await prisma.hr_entdab_history.create({
      data: {
        rkm_talab_fk: entdab.id,
        rkm_talab_id: 400 + i,
        from_user: adminUser?.user_id ?? 1,
        from_user_n: adminUser?.name ?? 'النظام',
        to_user: hrUser?.user_id ?? null,
        to_user_n: hrUser?.name ?? 'الموارد البشرية',
        option_choosed: pick(['اعتماد', 'إحالة', 'رفض']),
        level: 1,
        action_title: 'إنشاء طلب',
        process_title: 'انتداب',
        talab_in_title: 'طلب انتداب',
        talab_msg: 'تم إنشاء طلب الانتداب.',
        reason_action: 'ضرورة العمل',
        date_ar: dmy(dDate),
        date: ymd(dDate),
        publisher: adminUser?.name ?? 'النظام',
        suspend: '0',
        seen: 1,
        ttime: hms(dDate),
      },
    });
  }
  log('hr-affairs', `hr_entdab: 10 (+history)`);

  // =========================================================================
  //  CLEARANCE / TERMINATION
  // =========================================================================
  // hr_disclaimers — clearance forms grouped by disclaimer_id (termination/clearance)
  // Each group = one leaving employee, multiple rows share disclaimer_id.
  const leavers = pickN(employees, 6);
  const clearanceItems = ['مدير الفرع', 'المستودع', 'الموارد البشرية', 'المالية', 'تقنية المعلومات'];
  for (let g = 0; g < leavers.length; g++) {
    const e = leavers[g];
    const disclaimerId = g + 1;
    for (let r = 0; r < clearanceItems.length; r++) {
      await prisma.hr_disclaimers.create({
        data: {
          disclaimer_id: disclaimerId,
          adminstration_id: clearanceItems[r],
          notes: `إخلاء طرف من ${clearanceItems[r]} — لا يوجد ما يمنع.`,
          emp_id_fk: String(e.id),
          responsible_emp_id: String(employees[2].id),
          resignation: chance(0.5) ? 'استقالة' : 'انتهاء عقد',
          employee_card: 'تم التسليم',
          medical_card: 'تم التسليم',
          social_insurance: 'تم الإلغاء',
        },
      });
    }
  }
  log('hr-affairs', `hr_disclaimers: ${leavers.length} groups`);

  // hr_tayi_qyed — termination/archive records (termination/archive)
  for (let i = 0; i < 8; i++) {
    const e = randEmp();
    const fromD = addDays(BASE, -randInt(30, 400));
    const toD = addDays(fromD, randInt(30, 200));
    await prisma.hr_tayi_qyed.create({
      data: {
        emp_id: String(e.id),
        edara_id_fk: String(depId(i)),
        qsm_id_fk: String(depId(i)),
        direct_manger_id_fk: String(employees[2].id),
        from_date: ymd(fromD),
        from_date_ar: dmy(fromD),
        to_date: ymd(toD),
        to_date_ar: dmy(toD),
        date: ymd(BASE),
        date_s: ymd(BASE),
        publisher: String(adminUser?.user_id ?? 1),
      },
    });
  }
  log('hr-affairs', `hr_tayi_qyed: 8`);

  // =========================================================================
  //  LEGACY EMPLOYEES  (tbl_employees) — mirror ~10 real employees
  // =========================================================================
  const legacyEmps = employees.slice(0, 10);
  for (let i = 0; i < legacyEmps.length; i++) {
    const e = legacyEmps[i];
    const hire = addDays(BASE, -randInt(200, 1200));
    await prisma.tbl_employees.create({
      data: {
        emp_code: e.emp_code,
        edara_id_fk: depId(i),
        qsm_id_fk: depId(i),
        employee: e.employee.slice(0, 100),
        card_num: String(700000000000 + e.emp_code),
        card: 'yes',
        card_esdar_date: ymd(hire),
        card_enhaa_date: ymd(addDays(hire, 3650)),
        phone: 500000000 + (e.emp_code % 100000000),
        direct_manager_fk: employees[2].id,
        birth_date: ymd(addDays(BASE, -randInt(8000, 14000))),
        age: randInt(24, 48),
        gender: e.emp_type === 2 ? 2 : 1,
        adress: pick(['الرياض - العليا', 'الرياض - النخيل', 'جدة - الروضة']),
        nationality: 1,
        deyana: 1,
        job_title: pick(['مدرب لياقة', 'موظف استقبال', 'مشرف صالة', 'أخصائي مبيعات', 'محاسب']),
        employee_type: 1,
        date_ar: dmy(hire),
        date_s: ymd(hire),
        personal_photo: `uploads/emp/${e.emp_code}.jpg`,
        publisher: adminUser?.user_id ?? 1,
        qsm_n: depTitle(i),
        edara_n: depTitle(i),
        qualification_img: 'no',
        employee_qualification: pick(['بكالوريوس', 'دبلوم', 'ثانوي']),
        contract: 'دوام كامل',
        end_contract_date: ymd(addDays(hire, 730)),
        start_work_date: ymd(hire),
        khedma_year: randInt(0, 5),
        test_num_month: 3,
        end_test_date: ymd(addDays(hire, 90)),
        type_tamin: 'تأمين اجتماعي',
        markz_taklfa: 'مركز التكلفة الرئيسي',
        birth_img: 'yes',
        phesh_genai: 'no',
        ka3b_3ml: 'no',
        shahadt_jaish: 'no',
        military_service: 'no',
        person_img: 'yes',
        rokhsa_mihani: 'no',
        estkmal_nespa: 100,
        warady_type: 'راتب',
        warady_num: randInt(1, 999),
        tamin_rkm: 400000000 + e.emp_code,
        tamin_mosama_wazefy: 'موظف',
        tamin_date: ymd(hire),
        tamin_rateb: round2(e.basic_salary),
        tamin_hesa_emp: round2(e.basic_salary * 0.0975),
        tamin_hesa_oner: round2(e.basic_salary * 0.1175),
        download_app: 0,
        users_signatures: '0',
        app_users_signatures: '0',
        mosma_wazefy_n: 'موظف',
        direct_manager_code_fk: 1003,
      },
    });
  }
  log('hr-affairs', `tbl_employees: ${legacyEmps.length}`);

  console.log('✔ HrAffairs done');
}

// self-run for standalone testing
if (require.main === module) {
  seedHrAffairs()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
