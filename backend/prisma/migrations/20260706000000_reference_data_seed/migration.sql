-- Idempotent reference-catalog seed for production deploys.
-- Mirrors prisma/seed/05-reference-catalogs.ts — safe to re-run.

-- ---------------------------------------------------------------------------
-- Top-level departments (only when org table is completely empty)
-- ---------------------------------------------------------------------------
INSERT INTO `hr_edarat_aqsam` (`title_id`, `title_code`, `title`, `from_id_fk`, `trteeb`, `from_code`, `to_code`)
SELECT 0, 100, 'الإدارة العليا', 0, 1, 100, 199 FROM DUAL
WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 200, 'الموارد البشرية', 0, 2, 200, 299 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 300, 'المالية والحسابات', 0, 3, 300, 399 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 400, 'التشغيل والصالات', 0, 4, 400, 499 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 500, 'المبيعات والاستقبال', 0, 5, 500, 599 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 600, 'التدريب واللياقة', 0, 6, 600, 699 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 700, 'المخازن والمشتريات', 0, 7, 700, 799 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0
UNION ALL SELECT 0, 800, 'الصيانة والمرافق', 0, 8, 800, 899 FROM DUAL WHERE (SELECT COUNT(*) FROM `hr_edarat_aqsam`) = 0;

-- ---------------------------------------------------------------------------
-- Department sections (أقسام) — employee form qsm_id_fk dropdown
-- ---------------------------------------------------------------------------
INSERT INTO `hr_edarat_aqsam` (`title_id`, `title_code`, `title`, `from_id_fk`, `trteeb`, `from_code`, `to_code`)
SELECT 0, 101, 'مكتب المدير العام', p.id, 1, 101, 109
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الإدارة العليا' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'مكتب المدير العام' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 201, 'قسم التوظيف', p.id, 1, 201, 209
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الموارد البشرية' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم التوظيف' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 210, 'قسم الرواتب', p.id, 2, 210, 219
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الموارد البشرية' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الرواتب' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 220, 'قسم الشؤون الإدارية', p.id, 3, 220, 229
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الموارد البشرية' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الشؤون الإدارية' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 301, 'قسم المحاسبة', p.id, 1, 301, 309
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المالية والحسابات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم المحاسبة' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 310, 'قسم الخزينة', p.id, 2, 310, 319
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المالية والحسابات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الخزينة' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 401, 'قسم تشغيل الصالة', p.id, 1, 401, 409
FROM `hr_edarat_aqsam` p
WHERE p.title = 'التشغيل والصالات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم تشغيل الصالة' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 410, 'قسم المعدات', p.id, 2, 410, 419
FROM `hr_edarat_aqsam` p
WHERE p.title = 'التشغيل والصالات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم المعدات' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 501, 'قسم الاستقبال', p.id, 1, 501, 509
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المبيعات والاستقبال' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الاستقبال' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 510, 'قسم المبيعات', p.id, 2, 510, 519
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المبيعات والاستقبال' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم المبيعات' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 601, 'قسم التدريب الشخصي', p.id, 1, 601, 609
FROM `hr_edarat_aqsam` p
WHERE p.title = 'التدريب واللياقة' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم التدريب الشخصي' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 610, 'قسم الحصص الجماعية', p.id, 2, 610, 619
FROM `hr_edarat_aqsam` p
WHERE p.title = 'التدريب واللياقة' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الحصص الجماعية' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 701, 'قسم المستودعات', p.id, 1, 701, 709
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المخازن والمشتريات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم المستودعات' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 710, 'قسم المشتريات', p.id, 2, 710, 719
FROM `hr_edarat_aqsam` p
WHERE p.title = 'المخازن والمشتريات' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم المشتريات' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 801, 'قسم الصيانة', p.id, 1, 801, 809
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الصيانة والمرافق' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم الصيانة' AND c.from_id_fk = p.id)
UNION ALL
SELECT 0, 810, 'قسم النظافة', p.id, 2, 810, 819
FROM `hr_edarat_aqsam` p
WHERE p.title = 'الصيانة والمرافق' AND IFNULL(p.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `hr_edarat_aqsam` c WHERE c.title = 'قسم النظافة' AND c.from_id_fk = p.id);

