-- Production cleanup: remove only the original demo catalog and only while it has no documents.
DELETE s FROM `club_inbody_services` s
LEFT JOIN `club_inbody_invoices` i ON i.`service_id` = s.`id`
WHERE i.`id` IS NULL
  AND s.`name` IN ('قياس InBody أساسي', 'قياس InBody متقدم', 'تقرير InBody مع استشارة', 'تقرير InBody + استشارة');

DELETE s FROM `club_spa_services` s
LEFT JOIN `club_spa_invoices` i ON i.`service_id` = s.`id`
LEFT JOIN `club_spa_bookings` b ON b.`service_id` = s.`id`
WHERE i.`id` IS NULL AND b.`id` IS NULL
  AND s.`name` IN ('مساج استرخائي', 'مساج رياضي علاجي', 'جلسة ساونا', 'جلسة بخار', 'تدليك الأنسجة العميقة');
