ALTER TABLE `sales_shift_sessions`
  ADD COLUMN `shortage_reason` TEXT NULL AFTER `closing_notes`;

-- The person responsible for a session is the authenticated user who opened
-- or received it. Older rows can safely recover that identity from created_by.
UPDATE `sales_shift_sessions`
SET `user_id` = `created_by`
WHERE `created_by` IS NOT NULL
  AND `created_by` > 0
  AND `user_id` <> `created_by`;

-- Historical shortages predate the required-reason field. Keep them explicit
-- in treasury reports instead of showing an unexplained blank value.
UPDATE `sales_shift_sessions`
SET `shortage_reason` = 'بيانات قديمة — لم يكن سبب العجز مطلوبًا وقت تسجيل الوردية'
WHERE `cash_difference` < -0.01
  AND (`shortage_reason` IS NULL OR TRIM(`shortage_reason`) = '');
