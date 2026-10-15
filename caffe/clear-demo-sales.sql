-- Ordera cafe — clear DEMO / seed sales & shifts ONLY.
-- Does NOT delete products, categories, users, or company settings.
-- Run on production ONLY if you want to wipe fake invoices/shifts.

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM sales_pos_payments;
DELETE FROM sales_quick_sale_items;
DELETE FROM sales_shift_sale_adjustments;
DELETE FROM sales_quick_sales;
DELETE FROM sales_shift_sessions;
DELETE FROM sales_shifts;

SET FOREIGN_KEY_CHECKS = 1;

UPDATE sales_pos_settings
SET value = 'Ordera'
WHERE `key` = 'receipt_business_name';

UPDATE sales_pos_settings
SET value = '/Ordera.png'
WHERE `key` = 'receipt_logo_url';
