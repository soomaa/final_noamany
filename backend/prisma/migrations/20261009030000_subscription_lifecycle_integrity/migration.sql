ALTER TABLE club_subscriptions ADD COLUMN purchased_benefits JSON NULL, ADD COLUMN renewal_hold BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE club_subscriptions s LEFT JOIN club_subscription_types t ON t.id = s.subscription_type_id
SET s.purchased_benefits = JSON_OBJECT('version', 1, 'classTypeIds', COALESCE((SELECT JSON_ARRAYAGG(c.class_type_id) FROM club_subscription_type_classes c WHERE c.subscription_type_id = t.id), JSON_ARRAY()), 'provenance', 'migration_current_catalog',
'inbody_count', COALESCE(t.inbody_count,0), 'includes_spa', IF(COALESCE(t.includes_spa,0), CAST('true' AS JSON), CAST('false' AS JSON)), 'spa_count', COALESCE(t.spa_count,0),
'is_linked_to_freeze', IF(t.id IS NULL OR t.is_linked_to_freeze, CAST('true' AS JSON), CAST('false' AS JSON)), 'freeze_days', t.freeze_days, 'freeze_total_days', t.freeze_total_days, 'min_freeze', 0)
WHERE s.purchased_benefits IS NULL;

-- Only untouched queued periods can be safely held. Historical consumption is never rewritten.
WITH RECURSIVE frozen_queue AS (
  SELECT s.id, s.member_id, s.branch_id FROM club_subscriptions s
  WHERE s.status = 'frozen' AND EXISTS (SELECT 1 FROM club_subscription_freezes f WHERE f.subscription_id = s.id AND f.is_active = TRUE)
  UNION ALL
  SELECT child.id, child.member_id, child.branch_id FROM club_subscriptions child
  JOIN frozen_queue parent ON child.renewed_from_subscription_id = parent.id
  WHERE child.member_id = parent.member_id AND child.branch_id = parent.branch_id
    AND child.status = 'upcoming' AND child.sessions_used = 0 AND child.inbody_used = 0 AND child.spa_used = 0 
)
UPDATE club_subscriptions s JOIN frozen_queue q ON q.id = s.id
SET s.status = 'frozen', s.renewal_hold = TRUE WHERE s.status = 'upcoming';
