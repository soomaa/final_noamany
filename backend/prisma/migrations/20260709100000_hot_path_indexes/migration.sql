SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_action_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_action_date_idx` ON `tbl_hdoor_emps` (`action_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_action_date_s_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_action_date_s_idx` ON `tbl_hdoor_emps` (`action_date_s`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_member_code_action_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_member_code_action_date_idx` ON `tbl_hdoor_emps` (`member_code`, `action_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_member_code_action_date_s_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_member_code_action_date_s_idx` ON `tbl_hdoor_emps` (`member_code`, `action_date_s`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_branch_id_fk_action_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_branch_id_fk_action_date_idx` ON `tbl_hdoor_emps` (`branch_id_fk`, `action_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'tbl_hdoor_emps' AND index_name = 'tbl_hdoor_emps_branch_id_fk_action_date_s_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `tbl_hdoor_emps_branch_id_fk_action_date_s_idx` ON `tbl_hdoor_emps` (`branch_id_fk`, `action_date_s`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'hr_all_ozonat_orders' AND index_name = 'hr_all_ozonat_orders_emp_code_fk_ezn_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `hr_all_ozonat_orders_emp_code_fk_ezn_date_idx` ON `hr_all_ozonat_orders` (`emp_code_fk`, `ezn_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'hr_all_ozonat_orders' AND index_name = 'hr_all_ozonat_orders_emp_code_fk_ezn_date_ar_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `hr_all_ozonat_orders_emp_code_fk_ezn_date_ar_idx` ON `hr_all_ozonat_orders` (`emp_code_fk`, `ezn_date_ar`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'hr_all_ozonat_orders' AND index_name = 'hr_all_ozonat_orders_emp_id_fk_no3_ezn_ezn_month_ezn_year_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `hr_all_ozonat_orders_emp_id_fk_no3_ezn_ezn_month_ezn_year_idx` ON `hr_all_ozonat_orders` (`emp_id_fk`, `no3_ezn`, `ezn_month`, `ezn_year`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'hr_all_ozonat_orders' AND index_name = 'hr_all_ozonat_orders_current_to_user_id_suspend_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `hr_all_ozonat_orders_current_to_user_id_suspend_idx` ON `hr_all_ozonat_orders` (`current_to_user_id`, `suspend`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'hr_all_ozonat_orders' AND index_name = 'hr_all_ozonat_orders_suspend_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `hr_all_ozonat_orders_suspend_idx` ON `hr_all_ozonat_orders` (`suspend`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'emp_attendance' AND index_name = 'emp_attendance_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `emp_attendance_date_idx` ON `emp_attendance` (`date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'emp_attendance' AND index_name = 'emp_attendance_emp_id_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `emp_attendance_emp_id_date_idx` ON `emp_attendance` (`emp_id`(191), `date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fin_expenses' AND index_name = 'fin_expenses_branch_id_expense_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `fin_expenses_branch_id_expense_date_idx` ON `fin_expenses` (`branch_id`, `expense_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fin_expenses' AND index_name = 'fin_expenses_branch_id_approval_status_expense_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `fin_expenses_branch_id_approval_status_expense_date_idx` ON `fin_expenses` (`branch_id`, `approval_status`, `expense_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fin_revenues' AND index_name = 'fin_revenues_branch_id_revenue_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `fin_revenues_branch_id_revenue_date_idx` ON `fin_revenues` (`branch_id`, `revenue_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fin_revenues' AND index_name = 'fin_revenues_branch_id_payment_status_revenue_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `fin_revenues_branch_id_payment_status_revenue_date_idx` ON `fin_revenues` (`branch_id`, `payment_status`, `revenue_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_attendance' AND index_name = 'club_attendance_branch_id_attendance_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_attendance_branch_id_attendance_date_idx` ON `club_attendance` (`branch_id`, `attendance_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_subscriptions' AND index_name = 'club_subscriptions_branch_id_registration_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_subscriptions_branch_id_registration_date_idx` ON `club_subscriptions` (`branch_id`, `registration_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_subscriptions' AND index_name = 'club_subscriptions_branch_id_status_subscription_end_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_subscriptions_branch_id_status_subscription_end_date_idx` ON `club_subscriptions` (`branch_id`, `status`, `subscription_end_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_receipts' AND index_name = 'club_receipts_receipt_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_receipts_receipt_date_idx` ON `club_receipts` (`receipt_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_receipts' AND index_name = 'club_receipts_subscription_id_receipt_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_receipts_subscription_id_receipt_date_idx` ON `club_receipts` (`subscription_id`, `receipt_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_receipts' AND index_name = 'club_receipts_member_id_receipt_date_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_receipts_member_id_receipt_date_idx` ON `club_receipts` (`member_id`, `receipt_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_locker_subscriptions' AND index_name = 'club_locker_subs_branch_start_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_locker_subs_branch_start_idx` ON `club_locker_subscriptions` (`main_branch_id`, `subscription_start_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_locker_subscriptions' AND index_name = 'club_locker_subs_branch_status_end_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_locker_subs_branch_status_end_idx` ON `club_locker_subscriptions` (`main_branch_id`, `status`, `subscription_end_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_spa_invoices' AND index_name = 'club_spa_invoices_branch_id_invoice_date_status_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_spa_invoices_branch_id_invoice_date_status_idx` ON `club_spa_invoices` (`branch_id`, `invoice_date`, `status`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'club_inbody_invoices' AND index_name = 'club_inbody_invoices_branch_id_invoice_date_status_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `club_inbody_invoices_branch_id_invoice_date_status_idx` ON `club_inbody_invoices` (`branch_id`, `invoice_date`, `status`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'sales_quick_sales' AND index_name = 'sales_quick_sales_branch_id_sale_date_status_idx'
);
SET @sql := IF(@index_exists = 0, 'CREATE INDEX `sales_quick_sales_branch_id_sale_date_status_idx` ON `sales_quick_sales` (`branch_id`, `sale_date`, `status`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
