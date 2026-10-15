-- Add call-reminder timestamps to ONE80's isolated CRM tables.
-- The legacy `club_leads` table remains untouched.

ALTER TABLE `club_sales_crm_leads`
  ADD COLUMN `next_call_at` DATETIME(3) NULL,
  ADD INDEX `club_sales_crm_leads_next_call_at_idx` (`next_call_at`);

ALTER TABLE `club_sales_crm_lead_follow_ups`
  ADD COLUMN `next_call_at` DATETIME(3) NULL,
  ADD INDEX `club_sales_crm_lead_follow_ups_next_call_at_idx` (`next_call_at`);
