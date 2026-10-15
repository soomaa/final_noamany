-- Expand nationality dropdown (employees_settings type=2) — idempotent.
INSERT INTO `employees_settings` (`title_setting`, `have_branch`, `type`, `type_name`, `form_id`, `in_order`)
SELECT seed.t, 0, 2, 'الجنسية', 0, seed.io FROM (
  SELECT 'فلسطيني' AS t, 6 AS io UNION ALL
  SELECT 'لبناني', 7 UNION ALL
  SELECT 'عراقي', 8 UNION ALL
  SELECT 'كويتي', 9 UNION ALL
  SELECT 'إماراتي', 10 UNION ALL
  SELECT 'قطري', 11 UNION ALL
  SELECT 'بحريني', 12 UNION ALL
  SELECT 'عماني', 13 UNION ALL
  SELECT 'سوداني', 14 UNION ALL
  SELECT 'تونسي', 15 UNION ALL
  SELECT 'جزائري', 16 UNION ALL
  SELECT 'مغربي', 17 UNION ALL
  SELECT 'ليبي', 18 UNION ALL
  SELECT 'فلبيني', 19 UNION ALL
  SELECT 'هندي', 20 UNION ALL
  SELECT 'باكستاني', 21 UNION ALL
  SELECT 'بنجلاديشي', 22 UNION ALL
  SELECT 'نيبالي', 23 UNION ALL
  SELECT 'إندونيسي', 24 UNION ALL
  SELECT 'سريلانكي', 25 UNION ALL
  SELECT 'تركي', 26 UNION ALL
  SELECT 'إيراني', 27 UNION ALL
  SELECT 'أفغاني', 28 UNION ALL
  SELECT 'إثيوبي', 29 UNION ALL
  SELECT 'إريتري', 30 UNION ALL
  SELECT 'نيجيري', 31 UNION ALL
  SELECT 'أمريكي', 32 UNION ALL
  SELECT 'بريطاني', 33 UNION ALL
  SELECT 'فرنسي', 34 UNION ALL
  SELECT 'أخرى', 99
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `employees_settings` e WHERE e.title_setting = seed.t AND e.type = 2 AND e.type_name = 'الجنسية'
);
