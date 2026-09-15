/* eslint-disable no-console */
/**
 * Module 10 — HR Attendance / Shifts / Leaves / Permissions / Missions /
 *             Loans (salaf) / Payroll (mosayer) / Salary components.
 *
 * Seeds every "time & money" table so the HR side of the app renders:
 *   Attendance board/devices/rules/settings + shifts + check-in records
 *   Leaves (orders/history/attaches/settings + weekly off-days + balances)
 *   Permissions (ozonat orders/history/attaches/exceptions)
 *   Missions (mandate orders/history/settings)
 *   Loans (solaf orders + installments + postponements + settings + accounts)
 *   Payroll (mosayer runs/details/procedures/months/settings + insurance registers)
 *   Salary scale (hr_salary_doors) + salary raises (tbl_zeyada_rateb)
 *
 * Foundation (branches/employees/users/departments/jobs) is already seeded — reused via loaders.
 */
import {
  prisma, clearTables, log, reseed, randInt, pick, pickN, chance, round2,
  getBranchIds, getEmployees, getUsers, getDepartments, getJobs,
  BASE, addDays, ymd, dmy, ymdhms, hms,
} from './_shared';

// Legacy suspend workflow codes (shared by leaves/permissions/missions/loans)
const S_INCOMING = 0;
const S_APPROVED_L1 = 1;
const S_REJECTED = 2;
const S_INVESTIGATING = 3;
const S_APPROVED = 4;
const S_CANCELLED = 5;

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export async function seedHrAttendance(): Promise<void> {
  console.log('▶ HrAttendance…');
  reseed(20260701);

  // Children first, parents after — only THIS module's tables.
  await clearTables([
    // attendance check-in / config
    'tbl_hdoor_emps_history', 'tbl_hdoor_emps', 'tbl_emp_hdoor', 'tbl_hdoor_dawms_emps',
    'hr_emp_dwam_details', 'hr_emp_dwam', 'emp_attendance',
    'tbl_emps_hours_edafi', 'tbl_emps_shef_edafi',
    'tbl_hdodr_status', 'tbl_hdodr_setting',
    'attendance_devices', 'attendance_rules', 'attendance_channels',
    'tbl_gym_setting', 'holiday_setting', 'hr_emp_agazat_dayes',
    // leaves
    'hr_all_agzat_attaches', 'hr_all_agzat_history', 'hr_all_agzat_orders',
    'hr_agazat_sysat', 'hr_all_transformation_setting',
    // permissions
    'hr_all_ozonat_attaches', 'hr_all_ozonat_history', 'hr_all_ozonat_tamayoz', 'hr_all_ozonat_orders',
    // missions
    'hr_mandate_orders_history', 'hr_mandate_orders', 'hr_mandate_setting',
    // loans (salaf) — children first
    'hr_solaf_files_ta3gel', 'hr_solaf_files', 'hr_solaf_ta3gel', 'hr_solaf_tagel',
    'hr_solaf_quest', 'hr_solaf', 'hr_solaf_emp_hesbat', 'hr_solaf_dawabt',
    'hr_solaf_main_setting', 'hr_solf_transformation_setting',
    // payroll (mosayer) — children first
    'hr_mosayer_attechment', 'hr_mosayer_egraat', 'hr_mosayer_details', 'hr_mosayer_history', 'hr_mosayer',
    'hr_mosayer_tamenat_attaches', 'hr_mosayer_tamenat_egraat', 'hr_mosayer_tamenat_details',
    'hr_mosayer_tamenat_history', 'hr_mosayer_tamenat',
    'hr_mosayer_months', 'hr_mosayer_fe2at', 'hr_mosayer_sysat',
    // salary
    'tbl_zeyada_rateb', 'hr_salary_doors',
  ]);

  const branches = await getBranchIds();
  const employees = await getEmployees(); // {id, emp_code, employee, branch_id_fk, emp_type, basic_salary, phone}
  const users = await getUsers();          // {user_id, emp_code, name, level, branch_id_fk}
  const departments = await getDepartments();
  const jobs = await getJobs();

  const hrUser = users.find((u) => u.level === 1) ?? users[0];
  const hrUserId = hrUser?.user_id ?? 1;
  const hrUserName = hrUser?.name ?? 'مدير الموارد البشرية';
  const depId = departments[1]?.id ?? departments[0]?.id ?? 1;
  const depName = departments[1]?.title ?? 'الموارد البشرية';

  // Map emp_code -> its user_id (for approval routing)
  const userByEmpCode = new Map<number, number>();
  for (const u of users) if (u.emp_code != null) userByEmpCode.set(u.emp_code, u.user_id);

  const counts: Record<string, number> = {};
  const bump = (t: string, n = 1) => (counts[t] = (counts[t] ?? 0) + n);

  // Manual PK counters for tables whose `id` is NOT auto_increment.
  let ozonHistId = 1;
  let ozonAttachId = 1;
  let mosFe2atId = 1;
  let tamEgraatId = 1;
  let tamHistId = 1;

  // =========================================================================
  //  A. ATTENDANCE CONFIG — rules, channels, devices, shifts, shift-status
  // =========================================================================
  const ruleDefs = [
    { key: 'late', enabled: 1, threshold: '15', grace_min: '10', multiplier: '1' },
    { key: 'early_leave', enabled: 1, threshold: '15', grace_min: '10', multiplier: '1' },
    { key: 'absence', enabled: 1, threshold: '1', grace_min: '0', multiplier: '2' },
    { key: 'overtime', enabled: 1, threshold: '30', grace_min: '0', multiplier: '1.5' },
    { key: 'weekly_rest', enabled: 1, threshold: '1', grace_min: '0', multiplier: '1' },
    { key: 'holidays', enabled: 1, threshold: '0', grace_min: '0', multiplier: '2' },
    { key: 'flexible_hours', enabled: 0, threshold: '60', grace_min: '30', multiplier: '1' },
  ];
  for (const r of ruleDefs) { await prisma.attendance_rules.create({ data: r }); bump('attendance_rules'); }

  const channelDefs = [
    { key: 'device', enabled: 1, label: 'جهاز البصمة' },
    { key: 'app', enabled: 1, label: 'تطبيق الجوال' },
    { key: 'gps', enabled: 1, label: 'الموقع الجغرافي' },
    { key: 'qr', enabled: 1, label: 'رمز QR' },
    { key: 'nfc', enabled: 0, label: 'البطاقة الذكية NFC' },
    { key: 'face', enabled: 1, label: 'بصمة الوجه' },
  ];
  for (const c of channelDefs) { await prisma.attendance_channels.create({ data: c }); bump('attendance_channels'); }

  for (let i = 0; i < branches.length + 2; i++) {
    const b = branches[i % branches.length];
    await prisma.attendance_devices.create({
      data: {
        title: `جهاز البصمة - ${i + 1}`,
        ip: `192.168.${10 + i}.${randInt(20, 200)}`,
        branch_id_fk: b,
        last_sync: ymdhms(addDays(BASE, -randInt(0, 2))),
        status: chance(0.8) ? 'online' : 'offline',
        created_at: ymdhms(addDays(BASE, -randInt(60, 400))),
        updated_at: ymdhms(addDays(BASE, -randInt(0, 3))),
      },
    });
    bump('attendance_devices');
  }

  // Shifts (tbl_hdodr_setting) + shift status (tbl_hdodr_status)
  const shiftDefs = [
    { title: 'الدوام الصباحي', hf: '08:00', ht: '09:00', kf: '09:15', ef: '16:00', ekf: '15:45', et: '17:00' },
    { title: 'الدوام المسائي', hf: '15:00', ht: '16:00', kf: '16:15', ef: '22:00', ekf: '21:45', et: '23:00' },
    { title: 'دوام السيدات', hf: '09:00', ht: '10:00', kf: '10:15', ef: '17:00', ekf: '16:45', et: '18:00' },
    { title: 'دوام مرن', hf: '07:00', ht: '11:00', kf: '11:15', ef: '15:00', ekf: '14:45', et: '19:00' },
  ];
  const shiftIds: number[] = [];
  for (const s of shiftDefs) {
    const row = await prisma.tbl_hdodr_setting.create({
      data: {
        title: s.title,
        hdoor_from_time: s.hf, hdoor_to_time: s.ht, hdoor_khasm_from: s.kf,
        ensraf_from_time: s.ef, ensraf_khasm_from: s.ekf, ensraf_to_time: s.et,
      },
    });
    shiftIds.push(row.id);
    bump('tbl_hdodr_setting');
  }
  for (const s of shiftDefs) {
    await prisma.tbl_hdodr_status.create({
      data: { title: s.title.slice(0, 10), active: 'yes', branche: 'all' },
    });
    bump('tbl_hdodr_status');
  }

  // Legacy gym commission settings — one row per type, with the production legacy split.
  const gymRates: Array<{ ttype: 'target' | 'proten' | 'classes'; forUser: number; forGym: number }> = [
    { ttype: 'target', forUser: 0, forGym: 0 },
    { ttype: 'proten', forUser: 7, forGym: 93 },
    { ttype: 'classes', forUser: 40, forGym: 60 },
  ];
  for (const rate of gymRates) {
    await prisma.tbl_gym_setting.create({
      data: {
        ttype: rate.ttype,
        for_user: rate.forUser,
        for_gym: rate.forGym,
        date_ar: ymd(BASE),
        date_s: String(Math.floor(BASE.getTime() / 1000)),
        publisher: hrUserId,
        publisher_name: hrUserName,
      },
    });
    bump('tbl_gym_setting');
  }

  // Holidays (holiday_setting) — also used as leave "types" list + payroll holidays
  const holidayDefs = [
    { name: 'إجازة سنوية', num: 30, mx: 30, mn: 1, ttype: 0 },
    { name: 'إجازة مرضية', num: 30, mx: 30, mn: 1, ttype: 0 },
    { name: 'إجازة اضطرارية', num: 5, mx: 5, mn: 1, ttype: 0 },
    { name: 'إجازة أمومة', num: 70, mx: 70, mn: 10, ttype: 0 },
    { name: 'إجازة بدون راتب', num: 0, mx: 90, mn: 1, ttype: 0 },
    { name: 'إجازة زواج', num: 5, mx: 5, mn: 1, ttype: 0 },
    { name: 'اليوم الوطني', num: 1, mx: 1, mn: 1, ttype: 1, from: '2026-09-23', to: '2026-09-23' },
    { name: 'عيد الفطر', num: 4, mx: 4, mn: 4, ttype: 1, from: '2026-03-20', to: '2026-03-23' },
    { name: 'عيد الأضحى', num: 4, mx: 4, mn: 4, ttype: 1, from: '2026-05-27', to: '2026-05-30' },
    { name: 'يوم التأسيS', num: 1, mx: 1, mn: 1, ttype: 1, from: '2026-02-22', to: '2026-02-22' },
  ];
  for (const h of holidayDefs) {
    await prisma.holiday_setting.create({
      data: {
        name: h.name,
        num_days: h.num, max_days: h.mx, min_days: h.mn,
        mowazf_badel: 0, agaza_ttype: h.ttype,
        date_from: (h as any).from ?? null, date_to: (h as any).to ?? null,
        active: 'yes',
      },
    });
    bump('holiday_setting');
  }

  // Weekly off-days (hr_emp_agazat_dayes) — one/two per employee
  for (const e of employees) {
    const offs = pickN(['الجمعة', 'السبت', 'الأحد'], chance(0.4) ? 2 : 1);
    for (const off of offs) {
      await prisma.hr_emp_agazat_dayes.create({
        data: {
          emp_id_fk: e.id,
          emp_name: e.employee ?? `موظف ${e.emp_code}`,
          emp_code_fk: e.emp_code ?? 0,
          off_day: off,
          date_ar: dmy(addDays(BASE, -randInt(30, 300))),
          publisher: hrUserId,
        },
      });
      bump('hr_emp_agazat_dayes');
    }
  }

  // Transformation settings (approval-workflow rows) for leaves & loans
  const transDefs = [
    { title: 'المدير المباشر', tbl: 'agazat', level: 1, msg_accept: 'تم الاعتماد', msg_refuse: 'تم الرفض' },
    { title: 'مدير الموارد', tbl: 'agazat', level: 2, msg_accept: 'تم الاعتماد', msg_refuse: 'تم الرفض' },
    { title: 'المدير العام', tbl: 'agazat', level: 3, msg_accept: 'اعتماد نهائي', msg_refuse: 'رفض نهائي' },
  ];
  for (const t of transDefs) {
    await prisma.hr_all_transformation_setting.create({ data: t });
    bump('hr_all_transformation_setting');
    await prisma.hr_solf_transformation_setting.create({
      data: { ...t, tbl: 'solaf' },
    });
    bump('hr_solf_transformation_setting');
  }

  // =========================================================================
  //  B. EMPLOYEE SHIFT ASSIGNMENT (hr_emp_dwam + details) & dwam-emp links
  // =========================================================================
  const yearStart = new Date('2026-01-01T00:00:00Z');
  const fromEpoch = Math.floor(yearStart.getTime() / 1000);
  const toEpoch = Math.floor(new Date('2026-12-31T00:00:00Z').getTime() / 1000);

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    const shiftIdx = e.emp_type === 2 ? 2 : i % 2; // women -> ladies shift
    const dwamId = shiftIds[shiftIdx];
    const morning = shiftIdx !== 1;
    await prisma.hr_emp_dwam.create({
      data: {
        emp_id: e.id,
        emp_code: String(e.emp_code ?? ''),
        always_id_fk: 0,
        period_id_fk: dwamId,
        attend_time: morning ? '08:00' : '15:00',
        leave_time: morning ? '16:00' : '22:00',
        start_enter: morning ? '07:30' : '14:30',
        end_enter: morning ? '09:00' : '16:00',
        start_out: morning ? '15:30' : '21:30',
        end_out: morning ? '17:00' : '23:00',
        from_date: fromEpoch,
        from_date_ar: dmy(yearStart),
        to_date: toEpoch,
        to_date_ar: dmy(new Date('2026-12-31T00:00:00Z')),
        saturday: 1, sunday: 1, monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 0,
      },
    });
    bump('hr_emp_dwam');

    await prisma.hr_emp_dwam_details.create({
      data: {
        emp_id: e.id,
        emp_code: String(e.emp_code ?? '0'),
        num_in_device: String(1000 + i),
        device_id_fk: String(randInt(1, branches.length + 2)),
        period_id_fk: String(dwamId),
        from_day: 'السبت',
        to_day: 'الخميس',
        no3_dawam: e.emp_type === 2 && chance(0.3) ? 'half' : 'full',
      },
    });
    bump('hr_emp_dwam_details');

    await prisma.tbl_hdoor_dawms_emps.create({
      data: {
        dwam_id_fk: dwamId,
        emp_id_fk: e.id,
        emp_code_fk: e.emp_code ?? 0,
        type: 'emp',
        b_name: 'الفرع',
        branche_sub_work_id_fk: 0,
        t_type: 1,
        branch_id_fk: String(e.branch_id_fk ?? branches[0]),
      },
    });
    bump('tbl_hdoor_dawms_emps');
  }

  // =========================================================================
  //  C. ATTENDANCE CHECK-IN RECORDS (tbl_hdoor_emps + history, tbl_emp_hdoor,
  //     emp_attendance) — cover today (BASE) + prior days for the board & reports
  // =========================================================================
  // Work backwards from BASE over ~20 working days; today first so board shows current.
  const attendanceDays: Date[] = [];
  {
    let d = new Date(BASE);
    while (attendanceDays.length < 22) {
      const dow = d.getUTCDay(); // 5 = Friday off
      if (dow !== 5) attendanceDays.push(new Date(d));
      d = addDays(d, -1);
    }
  }

  for (const day of attendanceDays) {
    const iso = ymd(day);           // 'YYYY-MM-DD' used by action_date / action_date_s range filters
    const month = day.getUTCMonth() + 1;
    const year = day.getUTCFullYear();
    // ~85% of employees checked in each day
    for (const e of employees) {
      if (!chance(0.85)) continue;
      const morning = (e.emp_type === 2) || chance(0.6);
      const dwamHdoor = morning ? '08:00' : '15:00';
      const dwamEnsraf = morning ? '16:00' : '22:00';
      const lateMin = chance(0.25) ? randInt(3, 45) : 0;
      const earlyMin = chance(0.15) ? randInt(3, 30) : 0;
      const hh = morning ? 8 : 15;
      const mm = lateMin;
      const hdoorTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const outH = morning ? 16 : 22;
      const ensrafTime = `${String(outH).padStart(2, '0')}:${String(60 - (earlyMin || 0)).padStart(2, '0')}`.replace(':60', ':00');
      const branch = e.branch_id_fk ?? branches[0];
      const dwamId = e.emp_type === 2 ? shiftIds[2] : shiftIds[0];

      await prisma.tbl_hdoor_emps.create({
        data: {
          member_code: e.emp_code ?? 0,
          member_id: e.id,
          action_date: iso,
          action_date_s: iso,
          hdoor_time: hdoorTime,
          dwam_hdoor_time: dwamHdoor,
          late_min: lateMin,
          ensraf_time: ensrafTime,
          dwam_ensraf_time: dwamEnsraf,
          mobaker_min: earlyMin,
          hdoor_user_id: userByEmpCode.get(e.emp_code ?? -1) ?? hrUserId,
          ensraf_user_id: userByEmpCode.get(e.emp_code ?? -1) ?? hrUserId,
          ttype: 'hdoor',
          action_time: hdoorTime,
          num_min: 0,
          tasgel_type: chance(0.7) ? 'automatic' : 'manual',
          for_month: month,
          for_year: year,
          mobker_hdor: 0,
          sheft_type: 1,
          branch_id_fk: branch,
          dwam_id_fk: dwamId,
        },
      });
      bump('tbl_hdoor_emps');

      // history: a hdoor + ensraf pair for the same record (a few, not all)
      if (chance(0.35)) {
        await prisma.tbl_hdoor_emps_history.create({
          data: {
            member_code: e.emp_code ?? 0, member_id: e.id,
            action_date: iso, action_date_s: iso,
            hdoor_ensraf_time: hdoorTime, dwam_hdoor_time: dwamHdoor,
            setting_time: dwamHdoor, ttype: 'hdoor', action_time: hdoorTime,
          },
        });
        bump('tbl_hdoor_emps_history');
      }
    }
  }

  // tbl_emp_hdoor — flattened daily attendance report (all NOT-NULL cols required)
  for (const day of attendanceDays.slice(0, 10)) {
    const iso = ymd(day);
    const arDate = dmy(day);
    for (const e of employees) {
      if (!chance(0.7)) continue;
      const morning = e.emp_type === 2 || chance(0.6);
      const absent = chance(0.06);
      await prisma.tbl_emp_hdoor.create({
        data: {
          emp_code: e.emp_code ?? 0,
          emp_name: e.employee ?? `موظف ${e.emp_code}`,
          date_ar: arDate,
          date: iso,
          hdoor_time: morning ? '08:00' : '15:00',
          ensraf_time: morning ? '16:00' : '22:00',
          actual_hdoor_time: absent ? '00:00' : (morning ? '08:05' : '15:03'),
          actual_ensraf_time: absent ? '00:00' : (morning ? '16:02' : '22:01'),
          absent: absent ? 'yes' : 'no',
          hour_works: absent ? 0 : 8,
          edara_n: depName,
          publisher: hrUserId,
          publisher_name: hrUserName,
          inserted_date: ymdhms(day),
        },
      });
      bump('tbl_emp_hdoor');
    }
  }

  // emp_attendance — legacy summary rows (emp_id is a CSV text; date is int day count)
  for (let i = 0; i < 12; i++) {
    const e = pick(employees);
    await prisma.emp_attendance.create({
      data: {
        emp_id: String(e.id),
        date: randInt(20, 26), // present days in month
        presence: String(randInt(20, 26)),
        dissuasion: String(randInt(0, 3)),
        diff: String(randInt(0, 6)),
      },
    });
    bump('emp_attendance');
  }

  // Extra hours (tbl_emps_hours_edafi) + extra shifts (tbl_emps_shef_edafi)
  for (let i = 0; i < 14; i++) {
    const e = pick(employees);
    const d = addDays(BASE, -randInt(1, 45));
    await prisma.tbl_emps_hours_edafi.create({
      data: {
        emp_id_fk: e.id,
        emp_code_fk: e.emp_code ?? 0,
        emp_name: e.employee ?? `موظف ${e.emp_code}`,
        branch_id_fk: e.branch_id_fk ?? branches[0],
        num_hours: randInt(1, 5),
        date_ar: dmy(d),
        date_s: ymd(d),
        edafa_date: ymd(d),
        publisher: hrUserId,
        publisher_emp_id: hrUser?.emp_code ?? 0,
      },
    });
    bump('tbl_emps_hours_edafi');
  }
  for (let i = 0; i < 12; i++) {
    const e = pick(employees);
    const d = addDays(BASE, -randInt(1, 45));
    await prisma.tbl_emps_shef_edafi.create({
      data: {
        emp_id_fk: e.id,
        emp_name: e.employee ?? `موظف ${e.emp_code}`,
        ttype: 1,
        dwam_id_fk: pick(shiftIds),
        sheft_date: ymd(d),
        emp_code_fk: e.emp_code ?? 0,
        branch_id_fk: e.branch_id_fk ?? branches[0],
        date_ar: dmy(d),
        date_s: ymd(d),
        publisher: hrUserId,
        publisher_emp_id: hrUser?.emp_code ?? 0,
      },
    });
    bump('tbl_emps_shef_edafi');
  }

  // =========================================================================
  //  D. LEAVE SETTINGS + LEAVE ORDERS (hr_all_agzat_orders + history + attaches)
  // =========================================================================
  await prisma.hr_agazat_sysat.create({
    data: {
      min_nums_in_year: 5, emergency_nums_in_year: 5, max_nums_in_year: 30,
      moda_takdem_talb: 3, min_nums_in_talb: 1, moda_takdem_talb_min: 1,
      is_avlible_no_sallary_agaza: 1,
    },
  });
  bump('hr_agazat_sysat');

  // Spread leave orders across statuses. Approved annual leaves (f2a_agaza=1, suspend=4,
  // year=2026) power the balances page.
  const leaveStatuses = [
    S_APPROVED, S_APPROVED, S_APPROVED, S_APPROVED, S_APPROVED_L1,
    S_INCOMING, S_INCOMING, S_REJECTED, S_INVESTIGATING, S_APPROVED,
    S_APPROVED, S_APPROVED, S_APPROVED_L1, S_INCOMING,
  ];
  let agazaRkm = 5001;
  for (let i = 0; i < 16; i++) {
    const e = pick(employees);
    const suspend = leaveStatuses[i % leaveStatuses.length];
    // Keep starts inside 2026 so approved-annual rows land in the balances year.
    const start = addDays(BASE, randInt(-150, -1));
    const days = randInt(1, 7);
    const end = addDays(start, days - 1);
    const back = addDays(end, 1);
    // First 8 orders are annual leave (no3_agaza=1, f2a_agaza=1) so the
    // balances/carryover pages (suspend=4, year=2026, f2a_agaza=1) have data.
    const annual = i < 8;
    const noTypeId = annual ? 1 : pick([2, 3, 4, 5, 6]);
    const empUserId = userByEmpCode.get(e.emp_code ?? -1) ?? null;
    const approved = suspend === S_APPROVED || suspend === S_APPROVED_L1;
    const rejected = suspend === S_REJECTED || suspend === S_CANCELLED;
    const dirManager = pick(employees.filter((x) => x.emp_type === 1)) ?? e;

    const order = await prisma.hr_all_agzat_orders.create({
      data: {
        agaza_rkm: agazaRkm,
        agaza_date: ymd(addDays(start, -randInt(3, 10))),
        agaza_date_ar: dmy(addDays(start, -randInt(3, 10))),
        no3_agaza: noTypeId,
        f2a_agaza: annual ? 1 : 2,
        fatra_agaza: 1,
        emp_id_fk: e.id,
        emp_code_fk: BigInt(e.emp_code ?? 0),
        edara_id_fk: depId,
        edara_n: depName,
        qsm_id_fk: 0,
        qsm_n: '',
        direct_manager_id_fk: dirManager.id,
        direct_manager_code_fk: BigInt(dirManager.emp_code ?? 0),
        direct_manager_n: dirManager.employee ?? '',
        agaza_from_date_m: ymd(start),
        agaza_to_date_m: ymd(end),
        agaza_from_date: Math.floor(start.getTime() / 1000),
        agaza_to_date: Math.floor(end.getTime() / 1000),
        num_days: days,
        allDayes: days,
        rased_motah: 30,
        mobashret_amal_date_m: ymd(back),
        emp_jwal: e.phone ?? '0500000000',
        month: start.getUTCMonth() + 1,
        year: start.getUTCFullYear(),
        for_year: start.getUTCFullYear(),
        action_direct_manager: approved ? 1 : (rejected ? 2 : 0),
        action_mowazf_moktas: 0,
        action_moder_hr: approved ? 1 : 0,
        action_moder_final: suspend === S_APPROVED ? 1 : 0,
        suspend,
        current_from_user_id: empUserId,
        current_from_user_name: e.employee ?? '',
        current_to_user_id: approved ? hrUserId : (empUserId ?? hrUserId),
        current_to_user_name: hrUserName,
        talab_in_fk: 1,
        talab_in_title: 'طلب إجازة',
        level: approved ? 3 : 1,
        talab_msg: 'طلب إجازة جديد',
        reason: pick(['ظرف عائلي', 'سفر', 'إجازة سنوية', 'مراجعة طبية', 'مناسبة']),
        reason_action: approved ? 'موافقة' : (rejected ? 'رفض' : 'قيد المراجعة'),
        seen: 1,
        without_salary: noTypeId === 5 ? 1 : 0,
        publisher: empUserId ?? hrUserId,
        publisher_name: e.employee ?? '',
        current_date_s: ymd(BASE),
        agaza_from_day_n: DAY_NAMES[start.getUTCDay()],
        agaza_to_day_n: DAY_NAMES[end.getUTCDay()],
        mobashret_amal_day_n: DAY_NAMES[back.getUTCDay()],
        approve_direct_manager: approved ? 'accept' : (rejected ? 'refuse' : 'wait'),
        approve_hr: suspend === S_APPROVED ? 'accept' : 'wait',
        approve_moder_3am: suspend === S_APPROVED ? 'accept' : 'wait',
        close_talab: suspend === S_APPROVED ? 'close_talab' : 'wait',
        actions_sends: suspend === S_INCOMING ? 'start' : 'progress',
      },
    });
    bump('hr_all_agzat_orders');

    // history trail
    await prisma.hr_all_agzat_history.create({
      data: {
        agaza_rkm_fk: agazaRkm, agaza_id_fk: order.id,
        from_user: empUserId ?? hrUserId, from_user_n: e.employee ?? '',
        to_user: dirManager.id, to_user_n: dirManager.employee ?? '',
        talab_in_fk: 1, talab_in_title: 'طلب إجازة', level: '1',
        talab_msg: 'إرسال', reason_action: 'بدء الطلب',
        date: ymd(addDays(start, -randInt(3, 10))), date_ar: dmy(addDays(start, -randInt(3, 10))), seen: 1,
      },
    });
    bump('hr_all_agzat_history');
    if (approved) {
      await prisma.hr_all_agzat_history.create({
        data: {
          agaza_rkm_fk: agazaRkm, agaza_id_fk: order.id,
          from_user: dirManager.id, from_user_n: dirManager.employee ?? '',
          to_user: hrUserId, to_user_n: hrUserName,
          talab_in_fk: 1, talab_in_title: 'طلب إجازة', level: '2',
          talab_msg: 'اعتماد', reason_action: 'موافقة', date: ymd(start), date_ar: dmy(start), seen: 1,
        },
      });
      bump('hr_all_agzat_history');
    }
    // an attachment for medical leaves
    if (noTypeId === 2 && chance(0.6)) {
      await prisma.hr_all_agzat_attaches.create({
        data: {
          talab_id_fk: order.id, title: 'تقرير طبي',
          file: `uploads/leaves/${agazaRkm}-medical.pdf`,
          date: ymd(start), date_ar: dmy(start), time: hms(start),
          publisher: empUserId ?? hrUserId, publisher_name: e.employee ?? '',
        },
      });
      bump('hr_all_agzat_attaches');
    }
    agazaRkm++;
  }

  // =========================================================================
  //  E. PERMISSIONS (hr_all_ozonat_orders + history + attaches + tamayoz)
  // =========================================================================
  const permStatuses = [S_APPROVED, S_APPROVED, S_APPROVED_L1, S_INCOMING, S_REJECTED, S_APPROVED, S_INCOMING];
  let eznRkm = 7001;
  for (let i = 0; i < 15; i++) {
    const e = pick(employees);
    const suspend = permStatuses[i % permStatuses.length];
    const d = addDays(BASE, randInt(-40, 0));
    const fromH = randInt(9, 13);
    const toH = fromH + randInt(1, 3);
    const empUserId = userByEmpCode.get(e.emp_code ?? -1) ?? null;
    const approved = suspend === S_APPROVED || suspend === S_APPROVED_L1;
    const rejected = suspend === S_REJECTED || suspend === S_CANCELLED;
    const dirManager = pick(employees.filter((x) => x.emp_type === 1)) ?? e;

    const order = await prisma.hr_all_ozonat_orders.create({
      data: {
        ezn_rkm: eznRkm,
        ezn_date: ymd(d),
        ezn_date_ar: dmy(d),
        ezn_month: d.getUTCMonth() + 1,
        ezn_year: d.getUTCFullYear(),
        no3_ezn: 1, // personal permission (drives permissions.available())
        fatra_fk: 1,
        fatra_n: 'صباحي',
        from_hour: `${String(fromH).padStart(2, '0')}:00`,
        to_hour: `${String(toH).padStart(2, '0')}:00`,
        total_hours: toH - fromH,
        reason: pick(['مراجعة حكومية', 'ظرف طارئ', 'موعد طبي', 'مشوار شخصي']),
        emp_id_fk: e.id,
        emp_user_id: empUserId,
        emp_code_fk: e.emp_code ?? 0,
        edara_id_fk: depId,
        edara_n: depName,
        qsm_id_fk: 0,
        qsm_n: '',
        direct_manager_id_fk: dirManager.id,
        direct_manager_code_fk: dirManager.emp_code ?? 0,
        direct_manager_n: dirManager.employee ?? '',
        date: ymd(d),
        date_ar: dmy(d),
        publisher: empUserId ?? hrUserId,
        publisher_name: e.employee ?? '',
        level: approved ? 3 : 1,
        suspend,
        cancel: 'no',
        talab_in_fk: 1,
        talab_in_title: 'طلب إذن',
        talab_msg: 'طلب إذن',
        reason_action: approved ? 'موافقة' : (rejected ? 'رفض' : 'قيد المراجعة'),
        emp_name: e.employee ?? `موظف ${e.emp_code}`,
        job_title: 'موظف',
        seen: 1,
        action_direct_manager: approved ? 1 : (rejected ? 2 : 0),
        action_moder_hr: approved ? 1 : 0,
        action_moder_final: suspend === S_APPROVED ? 1 : 0,
        current_from_user_id: empUserId,
        current_to_user_id: approved ? hrUserId : (empUserId ?? hrUserId),
        current_from_user_name: e.employee ?? '',
        current_to_user_name: hrUserName,
        need_report: 'no',
        approve_direct_manager: approved ? 'accept' : (rejected ? 'refuse' : 'wait'),
        approve_hr: suspend === S_APPROVED ? 'accept' : 'wait',
        approve_moder_3am: suspend === S_APPROVED ? 'accept' : 'wait',
        close_talab: suspend === S_APPROVED ? 'close_talab' : 'wait',
        actions_sends: suspend === S_INCOMING ? 'start' : 'progress',
      },
    });
    bump('hr_all_ozonat_orders');

    await prisma.hr_all_ozonat_history.create({
      data: {
        id: ozonHistId++,
        ezn_rkm_fk: eznRkm, ezn_rkm_id: order.id,
        from_user_id: empUserId ?? hrUserId, from_user_name: e.employee ?? '',
        to_user_id: dirManager.id, to_user_name: dirManager.employee ?? '',
        level: 1, talab_in_fk: 1, talab_in_title: 'طلب إذن',
        talab_msg: 'إرسال', reason_action: 'بدء الطلب',
        date: ymd(d), date_ar: dmy(d), suspend: String(suspend), seen: 1,
      },
    });
    bump('hr_all_ozonat_history');
    if (chance(0.3)) {
      await prisma.hr_all_ozonat_attaches.create({
        data: {
          id: ozonAttachId++,
          talab_id_fk: order.id, title: 'مرفق الإذن',
          file: `uploads/perms/${eznRkm}.pdf`,
          date: ymd(d), date_ar: dmy(d), time: hms(d),
          publisher: empUserId ?? hrUserId, publisher_name: e.employee ?? '',
        },
      });
      bump('hr_all_ozonat_attaches');
    }
    eznRkm++;
  }
  // permission exceptions per department
  for (const dep of departments.slice(0, 5)) {
    await prisma.hr_all_ozonat_tamayoz.create({
      data: {
        edara_id: dep.id,
        from_date: '2026-01-01',
        to_date: '2026-12-31',
        num_koli: randInt(2, 4),
        num_gozy: randInt(4, 8),
        marat: randInt(2, 5),
      },
    });
    bump('hr_all_ozonat_tamayoz');
  }

  // =========================================================================
  //  F. MISSIONS (hr_mandate_orders + history + settings)
  // =========================================================================
  const mandateTypes = [
    { title: 'مأمورية داخلية', color: '#3498db' },
    { title: 'مأمورية خارجية', color: '#e67e22' },
    { title: 'دورة تدريبية', color: '#2ecc71' },
    { title: 'زيارة فرع', color: '#9b59b6' },
  ];
  const mandateTypeIds: number[] = [];
  let mcode = 9100;
  for (const m of mandateTypes) {
    const row = await prisma.hr_mandate_setting.create({
      data: {
        code: BigInt(mcode), title: m.title, color: m.color, from_code: mcode,
        date: Math.floor(BASE.getTime() / 1000), date_ar: dmy(BASE),
        publisher: hrUserId, publisher_name: hrUserName,
      },
    });
    mandateTypeIds.push(row.id);
    mcode++;
    bump('hr_mandate_setting');
  }

  const missionStatuses = [S_APPROVED, S_APPROVED, S_APPROVED_L1, S_INCOMING, S_INCOMING, S_REJECTED, S_INVESTIGATING, S_APPROVED];
  let mandateRkm = 8001;
  for (let i = 0; i < 12; i++) {
    const e = pick(employees);
    const suspend = missionStatuses[i % missionStatuses.length];
    const start = addDays(BASE, randInt(-30, 25));
    const days = randInt(1, 4);
    const end = addDays(start, days - 1);
    const empUserId = userByEmpCode.get(e.emp_code ?? -1) ?? null;
    const approved = suspend === S_APPROVED || suspend === S_APPROVED_L1;
    const dirManager = pick(employees.filter((x) => x.emp_type === 1)) ?? e;
    const bdalValue = randInt(150, 400);
    const jobId = jobs[i % jobs.length]?.id ?? 1;

    const order = await prisma.hr_mandate_orders.create({
      data: {
        rkm_talab: mandateRkm,
        emp_id_fk: e.id,
        edara_id_fk: depId,
        qsm_id_fk: 0,
        direct_manager_id_fk: dirManager.id,
        job_title_id_fk: jobId,
        mandate_type_fk: pick(mandateTypeIds),
        mandate_direction: pick(['الرياض - جدة', 'الرياض - الدمام', 'داخل المدينة', 'الرياض - أبها']),
        mandate_distance: String(randInt(5, 900)),
        mandate_purpose: pick(['حضور اجتماع', 'تدريب فريق', 'زيارة فرع', 'مهمة تسويقية']),
        from_date: ymd(start),
        to_date: ymd(end),
        num_days: String(days),
        bdal_count_method: '1',
        bdal_value: String(bdalValue),
        bdal_total: String(bdalValue * days),
        date: ymd(addDays(start, -randInt(2, 8))),
        date_s: ymd(addDays(start, -randInt(2, 8))),
        date_ar: dmy(addDays(start, -randInt(2, 8))),
        publisher: empUserId ?? hrUserId,
        publisher_name: e.employee ?? '',
        approved_direct_manager: approved ? 1 : 0,
        direct_manger_reason: approved ? 'موافقة' : '0',
        specific_emp_id: 0,
        approved_specific_emp: 0,
        specific_emp_reason: '0',
        current_from_id: String(empUserId ?? hrUserId),
        current_to_id: String(hrUserId),
        current_procedure: '1',
        current_process_title: 'المدير المباشر',
        last_from_id: '0', last_to_id: '0', last_procedure: '0', last_process_title: '0',
        procedure_level: '1',
        current_from_user_id: empUserId,
        current_from_user_name: e.employee ?? '',
        current_to_user_id: approved ? hrUserId : (empUserId ?? hrUserId),
        current_to_user_name: hrUserName,
        level: approved ? 2 : 1,
        suspend,
        talab_in_fk: 1,
        talab_in_title: 'طلب مأمورية',
        talab_msg: 'طلب مأمورية',
        reason_action: approved ? 'موافقة' : (suspend === S_REJECTED ? 'رفض' : 'قيد المراجعة'),
        seen: 1,
        action_emp: 1,
        action_moder_final: suspend === S_APPROVED ? 1 : 0,
        emp_user_id: empUserId,
        geha_mandate_name: pick(['وزارة الرياضة', 'الهيئة العامة للرياضة', 'فرع جدة', 'شركة موردة']),
        mandate_name: pick(mandateTypes).title,
      },
    });
    bump('hr_mandate_orders');

    await prisma.hr_mandate_orders_history.create({
      data: {
        mandate_rkm_fk: mandateRkm, mandate_rkm_id: order.id,
        from_user_id: empUserId ?? hrUserId, from_user_name: e.employee ?? '',
        to_user_id: dirManager.id, to_user_name: dirManager.employee ?? '',
        level: 1, talab_in_fk: 1, talab_in_title: 'طلب مأمورية',
        talab_msg: 'إرسال', reason_action: 'بدء الطلب',
        date_ar: dmy(start), date: ymd(start),
        publisher: e.employee ?? '', suspend: String(suspend), seen: 1,
      },
    });
    bump('hr_mandate_orders_history');
    mandateRkm++;
  }

  // =========================================================================
  //  G. LOANS (salaf): settings, dawabt, accounts, orders, installments,
  //     postponements + files
  // =========================================================================
  await prisma.hr_solaf_main_setting.create({
    data: {
      da3m_value: 5000, aqsa_moda_sadad: 12, had_adna: 1000,
      rateb_asasy: 1, bdl_sakn: 1, bdl_mowaslat: 1, bdl_jwal: 0,
      rateb_mokto3: 0, bdl_amal: 0, bdl_taklef: 0, bdl_ma3esha: 0,
    },
  });
  bump('hr_solaf_main_setting');

  const dawabtDefs = [
    { title: 'سلفة عادية', type: 1, type_n: 'سلفة' },
    { title: 'سلفة طارئة', type: 1, type_n: 'سلفة' },
    { title: 'سلفة زواج', type: 2, type_n: 'مناسبة' },
    { title: 'سلفة علاج', type: 2, type_n: 'مناسبة' },
    { title: 'الحد الأقصى 3 رواتب', type: 3, type_n: 'ضابط' },
  ];
  for (const d of dawabtDefs) { await prisma.hr_solaf_dawabt.create({ data: d }); bump('hr_solaf_dawabt'); }

  // Loan bank accounts for a subset of employees
  for (const e of pickN(employees, 10)) {
    await prisma.hr_solaf_emp_hesbat.create({
      data: {
        emp_id: e.id, emp_code: e.emp_code ?? 0, emp_name: e.employee ?? `موظف ${e.emp_code}`,
        rkm_hesab: BigInt(`${randInt(1000, 9999)}${randInt(100000000, 999999999)}`),
        hesab_name: e.employee ?? '',
        publisher: hrUserId, publisher_name: hrUserName,
        date_added: ymd(addDays(BASE, -randInt(30, 300))), time_add: hms(BASE),
      },
    });
    bump('hr_solaf_emp_hesbat');
  }

  const loanStatuses = [S_APPROVED, S_APPROVED, S_APPROVED, S_APPROVED_L1, S_INCOMING, S_INCOMING, S_REJECTED, S_INVESTIGATING, S_APPROVED, S_APPROVED, S_APPROVED, S_APPROVED_L1];
  let loanRkm = 6001;
  const approvedLoans: Array<{ t_rkm: number; emp: typeof employees[number]; qemt: number; qst: number; num: number; start: Date }> = [];
  for (let i = 0; i < 14; i++) {
    const e = pick(employees);
    const suspend = loanStatuses[i % loanStatuses.length];
    const approved = suspend === S_APPROVED || suspend === S_APPROVED_L1;
    const empUserId = userByEmpCode.get(e.emp_code ?? -1) ?? null;
    const qemt = randInt(3, 12) * 1000; // 3k..12k
    const num = pick([4, 6, 8, 10, 12]);
    const qst = Math.round(qemt / num);
    const start = addDays(BASE, randInt(-150, -10));
    const dirManager = pick(employees.filter((x) => x.emp_type === 1)) ?? e;
    // for approved loans, some installments already paid
    const paidCount = suspend === S_APPROVED ? randInt(0, num) : 0;
    const sadad = qst * paidCount;

    await prisma.hr_solaf.create({
      data: {
        t_rkm: loanRkm,
        t_rkm_date_m: ymd(addDays(start, -randInt(2, 10))),
        emp_id_fk: e.id,
        emp_code_fk: e.emp_code ?? 0,
        emp_name: e.employee ?? `موظف ${e.emp_code}`,
        edara_id_fk: depId,
        qsm_id_fk: 0,
        qemt_solaf: qemt,
        sadad_solfa: sadad,
        qst_num: num,
        khsm_form_date_m: ymd(start),
        khsm_to_date_m: ymd(addDays(start, num * 30)),
        hd_solfa: qemt,
        solaf_reason: pick(['ظروف مالية', 'زواج', 'علاج', 'شراء سيارة', 'ترميم منزل']),
        num_previous_requests: randInt(0, 2),
        edara_n: depName,
        qsm_n: '',
        job_title: 'موظف',
        suspend,
        direct_manager_id_fk: dirManager.id,
        direct_manager_code_fk: dirManager.emp_code ?? 0,
        direct_manager_n: dirManager.employee ?? '',
        action_direct_manager: approved ? 1 : (suspend === S_REJECTED ? 2 : 0),
        action_mowazf_moktas: 0,
        action_moder_hr: approved ? 1 : 0,
        action_moder_fr: approved ? 1 : 0,
        action_moder_final: suspend === S_APPROVED ? 1 : 0,
        current_from_user_id: empUserId ?? hrUserId,
        current_from_user_name: e.employee ?? '',
        current_to_user_id: approved ? hrUserId : (empUserId ?? hrUserId),
        current_to_user_name: hrUserName,
        talab_in_fk: 1,
        talab_in_title: 'طلب سلفة',
        level: approved ? 4 : 1,
        talab_msg: 'طلب سلفة جديد',
        reason_action: approved ? 'موافقة' : (suspend === S_REJECTED ? 'رفض' : 'قيد المراجعة'),
        qemt_qst: qst,
        seen: 1,
        rased_motah: String(qemt - sadad),
        ended: suspend === S_APPROVED && paidCount >= num ? 'yes' : 'no',
        tanfez_sanad_sarf: suspend === S_APPROVED ? 'yes' : 'no',
        publisher: empUserId ?? hrUserId,
      },
    });
    bump('hr_solaf');

    // installments (hr_solaf_quest) for approved loans
    if (approved) {
      approvedLoans.push({ t_rkm: loanRkm, emp: e, qemt, qst, num, start });
      for (let k = 0; k < num; k++) {
        const due = addDays(start, k * 30);
        const isPaid = k < paidCount;
        await prisma.hr_solaf_quest.create({
          data: {
            t_rkm_fk: loanRkm,
            emp_code_fk: e.emp_code ?? 0,
            value_of_qst: qst,
            month: due.getUTCMonth() + 1,
            year: due.getUTCFullYear(),
            qst_date_ar: dmy(due),
            qst_date: ymd(due),
            paid: isPaid ? 'yes' : 'no',
            date_paid: isPaid ? ymd(due) : null,
            time_paid: isPaid ? hms(due) : null,
            paid_sarf_person: isPaid ? hrUserName : null,
            suspend: 0,
          },
        });
        bump('hr_solaf_quest');
      }
      // a file
      await prisma.hr_solaf_files.create({
        data: {
          title: 'طلب السلفة الموقع', file: `uploads/loans/${loanRkm}.pdf`,
          solaf_id_fk: loanRkm, date: ymd(start), date_ar: dmy(start), time: hms(start),
          publisher: empUserId ?? hrUserId, publisher_name: e.employee ?? '',
        },
      });
      bump('hr_solaf_files');
    }
    loanRkm++;
  }

  // Loan postponement requests (hr_solaf_ta3gel / hr_solaf_tagel) for a couple of approved loans
  let ta3gelId = 6501;
  for (const L of pickN(approvedLoans, Math.min(4, approvedLoans.length))) {
    const empUserId = userByEmpCode.get(L.emp.emp_code ?? -1) ?? null;
    const suspend = pick([S_APPROVED, S_INCOMING]);
    const ta3 = await prisma.hr_solaf_ta3gel.create({
      data: {
        t_rkm: ta3gelId,
        solfa_rkm: L.t_rkm,
        t_rkm_date_m: ymd(BASE),
        emp_id_fk: L.emp.id,
        emp_code_fk: L.emp.emp_code ?? 0,
        emp_name: L.emp.employee ?? '',
        edara_id_fk: depId,
        qsm_id_fk: 0,
        edara_n: depName,
        qsm_n: '',
        job_title: 'موظف',
        fe2a_ta3gel: 1,
        qued_rkm: 0,
        for_month: String(BASE.getUTCMonth() + 1),
        qemt_qst: L.qst,
        ta3gel_reason: pick(['ظرف مالي طارئ', 'تأجيل قسط الشهر']),
        suspend,
        publisher: empUserId ?? hrUserId,
        publisher_name: L.emp.employee ?? '',
        action_moder_fr: suspend === S_APPROVED ? 1 : 0,
        action_moder_hr: suspend === S_APPROVED ? 1 : 0,
        level: 1,
        level_title: 'المدير المالي',
        seen: 1,
        mosayer_month: BASE.getUTCMonth() + 1,
        mosayer_year: BASE.getUTCFullYear(),
        tanfez: 'no',
      },
    });
    bump('hr_solaf_ta3gel');
    await prisma.hr_solaf_files_ta3gel.create({
      data: {
        title: 'طلب تأجيل', file: `uploads/loans/ta3gel-${ta3gelId}.pdf`,
        ta3gel_id_fk: ta3.id, date: ymd(BASE), date_ar: dmy(BASE), time: hms(BASE),
        publisher: empUserId ?? hrUserId, publisher_name: L.emp.employee ?? '',
      },
    });
    bump('hr_solaf_files_ta3gel');
    // legacy tagel variant
    await prisma.hr_solaf_tagel.create({
      data: {
        t_rkm: ta3gelId,
        solfa_rkm: L.t_rkm,
        t_rkm_date_m: ymd(BASE),
        emp_id_fk: L.emp.id,
        emp_code_fk: L.emp.emp_code ?? 0,
        emp_name: L.emp.employee ?? '',
        edara_id_fk: depId,
        qsm_id_fk: 0,
        edara_n: depName,
        qsm_n: '',
        job_title: jobs[0]?.id ?? 1,
        fe2a_tagel: 1,
        for_month: BASE.getUTCMonth() + 1,
        qemt_qst: L.qst,
        tagel_reason: 'تأجيل قسط',
        suspend,
        publisher: empUserId ?? hrUserId,
        publisher_name: L.emp.employee ?? '',
        action_moder_fr: suspend === S_APPROVED ? 1 : 0,
        action_moder_hr: suspend === S_APPROVED ? 1 : 0,
        level: 1,
        level_title: 'المدير المالي',
        seen: 1,
      },
    });
    bump('hr_solaf_tagel');
    ta3gelId++;
  }

  // =========================================================================
  //  H. SALARY SCALE (hr_salary_doors) + SALARY RAISES (tbl_zeyada_rateb)
  // =========================================================================
  const scaleDefs = [
    { mo2hel: 'ثانوي', martba: 'المرتبة الأولى', dawam: 'كامل', start: 4000, bonus: 200 },
    { mo2hel: 'دبلوم', martba: 'المرتبة الثانية', dawam: 'كامل', start: 5500, bonus: 300 },
    { mo2hel: 'بكالوريوس', martba: 'المرتبة الثالثة', dawam: 'كامل', start: 7000, bonus: 400 },
    { mo2hel: 'بكالوريوس', martba: 'المرتبة الرابعة', dawam: 'كامل', start: 9000, bonus: 500 },
    { mo2hel: 'ماجستير', martba: 'المرتبة الخامسة', dawam: 'كامل', start: 12000, bonus: 700 },
    { mo2hel: 'بكالوريوس', martba: 'دوام جزئي', dawam: 'جزئي', start: 3500, bonus: 150 },
  ];
  for (const s of scaleDefs) {
    const steps: Record<string, number> = {};
    for (let x = 1; x <= 15; x++) steps[`x_${x}`] = s.start + s.bonus * x;
    await prisma.hr_salary_doors.create({
      data: {
        mo2hel: s.mo2hel, martba: s.martba, dawam_type: s.dawam,
        salary_start: s.start, year_bonus_value: s.bonus,
        ...steps,
      },
    });
    bump('hr_salary_doors');
  }

  for (const e of pickN(employees, 10)) {
    const d = addDays(BASE, -randInt(20, 300));
    await prisma.tbl_zeyada_rateb.create({
      data: {
        emp_id_fk: e.id,
        emp_code: e.emp_code ?? 0,
        emp_name: e.employee ?? `موظف ${e.emp_code}`,
        value: randInt(3, 15) * 100,
        date_ar: dmy(d), date_s: ymd(d),
        publisher: hrUserId,
      },
    });
    bump('tbl_zeyada_rateb');
  }

  // =========================================================================
  //  I. PAYROLL (mosayer): categories, sysat, months, runs + details + procedures
  // =========================================================================
  const fe2atDefs = [
    { title: 'دوام كامل', tarteb: 1, color: '#2ecc71' },
    { title: 'دوام جزئي', tarteb: 2, color: '#f39c12' },
    { title: 'بالساعة', tarteb: 3, color: '#3498db' },
  ];
  for (const f of fe2atDefs) { await prisma.hr_mosayer_fe2at.create({ data: { id: mosFe2atId++, ...f } }); bump('hr_mosayer_fe2at'); }

  await prisma.hr_mosayer_sysat.create({
    data: {
      title: 'الإعداد', rateb_asasy: '1', badal_sakn: '1', badal_mowaslat: '1',
      badal_etsal: '1', badal_e3asha: '1', badal_tabe3a_amal: '1', badal_edafi: '1', badal_taklef: '1',
    },
  });
  bump('hr_mosayer_sysat');

  // months registry (hr_mosayer_months) — a handful around BASE
  const arMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const runMonths: Array<{ month: number; year: number }> = [
    { month: 5, year: 2026 },
    { month: 6, year: 2026 },
    { month: 7, year: 2026 },
  ];
  for (const rm of runMonths) {
    const from = new Date(Date.UTC(rm.year, rm.month - 1, 1));
    const to = new Date(Date.UTC(rm.year, rm.month, 0));
    await prisma.hr_mosayer_months.create({
      data: {
        month: rm.month, month_n: arMonths[rm.month - 1], year: rm.year,
        from_date_ar: dmy(from), from_date: ymd(from),
        to_date_ar: dmy(to), to_date: BigInt(Math.floor(to.getTime() / 1000)),
      },
    });
    bump('hr_mosayer_months');
  }

  // payroll runs (hr_mosayer) for the last 3 months. Most recent one still in-progress.
  let mosayerRkm = 3001;
  const payrollEmployees = employees.filter((e) => Number(e.basic_salary ?? 0) > 0);
  for (let r = 0; r < runMonths.length; r++) {
    const rm = runMonths[r];
    const runDate = new Date(Date.UTC(rm.year, rm.month, 0, 12));
    const isCurrent = r === runMonths.length - 1;
    const approvedRun = !isCurrent;

    // aggregate over lines
    let tRateb = 0, tSakn = 0, tMow = 0, tEdafiT = 0, tEsth = 0, tKhasmSolaf = 0, tSafi = 0, tKhsomat = 0;
    const lines: any[] = [];
    for (const e of payrollEmployees) {
      const basic = Number(e.basic_salary ?? 5000);
      const sakn = round2(basic * 0.25);
      const mow = round2(basic * 0.1);
      const edafi = chance(0.3) ? round2(basic * 0.05) : 0;
      const esth = round2(basic + sakn + mow + edafi);
      // loan deduction if this emp has an approved loan
      const loan = approvedLoans.find((l) => l.emp.id === e.id);
      const khasmSolaf = loan ? loan.qst : 0;
      const khasmTakher = chance(0.2) ? round2(basic * 0.01) : 0;
      const tamen = round2(basic * 0.0975);
      const khsomat = round2(khasmSolaf + khasmTakher + tamen);
      const safi = round2(esth - khsomat);
      tRateb += basic; tSakn += sakn; tMow += mow; tEdafiT += edafi;
      tEsth += esth; tKhasmSolaf += khasmSolaf; tKhsomat += khsomat; tSafi += safi;
      lines.push({ e, basic, sakn, mow, edafi, esth, khasmSolaf, khasmTakher, tamen, khsomat, safi });
    }

    const run = await prisma.hr_mosayer.create({
      data: {
        mosayer_rkm: mosayerRkm,
        mosayer_date: ymd(runDate),
        mosayer_date_ar: dmy(runDate),
        mosayer_month: rm.month,
        mosayer_year: rm.year,
        total: lines.length,
        egmali_rateb_asasy: round2(tRateb),
        egmali_badal_sakn: round2(tSakn),
        egmali_badal_mowaslat: round2(tMow),
        egmali_tot_edafi: round2(tEdafiT),
        egmali_total_esthkak: round2(tEsth),
        egmali_khasm_solaf: round2(tKhasmSolaf),
        egmali_total_khsomat: round2(tKhsomat),
        egmali_safi: round2(tSafi),
        approved: approvedRun ? 1 : 0,
        halet_sarf: approvedRun ? 'sarf' : null,
        cashing_date: approvedRun ? ymd(runDate) : null,
        due_date: ymd(runDate),
        suspend_direct_manager: approvedRun ? 'accept' : 'wait',
        suspend_mohasb: approvedRun ? 'accept' : 'wait',
        suspend_moder_mali: approvedRun ? 'accept' : (isCurrent ? 'wait' : 'accept'),
        suspend_moder_3am: approvedRun ? 'accept' : 'wait',
        amin_name: 'أمين الصندوق',
        manager_name: hrUserName,
        current_from_user_id: hrUserId,
        current_from_user_name: hrUserName,
        current_to_user_id: hrUserId,
        current_to_user_name: hrUserName,
        level: approvedRun ? 4 : 2,
        level_title: approvedRun ? 'معتمد' : 'قيد الاعتماد',
        talab_msg: 'مسير رواتب',
        seen: 1,
      },
    });
    bump('hr_mosayer');

    for (const ln of lines) {
      await prisma.hr_mosayer_details.create({
        data: {
          mosayer_rkm_fk: mosayerRkm,
          emp_id: ln.e.id,
          emp_code: ln.e.emp_code ?? 0,
          emp_name: ln.e.employee ?? `موظف ${ln.e.emp_code}`,
          mosma_wazefy_n: 'موظف',
          emp_pay_method: 1,
          ayam_amal: randInt(26, 30),
          sa3at_amal: 8,
          agr_sa3a: round2(ln.basic / 240),
          emp_bank_id_fk: randInt(1, 6),
          emp_bank_account_num: `SA${randInt(10, 99)}${randInt(1000000000, 1999999999)}`,
          bank_code: String(randInt(10, 99)),
          emp_name_in_bank: ln.e.employee ?? '',
          rateb_asasy: ln.basic,
          badal_sakn: ln.sakn,
          badal_mowaslat: ln.mow,
          tot_edafi: ln.edafi,
          total_esthkak: ln.esth,
          khasm_takher: ln.khasmTakher,
          khasm_tamen: ln.tamen,
          khasm_solaf: ln.khasmSolaf,
          total_khsomat: ln.khsomat,
          safi: ln.safi,
          halet_sarf: approvedRun ? 'sarf' : null,
        },
      });
      bump('hr_mosayer_details');
    }

    // a couple of "procedures" (adjustments) for the run
    for (const ln of pickN(lines, 3)) {
      await prisma.hr_mosayer_egraat.create({
        data: {
          mosayer_rkm_fk: mosayerRkm,
          emp_id: String(ln.e.id),
          emp_code: String(ln.e.emp_code ?? 0),
          emp_name: ln.e.employee ?? '',
          ancient_value: ln.basic,
          new_value: round2(ln.basic + randInt(1, 5) * 100),
          operation_value: 'increase',
          badal_name: 'بدل سكن',
          egraa_date: ymd(runDate),
          egraa_date_ar: dmy(runDate),
          publisher: String(hrUserId),
          publisher_name: hrUserName,
          reason: 'تعديل بدل',
          time_add: hms(runDate),
        },
      });
      bump('hr_mosayer_egraat');
    }

    // attachment on approved runs
    if (approvedRun) {
      await prisma.hr_mosayer_attechment.create({
        data: {
          mosayer_rkm_fk: mosayerRkm, title: 'كشف المسير المعتمد',
          attechment: `uploads/payroll/${mosayerRkm}.pdf`,
          time_ar: hms(runDate), date: ymd(runDate), date_ar: dmy(runDate),
          publisher: hrUserId, publisher_name: hrUserName,
        },
      });
      bump('hr_mosayer_attechment');
      // history trail
      await prisma.hr_mosayer_history.create({
        data: {
          mosayer_rkm_fk: mosayerRkm, mosayer_id_fk: run.id,
          from_user: hrUserId, from_user_n: hrUserName,
          to_user: hrUserId, to_user_n: hrUserName,
          level_title: 'اعتماد', level: '4', talab_msg: 'اعتماد المسير',
          action: 'accept', reason_action: 'موافقة',
          date: ymd(runDate), date_ar: dmy(runDate), seen: 1,
        },
      });
      bump('hr_mosayer_history');
    }
    mosayerRkm++;
  }

  // =========================================================================
  //  J. INSURANCE REGISTERS (hr_mosayer_tamenat + details + egraat + history + attaches)
  // =========================================================================
  let tamenatRkm = 4001;
  for (let r = 0; r < 2; r++) {
    const rm = runMonths[r + 1]; // June, July
    const runDate = new Date(Date.UTC(rm.year, rm.month, 0, 12));
    const insEmployees = payrollEmployees.filter((e) => e.emp_type === 1).slice(0, 12);
    let tRateb = 0, tHeset = 0, tSaned = 0, tSafi = 0, tKhsomat = 0, tEsth = 0;
    const lines: any[] = [];
    for (const e of insEmployees) {
      const basic = Number(e.basic_salary ?? 5000);
      const sakn = round2(basic * 0.25);
      const esth = round2(basic + sakn);
      const heset = round2(basic * 0.0975);   // employee GOSI share
      const saned = round2(basic * 0.0075);   // SANED
      const khsomat = round2(heset + saned);
      const safi = round2(esth - khsomat);
      tRateb += basic; tHeset += heset; tSaned += saned; tSafi += safi; tKhsomat += khsomat; tEsth += esth;
      lines.push({ e, basic, sakn, esth, heset, saned, khsomat, safi });
    }
    const tRun = await prisma.hr_mosayer_tamenat.create({
      data: {
        mosayer_rkm: tamenatRkm,
        mosayer_date: ymd(runDate),
        mosayer_date_ar: dmy(runDate),
        mosayer_month: rm.month,
        mosayer_year: rm.year,
        total: lines.length,
        egmali_rateb_asasy: round2(tRateb),
        egmali_total_esthkak: round2(tEsth),
        egmali_khasm_tamen: round2(tKhsomat),
        egmali_total_khsomat: round2(tKhsomat),
        egmali_safi: round2(tSafi),
        approved: r === 0 ? 1 : 0,
        halet_sarf: r === 0 ? 'sarf' : null,
        due_date: ymd(runDate),
        amin_name: 'أمين الصندوق',
        manager_name: hrUserName,
        current_from_user_id: hrUserId,
        current_from_user_name: hrUserName,
        current_to_user_id: hrUserId,
        current_to_user_name: hrUserName,
        level: r === 0 ? 4 : 2,
        level_title: r === 0 ? 'معتمد' : 'قيد الاعتماد',
        talab_msg: 'مسير التأمينات',
        seen: 1,
        publisher_id: hrUserId,
        publisher_name: hrUserName,
      },
    });
    bump('hr_mosayer_tamenat');

    for (const ln of lines) {
      await prisma.hr_mosayer_tamenat_details.create({
        data: {
          mosayer_rkm_fk: tamenatRkm,
          emp_id: ln.e.id,
          emp_code: ln.e.emp_code ?? 0,
          emp_name: ln.e.employee ?? '',
          mosma_wazefy_n: 'موظف',
          emp_pay_method: 1,
          ayam_amal: 30,
          rateb_asasy: ln.basic,
          badal_sakn: ln.sakn,
          total_esthkak: ln.esth,
          heset_mowzaf: ln.heset,
          saned: ln.saned,
          khasm_keyab: 0,
          total_khsomat: ln.khsomat,
          safi: ln.safi,
          nationality: 1,
          percent_emp: 9.75,
          percent_saned: 0.75,
        },
      });
      bump('hr_mosayer_tamenat_details');
    }
    // one procedure + history + attach for the approved register
    await prisma.hr_mosayer_tamenat_egraat.create({
      data: {
        id: tamEgraatId++,
        mosayer_rkm_fk: tamenatRkm,
        emp_id: String(lines[0].e.id),
        emp_code: String(lines[0].e.emp_code ?? 0),
        emp_name: lines[0].e.employee ?? '',
        ancient_value: lines[0].basic,
        new_value: round2(lines[0].basic + 200),
        operation_value: 'increase',
        badal_name: 'تعديل أساسي',
        egraa_date: ymd(runDate), egraa_date_ar: dmy(runDate),
        publisher: String(hrUserId), publisher_name: hrUserName,
        reason: 'تحديث الاشتراك', time_add: hms(runDate),
      },
    });
    bump('hr_mosayer_tamenat_egraat');
    await prisma.hr_mosayer_tamenat_history.create({
      data: {
        id: tamHistId++,
        talab_id_fk: tRun.id,
        from_user_id: hrUserId, to_user_id: hrUserId,
        from_user_n: hrUserName, to_user_n: hrUserName,
        process_title: 'اعتماد', date_ar: dmy(runDate), time_ar: hms(runDate),
        comment: 'اعتماد مسير التأمينات',
      },
    });
    bump('hr_mosayer_tamenat_history');
    if (r === 0) {
      await prisma.hr_mosayer_tamenat_attaches.create({
        data: {
          talb_id_fk: tRun.id, title: 'ملف الاشتراكات',
          file: `uploads/gosi/${tamenatRkm}.pdf`,
          date: ymd(runDate), date_ar: dmy(runDate), time: hms(runDate),
          publisher: hrUserId, publisher_name: hrUserName,
        },
      });
      bump('hr_mosayer_tamenat_attaches');
    }
    tamenatRkm++;
  }

  // ---- report ----
  const summary = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t}=${n}`)
    .join(', ');
  log('hr-attendance', summary);
  console.log('✔ HrAttendance done');
}

// self-run for standalone testing
if (require.main === module) {
  seedHrAttendance()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
