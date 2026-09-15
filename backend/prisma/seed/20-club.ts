/* eslint-disable no-console */
/**
 * CLUB + FITNESS domain seed — the flagship feature.
 *
 * Seeds the full club_* dataset: members, subscriptions (with receipts as the
 * source-of-truth for paid/remaining), refunds/transfers, attendance, lockers,
 * trainers + salaries, halls + bookings, classes + enrollments + waitlist,
 * exercises, workout programs/templates, member progress, physical & InBody
 * assessments/invoices, SPA services/bookings/invoices, facilities, equipment
 * + maintenance, member groups and surveys.
 *
 * Foundation (branches / employees / users) is already seeded — reused via loaders.
 */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2, reseed,
  getBranchIds, getEmployees,
  BASE, addDays, ymd, hms,
  fullNameMale, fullNameFemale, phone,
} from './_shared';

export async function seedClub(): Promise<void> {
  console.log('▶ Club…');
  reseed();

  // Clear ONLY our tables, children first.
  await clearTables([
    'club_equipment_maintenance',
    'club_equipment',
    'club_facilities',
    'club_inbody_invoices',
    'club_spa_invoices',
    'club_spa_bookings',
    'club_spa_services',
    'club_inbody_measurements',
    'club_physical_assessments',
    'club_member_progress',
    'club_workout_templates',
    'club_workout_programs',
    'club_exercises',
    'club_class_waitlist',
    'club_class_enrollments',
    'club_classes',
    'club_hall_bookings',
    'club_halls',
    'club_trainer_salaries',
    'club_trainers',
    'club_surveys',
    'club_member_groups',
    'club_locker_subscriptions',
    'club_locker_subscription_types',
    'club_lockers',
    'club_subscription_transfers',
    'club_subscription_refunds',
    'club_receipts',
    'club_subscriptions',
    'club_attendance',
    'club_members',
    'club_subscription_types',
    'club_membership_types',
  ]);

  const branchIds = await getBranchIds();
  const employees = await getEmployees();
  const empIds = employees.map((e) => e.id);
  const empsWithJobs = await prisma.employees.findMany({
    where: {
      AND: [
        { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        {
          OR: [
            { tamin_mosama_wazefy: { contains: 'مبيعات' } },
            { tamin_mosama_wazefy: { contains: 'استقبال' } },
          ],
        },
      ],
    },
    select: { id: true, branch_id_fk: true, tamin_mosama_wazefy: true },
  });
  const salesEmpIds = empsWithJobs
    .filter((e) => e.tamin_mosama_wazefy?.includes('مبيعات'))
    .map((e) => e.id);
  const receptionEmpIds = empsWithJobs
    .filter((e) => e.tamin_mosama_wazefy?.includes('استقبال'))
    .map((e) => e.id);
  const pickBranchEmp = (roleIds: number[], branchId: number): number => {
    const branchRoleIds = empsWithJobs
      .filter((e) => roleIds.includes(e.id) && e.branch_id_fk === branchId)
      .map((e) => e.id);
    return pick(branchRoleIds.length ? branchRoleIds : roleIds.length ? roleIds : empIds);
  };
  const B = (i: number) => branchIds[i % branchIds.length];

  // ===================================================================
  // 1. CATALOGS / SETTINGS
  // ===================================================================

  // ---- membership types ----
  const membershipTypeDefs = [
    { name: 'عضوية شهرية', price: 300, duration_days: 30 },
    { name: 'عضوية ربع سنوية', price: 800, duration_days: 90 },
    { name: 'عضوية نصف سنوية', price: 1500, duration_days: 180 },
    { name: 'عضوية سنوية', price: 2700, duration_days: 365 },
    { name: 'عضوية طلابية', price: 200, duration_days: 30 },
  ];
  const membershipTypes: number[] = [];
  for (const m of membershipTypeDefs) {
    const row = await prisma.club_membership_types.create({
      data: {
        name: m.name,
        description: `باقة ${m.name} تشمل دخول القاعات والمرافق`,
        price: m.price,
        duration_days: m.duration_days,
        is_active: true,
      },
    });
    membershipTypes.push(row.id);
  }

  // ---- subscription types (the sellable plans) ----
  const subTypeDefs = [
    { name: 'اشتراك شهر واحد', price: 350, days: 30, includes_spa: false, sessions: null },
    { name: 'اشتراك 3 أشهر', price: 900, days: 90, includes_spa: false, sessions: null },
    { name: 'اشتراك 6 أشهر', price: 1600, days: 180, includes_spa: true, sessions: null },
    { name: 'اشتراك سنوي VIP', price: 3000, days: 365, includes_spa: true, sessions: null },
    { name: 'باقة 12 حصة تدريب خاص', price: 1200, days: 60, includes_spa: false, sessions: 12 },
    { name: 'اشتراك طلابي شهري', price: 220, days: 30, includes_spa: false, sessions: null, students: true },
    { name: 'عرض الصيف الخاص', price: 500, days: 45, includes_spa: false, sessions: null, offer: true },
  ];
  const subTypes: { id: number; price: number; days: number; name: string }[] = [];
  for (const s of subTypeDefs) {
    const row = await prisma.club_subscription_types.create({
      data: {
        name: s.name,
        branch_id: pick(branchIds),
        price: s.price,
        days: s.days,
        is_special_offer: !!s.offer,
        is_for_students: !!s.students,
        show_in_app: true,
        wallet_points: chance(0.5) ? s.days : null,
        offer_validity: s.offer ? ymd(addDays(BASE, 60)) : null,
        is_linked_to_sessions: !!s.sessions,
        sessions_count: s.sessions ?? null,
        is_linked_to_freeze: s.days >= 90,
        freeze_days: s.days >= 90 ? 2 : null,
        includes_spa: !!s.includes_spa,
        spa_count: s.includes_spa ? 2 : null,
        is_active: true,
      },
    });
    subTypes.push({ id: row.id, price: s.price, days: s.days, name: s.name });
  }

  // ---- locker subscription types ----
  const lockerTypeDefs = [
    { name: 'خزانة شهرية', meta_value: 60, mta_value: 50, days: 30 },
    { name: 'خزانة ربع سنوية', meta_value: 150, mta_value: 130, days: 90 },
    { name: 'خزانة سنوية', meta_value: 500, mta_value: 450, days: 365 },
  ];
  const lockerTypes: { id: number; meta: number; days: number; name: string }[] = [];
  for (const l of lockerTypeDefs) {
    const row = await prisma.club_locker_subscription_types.create({
      data: {
        name: l.name,
        meta_value: l.meta_value,
        mta_value: l.mta_value,
        days: l.days,
        has_stop: l.days >= 90,
        stop_days: l.days >= 90 ? 7 : null,
        is_target_based: false,
        is_active: true,
      },
    });
    lockerTypes.push({ id: row.id, meta: l.meta_value, days: l.days, name: l.name });
  }

  // ---- member groups ----
  const groupDefs = [
    { name: 'مجموعة كمال الأجسام', category: 'رياضي', max: 40 },
    { name: 'مجموعة اللياقة العامة', category: 'عام', max: 60 },
    { name: 'مجموعة الكارديو', category: 'رياضي', max: 50 },
    { name: 'مجموعة السيدات', category: 'سيدات', max: 45 },
    { name: 'مجموعة كبار العملاء VIP', category: 'VIP', max: 20 },
  ];
  const groups: number[] = [];
  for (const g of groupDefs) {
    const row = await prisma.club_member_groups.create({
      data: { name: g.name, category: g.category, max_members: g.max, current_members: 0, is_active: true },
    });
    groups.push(row.id);
  }

  // ---- halls ----
  const hallDefs = [
    { name: 'قاعة الحديد', cap: 40 },
    { name: 'قاعة الكارديو', cap: 30 },
    { name: 'قاعة الأيروبيك', cap: 25 },
    { name: 'قاعة الكروس فيت', cap: 20 },
    { name: 'قاعة السيدات', cap: 30 },
    { name: 'قاعة اليوغا', cap: 18 },
  ];
  const halls: { id: number; branch_id: number; cap: number; name: string }[] = [];
  const hallStatuses = ['available', 'available', 'available', 'maintenance', 'unavailable'] as const;
  for (let i = 0; i < hallDefs.length; i++) {
    const h = hallDefs[i];
    const bid = B(i);
    const row = await prisma.club_halls.create({
      data: {
        name: h.name,
        hall_number: `H-${bid}-${i + 1}`,
        capacity: h.cap,
        branch_id: bid,
        description: `${h.name} مجهزة بأحدث الأجهزة`,
        status: pick(hallStatuses),
        is_deleted: false,
      },
    });
    halls.push({ id: row.id, branch_id: bid, cap: h.cap, name: h.name });
  }

  // ---- facilities ----
  const facilityDefs = [
    { name: 'الصالة الرياضية الرئيسية', type: 'gym' },
    { name: 'مسبح داخلي', type: 'pool' },
    { name: 'ساونا وبخار', type: 'spa' },
    { name: 'منطقة الكارديو', type: 'cardio' },
    { name: 'منطقة الأوزان الحرة', type: 'weights' },
  ];
  const facilities: { id: number; branch_id: number }[] = [];
  for (let i = 0; i < facilityDefs.length; i++) {
    const f = facilityDefs[i];
    const bid = B(i);
    const row = await prisma.club_facilities.create({
      data: {
        name: f.name,
        branch_id: bid,
        facility_type: f.type,
        capacity: randInt(20, 120),
        description: `${f.name} - متاحة لجميع الأعضاء`,
        status: chance(0.85) ? 'available' : 'maintenance',
        is_active: true,
      },
    });
    facilities.push({ id: row.id, branch_id: bid });
  }

  // ---- exercises ----
  const exerciseDefs = [
    { name: 'ضغط الصدر بالبار', category: 'قوة', muscle: 'الصدر', sets: 4, reps: 10, diff: 'medium' },
    { name: 'السكوات', category: 'قوة', muscle: 'الأرجل', sets: 4, reps: 12, diff: 'hard' },
    { name: 'الرفعة المميتة', category: 'قوة', muscle: 'الظهر', sets: 3, reps: 8, diff: 'hard' },
    { name: 'العقلة', category: 'قوة', muscle: 'الظهر', sets: 3, reps: 10, diff: 'medium' },
    { name: 'تمرين البلانك', category: 'ثبات', muscle: 'البطن', sets: 3, reps: 30, diff: 'easy' },
    { name: 'الجري على السير', category: 'كارديو', muscle: 'القلب', sets: 1, reps: 1, diff: 'easy' },
    { name: 'ضغط الكتف', category: 'قوة', muscle: 'الأكتاف', sets: 4, reps: 10, diff: 'medium' },
    { name: 'تمرين العضلة الأمامية', category: 'قوة', muscle: 'الذراعين', sets: 3, reps: 12, diff: 'easy' },
    { name: 'دفع الأرجل', category: 'قوة', muscle: 'الأرجل', sets: 4, reps: 12, diff: 'medium' },
    { name: 'تمارين البطن العلوية', category: 'ثبات', muscle: 'البطن', sets: 3, reps: 20, diff: 'easy' },
  ];
  const exercises: number[] = [];
  for (const e of exerciseDefs) {
    const row = await prisma.club_exercises.create({
      data: {
        name: e.name,
        category: e.category,
        muscle_group: e.muscle,
        description: `تمرين ${e.name} لتقوية ${e.muscle}`,
        instructions: 'حافظ على الوضعية الصحيحة وتنفس بانتظام',
        sets_default: e.sets,
        reps_default: e.reps,
        difficulty: e.diff as any,
        is_active: true,
      },
    });
    exercises.push(row.id);
  }

  // ---- spa services ----
  const spaDefs = [
    { name: 'مساج استرخائي', duration: 60, price: 250 },
    { name: 'مساج رياضي علاجي', duration: 45, price: 300 },
    { name: 'جلسة ساونا', duration: 30, price: 100 },
    { name: 'جلسة بخار', duration: 30, price: 100 },
    { name: 'تدليك الأنسجة العميقة', duration: 75, price: 400 },
  ];
  const spaServices: { id: number; duration: number; price: number }[] = [];
  for (let i = 0; i < spaDefs.length; i++) {
    const s = spaDefs[i];
    const row = await prisma.club_spa_services.create({
      data: {
        name: s.name,
        description: `خدمة ${s.name} في مركز السبا`,
        duration: s.duration,
        price: s.price,
        branch_id: B(i),
        is_active: true,
      },
    });
    spaServices.push({ id: row.id, duration: s.duration, price: s.price });
  }

  // ===================================================================
  // 2. MEMBERS (45 across branches, both genders, statuses, groups)
  // ===================================================================
  const MEMBER_COUNT = 45;
  const members: {
    id: number;
    code: string;
    name: string;
    gender: 'male' | 'female';
    branch_id: number;
    phone: string;
    is_active: boolean;
    start: string;
    end: string;
  }[] = [];

  // Branch-letter member codes: branch 1 -> A000001, branch 2 -> B000001, ...
  const branchCodePrefix = (branchId: number): string => {
    let n = Math.max(1, Math.floor(branchId));
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  };
  const branchSeq: Record<number, number> = {};

  for (let i = 0; i < MEMBER_COUNT; i++) {
    const gender: 'male' | 'female' = chance(0.62) ? 'male' : 'female';
    const name = gender === 'male' ? fullNameMale() : fullNameFemale();
    const bid = B(i);
    const mType = pick(membershipTypes);
    // spread statuses: ~65% active, ~20% expired, ~15% upcoming/inactive
    const roll = rnd01();
    let startOffset: number;
    let durationDays = pick([30, 90, 180, 365]);
    let isActive = true;
    if (roll < 0.2) {
      // expired
      startOffset = -randInt(200, 400);
      durationDays = pick([30, 90]);
      isActive = false;
    } else if (roll < 0.35) {
      // upcoming (starts in future) OR recently inactive
      startOffset = chance(0.5) ? randInt(3, 25) : -randInt(10, 40);
      isActive = startOffset < 0 ? chance(0.5) : true;
    } else {
      // active
      startOffset = -randInt(5, 120);
      isActive = true;
    }
    const startDate = addDays(BASE, startOffset);
    const endDate = addDays(startDate, durationDays);
    const seq = (branchSeq[bid] = (branchSeq[bid] ?? 0) + 1);
    const code = `${branchCodePrefix(bid)}${String(seq).padStart(6, '0')}`;
    const memberPhone = phone();
    const row = await prisma.club_members.create({
      data: {
        member_code: code,
        name,
        phone: memberPhone,
        email: `member${1000 + i}@noamanycenter.test`,
        gender: gender as any,
        card_number: `CARD-${100000 + i}`,
        date_of_birth: ymd(addDays(BASE, -randInt(6570, 16425))), // 18-45 yrs
        address: 'الرياض - المملكة العربية السعودية',
        branch_id: bid,
        membership_type_id: mType,
        start_date: ymd(startDate),
        end_date: ymd(endDate),
        notes: chance(0.3) ? 'عضو مميز' : null,
        is_active: isActive,
        is_deleted: false,
        created_by: pick(empIds),
        sales_id: pickBranchEmp(salesEmpIds, bid),
        employee_id: pickBranchEmp(receptionEmpIds, bid),
      },
    });
    members.push({
      id: row.id,
      code,
      name,
      gender,
      branch_id: bid,
      phone: memberPhone,
      is_active: isActive,
      start: ymd(startDate),
      end: ymd(endDate),
    });
  }

  // distribute members into groups + update current_members counts
  const groupCounts: Record<number, number> = {};
  groups.forEach((g) => (groupCounts[g] = 0));
  for (const m of members) {
    if (chance(0.8)) {
      const g = pick(groups);
      groupCounts[g]++;
    }
  }
  for (const g of groups) {
    await prisma.club_member_groups.update({ where: { id: g }, data: { current_members: groupCounts[g] } });
  }

  // ===================================================================
  // 3. SUBSCRIPTIONS + RECEIPTS + REFUNDS + TRANSFERS
  // ===================================================================
  const subscriptions: {
    id: number;
    member_id: number;
    member_name: string;
    branch_id: number;
    value: number;
    paid: number;
    start: string;
    end: string;
    status: 'active' | 'expired' | 'upcoming';
    typeName: string;
    typeId: number;
    receiptNumber: string;
  }[] = [];

  let subCounter = 0;
  let receiptCounter = 0;
  for (const m of members) {
    // most members have exactly 1 current subscription; some have 2 (history)
    const subN = chance(0.25) ? 2 : 1;
    for (let s = 0; s < subN; s++) {
      const st = pick(subTypes);
      subCounter++;
      const isHistory = s === 0 && subN === 2;
      let startOffset: number;
      let status: 'active' | 'expired' | 'upcoming';
      if (isHistory) {
        startOffset = -(st.days + randInt(30, 120));
        status = 'expired';
      } else {
        const roll = rnd01();
        if (roll < 0.2) {
          startOffset = -(st.days + randInt(5, 60));
          status = 'expired';
        } else if (roll < 0.32) {
          startOffset = randInt(3, 20);
          status = 'upcoming';
        } else {
          startOffset = -randInt(1, Math.max(2, st.days - 5));
          status = 'active';
        }
      }
      const startDate = addDays(BASE, startOffset);
      const endDate = addDays(startDate, st.days);
      const discountEnabled = chance(0.25);
      const discountValue = discountEnabled ? round2(st.price * pick([0.05, 0.1, 0.15])) : 0;
      const value = round2(st.price - discountValue);
      // paid: most fully paid, some partial (source of truth = receipts)
      const payRoll = rnd01();
      let paid: number;
      if (payRoll < 0.7) paid = value; // fully paid
      else if (payRoll < 0.9) paid = round2(value * pick([0.5, 0.6, 0.75])); // partial
      else paid = 0; // unpaid
      const remaining = round2(value - paid);
      const receiptNumber = `RCP-${20260 + subCounter}`;
      const paymentMethod = pick(['cash', 'card', 'bank', 'online'] as const);

      const sub = await prisma.club_subscriptions.create({
        data: {
          subscription_number: `SUB-${20000 + subCounter}`,
          registration_date: ymd(startDate),
          branch_id: m.branch_id,
          member_id: m.id,
          customer_name: m.name,
          subscription_type_id: st.id,
          subscription_type: st.name,
          subscription_start_date: ymd(startDate),
          subscription_end_date: ymd(endDate),
          subscription_value: st.price,
          discount_enabled: discountEnabled,
          discount_value: discountValue,
          paid_amount: paid,
          remaining_amount: remaining,
          gender: m.gender as any,
          employee_id: pick(empIds),
          sales_id: pick(empIds),
          payment_method: paymentMethod as any,
          receipt_number: receiptNumber,
          status: status as any,
          is_special: st.name.includes('VIP'),
          is_linked_to_sessions: st.name.includes('حصة'),
          sessions_count: st.name.includes('حصة') ? 12 : null,
          sessions_used: st.name.includes('حصة') ? randInt(0, 8) : 0,
          is_time_based: chance(0.1),
          time_from: null,
          time_to: null,
          created_by: pick(empIds),
        },
      });

      subscriptions.push({
        id: sub.id,
        member_id: m.id,
        member_name: m.name,
        branch_id: m.branch_id,
        value,
        paid,
        start: ymd(startDate),
        end: ymd(endDate),
        status,
        typeName: st.name,
        typeId: st.id,
        receiptNumber,
      });

      // ---- receipts (source of truth for paid amount) ----
      if (paid > 0) {
        // primary receipt for the (possibly partial) payment
        receiptCounter++;
        await prisma.club_receipts.create({
          data: {
            receipt_number: receiptNumber,
            subscription_id: sub.id,
            member_id: m.id,
            member_name: m.name,
            amount: paid,
            type: 'subscription',
            receipt_date: ymd(startDate),
            status: 'مدفوعة',
            description: `دفعة اشتراك ${st.name}`,
          },
        });
      }
    }
  }

  // ---- a couple of time-based subscriptions with explicit windows ----
  const timeBasedSubs = subscriptions.filter((_, idx) => idx % 11 === 0).slice(0, 4);
  for (const tb of timeBasedSubs) {
    await prisma.club_subscriptions.update({
      where: { id: tb.id },
      data: { is_time_based: true, time_from: '06:00:00', time_to: '12:00:00' },
    });
  }

  // ---- refunds (a handful of stopped subscriptions) ----
  const refundSubs = pickN(subscriptions.filter((s) => s.status !== 'upcoming'), 6);
  let refundCounter = 0;
  for (const rs of refundSubs) {
    refundCounter++;
    const remainingDays = randInt(10, 60);
    const dailyRate = round4(rs.value / 90);
    const refundAmount = round2(dailyRate * remainingDays);
    await prisma.club_subscription_refunds.create({
      data: {
        subscription_id: rs.id,
        member_id: rs.member_id,
        customer_name: rs.member_name,
        subscription_type: rs.typeName,
        original_start_date: rs.start,
        original_end_date: rs.end,
        stop_date: ymd(addDays(BASE, -randInt(1, 20))),
        remaining_days: remainingDays,
        original_value: rs.value,
        daily_rate: dailyRate,
        refund_amount: refundAmount,
        invoice_number: `REF-${30000 + refundCounter}`,
        refund_date: ymd(addDays(BASE, -randInt(1, 15))),
        reason: pick(['ظروف صحية', 'سفر خارج المدينة', 'عدم القدرة على الالتزام', 'طلب العميل']),
        status: pick(['pending', 'completed', 'completed', 'cancelled'] as const) as any,
        branch_id: rs.branch_id,
        created_by: pick(empIds),
      },
    });
  }

  // ---- transfers (a handful) ----
  const transferSubs = pickN(subscriptions.filter((s) => s.status === 'active'), 5);
  let transferCounter = 0;
  for (const ts of transferSubs) {
    transferCounter++;
    const toType = pick(subTypes.filter((t) => t.name !== ts.typeName));
    await prisma.club_subscription_transfers.create({
      data: {
        subscription_id: ts.id,
        member_id: ts.member_id,
        customer_name: ts.member_name,
        from_subscription_type: ts.typeName,
        to_subscription_type: toType.name,
        from_start_date: ts.start,
        from_end_date: ts.end,
        to_start_date: ymd(addDays(BASE, -randInt(1, 10))),
        to_end_date: ymd(addDays(BASE, toType.days)),
        from_value: ts.value,
        to_value: toType.price,
        transfer_date: ymd(addDays(BASE, -randInt(1, 10))),
        reason: pick(['ترقية الباقة', 'تغيير مدة الاشتراك', 'رغبة العميل']),
        branch_id: ts.branch_id,
        created_by: pick(empIds),
      },
    });
  }

  // ===================================================================
  // 4. ATTENDANCE (recent check-ins for active members)
  // ===================================================================
  let attCount = 0;
  const activeMembers = members.filter((m) => m.is_active);
  for (const m of activeMembers) {
    const visits = randInt(2, 6);
    for (let v = 0; v < visits; v++) {
      const dayOffset = -randInt(0, 21);
      const checkInDate = addDays(BASE, dayOffset);
      const inHour = randInt(6, 20);
      const checkIn = new Date(checkInDate);
      checkIn.setHours(inHour, randInt(0, 59), 0, 0);
      // most checked out, today's may still be checked in
      const isToday = dayOffset === 0;
      const stillIn = isToday && chance(0.4);
      const durationMin = randInt(45, 120);
      const checkOut = stillIn ? null : new Date(checkIn.getTime() + durationMin * 60000);
      attCount++;
      await prisma.club_attendance.create({
        data: {
          member_id: m.id,
          member_code: m.code,
          member_name: m.name,
          branch_id: m.branch_id,
          check_in_time: checkIn,
          check_out_time: checkOut,
          attendance_date: ymd(checkInDate),
          status: stillIn ? 'checked_in' : 'checked_out',
          duration: stillIn ? null : durationMin,
          notes: null,
          created_by: pick(empIds),
        },
      });
    }
  }

  // ===================================================================
  // 5. LOCKERS + LOCKER SUBSCRIPTIONS
  // ===================================================================
  const lockers: { id: number; number: string; main: number; sub: number; available: boolean }[] = [];
  let lockerNum = 0;
  for (const bid of branchIds) {
    const count = randInt(10, 16);
    for (let i = 0; i < count; i++) {
      lockerNum++;
      const row = await prisma.club_lockers.create({
        data: {
          locker_number: `LK-${bid}-${String(i + 1).padStart(3, '0')}`,
          main_branch_id: bid,
          sub_branch_id: bid,
          is_available: true, // set false below when occupied
        },
      });
      lockers.push({ id: row.id, number: row.locker_number, main: bid, sub: bid, available: true });
    }
  }

  // occupy ~55% of lockers with subscriptions
  let lockerSubCounter = 0;
  const membersByBranch: Record<number, typeof members> = {};
  for (const m of members) {
    (membersByBranch[m.branch_id] ||= []).push(m);
  }
  for (const lk of lockers) {
    if (!chance(0.55)) continue;
    lockerSubCounter++;
    const lt = pick(lockerTypes);
    const roll = rnd01();
    let startOffset: number;
    let status: 'active' | 'expired' | 'upcoming';
    if (roll < 0.75) {
      startOffset = -randInt(1, Math.max(2, lt.days - 3));
      status = 'active';
    } else if (roll < 0.9) {
      startOffset = -(lt.days + randInt(5, 40));
      status = 'expired';
    } else {
      startOffset = randInt(2, 15);
      status = 'upcoming';
    }
    const branchMembers = membersByBranch[lk.main] || members;
    const mm = branchMembers.length ? pick(branchMembers) : pick(members);
    const startDate = addDays(BASE, startOffset);
    const endDate = addDays(startDate, lt.days);
    await prisma.club_locker_subscriptions.create({
      data: {
        subscription_number: `LKS-${40000 + lockerSubCounter}`,
        main_branch_id: lk.main,
        sub_branch_id: lk.sub,
        member_id: mm.id,
        customer_name: mm.name,
        subscription_type_id: lt.id,
        subscription_days: lt.days,
        subscription_start_date: ymd(startDate),
        subscription_end_date: ymd(endDate),
        subscription_value: lt.meta,
        discount_enabled: false,
        discount_value: 0,
        paid_amount: lt.meta,
        locker_id: lk.id,
        payment_method: pick(['cash', 'card', 'bank'] as const) as any,
        gender: mm.gender as any,
        recommended_employee_id: pick(empIds),
        receipt_number: `LRCP-${40000 + lockerSubCounter}`,
        status: status as any,
        created_by: pick(empIds),
      },
    });
    if (status === 'active') {
      await prisma.club_lockers.update({ where: { id: lk.id }, data: { is_available: false } });
    }
  }

  // ===================================================================
  // 6. TRAINERS + SALARIES
  // ===================================================================
  const specializations = [
    'كمال الأجسام والقوة',
    'اللياقة العامة',
    'الكارديو وفقدان الوزن',
    'الكروس فيت',
    'اليوغا والبيلاتس',
    'تدريب السيدات',
    'التأهيل الرياضي',
  ];
  const trainers: { id: number; name: string }[] = [];
  const trainerEmpPool = pickN(empIds, Math.min(4, empIds.length));
  for (let i = 0; i < 8; i++) {
    const isMale = i < 6;
    const name = isMale ? fullNameMale() : fullNameFemale();
    const linkedEmp = i < trainerEmpPool.length ? trainerEmpPool[i] : null;
    const trainer = await prisma.club_trainers.create({
      data: {
        employee_id: linkedEmp,
        name,
        email: `trainer${i + 1}@noamanycenter.test`,
        phone: phone(),
        specialization: pick(specializations),
        experience: `${randInt(2, 15)} سنوات`,
        bio: 'مدرب معتمد بخبرة واسعة في مجال اللياقة البدنية والتدريب الشخصي',
        rating_avg: round2(3.5 + rnd01() * 1.5),
        is_active: true,
        is_deleted: false,
      },
    });
    trainers.push({ id: trainer.id, name });
    // salary (current + one historical)
    await prisma.club_trainer_salaries.create({
      data: {
        trainer_id: trainer.id,
        base_salary: pick([4000, 5000, 6000, 7000, 8000]),
        class_commission_percentage: pick([5, 10, 15]),
        subscription_commission_percentage: pick([2, 3, 5]),
        effective_date: ymd(addDays(BASE, -randInt(30, 200))),
        end_date: null,
        is_active: true,
        notes: 'الراتب الحالي',
      },
    });
    if (chance(0.4)) {
      await prisma.club_trainer_salaries.create({
        data: {
          trainer_id: trainer.id,
          base_salary: pick([3000, 3500, 4000]),
          class_commission_percentage: 5,
          subscription_commission_percentage: 2,
          effective_date: ymd(addDays(BASE, -randInt(400, 600))),
          end_date: ymd(addDays(BASE, -randInt(210, 260))),
          is_active: false,
          notes: 'راتب سابق',
        },
      });
    }
  }

  // ===================================================================
  // 7. CLASSES + ENROLLMENTS + WAITLIST
  // ===================================================================
  const classNameDefs = [
    'كارديو صباحي',
    'كروس فيت مكثف',
    'يوغا مسائية',
    'تمارين الحديد للمبتدئين',
    'أيروبيك السيدات',
    'HIIT حرق الدهون',
    'بيلاتس',
    'تدريب دائري',
    'تمارين البطن والقوة',
    'سبينينج',
    'زومبا',
    'ملاكمة لياقة',
  ];
  const classes: { id: number; cap: number; date: string }[] = [];
  for (let i = 0; i < classNameDefs.length; i++) {
    const trainer = pick(trainers);
    const hall = pick(halls);
    // spread across past (completed), today/soon (scheduled), future
    const roll = rnd01();
    let dayOffset: number;
    let status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    if (roll < 0.35) {
      dayOffset = -randInt(1, 20);
      status = 'completed';
    } else if (roll < 0.85) {
      dayOffset = randInt(0, 14);
      status = 'scheduled';
    } else {
      dayOffset = randInt(1, 10);
      status = 'cancelled';
    }
    const classDate = addDays(BASE, dayOffset);
    const startHour = randInt(7, 19);
    const cap = pick([10, 12, 15, 20]);
    const cls = await prisma.club_classes.create({
      data: {
        class_name: classNameDefs[i],
        description: `حصة ${classNameDefs[i]} بإشراف مدرب متخصص`,
        trainer_id: trainer.id,
        branch_id: hall.branch_id,
        hall_id: hall.id,
        class_date: ymd(classDate),
        start_time: `${String(startHour).padStart(2, '0')}:00:00`,
        end_time: `${String(startHour + 1).padStart(2, '0')}:00:00`,
        max_capacity: cap,
        price: pick([0, 0, 50, 75, 100]),
        status: status as any,
        is_active: true,
        is_deleted: false,
      },
    });
    classes.push({ id: cls.id, cap, date: ymd(classDate) });

    // enrollments (respect capacity + uniqueness)
    const enrolCount = Math.min(cap, randInt(4, cap));
    const enrolled = pickN(members, enrolCount);
    for (const em of enrolled) {
      let attStatus: 'registered' | 'attended' | 'absent' | 'cancelled';
      if (status === 'completed') attStatus = pick(['attended', 'attended', 'absent'] as const);
      else if (status === 'cancelled') attStatus = 'cancelled';
      else attStatus = 'registered';
      await prisma.club_class_enrollments.create({
        data: {
          class_id: cls.id,
          member_id: em.id,
          enrollment_date: ymd(addDays(classDate, -randInt(1, 7))),
          attendance_status: attStatus as any,
          attendance_time: attStatus === 'attended' ? `${String(startHour).padStart(2, '0')}:05:00` : null,
          notes: null,
        },
      });
    }

    // waitlist for a few "full" scheduled classes
    if (status === 'scheduled' && chance(0.4)) {
      const waitlisted = pickN(
        members.filter((mm) => !enrolled.some((e) => e.id === mm.id)),
        randInt(1, 3),
      );
      let pos = 1;
      for (const wm of waitlisted) {
        await prisma.club_class_waitlist.create({
          data: {
            class_id: cls.id,
            member_id: wm.id,
            position: pos++,
            status: 'waiting',
            notes: null,
          },
        });
      }
    }
  }

  // ===================================================================
  // 8. HALL BOOKINGS, WORKOUT PROGRAMS/TEMPLATES, PROGRESS, ASSESSMENTS, INBODY
  // ===================================================================

  // ---- hall bookings ----
  let bookingCount = 0;
  for (const hall of halls) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      bookingCount++;
      const dayOffset = randInt(-5, 14);
      const bookingDate = addDays(BASE, dayOffset);
      const startHour = randInt(8, 18);
      const mm = pick(members);
      let status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
      if (dayOffset < 0) status = pick(['completed', 'cancelled'] as const);
      else status = pick(['pending', 'confirmed', 'confirmed', 'active'] as const);
      await prisma.club_hall_bookings.create({
        data: {
          hall_id: hall.id,
          member_id: mm.id,
          customer_name: mm.name,
          booking_date: ymd(bookingDate),
          start_time: `${String(startHour).padStart(2, '0')}:00:00`,
          end_time: `${String(startHour + 1).padStart(2, '0')}:30:00`,
          number_of_people: randInt(1, 8),
          status: status as any,
          notes: chance(0.3) ? 'حجز خاص' : null,
          is_deleted: false,
        },
      });
    }
  }

  // ---- workout programs (per member goals) ----
  const goalDefs = ['زيادة الكتلة العضلية', 'فقدان الوزن', 'تحسين اللياقة', 'زيادة القوة', 'تحسين المرونة'];
  const programMembers = pickN(members, 15);
  for (const pm of programMembers) {
    await prisma.club_workout_programs.create({
      data: {
        member_id: pm.id,
        name: `برنامج ${pick(goalDefs)} - ${pm.name.split(' ')[0]}`,
        goal: pick(goalDefs),
        difficulty: pick(['easy', 'medium', 'hard'] as const) as any,
        duration_weeks: pick([4, 8, 12, 16]),
        description: 'برنامج تدريبي مخصص وفق أهداف العضو',
        is_active: true,
      },
    });
  }

  // ---- workout templates (reusable) ----
  const templateDefs = [
    { name: 'برنامج المبتدئين', ex: exercises.slice(0, 4) },
    { name: 'برنامج تضخيم العضلات', ex: exercises.slice(0, 6) },
    { name: 'برنامج حرق الدهون', ex: [exercises[4], exercises[5], exercises[9]] },
    { name: 'برنامج القوة المتقدم', ex: [exercises[0], exercises[1], exercises[2]] },
    { name: 'برنامج الجزء العلوي', ex: [exercises[0], exercises[3], exercises[6], exercises[7]] },
  ];
  for (const t of templateDefs) {
    await prisma.club_workout_templates.create({
      data: {
        name: t.name,
        description: `قالب تدريبي: ${t.name}`,
        exercises_json: t.ex.map((exId, idx) => ({ exercise_id: exId, order: idx + 1, sets: randInt(3, 4), reps: randInt(8, 15) })),
        is_active: true,
      },
    });
  }

  // ---- member progress (a few records each for a subset) ----
  const progressMembers = pickN(members, 18);
  for (const pm of progressMembers) {
    const records = randInt(2, 4);
    let weight = round2(60 + rnd01() * 40);
    for (let r = 0; r < records; r++) {
      const recDate = addDays(BASE, -(records - r) * 20);
      weight = round2(weight - rnd01() * 2);
      await prisma.club_member_progress.create({
        data: {
          member_id: pm.id,
          record_date: ymd(recDate),
          weight,
          body_fat: round2(15 + rnd01() * 15),
          muscle_mass: round2(weight * 0.4),
          measurements_json: { chest: randInt(90, 115), waist: randInt(70, 100), arm: randInt(30, 42) },
          goals: pick(goalDefs),
          notes: 'تقدم جيد',
        },
      });
    }
  }

  // ---- physical assessments ----
  const assessMembers = pickN(members, 14);
  for (const am of assessMembers) {
    await prisma.club_physical_assessments.create({
      data: {
        member_id: am.id,
        assess_date: ymd(addDays(BASE, -randInt(1, 60))),
        assessor: pick(trainers).name,
        scores_json: {
          strength: randInt(5, 10),
          endurance: randInt(4, 10),
          flexibility: randInt(3, 9),
          balance: randInt(5, 10),
        },
        notes: 'تقييم بدني شامل',
      },
    });
  }

  // ---- inbody measurements + invoices ----
  const inbodyMembers = pickN(members, 16);
  let inbodyInvCounter = 0;
  for (const im of inbodyMembers) {
    const measDate = addDays(BASE, -randInt(1, 45));
    const weight = round2(60 + rnd01() * 40);
    const bmi = round2(weight / 3.0);
    await prisma.club_inbody_measurements.create({
      data: {
        member_id: im.id,
        measurement_date: ymd(measDate),
        weight,
        body_fat: round2(14 + rnd01() * 16),
        muscle_mass: round2(weight * 0.42),
        bmi,
        notes: 'قياس InBody دوري',
      },
    });
    // matching invoice
    inbodyInvCounter++;
    const price = pick([50, 75, 100]);
    await prisma.club_inbody_invoices.create({
      data: {
        invoice_number: `INB-${50000 + inbodyInvCounter}`,
        is_member: true,
        member_id: im.id,
        customer_name: im.name,
        service_id: null,
        branch_id: im.branch_id,
        unit_price: price,
        total_amount: price,
        invoice_date: ymd(measDate),
        invoice_time: hms(new Date()),
        status: 'paid',
        is_active: true,
      },
    });
  }
  // a couple of non-member (walk-in) inbody invoices
  for (let i = 0; i < 3; i++) {
    inbodyInvCounter++;
    const price = pick([75, 100]);
    await prisma.club_inbody_invoices.create({
      data: {
        invoice_number: `INB-${50000 + inbodyInvCounter}`,
        is_member: false,
        member_id: null,
        customer_name: fullNameMale(),
        service_id: null,
        branch_id: pick(branchIds),
        unit_price: price,
        total_amount: price,
        invoice_date: ymd(addDays(BASE, -randInt(1, 20))),
        invoice_time: '10:30:00',
        status: 'paid',
        is_active: true,
      },
    });
  }

  // ===================================================================
  // 9. SPA BOOKINGS + INVOICES, EQUIPMENT + MAINTENANCE, SURVEYS
  // ===================================================================

  // ---- spa bookings ----
  let spaBookingCounter = 0;
  for (let i = 0; i < 16; i++) {
    spaBookingCounter++;
    const svc = pick(spaServices);
    const mm = chance(0.8) ? pick(members) : null;
    const dayOffset = randInt(-10, 14);
    const bookDate = addDays(BASE, dayOffset);
    const startHour = randInt(10, 19);
    let status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
    let payStatus: 'unpaid' | 'paid' | 'partial';
    if (dayOffset < 0) {
      status = pick(['completed', 'cancelled'] as const);
      payStatus = status === 'completed' ? 'paid' : 'unpaid';
    } else {
      status = pick(['pending', 'confirmed', 'confirmed'] as const);
      payStatus = pick(['unpaid', 'paid', 'partial'] as const);
    }
    await prisma.club_spa_bookings.create({
      data: {
        booking_number: `SPA-${60000 + spaBookingCounter}`,
        member_id: mm?.id ?? null,
        customer_name: mm ? mm.name : fullNameFemale(),
        customer_phone: mm ? mm.phone : phone(),
        service_id: svc.id,
        branch_id: mm ? mm.branch_id : pick(branchIds),
        booking_date: ymd(bookDate),
        booking_time: `${String(startHour).padStart(2, '0')}:30:00`,
        duration: svc.duration,
        price: svc.price,
        status: status as any,
        payment_status: payStatus as any,
        notes: null,
        is_active: true,
      },
    });
  }

  // ---- spa invoices (members only, service_id required) ----
  let spaInvCounter = 0;
  const spaInvMembers = pickN(members, 12);
  for (const sm of spaInvMembers) {
    spaInvCounter++;
    const svc = pick(spaServices);
    const qty = pick([1, 1, 1, 2]);
    await prisma.club_spa_invoices.create({
      data: {
        invoice_number: `SPI-${70000 + spaInvCounter}`,
        member_id: sm.id,
        service_id: svc.id,
        branch_id: sm.branch_id,
        quantity: qty,
        unit_price: svc.price,
        total_amount: round2(svc.price * qty),
        invoice_date: ymd(addDays(BASE, -randInt(1, 30))),
        status: 'paid',
        is_active: true,
      },
    });
  }

  // ---- equipment + maintenance ----
  const equipmentNames = [
    'جهاز الجري كهربائي',
    'جهاز الأوربتراك',
    'دراجة ثابتة',
    'جهاز ضغط الصدر',
    'جهاز سحب الظهر',
    'مجموعة دمبل 5-50 كجم',
    'جهاز السكوات سميث',
    'جهاز دفع الأرجل',
    'بار أولمبي',
    'جهاز الكابل المزدوج',
    'جهاز البطن',
    'جهاز التجديف',
  ];
  const equipment: { id: number; name: string }[] = [];
  for (let i = 0; i < equipmentNames.length; i++) {
    const fac = pick(facilities);
    let status: 'available' | 'maintenance' | 'unavailable';
    const roll = rnd01();
    if (roll < 0.8) status = 'available';
    else if (roll < 0.92) status = 'maintenance';
    else status = 'unavailable';
    const eq = await prisma.club_equipment.create({
      data: {
        facility_id: fac.id,
        name: equipmentNames[i],
        serial_number: `SN-${100000 + i}`,
        branch_id: fac.branch_id,
        status: status as any,
        purchase_date: ymd(addDays(BASE, -randInt(100, 900))),
        notes: null,
        is_active: true,
      },
    });
    equipment.push({ id: eq.id, name: equipmentNames[i] });
  }
  // maintenance records
  let maintCounter = 0;
  for (const eq of equipment) {
    if (!chance(0.6)) continue;
    const n = randInt(1, 2);
    for (let i = 0; i < n; i++) {
      maintCounter++;
      const isPast = chance(0.55);
      const schedDate = addDays(BASE, isPast ? -randInt(5, 60) : randInt(1, 30));
      const completed = isPast && chance(0.7);
      await prisma.club_equipment_maintenance.create({
        data: {
          equipment_id: eq.id,
          scheduled_date: ymd(schedDate),
          completed_date: completed ? ymd(addDays(schedDate, randInt(0, 3))) : null,
          description: `صيانة دورية لجهاز ${eq.name}`,
          cost: completed ? pick([150, 200, 350, 500]) : null,
          status: completed ? 'completed' : isPast ? 'in_progress' : 'scheduled',
        },
      });
    }
  }

  // ---- surveys ----
  const surveyDefs = [
    { title: 'استبيان رضا الأعضاء عن الخدمات', status: 'active', responses: 34 },
    { title: 'تقييم نظافة المرافق', status: 'active', responses: 21 },
    { title: 'استبيان الحصص التدريبية الجديدة', status: 'active', responses: 12 },
    { title: 'رأيك في أوقات العمل', status: 'closed', responses: 48 },
    { title: 'اقتراحات تطوير النادي', status: 'draft', responses: 0 },
  ];
  for (const s of surveyDefs) {
    await prisma.club_surveys.create({
      data: {
        title: s.title,
        status: s.status,
        responses_count: s.responses,
        questions_json: [
          { q: 'ما مدى رضاك عن الخدمة؟', type: 'rating', scale: 5 },
          { q: 'ما الذي يمكن تحسينه؟', type: 'text' },
        ],
      },
    });
  }

  // ---- customer sources (for subscription lead-source dropdown) ----
  const customerSources = ['Facebook', 'Instagram', 'صديق', 'إعلان', 'Google', 'Walk-in'];
  for (const name of customerSources) {
    const exists = await prisma.club_customer_sources.findFirst({ where: { name } });
    if (!exists) {
      await prisma.club_customer_sources.create({ data: { name, is_active: true } });
    }
  }

  log('club', `membership_types: ${membershipTypes.length}, sub_types: ${subTypes.length}, members: ${members.length}, subscriptions: ${subscriptions.length}, receipts: ${receiptCounter}, attendance: ${attCount}, lockers: ${lockers.length}, trainers: ${trainers.length}, classes: ${classes.length}, equipment: ${equipment.length}, customer_sources: ${customerSources.length}`);
  console.log('✔ Club done');
}

// local numeric helpers (kept here to avoid touching _shared)
function rnd01(): number {
  // reuse the shared PRNG via randInt for determinism
  return randInt(0, 1_000_000) / 1_000_000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// self-run for standalone testing
if (require.main === module) {
  seedClub()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
