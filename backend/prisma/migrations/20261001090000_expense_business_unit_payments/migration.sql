ALTER TABLE `fin_expenses`
  MODIFY `expense_date` VARCHAR(19) NOT NULL,
  ADD COLUMN `business_unit` VARCHAR(10) NOT NULL DEFAULT 'gym',
  ADD COLUMN `paid_amount` DECIMAL(14,2) NULL,
  ADD COLUMN `payments` JSON NULL;

UPDATE `fin_expenses` SET `business_unit` = 'cafe'
WHERE `expense_number` LIKE 'CAFE-%'
   OR `invoice_number` LIKE 'CAFE-%'
   OR `category` IN ('تكلفة مبيعات الكافيه', 'مصروفات الكافيه', 'هالك الكافيه')
   OR (`notes` = 'مستند تلقائي مربوط بالنظام' AND (
     `invoice_number` LIKE 'DRAWER-%' OR `invoice_number` LIKE 'HOSP-%'
     OR `sub_category` = 'هالك كافيه' OR `category` = 'مصروفات تشغيل الكافيه'
   ));

UPDATE `fin_expenses` e
JOIN `cafe_waste_records` w ON e.`invoice_number` = CONCAT('INV-DAMAGE-', w.`transaction_id`)
SET e.`business_unit` = 'cafe';

UPDATE `fin_expenses` SET `paid_amount` = `total_amount`
WHERE `payment_status` = 'مدفوع';
