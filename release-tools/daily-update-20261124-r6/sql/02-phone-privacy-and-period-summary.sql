-- 24-r6: RBAC rows for the customer phone privacy actions and the «ملخص الفترة» page.
-- Mirrors rbac.catalog.ts (seed-rbac.ts would upsert the same). Re-runnable (INSERT IGNORE).

INSERT IGNORE INTO `rbac_actions` (`key`, `label_ar`, `label_en`, `sensitive`, `sort_order`) VALUES
  ('viewPhone', 'إظهار أرقام الهواتف', 'Show phone numbers', 1, 14),
  ('revealPhone', 'إظهار رقم بالعين', 'Reveal a phone (eye)', 1, 15);

-- Phone actions on the customer screens (catalog: CONTACT on club, reception, members, sales portal,
-- potential members, calls log, subscriptions list).
INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a ON a.`key` IN ('viewPhone', 'revealPhone')
WHERE r.`key` IN ('club', 'club.reception', 'club.members', 'sales.portal', 'club.leads', 'club.calls', 'club.subscriptions.list');

-- «ملخص الفترة» (management meeting report) under the admin module; nobody gets it by default.
INSERT IGNORE INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'admin.period_summary', p.id, 'page', 'ملخص الفترة', 'Period summary', '/reports/period-summary', NULL, 3, true
FROM `rbac_resources` p WHERE p.`key` = 'admin';

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT r.id, a.id FROM `rbac_resources` r JOIN `rbac_actions` a ON a.`key` IN ('view', 'export', 'print')
WHERE r.`key` = 'admin.period_summary';