-- ---------------------------------------------------------------------------
-- employees_settings (HR form lookups)
-- ---------------------------------------------------------------------------
INSERT INTO `employees_settings` (`title_setting`, `have_branch`, `type`, `type_name`, `form_id`, `in_order`)
SELECT seed.t, seed.hb, seed.ty, seed.tn, seed.fi, seed.io FROM (
  SELECT 'ذكر' AS t, 0 AS hb, 1 AS ty, 'الجنس' AS tn, 0 AS fi, 1 AS io UNION ALL
  SELECT 'أنثى', 0, 1, 'الجنس', 0, 2 UNION ALL
  SELECT 'سعودي', 0, 2, 'الجنسية', 0, 1 UNION ALL
  SELECT 'مصري', 0, 2, 'الجنسية', 0, 2 UNION ALL
  SELECT 'سوري', 0, 2, 'الجنسية', 0, 3 UNION ALL
  SELECT 'يمني', 0, 2, 'الجنسية', 0, 4 UNION ALL
  SELECT 'أردني', 0, 2, 'الجنسية', 0, 5 UNION ALL
  SELECT 'مسلم', 0, 3, 'الديانة', 0, 1 UNION ALL
  SELECT 'مسيحي', 0, 3, 'الديانة', 0, 2 UNION ALL
  SELECT 'أعزب', 0, 4, 'الحالة الاجتماعية', 0, 1 UNION ALL
  SELECT 'متزوج', 0, 4, 'الحالة الاجتماعية', 0, 2 UNION ALL
  SELECT 'مطلق', 0, 4, 'الحالة الاجتماعية', 0, 3 UNION ALL
  SELECT 'أرمل', 0, 4, 'الحالة الاجتماعية', 0, 4 UNION ALL
  SELECT 'هوية وطنية', 0, 5, 'نوع الهوية', 0, 1 UNION ALL
  SELECT 'إقامة', 0, 5, 'نوع الهوية', 0, 2 UNION ALL
  SELECT 'جواز سفر', 0, 5, 'نوع الهوية', 0, 3 UNION ALL
  SELECT 'الأحوال المدنية', 0, 6, 'جهات إصدار الهوية', 0, 1 UNION ALL
  SELECT 'جوازات', 0, 6, 'جهات إصدار الهوية', 0, 2 UNION ALL
  SELECT 'دوام صباحي', 0, 9, 'الدوامات', 0, 1 UNION ALL
  SELECT 'دوام مسائي', 0, 9, 'الدوامات', 0, 2 UNION ALL
  SELECT 'دوام كامل', 0, 9, 'الدوامات', 0, 3 UNION ALL
  SELECT 'عقد دوام كامل', 0, 10, 'العقود', 0, 1 UNION ALL
  SELECT 'عقد جزئي', 0, 10, 'العقود', 0, 2 UNION ALL
  SELECT 'عقد مؤقت', 0, 10, 'العقود', 0, 3 UNION ALL
  SELECT 'بكالوريوس', 0, 14, 'الدرجات العلمية', 0, 1 UNION ALL
  SELECT 'ماجستير', 0, 14, 'الدرجات العلمية', 0, 2 UNION ALL
  SELECT 'دبلوم', 0, 14, 'الدرجات العلمية', 0, 3 UNION ALL
  SELECT 'ثانوي', 0, 14, 'الدرجات العلمية', 0, 4 UNION ALL
  SELECT 'بكالوريوس', 0, 15, 'المؤهل العلمي', 0, 1 UNION ALL
  SELECT 'دبلوم', 0, 15, 'المؤهل العلمي', 0, 2 UNION ALL
  SELECT 'ثانوي', 0, 15, 'المؤهل العلمي', 0, 3
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `employees_settings` e WHERE e.title_setting = seed.t AND e.type = seed.ty
);

-- Fix typo in widowed status if accidentally inserted
-- (handled in seed row above as أرml — corrected below)
UPDATE `employees_settings` SET `title_setting` = 'أرمل' WHERE `title_setting` = 'أرمل' AND `type` = 4;

