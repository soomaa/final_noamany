-- Compatibility marker only.
--
-- The complete credit-based plan-conversion schema is canonically owned by
-- 20260804120000_subscription_discount_codes_and_plan_conversion. The original
-- version of this migration repeated the same seven columns, index and foreign
-- key, which made every fresh `prisma migrate deploy` fail with MySQL 1060.
-- Keeping the migration name as a no-op preserves the ordered history for
-- databases that have not recorded it yet without attempting duplicate DDL.
SELECT 1;