-- ---------------------------------------------------------------------------
-- all_defined_setting (allowances / deductions / contract types / job roles)
-- ---------------------------------------------------------------------------
INSERT INTO `all_defined_setting` (`defined_title`, `defined_type`, `defined_type_title`, `in_order`)
SELECT seed.dt, seed.ty, seed.tt, seed.io FROM (
  SELECT 'بدل سكن' AS dt, 1 AS ty, 'allowances' AS tt, '1' AS io UNION ALL
  SELECT 'بدل نقل', 1, 'allowances', '2' UNION ALL
  SELECT 'بدل هاتف', 1, 'allowances', '3' UNION ALL
  SELECT 'بدل طبيعة عمل', 1, 'allowances', '4' UNION ALL
  SELECT 'حافز أداء', 1, 'allowances', '5' UNION ALL
  SELECT 'خصم تأمينات', 2, 'deduction', '1' UNION ALL
  SELECT 'خصم سلفة', 2, 'deduction', '2' UNION ALL
  SELECT 'خصم غياب', 2, 'deduction', '3' UNION ALL
  SELECT 'خصم تأخير', 2, 'deduction', '4' UNION ALL
  SELECT 'خصم جزاءات', 2, 'deduction', '5' UNION ALL
  SELECT 'عقد دائم', 3, 'type_contract', '1' UNION ALL
  SELECT 'عقد مؤقت', 3, 'type_contract', '2' UNION ALL
  SELECT 'مدرب', 4, 'job_role', '1' UNION ALL
  SELECT 'موظف استقبال', 4, 'job_role', '2' UNION ALL
  SELECT 'محاسب', 4, 'job_role', '3'
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `all_defined_setting` a
  WHERE a.defined_title = seed.dt AND a.defined_type = seed.ty AND a.defined_type_title = seed.tt
);

-- ---------------------------------------------------------------------------
-- City districts (hai)
-- ---------------------------------------------------------------------------
INSERT INTO `cities` (`name`, `from_id_fk`, `in_order`)
SELECT 'العليا', c.id, '1' FROM `cities` c
WHERE c.name = 'الرياض' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'العليا' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'النخيل', c.id, '2' FROM `cities` c
WHERE c.name = 'الرياض' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'النخيل' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'الملقا', c.id, '3' FROM `cities` c
WHERE c.name = 'الرياض' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'الملقا' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'الياسمين', c.id, '4' FROM `cities` c
WHERE c.name = 'الرياض' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'الياسمين' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'الروضة', c.id, '1' FROM `cities` c
WHERE c.name = 'جدة' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'الروضة' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'الحمراء', c.id, '2' FROM `cities` c
WHERE c.name = 'جدة' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'الحمراء' AND d.from_id_fk = c.id)
UNION ALL
SELECT 'الشاطئ', c.id, '3' FROM `cities` c
WHERE c.name = 'جدة' AND IFNULL(c.from_id_fk, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `cities` d WHERE d.name = 'الشاطئ' AND d.from_id_fk = c.id);

-- ---------------------------------------------------------------------------
-- Club reference catalogs
-- ---------------------------------------------------------------------------
INSERT INTO `club_customer_sources` (`name`, `is_active`, `created_at`, `updated_at`)
SELECT seed.n, seed.a, NOW(3), NOW(3) FROM (
  SELECT 'Facebook' AS n, 1 AS a UNION ALL
  SELECT 'Instagram', 1 UNION ALL SELECT 'صديق', 1 UNION ALL SELECT 'إعلان', 1 UNION ALL
  SELECT 'Google', 1 UNION ALL SELECT 'Walk-in', 1 UNION ALL SELECT 'زيارة مباشرة', 1 UNION ALL
  SELECT 'توصية مدرب', 1
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `club_customer_sources` s WHERE s.name = seed.n);

INSERT INTO `club_event_categories` (`name_ar`, `name_en`, `kind`, `color`, `show_in_app`, `requires_approval`, `is_active`, `created_at`, `updated_at`)
SELECT seed.ar, seed.en, seed.k, seed.c, 1, 0, 1, NOW(3), NOW(3) FROM (
  SELECT 'بطولة' AS ar, 'Competition' AS en, 'competition' AS k, '#ef4444' AS c UNION ALL
  SELECT 'ورشة تدريب', 'Workshop', 'workshop', '#3b82f6' UNION ALL
  SELECT 'يوم مفتوح', 'Open Day', 'open_day', '#22c55e' UNION ALL
  SELECT 'ندوة', 'Seminar', 'seminar', '#a855f7' UNION ALL
  SELECT 'فعالية مجتمعية', 'Community', 'community', '#f59e0b' UNION ALL
  SELECT 'تحدي لياقة', 'Challenge', 'challenge', '#06b6d4'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `club_event_categories` e WHERE e.name_ar = seed.ar);

INSERT INTO `club_membership_types` (`name`, `price`, `duration_days`, `is_active`, `created_at`, `updated_at`)
SELECT seed.n, seed.p, seed.d, 1, NOW(3), NOW(3) FROM (
  SELECT 'عضوية شهرية' AS n, 300.00 AS p, 30 AS d UNION ALL
  SELECT 'عضوية ربع سنوية', 800.00, 90 UNION ALL
  SELECT 'عضوية نصف سنوية', 1500.00, 180 UNION ALL
  SELECT 'عضوية سنوية', 2700.00, 365 UNION ALL
  SELECT 'عضوية طلابية', 200.00, 30
) AS seed
WHERE (SELECT COUNT(*) FROM `club_membership_types`) = 0;

INSERT INTO `club_subscription_types` (`name`, `price`, `days`, `is_linked_to_sessions`, `sessions_count`, `is_active`, `created_at`, `updated_at`)
SELECT seed.n, seed.p, seed.d, seed.ls, seed.sc, 1, NOW(3), NOW(3) FROM (
  SELECT 'اشتراك شهر واحد' AS n, 350.00 AS p, 30 AS d, 0 AS ls, NULL AS sc UNION ALL
  SELECT 'اشتراك 3 أشهر', 900.00, 90, 0, NULL UNION ALL
  SELECT 'اشتراك 6 أشهر', 1600.00, 180, 0, NULL UNION ALL
  SELECT 'اشتراك سنوي VIP', 3000.00, 365, 0, NULL UNION ALL
  SELECT 'باقة 12 حصة', 600.00, 90, 1, 12 UNION ALL
  SELECT 'اشتراك طلابي', 250.00, 30, 0, NULL UNION ALL
  SELECT 'عرض الصيف', 500.00, 60, 0, NULL
) AS seed
WHERE (SELECT COUNT(*) FROM `club_subscription_types`) = 0;

INSERT INTO `club_locker_subscription_types` (`name`, `meta_value`, `mta_value`, `days`, `is_active`, `created_at`, `updated_at`)
SELECT seed.n, seed.meta, seed.mta, seed.d, 1, NOW(3), NOW(3) FROM (
  SELECT 'خزانة شهرية' AS n, 100.00 AS meta, 50.00 AS mta, 30 AS d UNION ALL
  SELECT 'خزانة ربع سنوية', 250.00, 120.00, 90 UNION ALL
  SELECT 'خزانة سنوية', 800.00, 400.00, 365
) AS seed
WHERE (SELECT COUNT(*) FROM `club_locker_subscription_types`) = 0;

INSERT INTO `club_inbody_services` (`name`, `price`, `branch_id`, `is_active`, `created_at`, `updated_at`)
SELECT 'قياس InBody أساسي', 75.00, (SELECT MIN(branch_id) FROM `tbl_branches`), 1, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `club_inbody_services` WHERE name = 'قياس InBody أساسي')
UNION ALL
SELECT 'قياس InBody متقدم', 100.00, (SELECT MIN(branch_id) FROM `tbl_branches`), 1, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `club_inbody_services` WHERE name = 'قياس InBody متقدم')
UNION ALL
SELECT 'تقرير InBody + استشارة', 150.00, (SELECT MIN(branch_id) FROM `tbl_branches`), 1, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `club_inbody_services` WHERE name = 'تقرير InBody + استشارة');

INSERT INTO `sales_booking_services` (`name`, `price`, `is_active`, `created_at`, `updated_at`)
SELECT seed.n, seed.p, 1, NOW(3), NOW(3) FROM (
  SELECT 'تدريب شخصي' AS n, 250.00 AS p UNION ALL
  SELECT 'حجز صالة', 150.00 UNION ALL
  SELECT 'حصة جماعية', 80.00
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `sales_booking_services` s WHERE s.name = seed.n);

-- ---------------------------------------------------------------------------
-- Guard: normalise any zero/invalid `updated_at` so Prisma reads don't throw
-- P2020 ("datetime value with day or month set to zero"). Harmless no-op when
-- the rows above already carry NOW(3). Runs inside `prisma migrate reset`,
-- i.e. BEFORE the seed's Club step reads these tables.
-- ---------------------------------------------------------------------------
UPDATE `club_customer_sources`          SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `club_event_categories`          SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `club_membership_types`          SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `club_subscription_types`        SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `club_locker_subscription_types` SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `club_inbody_services`           SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
UPDATE `sales_booking_services`         SET `updated_at` = NOW(3) WHERE `updated_at` < '1971-01-01';
