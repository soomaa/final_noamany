-- CreateTable
CREATE TABLE `global_settings` (
    `id` INTEGER NOT NULL,
    `institute_name` VARCHAR(255) NOT NULL,
    `institute_code` VARCHAR(255) NOT NULL,
    `use_barcode` VARCHAR(3) NULL,
    `reg_prefix` VARCHAR(255) NOT NULL,
    `institute_email` VARCHAR(100) NOT NULL,
    `address` TEXT NOT NULL,
    `mobileno` VARCHAR(100) NOT NULL,
    `logo` VARCHAR(500) NULL,
    `currency` VARCHAR(100) NOT NULL,
    `currency_symbol` VARCHAR(100) NOT NULL,
    `sms_service_provider` VARCHAR(100) NOT NULL,
    `session_id` INTEGER NOT NULL,
    `translation` VARCHAR(100) NOT NULL,
    `footer_text` VARCHAR(255) NOT NULL,
    `animations` VARCHAR(100) NOT NULL,
    `timezone` VARCHAR(100) NOT NULL,
    `date_format` VARCHAR(100) NOT NULL,
    `facebook_url` VARCHAR(255) NOT NULL,
    `twitter_url` VARCHAR(255) NOT NULL,
    `linkedin_url` VARCHAR(255) NOT NULL,
    `youtube_url` VARCHAR(255) NOT NULL,
    `instagram_url` VARCHAR(200) NULL,
    `snapchat_url` VARCHAR(200) NULL,
    `cron_secret_key` VARCHAR(255) NULL,
    `preloader_backend` TINYINT NULL DEFAULT 1,
    `cms_default_branch` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `ketm_image` VARCHAR(200) NULL,
    `alert_days_contract` INTEGER NULL,
    `alert_days_quest` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conf_company_data` (
    `id_config` INTEGER NOT NULL AUTO_INCREMENT,
    `nameweb` VARCHAR(200) NOT NULL,
    `abbreviation_name` VARCHAR(255) NULL,
    `slogan` VARCHAR(200) NULL,
    `summary_company` TEXT NULL,
    `deskripsi` TEXT NULL,
    `website` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `email_cadangan` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `telepon` VARCHAR(50) NULL,
    `hp` VARCHAR(50) NULL,
    `fax` VARCHAR(50) NULL,
    `logo` VARCHAR(255) NULL,
    `icon` VARCHAR(255) NULL,
    `footer` VARCHAR(255) NULL,
    `keywords` VARCHAR(400) NULL,
    `metatext` TEXT NULL,
    `facebook` VARCHAR(255) NULL,
    `twitter` VARCHAR(255) NULL,
    `instagram` VARCHAR(255) NULL,
    `google_plus` VARCHAR(255) NULL,
    `google_map` TEXT NULL,
    `judul_1` VARCHAR(200) NULL,
    `pesan_1` VARCHAR(200) NULL,
    `judul_2` VARCHAR(200) NULL,
    `pesan_2` VARCHAR(200) NULL,
    `judul_3` VARCHAR(200) NULL,
    `pesan_3` VARCHAR(200) NULL,
    `judul_4` VARCHAR(200) NULL,
    `pesan_4` VARCHAR(200) NULL,
    `judul_5` VARCHAR(200) NULL,
    `pesan_5` VARCHAR(200) NOT NULL,
    `judul_6` VARCHAR(200) NULL,
    `pesan_6` VARCHAR(200) NOT NULL,
    `isi_1` VARCHAR(500) NULL,
    `isi_2` VARCHAR(500) NULL,
    `isi_3` VARCHAR(500) NULL,
    `isi_4` VARCHAR(500) NULL,
    `isi_5` VARCHAR(500) NULL,
    `isi_6` VARCHAR(500) NULL,
    `link_1` VARCHAR(255) NULL,
    `link_2` VARCHAR(255) NULL,
    `link_3` VARCHAR(255) NULL,
    `link_4` VARCHAR(255) NULL,
    `link_5` VARCHAR(255) NULL,
    `link_6` VARCHAR(255) NULL,
    `javawebmedia` TEXT NULL,
    `gambar` VARCHAR(255) NULL,
    `video` VARCHAR(255) NULL,
    `rekening` TEXT NULL,
    `gambar_berita` VARCHAR(255) NULL,
    `status_form_booking` ENUM('Aktif', 'Nonaktif') NOT NULL,
    `max_room_booking` INTEGER NULL,
    `nama_direktur` VARCHAR(255) NULL,
    `jabatan` VARCHAR(255) NULL,
    `stempel_tanda_tangan` VARCHAR(255) NULL,
    `protocol` VARCHAR(255) NOT NULL,
    `smtp_host` VARCHAR(255) NOT NULL,
    `smtp_port` INTEGER NOT NULL,
    `smtp_timeout` INTEGER NOT NULL,
    `smtp_user` VARCHAR(255) NOT NULL,
    `smtp_pass` VARCHAR(255) NOT NULL,
    `id_user` INTEGER NOT NULL,
    `tanggal` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `image` VARCHAR(300) NULL,
    `max_num` INTEGER NULL,

    PRIMARY KEY (`id_config`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conf_country_setting` (
    `main_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NULL,
    `from_id` INTEGER NULL,
    `from_type` ENUM('country', 'city', 'region') NULL,
    `created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated` DATETIME(0) NULL,

    INDEX `conf_country_setting_from_id_idx`(`from_id`),
    PRIMARY KEY (`main_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(300) NOT NULL,
    `from_id_fk` INTEGER NOT NULL DEFAULT 0,
    `in_order` VARCHAR(255) NOT NULL DEFAULT '0',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_city` (
    `city_id` INTEGER NOT NULL AUTO_INCREMENT,
    `city_name` VARCHAR(100) NULL,

    PRIMARY KEY (`city_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_branches` (
    `branch_id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_name` VARCHAR(50) NULL,
    `from_id` INTEGER NOT NULL,

    PRIMARY KEY (`branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branch_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `from_id` INTEGER NOT NULL,
    `lat_map` VARCHAR(200) NULL,
    `long_map` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_branch_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(15) NOT NULL,
    `br_code` ENUM('A', 'B', 'C', '') NULL,
    `from_id` INTEGER NOT NULL,
    `lat_map` VARCHAR(15) NULL,
    `long_map` VARCHAR(15) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `socity_branch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `lat_map` VARCHAR(100) NULL,
    `long_map` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_quick_purchase_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `total_amount` DECIMAL(14, 2) NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'مسودة',
    `notes` TEXT NULL,
    `stock_posted` BOOLEAN NOT NULL DEFAULT false,
    `posted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_quick_purchase_orders_order_number_key`(`order_number`),
    INDEX `prc_quick_purchase_orders_supplier_id_idx`(`supplier_id`),
    INDEX `prc_quick_purchase_orders_branch_id_idx`(`branch_id`),
    INDEX `prc_quick_purchase_orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'مسودة',
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `stock_posted` BOOLEAN NOT NULL DEFAULT false,
    `posted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_purchase_returns_return_number_key`(`return_number`),
    INDEX `prc_purchase_returns_supplier_id_idx`(`supplier_id`),
    INDEX `prc_purchase_returns_branch_id_idx`(`branch_id`),
    INDEX `prc_purchase_returns_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_return_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,

    INDEX `prc_purchase_return_items_purchase_return_id_idx`(`purchase_return_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_procurement_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NULL,
    `require_approval` BOOLEAN NOT NULL DEFAULT true,
    `approval_threshold` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `max_order_amount` DECIMAL(14, 2) NULL,
    `require_vendor_evaluation` BOOLEAN NOT NULL DEFAULT false,
    `min_quotations` INTEGER NOT NULL DEFAULT 1,
    `enable_inventory_integration` BOOLEAN NOT NULL DEFAULT true,
    `enable_three_way_match` BOOLEAN NOT NULL DEFAULT true,
    `match_tolerance_percent` DECIMAL(6, 3) NOT NULL DEFAULT 0,
    `notify_email` BOOLEAN NOT NULL DEFAULT false,
    `notify_sms` BOOLEAN NOT NULL DEFAULT false,
    `notify_in_system` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_procurement_settings_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(20) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_supplier_categories_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supply_regions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `branches` JSON NULL,
    `country` VARCHAR(100) NULL DEFAULT 'مصر',
    `city` VARCHAR(100) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_supply_regions_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_payment_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `days` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(20) NOT NULL DEFAULT 'immediate',
    `discount_percentage` DECIMAL(6, 3) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_payment_terms_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_requisitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_number` VARCHAR(40) NOT NULL,
    `request_type` VARCHAR(40) NULL,
    `requesting_department` VARCHAR(150) NOT NULL,
    `required_date` VARCHAR(10) NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT 'normal',
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `estimated_value` DECIMAL(14, 2) NULL,
    `approval_notes` TEXT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `branch_id` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_requisitions_request_number_key`(`request_number`),
    INDEX `prc_requisitions_branch_id_idx`(`branch_id`),
    INDEX `prc_requisitions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_requisition_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requisition_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(40) NULL,
    `specifications` TEXT NULL,
    `estimated_price` DECIMAL(14, 2) NULL,

    INDEX `prc_requisition_items_requisition_id_idx`(`requisition_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_rfqs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rfq_number` VARCHAR(40) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `requesting_department` VARCHAR(150) NOT NULL,
    `required_date` VARCHAR(10) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
    `estimated_budget` DECIMAL(14, 2) NULL,
    `selected_vendor_id` INTEGER NULL,
    `final_price` DECIMAL(14, 2) NULL,
    `branch_id` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_rfqs_rfq_number_key`(`rfq_number`),
    INDEX `prc_rfqs_branch_id_idx`(`branch_id`),
    INDEX `prc_rfqs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_rfq_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rfq_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `item_code` VARCHAR(60) NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(40) NULL,
    `estimated_price` DECIMAL(14, 2) NULL,

    INDEX `prc_rfq_items_rfq_id_idx`(`rfq_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_quotations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rfq_id` INTEGER NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `total_price` DECIMAL(14, 2) NOT NULL,
    `delivery_time` VARCHAR(60) NULL,
    `payment_terms` VARCHAR(150) NULL,
    `received_date` VARCHAR(10) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'received',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_quotations_rfq_id_idx`(`rfq_id`),
    INDEX `prc_quotations_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `po_number` VARCHAR(40) NOT NULL,
    `requisition_id` INTEGER NULL,
    `supplier_id` INTEGER NOT NULL,
    `expected_delivery_date` VARCHAR(10) NULL,
    `payment_terms` VARCHAR(150) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_purchase_orders_po_number_key`(`po_number`),
    INDEX `prc_purchase_orders_supplier_id_idx`(`supplier_id`),
    INDEX `prc_purchase_orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_order_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(40) NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,

    INDEX `prc_purchase_order_items_purchase_order_id_idx`(`purchase_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_goods_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `grn_number` VARCHAR(40) NOT NULL,
    `purchase_order_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NULL,
    `receiver_name` VARCHAR(150) NOT NULL,
    `receipt_date` VARCHAR(10) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `stock_posted` BOOLEAN NOT NULL DEFAULT false,
    `posted_at` DATETIME(3) NULL,
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_goods_receipts_grn_number_key`(`grn_number`),
    INDEX `prc_goods_receipts_purchase_order_id_idx`(`purchase_order_id`),
    INDEX `prc_goods_receipts_status_idx`(`status`),
    INDEX `prc_goods_receipts_warehouse_id_idx`(`warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_goods_receipt_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goods_receipt_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `ordered_qty` DECIMAL(14, 3) NOT NULL,
    `received_qty` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(40) NULL,
    `rejected` BOOLEAN NOT NULL DEFAULT false,

    INDEX `prc_goods_receipt_items_goods_receipt_id_idx`(`goods_receipt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(40) NOT NULL,
    `invoice_date` VARCHAR(10) NULL,
    `supplier_id` INTEGER NOT NULL,
    `purchase_order_id` INTEGER NULL,
    `goods_receipt_id` INTEGER NULL,
    `due_date` VARCHAR(10) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'بانتظار مطابقة',
    `matching_status` VARCHAR(20) NOT NULL DEFAULT 'تحت المراجعة',
    `notes` TEXT NULL,
    `invoice_amount` DECIMAL(14, 2) NOT NULL,
    `attachments` JSON NULL,
    `branch_id` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_purchase_invoices_invoice_number_key`(`invoice_number`),
    INDEX `prc_purchase_invoices_supplier_id_idx`(`supplier_id`),
    INDEX `prc_purchase_invoices_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_purchase_invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_invoice_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `po_quantity` DECIMAL(14, 3) NULL,
    `grn_quantity` DECIMAL(14, 3) NULL,
    `variance` DECIMAL(14, 3) NULL,

    INDEX `prc_purchase_invoice_items_purchase_invoice_id_idx`(`purchase_invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_payment_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_invoice_id` INTEGER NOT NULL,
    `scheduled_date` VARCHAR(10) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` VARCHAR(40) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'مجدول',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prc_supplier_payment_schedules_purchase_invoice_id_idx`(`purchase_invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_debit_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `debit_number` VARCHAR(40) NOT NULL,
    `debit_date` VARCHAR(10) NULL,
    `supplier_id` INTEGER NOT NULL,
    `purchase_order_id` INTEGER NULL,
    `invoice_id` INTEGER NULL,
    `reason` VARCHAR(255) NOT NULL,
    `debit_amount` DECIMAL(14, 2) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'مسودة',
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `sent_date` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_debit_notes_debit_number_key`(`debit_number`),
    INDEX `prc_debit_notes_supplier_id_idx`(`supplier_id`),
    INDEX `prc_debit_notes_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_debit_note_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `debit_note_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,

    INDEX `prc_debit_note_items_debit_note_id_idx`(`debit_note_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NULL,
    `supplier_name` VARCHAR(200) NULL,
    `start_date` VARCHAR(10) NOT NULL,
    `end_date` VARCHAR(10) NOT NULL,
    `contract_type` VARCHAR(60) NULL,
    `contract_value` DECIMAL(14, 2) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_supplier_contracts_contract_number_key`(`contract_number`),
    INDEX `prc_supplier_contracts_supplier_id_idx`(`supplier_id`),
    INDEX `prc_supplier_contracts_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `invoice_date` VARCHAR(10) NULL,
    `due_date` VARCHAR(10) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remaining_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'EGP',
    `status` VARCHAR(20) NOT NULL DEFAULT 'مسودة',
    `notes` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_supplier_invoices_invoice_number_key`(`invoice_number`),
    INDEX `prc_supplier_invoices_supplier_id_idx`(`supplier_id`),
    INDEX `prc_supplier_invoices_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `product_name` VARCHAR(255) NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `total_amount` DECIMAL(14, 2) NOT NULL,

    INDEX `prc_supplier_invoice_items_invoice_id_idx`(`invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prc_supplier_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_number` VARCHAR(40) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `invoice_id` INTEGER NULL,
    `payment_date` VARCHAR(10) NULL,
    `payment_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `original_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remaining_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'EGP',
    `payment_method` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'مسودة',
    `notes` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prc_supplier_payments_payment_number_key`(`payment_number`),
    INDEX `prc_supplier_payments_supplier_id_idx`(`supplier_id`),
    INDEX `prc_supplier_payments_invoice_id_idx`(`invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `expense_number` VARCHAR(40) NOT NULL,
    `expense_date` VARCHAR(10) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `sub_category` VARCHAR(100) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` VARCHAR(40) NOT NULL DEFAULT 'نقدي',
    `payment_status` VARCHAR(30) NOT NULL DEFAULT 'معلق',
    `approval_status` VARCHAR(30) NOT NULL DEFAULT 'معلق',
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `rejection_notes` TEXT NULL,
    `description` TEXT NULL,
    `vendor` VARCHAR(255) NULL,
    `invoice_number` VARCHAR(100) NULL,
    `branch_id` INTEGER NULL,
    `department_id` INTEGER NULL,
    `attachments` JSON NULL,
    `notes` TEXT NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurring_frequency` VARCHAR(30) NULL,
    `next_recurring_date` VARCHAR(10) NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_expenses_expense_number_key`(`expense_number`),
    INDEX `fin_expenses_expense_date_idx`(`expense_date`),
    INDEX `fin_expenses_category_idx`(`category`),
    INDEX `fin_expenses_approval_status_idx`(`approval_status`),
    INDEX `fin_expenses_branch_id_idx`(`branch_id`),
    INDEX `fin_expenses_is_recurring_next_recurring_date_idx`(`is_recurring`, `next_recurring_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_revenues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `revenue_number` VARCHAR(40) NOT NULL,
    `revenue_date` VARCHAR(10) NOT NULL,
    `source` VARCHAR(60) NOT NULL,
    `sub_source` VARCHAR(100) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL,
    `net_amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` VARCHAR(40) NOT NULL DEFAULT 'نقدي',
    `payment_status` VARCHAR(30) NOT NULL DEFAULT 'مدفوع',
    `description` TEXT NULL,
    `customer_name` VARCHAR(255) NULL,
    `invoice_number` VARCHAR(100) NULL,
    `receipt_number` VARCHAR(100) NULL,
    `source_module` VARCHAR(40) NULL,
    `source_ref` VARCHAR(100) NULL,
    `branch_id` INTEGER NULL,
    `attachments` JSON NULL,
    `notes` TEXT NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurring_frequency` VARCHAR(30) NULL,
    `next_recurring_date` VARCHAR(10) NULL,
    `created_by` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_revenues_revenue_number_key`(`revenue_number`),
    INDEX `fin_revenues_revenue_date_idx`(`revenue_date`),
    INDEX `fin_revenues_source_idx`(`source`),
    INDEX `fin_revenues_branch_id_idx`(`branch_id`),
    INDEX `fin_revenues_payment_status_idx`(`payment_status`),
    INDEX `fin_revenues_is_recurring_next_recurring_date_idx`(`is_recurring`, `next_recurring_date`),
    UNIQUE INDEX `uq_fin_revenue_source`(`source_module`, `source_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `account_type` ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
    `normal_balance` ENUM('debit', 'credit') NOT NULL,
    `parent_id` INTEGER NULL,
    `is_postable` BOOLEAN NOT NULL DEFAULT true,
    `category` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `branch_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `acc_accounts_code_key`(`code`),
    INDEX `acc_accounts_parent_id_idx`(`parent_id`),
    INDEX `acc_accounts_account_type_idx`(`account_type`),
    INDEX `acc_accounts_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_accounting_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `start_date` VARCHAR(10) NOT NULL,
    `end_date` VARCHAR(10) NOT NULL,
    `status` ENUM('open', 'closed', 'locked') NOT NULL DEFAULT 'open',
    `closed_by` INTEGER NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `acc_accounting_periods_status_idx`(`status`),
    UNIQUE INDEX `acc_accounting_periods_start_date_end_date_key`(`start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_journal_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_no` VARCHAR(50) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `period_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `description` TEXT NULL,
    `reference` VARCHAR(255) NULL,
    `status` ENUM('draft', 'posted', 'reversed') NOT NULL DEFAULT 'draft',
    `source_module` VARCHAR(40) NULL,
    `source_doc_type` VARCHAR(60) NULL,
    `source_doc_id` VARCHAR(80) NULL,
    `total_debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total_credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `reverses_id` INTEGER NULL,
    `reversed_by_id` INTEGER NULL,
    `reversal_reason` TEXT NULL,
    `created_by` INTEGER NULL,
    `posted_by` INTEGER NULL,
    `posted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `acc_journal_entries_entry_no_key`(`entry_no`),
    INDEX `acc_journal_entries_date_idx`(`date`),
    INDEX `acc_journal_entries_status_idx`(`status`),
    INDEX `acc_journal_entries_branch_id_idx`(`branch_id`),
    UNIQUE INDEX `uq_acc_source_doc`(`source_module`, `source_doc_type`, `source_doc_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_journal_entry_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `line_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `acc_journal_entry_lines_entry_id_idx`(`entry_id`),
    INDEX `acc_journal_entry_lines_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fiscal_year_start` VARCHAR(5) NOT NULL DEFAULT '01-01',
    `base_currency` VARCHAR(8) NOT NULL DEFAULT 'EGP',
    `currency_symbol` VARCHAR(8) NOT NULL DEFAULT 'ج.م',
    `require_approval` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acc_default_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(60) NOT NULL,
    `account_code` VARCHAR(50) NOT NULL,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_acc_default_key_branch`(`key`, `branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_about_app` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_name` VARCHAR(255) NOT NULL DEFAULT '',
    `app_version` VARCHAR(50) NULL,
    `description` TEXT NULL,
    `features` TEXT NULL,
    `contact_email` VARCHAR(255) NULL,
    `contact_phone` VARCHAR(50) NULL,
    `website` VARCHAR(255) NULL,
    `privacy_policy` TEXT NULL,
    `terms_of_service` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invitation_code` VARCHAR(50) NOT NULL,
    `recipient_name` VARCHAR(255) NOT NULL,
    `recipient_email` VARCHAR(255) NOT NULL,
    `sent_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('pending', 'accepted', 'rejected', 'attended') NOT NULL DEFAULT 'pending',
    `accepted_date` DATETIME(3) NULL,
    `rejected_date` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `attendance_date` DATETIME(3) NULL,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `am_invitations_invitation_code_key`(`invitation_code`),
    INDEX `am_invitations_status_idx`(`status`),
    INDEX `am_invitations_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(500) NULL,
    `discount` DECIMAL(5, 2) NULL,
    `start_date` VARCHAR(10) NULL,
    `end_date` VARCHAR(10) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_offers_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_trainers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `specialization` VARCHAR(255) NULL,
    `experience` INTEGER NULL,
    `bio` TEXT NULL,
    `image_url` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_trainers_is_active_idx`(`is_active`),
    INDEX `am_trainers_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_exercise_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `description` TEXT NULL,
    `instructions` TEXT NULL,
    `duration` INTEGER NULL,
    `difficulty` ENUM('easy', 'medium', 'hard') NULL,
    `image_url` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_exercises_category_id_idx`(`category_id`),
    INDEX `am_exercises_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_news` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `publish_date` VARCHAR(10) NULL,
    `image_url` VARCHAR(500) NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_news_is_published_idx`(`is_published`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_ads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(500) NULL,
    `link_url` VARCHAR(500) NULL,
    `start_date` VARCHAR(10) NULL,
    `end_date` VARCHAR(10) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_ads_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `agent_brok_fk` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `username` VARCHAR(40) NULL,
    `password` VARCHAR(255) NULL,
    `name` VARCHAR(100) NULL,
    `email` VARCHAR(50) NULL,
    `address` VARCHAR(200) NULL,
    `level` INTEGER NULL,
    `role_id_fk` INTEGER NULL,
    `image` VARCHAR(500) NULL,
    `x_y_z` VARCHAR(300) NULL,
    `branch_id_fk` INTEGER NULL,
    `app_pass` VARCHAR(100) NULL,
    `approved` INTEGER NULL DEFAULT 1,
    `pass_demo` VARCHAR(100) NULL,
    `user_pass` VARCHAR(500) NULL,
    `device_token` VARCHAR(255) NOT NULL DEFAULT '',
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pages` (
    `page_id` INTEGER NOT NULL AUTO_INCREMENT,
    `page_title` VARCHAR(255) NOT NULL,
    `page_link` VARCHAR(255) NOT NULL,
    `group_id_fk` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `page_order` INTEGER NOT NULL,
    `page_icon_code` VARCHAR(255) NOT NULL,
    `page_photo` VARCHAR(500) NOT NULL DEFAULT '0',
    `bg_color` VARCHAR(10) NULL,
    `width` VARCHAR(10) NULL,
    `color` VARCHAR(10) NULL,
    `class` VARCHAR(10) NULL,

    PRIMARY KEY (`page_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `user_id` INTEGER NOT NULL,
    `page_id_fk` INTEGER NOT NULL,
    `page_level` INTEGER NOT NULL,

    INDEX `permissions_page_id_fk_idx`(`page_id_fk`),
    PRIMARY KEY (`user_id`, `page_id_fk`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(50) NULL,
    `active` ENUM('yes', 'no') NOT NULL DEFAULT 'yes',
    `page_order` INTEGER NULL,
    `screen_num` TINYINT NULL,
    `icon_path` VARCHAR(300) NULL,
    `icon_path_past` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `notify_id_fk` INTEGER NULL,
    `message` VARCHAR(1000) NULL,
    `url` VARCHAR(100) NULL,
    `date` VARCHAR(100) NULL,
    `type` TINYINT NULL,
    `approved` TINYINT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_user` INTEGER NULL,
    `to_user` INTEGER NULL,
    `date_ar` VARCHAR(15) NULL,
    `time_ar` VARCHAR(15) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `seen_date` VARCHAR(15) NULL,
    `seen_time` VARCHAR(10) NULL,
    `fk_id` BIGINT NULL,
    `notify_id_fk` INTEGER NULL,
    `n_code` INTEGER NULL,
    `test_num` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_sys_notifications_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NULL,
    `t_table` VARCHAR(100) NULL,
    `url` VARCHAR(100) NULL,
    `title` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee` VARCHAR(200) NULL,
    `emp_code` INTEGER NULL,
    `branch_id_fk` INTEGER NULL,
    `emp_code_g` INTEGER NULL,
    `socity_branch_id_fk` INTEGER NULL,
    `branche_work_id_fk` INTEGER NULL,
    `branche_sub_work_id_fk` INTEGER NULL,
    `emp_type` TINYINT NOT NULL DEFAULT 1,
    `card_num` BIGINT NULL DEFAULT 0,
    `demo_card` VARCHAR(15) NOT NULL,
    `gender` TINYINT NULL,
    `f2a_contract` INTEGER NULL,
    `cat_manager_id_fk` VARCHAR(255) NULL,
    `insurance_number` INTEGER NULL,
    `city_id_fk` INTEGER NULL,
    `hai_id_fk` INTEGER NULL,
    `street_name` VARCHAR(255) NULL,
    `bank` TINYINT NULL,
    `bank_num` VARCHAR(255) NULL,
    `status` TINYINT NULL,
    `phone` VARCHAR(20) NULL,
    `administration` INTEGER NULL,
    `department` VARCHAR(100) NULL,
    `degree_id` VARCHAR(100) NULL,
    `contract` VARCHAR(100) NULL,
    `personal_photo` VARCHAR(200) NULL,
    `emp_sign` VARCHAR(255) NULL,
    `birth_date` VARCHAR(255) NULL,
    `birth_date_m` VARCHAR(30) NULL,
    `birth_date_h` VARCHAR(30) NULL,
    `type_card` VARCHAR(100) NULL,
    `dest_card` VARCHAR(100) NULL,
    `passport_number` VARCHAR(50) NULL,
    `date_start_passport` VARCHAR(50) NULL,
    `date_end_passport` VARCHAR(50) NULL,
    `esdar_date` VARCHAR(20) NULL,
    `esdar_date_m` VARCHAR(30) NULL,
    `esdar_date_h` VARCHAR(30) NULL,
    `end_date` VARCHAR(255) NULL,
    `end_date_m` VARCHAR(30) NULL,
    `end_date_h` VARCHAR(30) NULL,
    `adress` VARCHAR(100) NULL,
    `adress_other` VARCHAR(100) NULL,
    `email` VARCHAR(200) NULL,
    `nationality` VARCHAR(100) NULL,
    `deyana` VARCHAR(20) NULL,
    `employee_degree` VARCHAR(100) NULL,
    `employee_qualification` VARCHAR(100) NULL,
    `employee_type` INTEGER NOT NULL DEFAULT 1,
    `reason` VARCHAR(100) NULL,
    `manger` VARCHAR(20) NULL,
    `type_tamin` VARCHAR(100) NULL,
    `start_work_date_m` VARCHAR(255) NULL,
    `start_work_date_h` VARCHAR(30) NULL,
    `end_contract_date_m` VARCHAR(255) NULL,
    `end_contract_date_h` VARCHAR(30) NULL,
    `end_service_date_m` VARCHAR(30) NULL,
    `end_service_date_h` VARCHAR(30) NULL,
    `work_maktb` VARCHAR(50) NULL,
    `another_phone` VARCHAR(20) NULL,
    `snap_chat` VARCHAR(50) NULL,
    `twiter` VARCHAR(255) NULL,
    `start_tamin_date_m` VARCHAR(30) NULL,
    `start_tamin_date_h` VARCHAR(30) NULL,
    `type_tamin__medicine` VARCHAR(100) NULL,
    `tamin_company` VARCHAR(100) NULL,
    `tamin_medicine_num` VARCHAR(200) NULL,
    `tamin_medicine_end_date` VARCHAR(15) NULL,
    `tamin_medicine_company` VARCHAR(70) NULL,
    `polica_num` VARCHAR(200) NULL,
    `tamin_type` VARCHAR(100) NULL,
    `tamin_date_m` VARCHAR(30) NULL,
    `tamin_date_h` VARCHAR(30) NULL,
    `leave_emp` TINYINT NULL,
    `executive_management_fk` TINYINT NULL,
    `manger_type` TINYINT NULL,
    `publisher` INTEGER NULL,
    `date` VARCHAR(30) NULL,
    `tahwela_rkm` INTEGER NULL,
    `edara_n` VARCHAR(50) NULL,
    `qsm_n` VARCHAR(50) NULL,
    `mosma_wazefy_code` INTEGER NULL,
    `mosma_wazefy_tarteb` TINYINT NULL,
    `mosma_wazefy_n` VARCHAR(50) NULL,
    `mosma_wazefy_eqama_n` VARCHAR(100) NULL,
    `test_num_month` INTEGER NULL,
    `end_test_date_m` VARCHAR(30) NULL,
    `edara_id` INTEGER NULL,
    `qsm_id` INTEGER NULL,
    `w7da_id` INTEGER NULL,
    `markz_id` INTEGER NULL,
    `markz_name` VARCHAR(50) NULL,
    `cat_mosayer_id_fk` TINYINT NULL,
    `show_in_mosayer` ENUM('yes', 'no') NULL,
    `show_in_tamen` ENUM('yes', 'no') NULL,
    `use_signature` VARCHAR(50) NULL,
    `users_signatures` VARCHAR(255) NULL,
    `bbank` VARCHAR(500) NULL,
    `x1` VARCHAR(15) NULL,
    `x2` VARCHAR(15) NULL,
    `rkm_saheb_amal` VARCHAR(15) NULL,
    `tasken_type` ENUM('alone', 'family') NULL,
    `tasken_vlaue` DECIMAL(19, 2) NULL,
    `motawen` ENUM('yes', 'no') NULL,
    `download_app` TINYINT NULL,
    `token` VARCHAR(500) NULL,
    `token_date` VARCHAR(15) NULL,
    `token_time` VARCHAR(10) NULL,
    `generate_qrcode` ENUM('yes', 'no') NULL DEFAULT 'no',
    `tamin_egtma3y_num` VARCHAR(100) NULL,
    `branche_company_id_fk` INTEGER NULL,
    `barcode_path` VARCHAR(200) NULL,
    `qrcode_path` VARCHAR(200) NULL,
    `year_vacation_num` INTEGER NULL,
    `remove_basma` ENUM('yes', 'no') NOT NULL DEFAULT 'no',
    `halet_kafala` ENUM('kafala', 'ajeer', 'zeyara', 'other', 'saudi', 'eqama') NOT NULL DEFAULT 'kafala',
    `remain_akd` DOUBLE NULL,
    `remain_tby` DOUBLE NULL,
    `remain_gwaz` DOUBLE NULL,
    `remain_eqama` DOUBLE NULL,
    `no3_emp` ENUM('eshraf', 'schools') NOT NULL DEFAULT 'schools',
    `wazefa_type` ENUM('moder', 'emp') NOT NULL DEFAULT 'emp',
    `neqat_total` INTEGER NULL,
    `neqat_x1` INTEGER NULL,
    `neqat_x2` INTEGER NULL,
    `neqat_x3` INTEGER NULL,
    `neqat_x4` INTEGER NULL,
    `neqat_x5` INTEGER NULL,
    `neqat_x6` INTEGER NULL,
    `neqat_x7` INTEGER NULL,
    `neqat_t` INTEGER NULL,
    `card_esdar_date` VARCHAR(50) NULL,
    `card_enhaa_date` VARCHAR(50) NULL,
    `age` INTEGER NOT NULL DEFAULT 0,
    `birth_img` ENUM('yes', 'no') NULL,
    `qualification_img` ENUM('yes', 'no') NULL,
    `phesh_genai` ENUM('yes', 'no') NULL,
    `military_service` ENUM('yes', 'no') NULL,
    `e3fa_reason` VARCHAR(50) NULL,
    `person_img` ENUM('yes', 'no') NULL,
    `rokhsa_mihani` ENUM('yes', 'no') NULL,
    `date_ar` VARCHAR(50) NULL,
    `date_s` VARCHAR(50) NULL,
    `shahadt_jaish` ENUM('yes', 'no') NOT NULL,
    `tamin_rkm` INTEGER NOT NULL,
    `khedma_year` INTEGER NOT NULL,
    `tamin_mosama_wazefy` VARCHAR(50) NULL,
    `tamin_rateb` DECIMAL(19, 2) NULL,
    `tamin_hesa_emp` DECIMAL(19, 2) NULL,
    `tamin_hesa_oner` DECIMAL(19, 2) NULL,
    `emp_code_gym` INTEGER NOT NULL DEFAULT 0,
    `previous_experience` TEXT NULL,
    `skills` TEXT NULL,
    `languages` TEXT NULL,
    `marital_status` INTEGER NULL,
    `national_address` VARCHAR(255) NULL,
    `basic_salary` DECIMAL(19, 2) NULL,
    `app_user_id` INTEGER NULL,

    INDEX `employees_app_user_id_idx`(`app_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` INTEGER NULL,
    `edara_id_fk` INTEGER NOT NULL,
    `qsm_id_fk` INTEGER NOT NULL,
    `employee` VARCHAR(100) NOT NULL,
    `card_num` VARCHAR(50) NOT NULL,
    `card` ENUM('yes', 'no') NOT NULL DEFAULT 'yes',
    `card_esdar_date` VARCHAR(20) NOT NULL,
    `card_enhaa_date` VARCHAR(20) NOT NULL,
    `phone` INTEGER NOT NULL,
    `direct_manager_fk` INTEGER NOT NULL,
    `birth_date` VARCHAR(20) NOT NULL,
    `age` INTEGER NOT NULL,
    `gender` INTEGER NOT NULL,
    `adress` VARCHAR(100) NOT NULL,
    `nationality` INTEGER NOT NULL,
    `deyana` INTEGER NOT NULL,
    `job_title` VARCHAR(100) NOT NULL,
    `employee_type` INTEGER NOT NULL DEFAULT 1,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` VARCHAR(20) NOT NULL,
    `personal_photo` VARCHAR(100) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `type` INTEGER NULL,
    `qsm_n` VARCHAR(100) NOT NULL,
    `edara_n` VARCHAR(100) NOT NULL,
    `qualification_img` ENUM('yes', 'no') NOT NULL,
    `employee_qualification` VARCHAR(100) NOT NULL,
    `contract` VARCHAR(100) NOT NULL,
    `end_contract_date` VARCHAR(20) NOT NULL,
    `start_work_date` VARCHAR(20) NOT NULL,
    `khedma_year` INTEGER NOT NULL,
    `test_num_month` INTEGER NOT NULL,
    `end_test_date` VARCHAR(20) NOT NULL,
    `type_tamin` VARCHAR(100) NOT NULL,
    `markz_taklfa` VARCHAR(200) NOT NULL,
    `birth_img` ENUM('yes', 'no') NOT NULL DEFAULT 'yes',
    `phesh_genai` ENUM('yes', 'no') NOT NULL,
    `ka3b_3ml` ENUM('yes', 'no') NOT NULL,
    `shahadt_jaish` ENUM('yes', 'no') NOT NULL,
    `military_service` ENUM('yes', 'no') NOT NULL,
    `e3fa_reason` ENUM('yes', 'no') NULL,
    `person_img` ENUM('yes', 'no') NOT NULL,
    `rokhsa_mihani` ENUM('yes', 'no') NOT NULL,
    `estkmal_nespa` DECIMAL(10, 0) NOT NULL,
    `warady_type` VARCHAR(100) NOT NULL,
    `warady_num` INTEGER NOT NULL,
    `tamin_rkm` INTEGER NOT NULL,
    `tamin_mosama_wazefy` VARCHAR(100) NOT NULL,
    `tamin_date` VARCHAR(20) NOT NULL,
    `tamin_rateb` DECIMAL(10, 0) NOT NULL,
    `tamin_hesa_emp` DECIMAL(10, 0) NOT NULL,
    `tamin_hesa_oner` DECIMAL(10, 0) NOT NULL,
    `khat_seir` VARCHAR(100) NULL,
    `download_app` INTEGER NOT NULL DEFAULT 0,
    `users_signatures` VARCHAR(100) NOT NULL DEFAULT '0',
    `app_users_signatures` VARCHAR(100) NOT NULL DEFAULT '0',
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `token` VARCHAR(400) NULL,
    `token_date` VARCHAR(20) NULL,
    `token_time` VARCHAR(20) NULL,
    `mosma_wazefy_n` VARCHAR(50) NULL,
    `direct_manager_code_fk` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emp_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `emp_code` VARCHAR(255) NOT NULL DEFAULT '0',
    `title` VARCHAR(400) NOT NULL,
    `emp_file` TEXT NOT NULL,
    `tanbih_fk` TINYINT NULL,
    `period` TINYINT NULL,
    `have_date` TINYINT NOT NULL DEFAULT 0,
    `from_date` VARCHAR(15) NULL,
    `from_date_h` VARCHAR(15) NULL,
    `to_date` VARCHAR(15) NULL,
    `to_date_h` VARCHAR(15) NULL,

    INDEX `emp_files_emp_id_idx`(`emp_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_employe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` VARCHAR(255) NOT NULL DEFAULT '0',
    `num_days_in_month` VARCHAR(255) NOT NULL DEFAULT '0',
    `hours_work` VARCHAR(255) NOT NULL DEFAULT '0',
    `hour_value` VARCHAR(255) NOT NULL DEFAULT '0',
    `work_period_id_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `contract_nature` INTEGER NOT NULL DEFAULT 0,
    `job_type` VARCHAR(255) NOT NULL DEFAULT '0',
    `pay_method_id_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `bank_id_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `bank_code` VARCHAR(255) NOT NULL DEFAULT '255',
    `bank_account_num` VARCHAR(255) NOT NULL DEFAULT '0',
    `year_vacation_num` VARCHAR(255) NOT NULL DEFAULT '0',
    `year_vacation_period` VARCHAR(255) NOT NULL DEFAULT '0',
    `casual_vacation_num` VARCHAR(255) NOT NULL DEFAULT '0',
    `travel_ticket` VARCHAR(255) NOT NULL DEFAULT '0',
    `travel_type_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `travel_period` VARCHAR(255) NOT NULL DEFAULT '0',
    `reward_end_work` TINYINT NOT NULL DEFAULT 0,
    `vacation_previous_balance` DOUBLE NOT NULL,
    `vacation_start_ar` VARCHAR(255) NOT NULL,
    `vacation_start_m` VARCHAR(15) NULL,
    `vacation_start_h` VARCHAR(15) NULL,
    `travel_type_name` VARCHAR(30) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_employes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` VARCHAR(255) NOT NULL DEFAULT '0',
    `markz` VARCHAR(255) NULL,
    `markz_name` VARCHAR(100) NULL,
    `having_all_value` VARCHAR(100) NULL DEFAULT '0',
    `having_tamin_value` VARCHAR(100) NULL DEFAULT '0',
    `discut_all_value` DECIMAL(19, 2) NULL,
    `discut_tamin_value` VARCHAR(100) NULL DEFAULT '0',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_finance_employes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NOT NULL DEFAULT 0,
    `method_to_count` TINYINT NOT NULL DEFAULT 1,
    `badl_discount_id_fk` INTEGER NOT NULL DEFAULT 0,
    `badl_code` INTEGER NULL,
    `value` DOUBLE NOT NULL DEFAULT 0,
    `badl_type` TINYINT NOT NULL DEFAULT 0,
    `specific_period` VARCHAR(255) NOT NULL DEFAULT '0',
    `date_from` VARCHAR(255) NULL,
    `date_to` VARCHAR(255) NULL,
    `insurance_affect` TINYINT NOT NULL DEFAULT 0,
    `dalel_code` BIGINT NOT NULL DEFAULT 0,
    `dalel_name` VARCHAR(100) NULL,
    `having_all_value` DECIMAL(19, 2) NULL,
    `having_tamin_value` DECIMAL(19, 2) NULL,
    `discut_all_value` DECIMAL(19, 2) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    INDEX `hr_finance_employes_emp_id_idx`(`emp_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees_settings` (
    `id_setting` INTEGER NOT NULL AUTO_INCREMENT,
    `title_setting` VARCHAR(255) NOT NULL,
    `have_branch` INTEGER NOT NULL DEFAULT 0,
    `type` INTEGER NOT NULL,
    `type_name` VARCHAR(255) NOT NULL,
    `form_id` INTEGER NOT NULL DEFAULT 0,
    `in_order` INTEGER NOT NULL DEFAULT 0,
    `color` VARCHAR(10) NULL,

    PRIMARY KEY (`id_setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees_branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id_fk` INTEGER NULL,
    `emp_id_fk` INTEGER NULL,
    `date` VARCHAR(100) NULL,
    `publisher` INTEGER NULL,

    INDEX `employees_branches_emp_id_fk_idx`(`emp_id_fk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `all_defined_setting` (
    `defined_id` INTEGER NOT NULL AUTO_INCREMENT,
    `defined_title` VARCHAR(255) NOT NULL,
    `defined_type` INTEGER NOT NULL,
    `defined_type_title` VARCHAR(255) NOT NULL,
    `in_order` VARCHAR(255) NOT NULL DEFAULT '0',

    PRIMARY KEY (`defined_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `main_dep_name` VARCHAR(255) NOT NULL,
    `main_dep_f_id` VARCHAR(255) NOT NULL,
    `sub_dep_name` VARCHAR(255) NOT NULL,
    `detail` VARCHAR(255) NOT NULL,
    `type` TINYINT NOT NULL,
    `suspend` TINYINT NOT NULL,
    `date` VARCHAR(255) NOT NULL,
    `date_s` VARCHAR(255) NOT NULL,
    `publisher` VARCHAR(255) NOT NULL,
    `deleted` TINYINT NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `from_id_fk` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 0,
    `in_order` VARCHAR(255) NOT NULL DEFAULT '0',
    `dep_code` INTEGER NULL,
    `edara_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_job_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `edara_title` VARCHAR(255) NOT NULL,
    `edara_id_fk` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_edarat_aqsam` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title_id` INTEGER NOT NULL,
    `title_code` INTEGER NULL,
    `title` VARCHAR(100) NULL,
    `from_id_fk` INTEGER NULL DEFAULT 0,
    `trteeb` INTEGER NULL,
    `from_code` INTEGER NOT NULL,
    `to_code` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bank_name` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banks_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `account_num` VARCHAR(255) NOT NULL,
    `ar_name` VARCHAR(255) NOT NULL DEFAULT '0',
    `en_name` VARCHAR(255) NOT NULL DEFAULT '0',
    `bank_code` VARCHAR(255) NOT NULL DEFAULT '0',
    `account_num_length` VARCHAR(255) NOT NULL DEFAULT '0',
    `code` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_employes_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` INTEGER NOT NULL DEFAULT 0,
    `bank_id_fk` INTEGER NOT NULL DEFAULT 0,
    `bank_account_num` VARCHAR(255) NOT NULL DEFAULT '0',
    `bank_code` VARCHAR(10) NULL,
    `approved_for_sarf` TINYINT NOT NULL DEFAULT 0,
    `bank_id_fk_image` VARCHAR(700) NULL DEFAULT '0',
    `emp_bank_name` VARCHAR(70) NULL,
    `past_bank_id_fk` INTEGER NULL,
    `past_bank_account_num` VARCHAR(200) NULL,
    `past_bank_id_fk_image` VARCHAR(200) NULL,
    `attachment` VARCHAR(200) NULL,
    `past_attachment` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hdoor_emps` (
    `hodoor_id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_code` INTEGER NULL,
    `member_id` INTEGER NULL,
    `action_date` VARCHAR(15) NULL,
    `action_date_s` VARCHAR(15) NULL,
    `hdoor_time` VARCHAR(15) NULL,
    `dwam_hdoor_time` VARCHAR(10) NULL,
    `late_min` DOUBLE NULL,
    `ensraf_time` VARCHAR(10) NULL,
    `dwam_ensraf_time` VARCHAR(10) NULL,
    `mobaker_min` DOUBLE NULL,
    `hdoor_user_id` INTEGER NULL,
    `ensraf_user_id` INTEGER NULL,
    `ttype` ENUM('hdoor', 'ensraf', 'Out') NULL,
    `action_time` VARCHAR(10) NULL,
    `num_min` DOUBLE NULL,
    `tasgel_type` ENUM('automatic', 'manual') NULL DEFAULT 'automatic',
    `hdoor_img_path` VARCHAR(500) NULL,
    `ensraf_img_path` VARCHAR(500) NULL,
    `hdoor_lat` VARCHAR(100) NULL,
    `hdoor_long` VARCHAR(100) NULL,
    `ensraf_lat` VARCHAR(100) NULL,
    `ensraf_long` VARCHAR(100) NULL,
    `second_hdoor_time` VARCHAR(10) NULL,
    `second_hdoor_user_id` INTEGER NULL,
    `second_dwam_hdoor_time` VARCHAR(10) NULL,
    `second_late_min` DOUBLE NULL,
    `second_hdoor_img_path` VARCHAR(500) NULL,
    `second_hdoor_lat` VARCHAR(100) NULL,
    `second_hdoor_long` VARCHAR(100) NULL,
    `second_ensraf_time` VARCHAR(10) NULL,
    `second_ensraf_user_id` INTEGER NULL,
    `second_dwam_ensraf_time` VARCHAR(10) NULL,
    `second_mobaker_min` DOUBLE NULL,
    `second_ensraf_img_path` VARCHAR(500) NULL,
    `second_ensraf_lat` VARCHAR(100) NULL,
    `second_ensraf_long` VARCHAR(100) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `mobker_hdor` INTEGER NULL DEFAULT 0,
    `ensraf_point` INTEGER NULL,
    `sheft_type` INTEGER NOT NULL,
    `branch_id_fk` INTEGER NOT NULL,
    `dwam_id_fk` INTEGER NOT NULL,

    PRIMARY KEY (`hodoor_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hdoor_emps_history` (
    `hodoor_id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_code` INTEGER NULL,
    `member_id` INTEGER NULL,
    `action_date` VARCHAR(15) NULL,
    `action_date_s` VARCHAR(15) NULL,
    `hdoor_ensraf_time` VARCHAR(15) NULL,
    `dwam_hdoor_time` VARCHAR(10) NULL,
    `setting_time` VARCHAR(10) NULL,
    `ttype` ENUM('hdoor', 'ensraf', 'Out') NULL,
    `action_time` VARCHAR(10) NULL,
    `img_path` VARCHAR(500) NULL,
    `m_lat` VARCHAR(100) NULL,
    `m_long` VARCHAR(100) NULL,

    PRIMARY KEY (`hodoor_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hdodr_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hdoor_from_time` VARCHAR(10) NULL,
    `hdoor_to_time` VARCHAR(10) NULL,
    `hdoor_khasm_from` VARCHAR(10) NULL,
    `ensraf_from_time` VARCHAR(10) NULL,
    `ensraf_khasm_from` VARCHAR(10) NULL,
    `ensraf_to_time` VARCHAR(10) NULL,
    `title` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hdodr_status` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(10) NULL,
    `active` ENUM('yes', 'no') NOT NULL DEFAULT 'no',
    `branche` ENUM('all', 'aja') NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_emp_dwam` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NOT NULL,
    `emp_code` VARCHAR(255) NULL,
    `always_id_fk` INTEGER NOT NULL,
    `period_id_fk` INTEGER NOT NULL,
    `attend_time` VARCHAR(255) NOT NULL,
    `leave_time` VARCHAR(255) NOT NULL,
    `start_enter` VARCHAR(255) NOT NULL,
    `end_enter` VARCHAR(255) NOT NULL,
    `start_out` VARCHAR(255) NOT NULL,
    `end_out` VARCHAR(255) NOT NULL,
    `from_date` INTEGER NOT NULL,
    `from_date_ar` VARCHAR(255) NOT NULL,
    `to_date` INTEGER NOT NULL,
    `to_date_ar` VARCHAR(255) NOT NULL,
    `saturday` INTEGER NOT NULL DEFAULT 0,
    `sunday` INTEGER NOT NULL DEFAULT 0,
    `monday` INTEGER NOT NULL DEFAULT 0,
    `tuesday` INTEGER NOT NULL DEFAULT 0,
    `wednesday` INTEGER NOT NULL DEFAULT 0,
    `thursday` INTEGER NOT NULL DEFAULT 0,
    `friday` INTEGER NOT NULL DEFAULT 0,

    INDEX `hr_emp_dwam_emp_id_idx`(`emp_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_emp_dwam_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `emp_code` VARCHAR(255) NOT NULL DEFAULT '0',
    `num_in_device` VARCHAR(255) NOT NULL,
    `device_id_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `period_id_fk` VARCHAR(255) NOT NULL DEFAULT '0',
    `from_day` VARCHAR(255) NOT NULL DEFAULT '0',
    `to_day` VARCHAR(255) NOT NULL DEFAULT '0',
    `no3_dawam` ENUM('full', 'half') NULL,

    INDEX `hr_emp_dwam_details_emp_id_idx`(`emp_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emp_attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` TEXT NOT NULL,
    `date` INTEGER NOT NULL,
    `presence` VARCHAR(255) NOT NULL,
    `dissuasion` VARCHAR(255) NOT NULL,
    `diff` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_gym_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ttype` ENUM('target', 'proten', 'classes') NOT NULL,
    `for_user` INTEGER NOT NULL,
    `for_gym` INTEGER NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `publisher_name` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holiday_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(300) NOT NULL,
    `num_days` INTEGER NOT NULL DEFAULT 0,
    `max_days` INTEGER NOT NULL DEFAULT 0,
    `min_days` INTEGER NOT NULL DEFAULT 0,
    `mowazf_badel` TINYINT NOT NULL DEFAULT 0,
    `agaza_ttype` TINYINT NOT NULL DEFAULT 0,
    `date_from` VARCHAR(15) NULL,
    `date_to` VARCHAR(15) NULL,
    `active` VARCHAR(191) NULL DEFAULT 'yes',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_agazat_sysat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `min_nums_in_year` INTEGER NULL,
    `emergency_nums_in_year` INTEGER NULL,
    `max_nums_in_year` INTEGER NULL,
    `moda_takdem_talb` INTEGER NULL,
    `min_nums_in_talb` INTEGER NULL,
    `moda_takdem_talb_min` INTEGER NULL,
    `is_avlible_no_sallary_agaza` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_agzat_attaches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `talab_id_fk` INTEGER NULL,
    `title` VARCHAR(150) NULL,
    `file` TEXT NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time` VARCHAR(10) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_agzat_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agaza_rkm_fk` INTEGER NOT NULL DEFAULT 0,
    `agaza_id_fk` INTEGER NOT NULL DEFAULT 0,
    `from_user` INTEGER NOT NULL DEFAULT 0,
    `from_user_n` VARCHAR(100) NULL,
    `to_user` INTEGER NOT NULL DEFAULT 0,
    `to_user_n` VARCHAR(100) NULL,
    `talab_in_fk` INTEGER NOT NULL DEFAULT 0,
    `talab_in_title` VARCHAR(20) NULL,
    `level` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(30) NULL,
    `reason_action` VARCHAR(30) NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_agzat_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agaza_rkm` INTEGER NULL,
    `agaza_date` VARCHAR(20) NULL,
    `agaza_date_ar` VARCHAR(20) NULL,
    `no3_agaza` INTEGER NULL,
    `f2a_agaza` TINYINT NULL,
    `fatra_agaza` TINYINT NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` BIGINT NULL,
    `edara_id_fk` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_id_fk` INTEGER NULL,
    `qsm_n` VARCHAR(50) NULL,
    `direct_manager_id_fk` INTEGER NULL,
    `direct_manager_code_fk` BIGINT NULL,
    `direct_manager_n` VARCHAR(50) NULL,
    `agaza_from_date_m` VARCHAR(20) NULL,
    `agaza_from_date_h` VARCHAR(20) NULL,
    `agaza_to_date_m` VARCHAR(20) NULL,
    `agaza_to_date_h` VARCHAR(20) NULL,
    `agaza_to_date` INTEGER NULL,
    `agaza_from_date` INTEGER NULL,
    `num_days` FLOAT NULL DEFAULT 0,
    `allDayes` INTEGER NULL,
    `rased_motah` INTEGER NULL,
    `mobashret_amal_date_m` VARCHAR(20) NULL,
    `mobashret_amal_date_h` VARCHAR(20) NULL,
    `address_since_agaza` VARCHAR(50) NULL,
    `emp_jwal` VARCHAR(20) NULL,
    `month` INTEGER NULL,
    `year` INTEGER NULL,
    `marad_name` VARCHAR(50) NULL,
    `taqrer_form_date_m` VARCHAR(20) NULL,
    `taqrer_form_date_h` VARCHAR(20) NULL,
    `taqrer_to_date_m` VARCHAR(20) NULL,
    `taqrer_to_date_h` VARCHAR(20) NULL,
    `hospital_name` VARCHAR(100) NULL,
    `hospital_report` VARCHAR(150) NULL,
    `emp_badel_id_fk` INTEGER NULL,
    `emp_badel_code_fk` BIGINT NULL,
    `emp_badel_n` VARCHAR(50) NULL,
    `action_emp_badel` TINYINT NOT NULL DEFAULT 0,
    `action_direct_manager` TINYINT NOT NULL DEFAULT 0,
    `action_mowazf_moktas` TINYINT NOT NULL DEFAULT 0,
    `action_moder_hr` TINYINT NOT NULL DEFAULT 0,
    `action_moder_final` TINYINT NOT NULL DEFAULT 0,
    `suspend` TINYINT NOT NULL DEFAULT 0,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(50) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(50) NULL,
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(100) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `talab_msg` VARCHAR(100) NULL,
    `reason_action` VARCHAR(50) NULL,
    `current_date_s` VARCHAR(50) NULL,
    `agaza_from_day_n` VARCHAR(20) NULL,
    `agaza_to_day_n` VARCHAR(20) NULL,
    `mobashret_amal_day_n` VARCHAR(20) NULL,
    `daraget_waffa` VARCHAR(100) NULL,
    `without_salary` TINYINT NOT NULL DEFAULT 0,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `publisher` INTEGER NULL,
    `manger` VARCHAR(50) NULL,
    `manager_code` VARCHAR(50) NULL,
    `manager_name` VARCHAR(100) NULL,
    `current_from_emp_id` VARCHAR(50) NULL,
    `current_to_emp_id` VARCHAR(50) NULL,
    `reason` VARCHAR(200) NULL,
    `suspend_reason` VARCHAR(200) NULL,
    `suspend_date` VARCHAR(20) NULL,
    `suspend_time` VARCHAR(20) NULL,
    `f_file` VARCHAR(200) NULL,
    `for_year` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `send_to_emp_badel` VARCHAR(191) NULL DEFAULT 'wait',
    `send_to_direct_manager` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_emp_badel` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_direct_manager` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_moder_edara` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_hr` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_emp_badel_date` VARCHAR(15) NULL,
    `approve_direct_manager_date` VARCHAR(15) NULL,
    `approve_moder_edara_date` VARCHAR(15) NULL,
    `approve_hr_date` VARCHAR(15) NULL,
    `close_talab` VARCHAR(191) NULL DEFAULT 'wait',
    `actions_sends` VARCHAR(191) NULL DEFAULT 'start',
    `approve_moder_3am` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_moder_3am_date` VARCHAR(15) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_ozonat_attaches` (
    `id` INTEGER NOT NULL,
    `talab_id_fk` INTEGER NULL,
    `title` VARCHAR(100) NULL,
    `file` TEXT NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time` VARCHAR(10) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_ozonat_history` (
    `id` INTEGER NOT NULL,
    `ezn_rkm_fk` INTEGER NULL,
    `ezn_rkm_id` INTEGER NULL,
    `from_user_id` INTEGER NULL,
    `from_user_name` VARCHAR(100) NULL,
    `to_user_id` INTEGER NULL,
    `to_user_name` VARCHAR(100) NULL,
    `level` TINYINT NULL,
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(500) NULL,
    `reason_action` VARCHAR(500) NULL,
    `date_ar` VARCHAR(50) NULL,
    `date` VARCHAR(100) NULL,
    `publisher` VARCHAR(100) NULL,
    `suspend` VARCHAR(2) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_ozonat_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ezn_rkm` INTEGER NULL,
    `ezn_date` VARCHAR(20) NULL,
    `ezn_date_ar` VARCHAR(20) NULL,
    `ezn_month` INTEGER NULL,
    `ezn_year` INTEGER NULL,
    `no3_ezn` TINYINT NULL,
    `fatra_fk` TINYINT NULL,
    `fatra_n` VARCHAR(20) NULL,
    `from_hour` VARCHAR(10) NULL,
    `to_hour` VARCHAR(10) NULL,
    `total_hours` DOUBLE NOT NULL DEFAULT 0,
    `reason` VARCHAR(120) NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_user_id` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `edara_id_fk` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_id_fk` INTEGER NULL,
    `qsm_n` VARCHAR(100) NULL,
    `direct_manager_id_fk` INTEGER NULL,
    `direct_manager_code_fk` INTEGER NULL,
    `direct_manager_n` VARCHAR(100) NULL,
    `date` VARCHAR(20) NULL,
    `date_ar` VARCHAR(20) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(70) NULL,
    `current_from_id` VARCHAR(100) NULL,
    `current_to_id` VARCHAR(100) NULL,
    `current_from_user_name` VARCHAR(100) NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `suspend` TINYINT NOT NULL DEFAULT 0,
    `cancel` VARCHAR(191) NULL DEFAULT 'no',
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(100) NULL,
    `reason_action` VARCHAR(50) NULL,
    `emp_name` VARCHAR(100) NULL,
    `job_title` VARCHAR(100) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `action_direct_manager` TINYINT NOT NULL DEFAULT 0,
    `action_mowazf_moktas` TINYINT NOT NULL DEFAULT 0,
    `action_moder_hr` TINYINT NOT NULL DEFAULT 0,
    `action_moder_final` TINYINT NOT NULL DEFAULT 0,
    `remain_hours` INTEGER NULL,
    `remain_num` INTEGER NULL,
    `geha_name` VARCHAR(50) NULL,
    `visit_goal` VARCHAR(50) NULL,
    `visit_sub` VARCHAR(50) NULL,
    `visit_type` TINYINT NULL,
    `visit_detailes` VARCHAR(50) NULL,
    `need_report` VARCHAR(191) NULL DEFAULT 'no',
    `send_report` VARCHAR(191) NULL,
    `report_to_user_id` INTEGER NULL,
    `suspend_report` TINYINT NULL,
    `current_from_user_emp_id` INTEGER NULL,
    `current_to_emp_id` INTEGER NULL,
    `current_from_emp_id` INTEGER NULL,
    `current_from_user_id` INTEGER NULL,
    `current_to_user_id` INTEGER NULL,
    `suspend_reason` VARCHAR(200) NULL,
    `suspend_date` VARCHAR(20) NULL,
    `suspend_time` VARCHAR(20) NULL,
    `send_to_direct_manager` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_direct_manager` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_moder_edara` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_hr` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_emp_badel_date` VARCHAR(15) NULL,
    `approve_direct_manager_date` VARCHAR(15) NULL,
    `approve_moder_edara_date` VARCHAR(15) NULL,
    `approve_hr_date` VARCHAR(15) NULL,
    `close_talab` VARCHAR(191) NULL DEFAULT 'wait',
    `actions_sends` VARCHAR(191) NULL DEFAULT 'start',
    `approve_moder_3am` VARCHAR(191) NULL DEFAULT 'wait',
    `approve_moder_3am_date` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_ozonat_tamayoz` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `edara_id` INTEGER NOT NULL,
    `from_date` VARCHAR(20) NOT NULL,
    `to_date` VARCHAR(20) NOT NULL,
    `num_koli` INTEGER NOT NULL,
    `num_gozy` INTEGER NOT NULL,
    `marat` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_all_transformation_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(20) NULL,
    `tbl` VARCHAR(10) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `msg_accept` VARCHAR(30) NULL,
    `msg_refuse` VARCHAR(30) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_emp_agazat_dayes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `emp_code_fk` INTEGER NOT NULL,
    `off_day` VARCHAR(50) NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_entdab` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rkm_talab` INTEGER NOT NULL,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(150) NULL,
    `edara_id_fk` INTEGER NOT NULL,
    `qsm_id_fk` INTEGER NOT NULL,
    `direct_manager_id_fk` INTEGER NOT NULL,
    `direct_manager_n` VARCHAR(150) NULL,
    `job_title_id_fk` INTEGER NOT NULL,
    `mandate_type_fk` INTEGER NOT NULL,
    `mandate_direction` VARCHAR(255) NOT NULL DEFAULT '0',
    `mandate_distance` VARCHAR(255) NOT NULL DEFAULT '0',
    `mandate_purpose` VARCHAR(500) NOT NULL DEFAULT '0',
    `mandate_purpose_id_fk` INTEGER NULL,
    `from_date` VARCHAR(255) NOT NULL DEFAULT '0',
    `to_date` VARCHAR(255) NOT NULL DEFAULT '0',
    `num_days` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_count_method` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_value` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_total` VARCHAR(255) NOT NULL DEFAULT '0',
    `date` VARCHAR(255) NOT NULL DEFAULT '0',
    `date_s` VARCHAR(255) NOT NULL DEFAULT '0',
    `date_ar` VARCHAR(255) NOT NULL DEFAULT '0',
    `publisher` INTEGER NOT NULL DEFAULT 0,
    `publisher_name` VARCHAR(250) NULL,
    `current_from_id` INTEGER NULL,
    `current_from_name` VARCHAR(150) NULL,
    `current_to_id` INTEGER NULL,
    `current_to_name` VARCHAR(150) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `suspend` TINYINT NOT NULL DEFAULT 0,
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(255) NULL,
    `talab_msg` VARCHAR(255) NULL,
    `reason_action` VARCHAR(255) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `action_emp` TINYINT NOT NULL DEFAULT 0,
    `action_moder_3am` VARCHAR(191) NULL,
    `action_moder_3am_date` VARCHAR(15) NULL,
    `action_mokadem_talab` VARCHAR(191) NULL,
    `action_mokadem_talab_date` VARCHAR(15) NULL,
    `action_emp_talab` VARCHAR(191) NULL,
    `action_emp_talab_date` VARCHAR(15) NULL,
    `action_moder_mobasher` VARCHAR(191) NULL,
    `action_moder_mobasher_date` VARCHAR(15) NULL,
    `action_moder_hr` VARCHAR(191) NULL,
    `tanfez_hr` VARCHAR(191) NULL,
    `tanfez_mosayer` VARCHAR(191) NULL DEFAULT 'no',
    `action_moder_hr_date` VARCHAR(15) NULL,
    `emp_user_id` INTEGER NULL,
    `geha_mandate_id_fk` INTEGER NULL,
    `geha_mandate_name` VARCHAR(100) NULL,
    `mandate_id_fk` INTEGER NULL,
    `mandate_name` VARCHAR(100) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `makan_id_fk` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_entdab_amaken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mkan` VARCHAR(100) NULL,
    `distance` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_entdab_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rkm_talab_fk` INTEGER NULL,
    `rkm_talab_id` INTEGER NULL,
    `from_user` INTEGER NULL,
    `from_user_n` VARCHAR(100) NULL,
    `to_user` INTEGER NULL,
    `to_user_n` VARCHAR(100) NULL,
    `option_choosed` VARCHAR(191) NULL,
    `level` TINYINT NULL,
    `talab_in_fk` INTEGER NULL,
    `action_title` VARCHAR(50) NULL,
    `process_title` VARCHAR(50) NULL,
    `talab_in_title` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(500) NULL,
    `reason_action` TEXT NULL,
    `date_ar` VARCHAR(50) NULL,
    `date` VARCHAR(100) NULL,
    `publisher` VARCHAR(100) NULL,
    `suspend` VARCHAR(2) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `ttime` VARCHAR(15) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_entdab_sysat_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NOT NULL,
    `ttype` TINYINT NULL,
    `hours_out_work_days` FLOAT NULL,
    `hours_out_vacation_days` FLOAT NULL,
    `taklef_moda_minmum` INTEGER NULL,
    `taklef_moda_maxmum` INTEGER NULL,
    `taklef_badel_minmum` INTEGER NULL,
    `taklef_badel_maxmum` INTEGER NULL,
    `mostwa_wazefy` INTEGER NULL,
    `badal_value_part_day` INTEGER NULL,
    `badal_value_full_day` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_enzarat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_name` VARCHAR(100) NULL,
    `emp_name_id` INTEGER NULL,
    `emp_user_id` INTEGER NULL,
    `emp_edara` VARCHAR(100) NULL,
    `emp_edara_id` INTEGER NULL,
    `emp_qesm` VARCHAR(70) NULL,
    `emp_qesm_id` INTEGER NULL,
    `direct_manager_emp_id` INTEGER NULL,
    `direct_manager_user_id` INTEGER NULL,
    `enzar_type` VARCHAR(50) NULL,
    `enzar_type_id` INTEGER NULL,
    `details` VARCHAR(300) NULL,
    `enzar_time` VARCHAR(10) NULL,
    `enzar_date` VARCHAR(15) NULL,
    `enzar_date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(100) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `send_to_hr` VARCHAR(191) NULL DEFAULT 'no',
    `send_to_emp` VARCHAR(191) NULL DEFAULT 'no',
    `actions_sends` VARCHAR(191) NULL DEFAULT 'start',
    `hr_notes` VARCHAR(300) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_enzarat_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NULL,
    `file` VARCHAR(255) NULL,
    `main_id_fk` INTEGER NULL,
    `date` INTEGER NULL,
    `date_ar` VARCHAR(20) NULL,
    `time` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_enzarat_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `talab_id_fk` INTEGER NOT NULL,
    `from_user_id` INTEGER NULL,
    `to_user_id` INTEGER NULL,
    `from_user_n` VARCHAR(150) NULL,
    `to_user_n` VARCHAR(150) NULL,
    `from_mosma_wazefy_n` VARCHAR(100) NULL,
    `to_mosma_wazefy_n` VARCHAR(100) NULL,
    `process_title` VARCHAR(100) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time_ar` VARCHAR(15) NULL,
    `comment` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_forms_settings` (
    `id_setting` INTEGER NOT NULL AUTO_INCREMENT,
    `title_setting` VARCHAR(255) NOT NULL,
    `have_branch` INTEGER NOT NULL DEFAULT 0,
    `type` INTEGER NOT NULL,
    `type_name` VARCHAR(255) NOT NULL,
    `max_degree` VARCHAR(255) NOT NULL DEFAULT '0',
    `form_id` INTEGER NOT NULL DEFAULT 0,
    `in_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id_setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_general_setting` (
    `id_setting` INTEGER NOT NULL,
    `title_setting` VARCHAR(255) NOT NULL,
    `ttype` VARCHAR(191) NULL,
    `form_id` INTEGER NOT NULL DEFAULT 0,
    `status_setting` VARCHAR(191) NULL DEFAULT 'active',
    `details` TEXT NULL,

    PRIMARY KEY (`id_setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_gezaat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `mosma_wazefy_id` INTEGER NULL,
    `mosma_wazefy_n` VARCHAR(30) NULL,
    `edara_id_fk` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_id_fk` INTEGER NULL,
    `qsm_n` VARCHAR(100) NULL,
    `details` VARCHAR(300) NULL,
    `geza_type` INTEGER NULL,
    `geza_value` VARCHAR(100) NULL,
    `suspend` INTEGER NOT NULL DEFAULT 0,
    `suspend_date` VARCHAR(50) NULL,
    `suspend_time` VARCHAR(50) NULL,
    `suspend_publisher_name` VARCHAR(100) NULL,
    `suspend_publisher` INTEGER NULL,
    `month` INTEGER NULL,
    `year` INTEGER NULL,
    `geza_date` VARCHAR(15) NULL,
    `geza_date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(150) NULL,
    `mosayer_rkm_fk` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mandate_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rkm_talab` INTEGER NOT NULL,
    `emp_id_fk` INTEGER NOT NULL,
    `edara_id_fk` INTEGER NOT NULL,
    `qsm_id_fk` INTEGER NOT NULL,
    `direct_manager_id_fk` INTEGER NOT NULL,
    `job_title_id_fk` INTEGER NOT NULL,
    `mandate_type_fk` INTEGER NOT NULL,
    `mandate_direction` VARCHAR(255) NOT NULL DEFAULT '0',
    `mandate_distance` VARCHAR(255) NOT NULL DEFAULT '0',
    `mandate_purpose` VARCHAR(500) NOT NULL DEFAULT '0',
    `from_date` VARCHAR(255) NOT NULL DEFAULT '0',
    `to_date` VARCHAR(255) NOT NULL DEFAULT '0',
    `num_days` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_count_method` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_value` VARCHAR(255) NOT NULL DEFAULT '0',
    `bdal_total` VARCHAR(255) NOT NULL DEFAULT '0',
    `date` VARCHAR(255) NOT NULL DEFAULT '0',
    `date_s` VARCHAR(255) NOT NULL DEFAULT '0',
    `date_ar` VARCHAR(255) NOT NULL DEFAULT '0',
    `publisher` INTEGER NOT NULL DEFAULT 0,
    `publisher_name` VARCHAR(250) NULL,
    `approved_direct_manager` TINYINT NOT NULL,
    `direct_manger_reason` VARCHAR(255) NOT NULL DEFAULT '0',
    `specific_emp_id` INTEGER NOT NULL,
    `approved_specific_emp` TINYINT NOT NULL,
    `specific_emp_reason` VARCHAR(255) NOT NULL DEFAULT '0',
    `current_from_id` VARCHAR(255) NOT NULL DEFAULT '0',
    `current_to_id` VARCHAR(255) NOT NULL DEFAULT '0',
    `current_procedure` VARCHAR(255) NOT NULL DEFAULT '0',
    `current_process_title` VARCHAR(255) NOT NULL DEFAULT '0',
    `last_from_id` VARCHAR(255) NOT NULL DEFAULT '0',
    `last_to_id` VARCHAR(255) NOT NULL DEFAULT '0',
    `last_procedure` VARCHAR(255) NOT NULL DEFAULT '0',
    `last_process_title` VARCHAR(255) NOT NULL DEFAULT '0',
    `procedure_level` VARCHAR(255) NOT NULL DEFAULT '0',
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(255) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(255) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `suspend` TINYINT NOT NULL DEFAULT 0,
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(255) NULL,
    `talab_msg` VARCHAR(255) NULL,
    `reason_action` VARCHAR(255) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `action_emp` TINYINT NOT NULL DEFAULT 0,
    `action_moder_final` TINYINT NOT NULL DEFAULT 0,
    `emp_user_id` INTEGER NULL,
    `geha_mandate_id_fk` INTEGER NULL,
    `geha_mandate_name` VARCHAR(100) NULL,
    `mandate_id_fk` INTEGER NULL,
    `mandate_name` VARCHAR(100) NULL,
    `mandate_purpose_id_fk` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mandate_orders_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mandate_rkm_fk` INTEGER NULL,
    `mandate_rkm_id` INTEGER NULL,
    `from_user_id` INTEGER NULL,
    `from_user_name` VARCHAR(100) NULL,
    `to_user_id` INTEGER NULL,
    `to_user_name` VARCHAR(100) NULL,
    `level` TINYINT NULL,
    `talab_in_fk` INTEGER NULL,
    `talab_in_title` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(500) NULL,
    `reason_action` VARCHAR(500) NULL,
    `date_ar` VARCHAR(50) NULL,
    `date` VARCHAR(100) NULL,
    `publisher` VARCHAR(100) NULL,
    `suspend` VARCHAR(2) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mandate_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` BIGINT NULL,
    `title` VARCHAR(80) NULL,
    `color` VARCHAR(30) NULL,
    `from_code` INTEGER NULL,
    `date` INTEGER NULL,
    `date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mokafat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mokafa_rkm` INTEGER NOT NULL,
    `mokafa_date` INTEGER NOT NULL,
    `month` INTEGER NULL,
    `year` INTEGER NULL,
    `mon_melady` VARCHAR(255) NOT NULL DEFAULT '0',
    `mokafa_date_ar` VARCHAR(255) NOT NULL,
    `mokafa_value_type` INTEGER NOT NULL,
    `mokafa_type` INTEGER NOT NULL,
    `total_value` VARCHAR(255) NULL,
    `presence_number` INTEGER NOT NULL DEFAULT 0,
    `publisher` INTEGER NOT NULL,
    `about` VARCHAR(255) NOT NULL,
    `suspend` TINYINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mokafat_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mokafa_rkm_fk` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `month` TINYINT NULL,
    `year` INTEGER NULL,
    `bank_responsible_national_num` VARCHAR(255) NULL,
    `bank_responsible_name` VARCHAR(500) NULL,
    `bank_account_num` VARCHAR(255) NULL,
    `bank_code` VARCHAR(255) NULL,
    `value` DECIMAL(19, 2) NULL,
    `mokafa_types` INTEGER NULL,
    `mokafa_option` VARCHAR(191) NULL,
    `edara_n` VARCHAR(150) NULL,
    `qsm_n` VARCHAR(150) NULL,
    `mosma_wazefy_n` VARCHAR(100) NULL,
    `day` INTEGER NULL,
    `suspend` TINYINT NULL,
    `mosayer_rkm_fk` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mokafat_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mokafa_code` BIGINT NULL,
    `title` VARCHAR(70) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm` INTEGER NULL,
    `mosayer_date` VARCHAR(15) NULL,
    `mosayer_date_ar` VARCHAR(15) NULL,
    `mosayer_month` TINYINT NULL,
    `mosayer_year` INTEGER NULL,
    `total` INTEGER NOT NULL,
    `egmali_rateb_asasy` DECIMAL(19, 2) NULL,
    `egmali_badal_sakn` DECIMAL(19, 2) NULL,
    `egmali_badal_mowaslat` DECIMAL(19, 2) NULL,
    `egmali_badal_etsal` DECIMAL(19, 2) NULL,
    `egmali_badal_e3asha` DECIMAL(19, 2) NULL,
    `egmali_badal_tabe3a_amal` DECIMAL(19, 2) NULL,
    `egmali_tot_edafi` DECIMAL(19, 2) NULL,
    `egmali_badal_taklef` DECIMAL(19, 2) NULL,
    `egmali_tot_mokafaa` DECIMAL(19, 2) NULL,
    `egmali_tot_entdab` DECIMAL(19, 2) NULL,
    `egmali_tot_okraa_esthkaq` DECIMAL(19, 2) NULL,
    `egmali_total_esthkak` DECIMAL(19, 2) NULL,
    `egmali_khasm_keyab` DECIMAL(19, 2) NULL,
    `egmali_agaza_bdon_rateb` DECIMAL(19, 2) NULL,
    `egmali_khasm_takher` DECIMAL(19, 2) NULL,
    `egmali_khasm_gezaa` DECIMAL(19, 2) NULL,
    `egmali_khasm_tamen` DECIMAL(19, 2) NULL,
    `egmali_khasm_solaf` DECIMAL(19, 2) NULL,
    `egmali_tot_okraa_khasm` DECIMAL(19, 2) NULL,
    `egmali_total_khsomat` DECIMAL(19, 2) NULL,
    `egmali_safi` DECIMAL(19, 2) NULL,
    `suspend_direct_manager` VARCHAR(191) NULL,
    `suspend_mohasb` VARCHAR(191) NULL,
    `suspend_moder_mali` VARCHAR(191) NULL,
    `suspend_moder_3am` VARCHAR(191) NULL,
    `amin_name` VARCHAR(75) NULL,
    `manager_name` VARCHAR(75) NULL,
    `naeb_name` VARCHAR(75) NULL,
    `approved` INTEGER NULL DEFAULT 0,
    `cashing_date` VARCHAR(50) NULL,
    `due_date` VARCHAR(50) NULL,
    `file_downloded` VARCHAR(100) NULL,
    `halet_sarf` VARCHAR(191) NULL,
    `do_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `tanfez_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `finish_sarf_date` VARCHAR(15) NULL,
    `finish_sarf_time` VARCHAR(15) NULL,
    `finish_sarf_person` VARCHAR(100) NULL,
    `taghez` VARCHAR(191) NULL DEFAULT 'no',
    `taghez_date_ar` VARCHAR(15) NULL,
    `taghez_time` VARCHAR(15) NULL,
    `emp_id_fk` INTEGER NULL,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(150) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(150) NULL,
    `level` TINYINT NULL,
    `level_title` VARCHAR(20) NULL,
    `talab_msg` VARCHAR(150) NULL,
    `reason_action` VARCHAR(255) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,

    UNIQUE INDEX `hr_mosayer_mosayer_rkm_key`(`mosayer_rkm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_attechment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm_fk` INTEGER NULL,
    `title` VARCHAR(150) NULL,
    `attechment` VARCHAR(300) NULL,
    `time_ar` VARCHAR(10) NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(150) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm_fk` INTEGER NULL,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(70) NULL,
    `mosma_wazefy_n` VARCHAR(50) NULL,
    `emp_pay_method` TINYINT NULL,
    `ayam_amal` DOUBLE NULL,
    `sa3at_amal` DOUBLE NULL,
    `agr_sa3a` DOUBLE NULL,
    `emp_bank_id_fk` INTEGER NULL,
    `emp_bank_account_num` VARCHAR(30) NULL,
    `bank_code` VARCHAR(6) NULL,
    `emp_name_in_bank` VARCHAR(70) NULL,
    `rateb_asasy` DECIMAL(19, 2) NULL,
    `badal_sakn` DECIMAL(19, 2) NULL,
    `badal_mowaslat` DECIMAL(19, 2) NULL,
    `badal_etsal` DECIMAL(19, 2) NULL,
    `badal_e3asha` DECIMAL(19, 2) NULL,
    `badal_tabe3a_amal` DECIMAL(19, 2) NULL,
    `tot_edafi` DECIMAL(19, 2) NULL,
    `badal_taklef` DECIMAL(19, 2) NULL,
    `tot_mokafaa` DECIMAL(19, 2) NULL,
    `tot_entdab` DECIMAL(19, 2) NULL,
    `tot_okraa_esthkaq` DECIMAL(19, 2) NULL,
    `total_esthkak` DECIMAL(19, 2) NULL,
    `khasm_keyab` DECIMAL(19, 2) NULL,
    `agaza_bdon_rateb` DECIMAL(19, 2) NULL,
    `khasm_takher` DECIMAL(19, 2) NULL,
    `khasm_gezaa` DECIMAL(19, 2) NULL,
    `khasm_tamen` DECIMAL(19, 2) NULL,
    `khasm_solaf` DECIMAL(19, 2) NULL,
    `tot_okraa_khasm` DECIMAL(19, 2) NULL,
    `total_khsomat` DECIMAL(19, 2) NULL,
    `safi` DECIMAL(19, 2) NULL,
    `halet_sarf` VARCHAR(191) NULL,
    `tanfez_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `taghez` VARCHAR(191) NULL DEFAULT 'no',
    `taghez_date_ar` VARCHAR(15) NULL,
    `taghez_time` VARCHAR(15) NULL,
    `sent_sarf` VARCHAR(191) NULL,
    `sent_sarf_time` VARCHAR(15) NULL,
    `publisher_sent_sarf` VARCHAR(100) NULL,
    `finish_sarf_date` VARCHAR(15) NULL,
    `finish_sarf_time` VARCHAR(15) NULL,
    `finish_sarf_person` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_egraat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm_fk` INTEGER NULL,
    `emp_id` VARCHAR(50) NULL,
    `emp_code` VARCHAR(50) NULL,
    `emp_name` VARCHAR(100) NULL,
    `ancient_value` DOUBLE NULL,
    `new_value` DOUBLE NULL,
    `operation_value` VARCHAR(191) NULL,
    `subs_value` VARCHAR(50) NULL,
    `badal_code` VARCHAR(100) NULL,
    `badal_n` VARCHAR(15) NULL,
    `num` VARCHAR(10) NULL,
    `dwam_f2a` TINYINT NULL,
    `badal_name` VARCHAR(150) NULL,
    `egraa_date` VARCHAR(100) NULL,
    `egraa_date_ar` VARCHAR(150) NULL,
    `publisher` VARCHAR(100) NULL,
    `publisher_name` VARCHAR(150) NULL,
    `mosma_wazefy_n` VARCHAR(150) NULL,
    `reason` VARCHAR(150) NULL,
    `time_add` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_fe2at` (
    `id` INTEGER NOT NULL,
    `title` VARCHAR(40) NULL,
    `tarteb` TINYINT NULL,
    `color` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm_fk` INTEGER NOT NULL DEFAULT 0,
    `mosayer_id_fk` INTEGER NOT NULL DEFAULT 0,
    `from_user` INTEGER NOT NULL DEFAULT 0,
    `from_user_n` VARCHAR(100) NULL,
    `to_user` INTEGER NOT NULL DEFAULT 0,
    `to_user_n` VARCHAR(150) NULL,
    `level_title` VARCHAR(30) NULL,
    `level` VARCHAR(100) NULL,
    `talab_msg` VARCHAR(30) NULL,
    `action` VARCHAR(191) NULL,
    `reason_action` VARCHAR(30) NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_months` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `month` TINYINT NULL,
    `month_n` VARCHAR(15) NULL,
    `year` INTEGER NULL,
    `from_date_ar` VARCHAR(20) NULL,
    `from_date` VARCHAR(15) NULL,
    `to_date_ar` VARCHAR(20) NULL,
    `to_date` BIGINT NULL,
    `test_from` INTEGER NULL,
    `test_to` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_sysat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(15) NULL,
    `rateb_asasy` VARCHAR(191) NULL,
    `badal_sakn` VARCHAR(191) NULL,
    `badal_mowaslat` VARCHAR(191) NULL,
    `badal_etsal` VARCHAR(191) NULL,
    `badal_e3asha` VARCHAR(191) NULL,
    `badal_tabe3a_amal` VARCHAR(191) NULL,
    `badal_edafi` VARCHAR(191) NULL,
    `badal_taklef` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_tamenat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm` INTEGER NULL,
    `mosayer_date` VARCHAR(15) NULL,
    `mosayer_date_ar` VARCHAR(15) NULL,
    `mosayer_month` TINYINT NULL,
    `mosayer_year` INTEGER NULL,
    `total` INTEGER NOT NULL,
    `egmali_rateb_asasy` DECIMAL(19, 2) NULL,
    `egmali_badal_sakn` DECIMAL(19, 2) NULL,
    `egmali_badal_mowaslat` DECIMAL(19, 2) NULL,
    `egmali_badal_etsal` DECIMAL(19, 2) NULL,
    `egmali_badal_e3asha` DECIMAL(19, 2) NULL,
    `egmali_badal_tabe3a_amal` DECIMAL(19, 2) NULL,
    `egmali_tot_edafi` DECIMAL(19, 2) NULL,
    `egmali_badal_taklef` DECIMAL(19, 2) NULL,
    `egmali_tot_mokafaa` DECIMAL(19, 2) NULL,
    `egmali_tot_entdab` DECIMAL(19, 2) NULL,
    `egmali_tot_okraa_esthkaq` DECIMAL(19, 2) NULL,
    `egmali_total_esthkak` DECIMAL(19, 2) NULL,
    `egmali_khasm_keyab` DECIMAL(19, 2) NULL,
    `egmali_agaza_bdon_rateb` DECIMAL(19, 2) NULL,
    `egmali_khasm_takher` DECIMAL(19, 2) NULL,
    `egmali_khasm_gezaa` DECIMAL(19, 2) NULL,
    `egmali_khasm_tamen` DECIMAL(19, 2) NULL,
    `egmali_khasm_solaf` DECIMAL(19, 2) NULL,
    `egmali_tot_okraa_khasm` DECIMAL(19, 2) NULL,
    `egmali_total_khsomat` DECIMAL(19, 2) NULL,
    `egmali_safi` DECIMAL(19, 2) NULL,
    `suspend_direct_manager` VARCHAR(191) NULL,
    `suspend_mohasb` VARCHAR(191) NULL,
    `suspend_moder_mali` VARCHAR(191) NULL,
    `suspend_moder_3am` VARCHAR(191) NULL,
    `amin_name` VARCHAR(75) NULL,
    `manager_name` VARCHAR(75) NULL,
    `naeb_name` VARCHAR(75) NULL,
    `approved` INTEGER NULL DEFAULT 0,
    `cashing_date` VARCHAR(50) NULL,
    `due_date` VARCHAR(50) NULL,
    `file_downloded` VARCHAR(100) NULL,
    `halet_sarf` VARCHAR(191) NULL,
    `do_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `ezn_sarf_id` INTEGER NULL,
    `tanfez_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `finish_sarf_date` VARCHAR(15) NULL,
    `finish_sarf_time` VARCHAR(15) NULL,
    `finish_sarf_person` VARCHAR(100) NULL,
    `taghez` VARCHAR(191) NULL DEFAULT 'no',
    `taghez_date_ar` VARCHAR(15) NULL,
    `taghez_time` VARCHAR(15) NULL,
    `emp_id_fk` INTEGER NULL,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(150) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(150) NULL,
    `level` TINYINT NULL,
    `level_title` VARCHAR(20) NULL,
    `talab_msg` VARCHAR(150) NULL,
    `reason_action` VARCHAR(255) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `publisher_id` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `send_to_hr` VARCHAR(191) NULL DEFAULT 'no',
    `send_to_mohseb` VARCHAR(191) NULL DEFAULT 'no',
    `send_to_mali` VARCHAR(191) NULL DEFAULT 'no',
    `send_to_moder_3am` VARCHAR(191) NULL DEFAULT 'no',
    `approve_moder_3am` VARCHAR(191) NULL DEFAULT 'no',
    `actions_sends` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_tamenat_attaches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `talb_id_fk` INTEGER NULL,
    `title` VARCHAR(250) NULL,
    `file` TEXT NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time` VARCHAR(10) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_tamenat_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosayer_rkm_fk` INTEGER NULL,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(70) NULL,
    `cat_mosayer_id_fk` INTEGER NULL,
    `markz_id_fk` INTEGER NULL,
    `mosma_wazefy_n` VARCHAR(50) NULL,
    `emp_pay_method` TINYINT NULL,
    `ayam_amal` DOUBLE NULL,
    `sa3at_amal` DOUBLE NULL,
    `agr_sa3a` DOUBLE NULL,
    `emp_bank_id_fk` INTEGER NULL,
    `emp_bank_account_num` VARCHAR(30) NULL,
    `bank_code` VARCHAR(6) NULL,
    `emp_name_in_bank` VARCHAR(70) NULL,
    `rateb_asasy` DECIMAL(19, 2) NULL,
    `badal_sakn` DECIMAL(19, 2) NULL,
    `badal_mowaslat` DECIMAL(19, 2) NULL,
    `thabeet` DECIMAL(19, 2) NULL,
    `okraaaa` DECIMAL(19, 2) NULL,
    `badal_etsal` DECIMAL(19, 2) NULL,
    `badal_e3asha` DECIMAL(19, 2) NULL,
    `badal_tabe3a_amal` DECIMAL(19, 2) NULL,
    `total_esthkak` DECIMAL(19, 2) NULL,
    `heset_mowzaf` DECIMAL(19, 2) NULL,
    `aktar` DECIMAL(19, 2) NULL,
    `saned` DECIMAL(19, 2) NULL,
    `ma3ash` DECIMAL(19, 2) NULL,
    `khasm_keyab` DECIMAL(19, 2) NULL,
    `total_khsomat` DECIMAL(19, 2) NULL,
    `safi` DECIMAL(19, 2) NULL,
    `halet_sarf` VARCHAR(191) NULL,
    `tanfez_ezn_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `taghez` VARCHAR(191) NULL DEFAULT 'no',
    `taghez_date_ar` VARCHAR(15) NULL,
    `taghez_time` VARCHAR(15) NULL,
    `sent_sarf` VARCHAR(191) NULL,
    `sent_sarf_time` VARCHAR(15) NULL,
    `publisher_sent_sarf` VARCHAR(100) NULL,
    `finish_sarf_date` VARCHAR(15) NULL,
    `finish_sarf_time` VARCHAR(15) NULL,
    `finish_sarf_person` VARCHAR(100) NULL,
    `nationality` INTEGER NULL,
    `percent_emp` DECIMAL(19, 4) NULL,
    `percent_aktar` DECIMAL(19, 4) NULL,
    `percent_saned` DECIMAL(19, 4) NULL,
    `percent_ma3ash` DECIMAL(19, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_tamenat_egraat` (
    `id` INTEGER NOT NULL,
    `mosayer_rkm_fk` INTEGER NULL,
    `emp_id` VARCHAR(50) NULL,
    `emp_code` VARCHAR(50) NULL,
    `emp_name` VARCHAR(100) NULL,
    `ancient_value` DOUBLE NULL,
    `new_value` DOUBLE NULL,
    `operation_value` VARCHAR(191) NULL,
    `subs_value` VARCHAR(50) NULL,
    `badal_code` VARCHAR(100) NULL,
    `badal_n` VARCHAR(15) NULL,
    `num` VARCHAR(10) NULL,
    `dwam_f2a` TINYINT NULL,
    `badal_name` VARCHAR(150) NULL,
    `egraa_date` VARCHAR(100) NULL,
    `egraa_date_ar` VARCHAR(150) NULL,
    `publisher` VARCHAR(100) NULL,
    `publisher_name` VARCHAR(150) NULL,
    `mosma_wazefy_n` VARCHAR(150) NULL,
    `reason` VARCHAR(150) NULL,
    `time_add` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosayer_tamenat_history` (
    `id` INTEGER NOT NULL,
    `talab_id_fk` INTEGER NOT NULL,
    `from_user_id` INTEGER NULL,
    `to_user_id` INTEGER NULL,
    `from_user_n` VARCHAR(150) NULL,
    `to_user_n` VARCHAR(150) NULL,
    `from_mosma_wazefy_n` VARCHAR(100) NULL,
    `to_mosma_wazefy_n` VARCHAR(100) NULL,
    `process_title` VARCHAR(100) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time_ar` VARCHAR(15) NULL,
    `comment` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ozonat_types` (
    `ezn_id` INTEGER NOT NULL AUTO_INCREMENT,
    `ezn_name` VARCHAR(15) NULL,

    PRIMARY KEY (`ezn_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `t_rkm` INTEGER NULL,
    `t_rkm_date_m` VARCHAR(15) NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `edara_id_fk` INTEGER NULL,
    `qsm_id_fk` INTEGER NULL,
    `qemt_solaf` INTEGER NULL,
    `sadad_solfa` INTEGER NULL DEFAULT 0,
    `qst_num` INTEGER NULL,
    `khsm_form_date_m` VARCHAR(15) NULL,
    `khsm_to_date_m` VARCHAR(15) NULL,
    `hd_solfa` INTEGER NULL,
    `previous_request_date_m` VARCHAR(15) NULL,
    `solaf_reason` VARCHAR(100) NULL,
    `num_previous_requests` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_n` VARCHAR(100) NULL,
    `job_title` VARCHAR(100) NULL,
    `suspend` INTEGER NULL DEFAULT 0,
    `direct_manager_id_fk` INTEGER NULL,
    `direct_manager_code_fk` INTEGER NULL,
    `direct_manager_n` VARCHAR(100) NULL,
    `action_direct_manager` INTEGER NOT NULL,
    `action_mowazf_moktas` INTEGER NOT NULL,
    `action_moder_hr` INTEGER NOT NULL,
    `action_moder_fr` INTEGER NOT NULL,
    `action_moder_final` INTEGER NOT NULL,
    `current_from_user_id` INTEGER NOT NULL,
    `current_from_user_name` VARCHAR(100) NOT NULL,
    `current_to_user_id` INTEGER NOT NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `talab_in_fk` INTEGER NOT NULL,
    `talab_in_title` VARCHAR(100) NOT NULL,
    `level` INTEGER NOT NULL,
    `talab_msg` VARCHAR(100) NOT NULL,
    `reason_action` VARCHAR(100) NOT NULL,
    `qemt_qst` DOUBLE NOT NULL DEFAULT 0,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `direct_manger_taqeem` TINYINT NOT NULL DEFAULT 0,
    `direct_manger_sarf` TINYINT NOT NULL DEFAULT 0,
    `emp_motalbat` TINYINT NOT NULL DEFAULT 0,
    `solaf_qaema` TINYINT NOT NULL DEFAULT 0,
    `rased_yasmah` TINYINT NOT NULL DEFAULT 0,
    `rased_motah` VARCHAR(15) NULL,
    `moder_mali_option` TINYINT NOT NULL DEFAULT 0,
    `ended` VARCHAR(191) NULL,
    `tanfez_sanad_sarf` VARCHAR(191) NULL DEFAULT 'no',
    `publisher` INTEGER NULL,

    UNIQUE INDEX `hr_solaf_t_rkm_key`(`t_rkm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_dawabt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NULL,
    `type` INTEGER NULL,
    `type_n` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_emp_hesbat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `rkm_hesab` BIGINT NULL,
    `hesab_name` VARCHAR(200) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `date_added` VARCHAR(15) NULL,
    `time_add` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NULL,
    `file` TEXT NULL,
    `solaf_id_fk` INTEGER NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time` VARCHAR(20) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_files_ta3gel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NOT NULL,
    `file` VARCHAR(225) NULL,
    `ta3gel_id_fk` INTEGER NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `time` VARCHAR(50) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(150) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_main_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `da3m_value` INTEGER NULL,
    `aqsa_moda_sadad` INTEGER NULL,
    `had_adna` INTEGER NULL,
    `rateb_asasy` INTEGER NOT NULL DEFAULT 0,
    `bdl_sakn` INTEGER NOT NULL DEFAULT 0,
    `bdl_mowaslat` INTEGER NOT NULL DEFAULT 0,
    `bdl_jwal` INTEGER NOT NULL DEFAULT 0,
    `rateb_mokto3` INTEGER NOT NULL DEFAULT 0,
    `bdl_amal` INTEGER NOT NULL DEFAULT 0,
    `bdl_taklef` INTEGER NOT NULL DEFAULT 0,
    `bdl_ma3esha` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_quest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `t_rkm_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `value_of_qst` FLOAT NULL,
    `month` INTEGER NULL,
    `year` INTEGER NULL,
    `qst_date_ar` VARCHAR(15) NULL,
    `qst_date` VARCHAR(15) NULL,
    `paid` VARCHAR(191) NULL,
    `date_paid` VARCHAR(15) NULL,
    `time_paid` VARCHAR(15) NULL,
    `paid_sarf_person` VARCHAR(100) NULL,
    `suspend` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_ta3gel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `t_rkm` INTEGER NULL,
    `solfa_rkm` INTEGER NULL,
    `t_rkm_date_m` VARCHAR(100) NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `edara_id_fk` INTEGER NULL,
    `qsm_id_fk` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_n` VARCHAR(100) NULL,
    `job_title` VARCHAR(150) NULL,
    `fe2a_ta3gel` INTEGER NULL,
    `qued_rkm` INTEGER NULL,
    `for_month` TINYTEXT NULL,
    `qemt_qst` INTEGER NULL,
    `ta3gel_reason` VARCHAR(100) NULL,
    `suspend` INTEGER NULL DEFAULT 0,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(150) NULL,
    `from_bank_id_fk` INTEGER NULL,
    `from_bank_code` VARCHAR(50) NULL,
    `from_bank_account_num` VARCHAR(50) NULL,
    `to_bank_id_fk` INTEGER NULL,
    `to_bank_code` VARCHAR(50) NULL,
    `to_bank_account_num` VARCHAR(50) NULL,
    `action_moder_fr` TINYINT NOT NULL DEFAULT 0,
    `action_moder_hr` TINYINT NOT NULL DEFAULT 0,
    `action_mohaseb` TINYINT NULL,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(100) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `level_title` VARCHAR(50) NOT NULL DEFAULT 'مقدم الطلب',
    `reason_action` VARCHAR(150) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `ta3gel_morfak` TEXT NULL,
    `mosayer_month` INTEGER NULL,
    `mosayer_year` INTEGER NULL,
    `tanfez` VARCHAR(191) NULL DEFAULT 'no',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solaf_tagel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `t_rkm` INTEGER NULL,
    `solfa_rkm` INTEGER NULL,
    `t_rkm_date_m` VARCHAR(100) NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `edara_id_fk` INTEGER NULL,
    `qsm_id_fk` INTEGER NULL,
    `edara_n` VARCHAR(100) NULL,
    `qsm_n` VARCHAR(100) NULL,
    `job_title` INTEGER NULL,
    `fe2a_tagel` INTEGER NULL,
    `for_month` INTEGER NULL,
    `qemt_qst` INTEGER NULL,
    `tagel_reason` VARCHAR(100) NULL,
    `suspend` INTEGER NULL DEFAULT 0,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(150) NULL,
    `action_moder_fr` TINYINT NOT NULL DEFAULT 0,
    `action_moder_hr` TINYINT NOT NULL DEFAULT 0,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(100) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `level_title` VARCHAR(50) NOT NULL DEFAULT 'مقدم الطلب',
    `reason_action` VARCHAR(150) NULL,
    `seen` TINYINT NOT NULL DEFAULT 0,
    `tagel_morfak` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_solf_transformation_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(20) NULL,
    `tbl` VARCHAR(10) NULL,
    `level` TINYINT NOT NULL DEFAULT 0,
    `msg_accept` VARCHAR(30) NULL,
    `msg_refuse` VARCHAR(30) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_talabat_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `talab_date_ar` VARCHAR(20) NULL,
    `talab_time` VARCHAR(10) NULL,
    `emp_id_fk` INTEGER NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `no3_talab_id` TINYINT NULL,
    `date_ar` VARCHAR(20) NULL,
    `publisher_name` VARCHAR(70) NULL,
    `send_report` VARCHAR(191) NULL DEFAULT 'no',
    `suspend` TINYINT NULL DEFAULT 0,
    `notes` VARCHAR(500) NULL,
    `rad_notes` VARCHAR(200) NULL,
    `rad_file` VARCHAR(500) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_talabat_types` (
    `id` INTEGER NOT NULL,
    `title` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_emp_hdoor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date` VARCHAR(20) NOT NULL,
    `hdoor_time` VARCHAR(20) NOT NULL,
    `ensraf_time` VARCHAR(20) NOT NULL,
    `actual_hdoor_time` VARCHAR(20) NOT NULL,
    `actual_ensraf_time` VARCHAR(20) NOT NULL,
    `absent` VARCHAR(50) NULL,
    `hour_works` DECIMAL(10, 0) NOT NULL,
    `edara_n` VARCHAR(100) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `publisher_name` VARCHAR(100) NOT NULL,
    `inserted_date` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_emps_hours_edafi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_code_fk` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `branch_id_fk` INTEGER NOT NULL,
    `num_hours` INTEGER NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` VARCHAR(20) NOT NULL,
    `edafa_date` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `publisher_emp_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_emps_shef_edafi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `ttype` INTEGER NOT NULL,
    `dwam_id_fk` INTEGER NOT NULL,
    `sheft_date` VARCHAR(20) NOT NULL,
    `emp_code_fk` INTEGER NOT NULL,
    `branch_id_fk` INTEGER NOT NULL,
    `date_ar` VARCHAR(11) NOT NULL,
    `date_s` VARCHAR(11) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `publisher_emp_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hdoor_dawms_emps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dwam_id_fk` INTEGER NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `type` VARCHAR(100) NULL,
    `b_name` VARCHAR(100) NULL,
    `branche_sub_work_id_fk` INTEGER NULL,
    `t_type` INTEGER NULL,
    `branch_id_fk` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_hr_forms_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id` INTEGER NOT NULL,
    `title` VARCHAR(50) NULL,
    `ttype` INTEGER NOT NULL,
    `ttype_name` VARCHAR(15) NULL,
    `color` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_mohmat_3mal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `mohma_name` VARCHAR(200) NOT NULL,
    `mohma_date` VARCHAR(20) NOT NULL,
    `site_id` INTEGER NOT NULL,
    `site_name` VARCHAR(150) NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `s_lat` DOUBLE NOT NULL,
    `s_long` DOUBLE NOT NULL,
    `radius` INTEGER NOT NULL DEFAULT 100,
    `date_ar` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,
    `site_name` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_zeyada_rateb` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NOT NULL,
    `emp_code` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NOT NULL,
    `value` DECIMAL(10, 0) NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` VARCHAR(20) NOT NULL,
    `publisher` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NULL,
    `ip` VARCHAR(50) NULL,
    `branch_id_fk` INTEGER NULL,
    `last_sync` VARCHAR(30) NULL,
    `status` VARCHAR(20) NULL,
    `created_at` VARCHAR(30) NULL,
    `updated_at` VARCHAR(30) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `enabled` TINYINT NOT NULL DEFAULT 1,
    `threshold` VARCHAR(20) NULL,
    `grace_min` VARCHAR(20) NULL,
    `multiplier` VARCHAR(20) NULL,

    UNIQUE INDEX `attendance_rules_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(20) NOT NULL,
    `enabled` TINYINT NOT NULL DEFAULT 1,
    `label` VARCHAR(50) NULL,

    UNIQUE INDEX `attendance_channels_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `penalty_bylaws` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NULL,
    `title` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `action_type` VARCHAR(20) NULL,
    `threshold` INTEGER NULL,
    `period_months` INTEGER NULL,
    `deduction_days` FLOAT NULL,
    `deduction_amount` FLOAT NULL,
    `suspension_days` INTEGER NULL,
    `warning_template_id` INTEGER NULL,
    `is_active` TINYINT NOT NULL DEFAULT 1,
    `sort_order` INTEGER NULL,
    `publisher` INTEGER NULL,
    `created_at` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(30) NOT NULL,
    `request_no` INTEGER NULL,
    `emp_id_fk` INTEGER NULL,
    `emp_code_fk` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `reason_action` VARCHAR(255) NULL,
    `payload` TEXT NULL,
    `created_at` VARCHAR(30) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `current_to_user_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_disclaimers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `disclaimer_id` INTEGER NOT NULL,
    `adminstration_id` VARCHAR(300) NULL,
    `notes` TEXT NULL,
    `emp_id_fk` VARCHAR(255) NULL,
    `responsible_emp_id` VARCHAR(300) NULL,
    `resignation` VARCHAR(255) NULL,
    `employee_card` VARCHAR(255) NULL,
    `medical_card` VARCHAR(255) NULL,
    `social_insurance` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_tayi_qyed` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` VARCHAR(200) NULL,
    `edara_id_fk` VARCHAR(200) NULL,
    `qsm_id_fk` VARCHAR(200) NULL,
    `direct_manger_id_fk` VARCHAR(200) NULL,
    `from_date` VARCHAR(250) NULL,
    `from_date_ar` VARCHAR(250) NULL,
    `to_date` VARCHAR(250) NULL,
    `to_date_ar` VARCHAR(250) NULL,
    `date` VARCHAR(250) NULL,
    `date_s` VARCHAR(250) NULL,
    `publisher` VARCHAR(250) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_date` VARCHAR(100) NULL,
    `file` VARCHAR(200) NULL,
    `subject` TEXT NULL,
    `publisher` INTEGER NULL,
    `publisher_name` INTEGER NULL,
    `date` INTEGER NULL,
    `date_ar` INTEGER NULL,
    `ta3mem_title` VARCHAR(100) NULL,
    `type` VARCHAR(20) NULL,
    `img` VARCHAR(500) NULL,
    `adv_from_date` VARCHAR(100) NULL,
    `adv_to_date` VARCHAR(100) NULL,
    `adv_place` VARCHAR(200) NULL,
    `adv_time` VARCHAR(100) NULL,
    `send_all_t3mem` INTEGER NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_id_fk` INTEGER NULL,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `seen` INTEGER NULL,
    `seen_date` VARCHAR(15) NULL,
    `seen_time` VARCHAR(20) NULL,
    `type` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_attaches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_id_fk` INTEGER NULL,
    `title` VARCHAR(100) NULL,
    `file` VARCHAR(250) NULL,
    `date` VARCHAR(50) NULL,
    `date_ar` VARCHAR(50) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_salary_doors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mo2hel` VARCHAR(100) NULL,
    `martba` VARCHAR(100) NULL,
    `dawam_type` VARCHAR(50) NULL,
    `salary_start` INTEGER NULL,
    `year_bonus_value` INTEGER NULL,
    `x_1` INTEGER NULL,
    `x_2` INTEGER NULL,
    `x_3` INTEGER NULL,
    `x_4` INTEGER NULL,
    `x_5` INTEGER NULL,
    `x_6` INTEGER NULL,
    `x_7` INTEGER NULL,
    `x_8` INTEGER NULL,
    `x_9` INTEGER NULL,
    `x_10` INTEGER NULL,
    `x_11` INTEGER NULL,
    `x_12` INTEGER NULL,
    `x_13` INTEGER NULL,
    `x_14` INTEGER NULL,
    `x_15` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_insurance_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nationality_type` INTEGER NULL,
    `setting_id_fk` VARCHAR(300) NULL,
    `emp_average` VARCHAR(300) NULL,
    `society_average` VARCHAR(300) NULL,
    `date` VARCHAR(300) NULL,
    `date_s` VARCHAR(300) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_egraat_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NULL,
    `title` VARCHAR(100) NULL,
    `main_type` INTEGER NULL DEFAULT 0,
    `tarteb` INTEGER NULL,
    `min_num` INTEGER NULL,
    `max_num` INTEGER NULL,
    `date` VARCHAR(50) NULL,
    `date_ar` VARCHAR(50) NULL,
    `time` VARCHAR(50) NULL,
    `publisher_name` VARCHAR(50) NULL,
    `publisher` INTEGER NULL,
    `edara` INTEGER NULL,
    `qsm` INTEGER NULL,
    `job_number` INTEGER NULL,
    `marg3_mobasher` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_egraat_emp_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_title_id_fk` INTEGER NULL,
    `job_title_code_fk` INTEGER NULL,
    `job_title_n` VARCHAR(100) NULL,
    `person_type` INTEGER NULL,
    `person_id` INTEGER NULL,
    `person_code` VARCHAR(15) NULL,
    `person_name` VARCHAR(100) NULL,
    `person_qsm` VARCHAR(100) NULL,
    `person_edara` VARCHAR(100) NULL,
    `person_private_name` VARCHAR(100) NULL,
    `person_img` VARCHAR(100) NULL,
    `person_suspend` INTEGER NULL,
    `from_date` VARCHAR(15) NULL,
    `to_date` VARCHAR(15) NULL,
    `from_date_str` VARCHAR(30) NULL,
    `to_date_str` VARCHAR(30) NULL,
    `date` INTEGER NULL,
    `date_ar` VARCHAR(100) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `web_display` INTEGER NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_evaluation_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NULL,
    `from_id` INTEGER NULL,
    `degree` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3en_moaqt_evaluation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` VARCHAR(100) NULL,
    `edara_id_fk` VARCHAR(100) NULL,
    `qsm_id_fk` VARCHAR(100) NULL,
    `total_degree` VARCHAR(100) NULL,
    `result_tagraba` VARCHAR(100) NULL,
    `taqdeer` VARCHAR(100) NULL,
    `date` INTEGER NULL,
    `date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3en_moaqt_evaluation_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `evaluate_id_fk` INTEGER NULL,
    `title` VARCHAR(255) NULL,
    `max_degree` VARCHAR(50) NULL,
    `emp_degree` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3en_moaqt_evaluation_points` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `evaluate_id_fk` INTEGER NULL,
    `title` VARCHAR(255) NULL,
    `type` INTEGER NULL,
    `type_n` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custody_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(300) NULL,
    `from_id` INTEGER NULL DEFAULT 0,
    `level` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emp_custody` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_code` INTEGER NULL,
    `custody_id_fk` INTEGER NULL,
    `custody_title` VARCHAR(255) NULL,
    `num` INTEGER NULL,
    `status` INTEGER NULL,
    `date_recived` VARCHAR(255) NULL,
    `transfered` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_job_request` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rkm_talab` INTEGER NULL,
    `date_talab` VARCHAR(15) NULL,
    `date_talab_ar` VARCHAR(15) NULL,
    `dep_id_fk` INTEGER NULL,
    `sub_dep_id_fk` INTEGER NULL,
    `job_title_id_fk` INTEGER NULL,
    `num_for_job` INTEGER NULL,
    `job_type` INTEGER NULL,
    `job_natural` INTEGER NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `publisher` INTEGER NULL,
    `img` VARCHAR(500) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_job_request_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_id_fk` INTEGER NULL,
    `type` INTEGER NULL,
    `title` VARCHAR(500) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_request_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(300) NULL,
    `national_num` VARCHAR(50) NULL,
    `national_num_img` TEXT NULL,
    `personal_photo` VARCHAR(600) NULL,
    `gender_id_fk` INTEGER NULL,
    `nationality_id_fk` INTEGER NULL,
    `date_birth` VARCHAR(300) NULL,
    `date_birth_hijri` VARCHAR(20) NULL,
    `place_birth` VARCHAR(300) NULL,
    `social_status` INTEGER NULL,
    `city` VARCHAR(300) NULL,
    `hai` VARCHAR(300) NULL,
    `job_request_id_fk` INTEGER NULL,
    `job_name_other` VARCHAR(300) NULL,
    `mob` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `work_now` INTEGER NULL,
    `interview_date` VARCHAR(50) NULL,
    `determine_interview` INTEGER NULL,
    `do_interview` INTEGER NULL,
    `total_degree` VARCHAR(50) NULL,
    `date` VARCHAR(50) NULL,
    `date_ar` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_agents` (
    `agent_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NULL,
    `name_slug` VARCHAR(255) NULL,
    `gender` VARCHAR(10) NULL,
    `image` VARCHAR(500) NULL,
    `office_no` VARCHAR(15) NULL,
    `mob` VARCHAR(20) NULL,
    `mob_2` VARCHAR(20) NULL,
    `mob_3` VARCHAR(20) NULL,
    `mob_4` VARCHAR(20) NULL,
    `fax` VARCHAR(20) NULL,
    `email` VARCHAR(30) NULL,
    `private_email` VARCHAR(30) NULL,
    `facebook` VARCHAR(50) NULL,
    `twitter` VARCHAR(50) NULL,
    `instgram` VARCHAR(50) NULL,
    `linkedin` VARCHAR(50) NULL,
    `address` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `activity` VARCHAR(10) NULL,
    `view_details` VARCHAR(5) NULL,
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated` DATETIME(0) NULL,
    `have_account` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`agent_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_name` VARCHAR(100) NULL,
    `user_phone` VARCHAR(20) NULL,
    `user_email` VARCHAR(70) NULL,
    `user_city` VARCHAR(100) NULL,
    `user_pass` VARCHAR(500) NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `rand_key` INTEGER NULL,
    `m_image` TEXT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conf_area_setting` (
    `main_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NULL,
    `type` VARCHAR(10) NULL,
    `from_id_fk` INTEGER NULL,
    `created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated` DATETIME(0) NULL,

    PRIMARY KEY (`main_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_msg` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `msg_date` VARCHAR(100) NULL,
    `msg_title` VARCHAR(100) NULL,
    `subject` TEXT NULL,
    `msg_f2a` INTEGER NULL,
    `start_time` VARCHAR(100) NULL,
    `start_date` VARCHAR(100) NULL,
    `moda` VARCHAR(100) NULL,
    `publisher` INTEGER NOT NULL,
    `publisher_name` INTEGER NOT NULL,
    `date` INTEGER NOT NULL,
    `date_ar` INTEGER NOT NULL,
    `send_all_t3mem` INTEGER NOT NULL DEFAULT 0,
    `img` VARCHAR(250) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_msg_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_msg_id_fk` INTEGER NULL,
    `emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `type` INTEGER NOT NULL DEFAULT 0,
    `seen` INTEGER NULL,
    `send_all_t3mem` INTEGER NULL,
    `seen_date` VARCHAR(15) NULL,
    `seen_time` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_msg_attaches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_msg_id_fk` INTEGER NULL,
    `title` VARCHAR(100) NULL,
    `file` VARCHAR(250) NULL,
    `date` VARCHAR(50) NULL,
    `date_ar` VARCHAR(50) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_personal_msg` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `msg_date` VARCHAR(100) NULL,
    `msg_time` VARCHAR(15) NULL,
    `msg_title` VARCHAR(100) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `from_user_id` INTEGER NULL,
    `from_emp_id` INTEGER NULL,
    `subject` TEXT NULL,
    `message` VARCHAR(255) NULL,
    `msg_f2a` INTEGER NULL,
    `start_time` VARCHAR(100) NULL,
    `start_date` VARCHAR(100) NULL,
    `moda` VARCHAR(100) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(250) NULL,
    `date` VARCHAR(15) NULL,
    `date_ar` VARCHAR(15) NULL,
    `send_all_t3mem` INTEGER NOT NULL DEFAULT 0,
    `file` VARCHAR(250) NULL,
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `deleted_date` VARCHAR(10) NULL,
    `deleted_time` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ta3mem_personal_msg_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ta3mem_msg_id_fk` INTEGER NULL,
    `to_user_id` INTEGER NULL,
    `to_emp_id` INTEGER NULL,
    `emp_code` INTEGER NULL,
    `emp_name` VARCHAR(100) NULL,
    `type` INTEGER NOT NULL DEFAULT 0,
    `seen` INTEGER NULL,
    `send_all_t3mem` INTEGER NULL,
    `send_date` VARCHAR(15) NULL,
    `send_time` VARCHAR(10) NULL,
    `seen_date` VARCHAR(15) NULL,
    `seen_time` VARCHAR(20) NULL,
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `deleted_date` VARCHAR(10) NULL,
    `deleted_time` VARCHAR(10) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `for_c_year` INTEGER NOT NULL DEFAULT 2025,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_messages` (
    `msg_id` INTEGER NOT NULL AUTO_INCREMENT,
    `msg_date` VARCHAR(15) NULL,
    `msg_time` VARCHAR(15) NULL,
    `msg_title` VARCHAR(300) NULL,
    `msg_content` TEXT NULL,
    `user_phone` VARCHAR(25) NULL,
    `customer_id` INTEGER NULL,
    `act_ended` VARCHAR(10) NOT NULL DEFAULT 'reading',
    `act_ended_emp_id` INTEGER NULL,
    `act_ended_date` VARCHAR(15) NULL,
    `act_ended_time` VARCHAR(15) NULL,

    PRIMARY KEY (`msg_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_dialy_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `send_date_ar` VARCHAR(20) NULL,
    `send_time` VARCHAR(10) NULL,
    `emp_id_fk` INTEGER NULL,
    `title` VARCHAR(255) NULL,
    `status` VARCHAR(12) NULL,
    `notes` VARCHAR(500) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `suspend` INTEGER NULL DEFAULT 0,
    `rad_notes` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_takrer_yawmi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id_fk` INTEGER NULL,
    `emp_name` VARCHAR(50) NULL,
    `branch_id_fk` INTEGER NULL,
    `date` VARCHAR(50) NULL,
    `date_ar` VARCHAR(50) NULL,
    `inserted_date` VARCHAR(50) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(50) NULL,
    `time` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_takrer_yawmi_bnod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `band` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_takrer_yawmi_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `takrer_id_fk` INTEGER NULL,
    `band_id_fk` INTEGER NULL,
    `band_name` VARCHAR(100) NULL,
    `text1` VARCHAR(50) NULL,
    `text2` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mobadrat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `send_date_ar` VARCHAR(20) NULL,
    `send_time` VARCHAR(10) NULL,
    `emp_id_fk` INTEGER NULL,
    `title` VARCHAR(255) NULL,
    `notes` VARCHAR(500) NULL,
    `for_month` INTEGER NULL,
    `for_year` INTEGER NULL,
    `suspend` INTEGER NULL DEFAULT 0,
    `rad_notes` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ansheta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NULL,
    `title` VARCHAR(200) NULL,
    `send_date` VARCHAR(15) NULL,
    `send_time` VARCHAR(10) NULL,
    `suspend` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(200) NULL,
    `rad_notes` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_ansheta_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `main_id_fk` INTEGER NULL,
    `file_name` VARCHAR(300) NULL,
    `uploaded_on` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_lawyeh_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `f_file` VARCHAR(500) NULL,
    `title` VARCHAR(200) NULL,
    `user_id` INTEGER NULL,
    `added_date` VARCHAR(15) NULL,
    `added_time` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_lawyeh_files_seens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `layha_id_fk` INTEGER NULL,
    `emp_id_fk` INTEGER NULL,
    `user_id_fk` INTEGER NULL,
    `seen` INTEGER NOT NULL DEFAULT 0,
    `seen_date` VARCHAR(15) NULL,
    `seen_time` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosalat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosala_rkm` INTEGER NULL,
    `mosala_date_ar` VARCHAR(15) NULL,
    `mosala_time` VARCHAR(10) NULL,
    `emp_name` VARCHAR(100) NULL,
    `emp_name_id` INTEGER NULL,
    `emp_user_id` INTEGER NULL,
    `emp_edara` VARCHAR(100) NULL,
    `emp_edara_id` INTEGER NULL,
    `emp_qesm` VARCHAR(70) NULL,
    `emp_qesm_id` INTEGER NULL,
    `direct_manager_emp_id` INTEGER NULL,
    `direct_manager_user_id` INTEGER NULL,
    `details` VARCHAR(300) NULL,
    `publisher` INTEGER NULL,
    `publisher_name` VARCHAR(100) NULL,
    `current_from_user_id` INTEGER NULL,
    `current_from_user_name` VARCHAR(100) NULL,
    `current_to_user_id` INTEGER NULL,
    `current_to_user_name` VARCHAR(100) NULL,
    `send_to_hr` VARCHAR(5) NOT NULL DEFAULT 'no',
    `send_to_emp` VARCHAR(5) NOT NULL DEFAULT 'no',
    `actions_sends` VARCHAR(15) NULL DEFAULT 'start',
    `answer_reasons` VARCHAR(500) NULL,
    `answer_mobarer` VARCHAR(500) NULL,
    `answer_other` VARCHAR(500) NULL,
    `answer_date` VARCHAR(15) NULL,
    `answer_time` VARCHAR(10) NULL,
    `send_from` VARCHAR(12) NOT NULL DEFAULT 'hr',
    `for_year` INTEGER NOT NULL DEFAULT 2025,
    `for_month` INTEGER NULL,
    `f_file` VARCHAR(500) NULL,
    `real_file` VARCHAR(500) NULL,
    `action_moder_rad` VARCHAR(10) NOT NULL DEFAULT 'wait',
    `action_moder_date` VARCHAR(15) NULL,
    `action_moder_time` VARCHAR(10) NULL,
    `action_moder_notes` VARCHAR(300) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_mosalat_mokalfat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mosala_id_fk` INTEGER NULL,
    `mokalfa_id` INTEGER NULL,
    `mokalfa_name` VARCHAR(255) NULL,
    `mokalfa_notes` VARCHAR(200) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_locations_visits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `send_date_ar` VARCHAR(20) NULL,
    `send_time` VARCHAR(10) NULL,
    `emp_id_fk` INTEGER NULL,
    `lat` VARCHAR(100) NULL,
    `long` VARCHAR(100) NULL,
    `img_path` VARCHAR(500) NULL,
    `notes` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_emp_zeyarat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emp_id` INTEGER NOT NULL,
    `emp_code` INTEGER NOT NULL,
    `emp_name` VARCHAR(100) NULL,
    `site_lat` DOUBLE NOT NULL,
    `site_long` DOUBLE NOT NULL,
    `date` VARCHAR(20) NOT NULL,
    `zeyara_date` VARCHAR(20) NOT NULL,
    `zeyara_time` VARCHAR(20) NOT NULL,
    `emp_img` VARCHAR(100) NOT NULL,
    `site_id` INTEGER NOT NULL,
    `site_name` VARCHAR(200) NULL,
    `notes` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_membership_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `duration_days` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `gender` ENUM('male', 'female') NOT NULL,
    `card_number` VARCHAR(30) NULL,
    `date_of_birth` VARCHAR(10) NULL,
    `address` TEXT NULL,
    `marital_status` VARCHAR(20) NULL,
    `job_title` VARCHAR(120) NULL,
    `profile_picture` VARCHAR(255) NULL,
    `branch_id` INTEGER NOT NULL,
    `membership_type_id` INTEGER NULL,
    `start_date` VARCHAR(10) NULL,
    `end_date` VARCHAR(10) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `app_user_id` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_members_member_code_key`(`member_code`),
    INDEX `club_members_branch_id_idx`(`branch_id`),
    INDEX `club_members_membership_type_id_idx`(`membership_type_id`),
    INDEX `club_members_card_number_idx`(`card_number`),
    INDEX `club_members_name_idx`(`name`),
    INDEX `club_members_phone_idx`(`phone`),
    INDEX `club_members_app_user_id_idx`(`app_user_id`),
    INDEX `club_members_branch_id_is_active_is_deleted_idx`(`branch_id`, `is_active`, `is_deleted`),
    UNIQUE INDEX `uq_club_member_phone`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `member_code` VARCHAR(30) NOT NULL,
    `member_name` VARCHAR(200) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `check_in_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `check_out_time` DATETIME(3) NULL,
    `attendance_date` VARCHAR(10) NOT NULL,
    `status` ENUM('checked_in', 'checked_out') NOT NULL DEFAULT 'checked_in',
    `duration` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_attendance_member_id_idx`(`member_id`),
    INDEX `club_attendance_branch_id_idx`(`branch_id`),
    INDEX `club_attendance_attendance_date_idx`(`attendance_date`),
    INDEX `club_attendance_status_idx`(`status`),
    INDEX `club_attendance_member_code_idx`(`member_code`),
    INDEX `club_attendance_attendance_date_check_in_time_idx`(`attendance_date`, `check_in_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_subscription_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `branch_id` INTEGER NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `days` INTEGER NOT NULL,
    `is_special_offer` BOOLEAN NOT NULL DEFAULT false,
    `is_for_students` BOOLEAN NOT NULL DEFAULT false,
    `show_in_app` BOOLEAN NOT NULL DEFAULT false,
    `wallet_points` INTEGER NULL,
    `offer_validity` VARCHAR(10) NULL,
    `is_linked_to_sessions` BOOLEAN NOT NULL DEFAULT false,
    `sessions_count` INTEGER NULL,
    `is_linked_to_freeze` BOOLEAN NOT NULL DEFAULT false,
    `freeze_days` INTEGER NULL,
    `includes_spa` BOOLEAN NOT NULL DEFAULT false,
    `spa_count` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_number` VARCHAR(30) NOT NULL,
    `registration_date` VARCHAR(10) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `subscription_type_id` INTEGER NULL,
    `subscription_type` VARCHAR(150) NULL,
    `subscription_start_date` VARCHAR(10) NOT NULL,
    `subscription_end_date` VARCHAR(10) NOT NULL,
    `subscription_value` DECIMAL(10, 2) NOT NULL,
    `discount_enabled` BOOLEAN NOT NULL DEFAULT false,
    `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remaining_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `gender` ENUM('male', 'female') NULL,
    `employee_id` INTEGER NULL,
    `sales_id` INTEGER NULL,
    `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL,
    `receipt_number` VARCHAR(30) NULL,
    `customer_source_id` INTEGER NULL,
    `guardian_name` VARCHAR(200) NULL,
    `guardian_phone` VARCHAR(20) NULL,
    `status` ENUM('active', 'expired', 'upcoming', 'frozen') NOT NULL DEFAULT 'active',
    `is_special` BOOLEAN NOT NULL DEFAULT false,
    `is_linked_to_sessions` BOOLEAN NOT NULL DEFAULT false,
    `sessions_count` INTEGER NULL,
    `sessions_used` INTEGER NOT NULL DEFAULT 0,
    `is_time_based` BOOLEAN NOT NULL DEFAULT false,
    `time_from` VARCHAR(8) NULL,
    `time_to` VARCHAR(8) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_subscriptions_subscription_number_key`(`subscription_number`),
    INDEX `club_subscriptions_member_id_idx`(`member_id`),
    INDEX `club_subscriptions_branch_id_idx`(`branch_id`),
    INDEX `club_subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_number` VARCHAR(30) NOT NULL,
    `subscription_id` INTEGER NULL,
    `member_id` INTEGER NULL,
    `member_name` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `type` VARCHAR(50) NULL,
    `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL,
    `receipt_date` VARCHAR(10) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'مدفوعة',
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_receipts_receipt_number_key`(`receipt_number`),
    INDEX `club_receipts_subscription_id_idx`(`subscription_id`),
    INDEX `club_receipts_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_customer_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cafe_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category_id` INTEGER NULL,
    `sell_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `image_url` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cafe_products_product_code_key`(`product_code`),
    INDEX `cafe_products_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cafe_product_recipes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `ingredient_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `cafe_product_recipes_product_id_idx`(`product_id`),
    INDEX `cafe_product_recipes_ingredient_id_idx`(`ingredient_id`),
    UNIQUE INDEX `cafe_product_recipes_product_id_ingredient_id_key`(`product_id`, `ingredient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_subscription_refunds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `subscription_type` VARCHAR(150) NULL,
    `original_start_date` VARCHAR(10) NOT NULL,
    `original_end_date` VARCHAR(10) NOT NULL,
    `stop_date` VARCHAR(10) NOT NULL,
    `remaining_days` INTEGER NOT NULL,
    `original_value` DECIMAL(10, 2) NOT NULL,
    `daily_rate` DECIMAL(10, 4) NOT NULL,
    `refund_amount` DECIMAL(10, 2) NOT NULL,
    `invoice_number` VARCHAR(30) NOT NULL,
    `refund_date` VARCHAR(10) NOT NULL,
    `reason` TEXT NULL,
    `notes` TEXT NULL,
    `status` ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `club_subscription_refunds_invoice_number_key`(`invoice_number`),
    INDEX `club_subscription_refunds_subscription_id_idx`(`subscription_id`),
    INDEX `club_subscription_refunds_member_id_idx`(`member_id`),
    INDEX `club_subscription_refunds_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_subscription_freezes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `freeze_start_date` VARCHAR(10) NOT NULL,
    `freeze_end_date` VARCHAR(10) NULL,
    `planned_days` INTEGER NOT NULL,
    `actual_days` INTEGER NULL,
    `original_end_date` VARCHAR(10) NOT NULL,
    `reason` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_subscription_freezes_subscription_id_idx`(`subscription_id`),
    INDEX `club_subscription_freezes_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_subscription_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `from_subscription_type` VARCHAR(150) NULL,
    `to_subscription_type` VARCHAR(150) NULL,
    `from_start_date` VARCHAR(10) NULL,
    `from_end_date` VARCHAR(10) NULL,
    `to_start_date` VARCHAR(10) NULL,
    `to_end_date` VARCHAR(10) NULL,
    `from_value` DECIMAL(10, 2) NULL,
    `to_value` DECIMAL(10, 2) NULL,
    `transfer_date` VARCHAR(10) NOT NULL,
    `reason` TEXT NULL,
    `branch_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_subscription_transfers_subscription_id_idx`(`subscription_id`),
    INDEX `club_subscription_transfers_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_lockers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `locker_number` VARCHAR(30) NOT NULL,
    `main_branch_id` INTEGER NOT NULL,
    `sub_branch_id` INTEGER NOT NULL,
    `is_available` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_lockers_main_branch_id_idx`(`main_branch_id`),
    INDEX `club_lockers_sub_branch_id_idx`(`sub_branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_locker_subscription_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `meta_value` DECIMAL(10, 2) NOT NULL,
    `mta_value` DECIMAL(10, 2) NOT NULL,
    `days` INTEGER NOT NULL,
    `has_stop` BOOLEAN NOT NULL DEFAULT false,
    `stop_days` INTEGER NULL,
    `is_target_based` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_locker_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_number` VARCHAR(30) NOT NULL,
    `main_branch_id` INTEGER NOT NULL,
    `sub_branch_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NOT NULL,
    `subscription_type_id` INTEGER NOT NULL,
    `subscription_days` INTEGER NULL,
    `subscription_start_date` VARCHAR(10) NOT NULL,
    `subscription_end_date` VARCHAR(10) NOT NULL,
    `subscription_value` DECIMAL(10, 2) NOT NULL,
    `discount_enabled` BOOLEAN NOT NULL DEFAULT false,
    `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `locker_id` INTEGER NOT NULL,
    `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL,
    `gender` ENUM('male', 'female') NULL,
    `recommended_employee_id` INTEGER NULL,
    `receipt_number` VARCHAR(30) NULL,
    `status` ENUM('active', 'expired', 'upcoming', 'frozen') NOT NULL DEFAULT 'active',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_locker_subscriptions_subscription_number_key`(`subscription_number`),
    INDEX `club_locker_subscriptions_locker_id_idx`(`locker_id`),
    INDEX `club_locker_subscriptions_subscription_type_id_idx`(`subscription_type_id`),
    INDEX `club_locker_subscriptions_member_id_idx`(`member_id`),
    INDEX `club_locker_subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_member_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT 'عام',
    `max_members` INTEGER NOT NULL DEFAULT 0,
    `current_members` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_surveys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `responses_count` INTEGER NOT NULL DEFAULT 0,
    `questions_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_trainers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NULL,
    `name` VARCHAR(200) NOT NULL,
    `email` VARCHAR(150) NULL,
    `phone` VARCHAR(20) NULL,
    `specialization` VARCHAR(200) NULL,
    `experience` VARCHAR(100) NULL,
    `bio` TEXT NULL,
    `image_url` VARCHAR(255) NULL,
    `rating_avg` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_trainers_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_trainer_salaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trainer_id` INTEGER NOT NULL,
    `base_salary` DECIMAL(10, 2) NOT NULL,
    `class_commission_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subscription_commission_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `effective_date` VARCHAR(10) NOT NULL,
    `end_date` VARCHAR(10) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_trainer_salaries_trainer_id_idx`(`trainer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_halls` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `hall_number` VARCHAR(30) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('available', 'maintenance', 'unavailable') NOT NULL DEFAULT 'available',
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_halls_branch_id_idx`(`branch_id`),
    UNIQUE INDEX `club_halls_branch_id_hall_number_key`(`branch_id`, `hall_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_hall_bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hall_id` INTEGER NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `booking_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `end_time` VARCHAR(8) NOT NULL,
    `number_of_people` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `notes` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_hall_bookings_hall_id_idx`(`hall_id`),
    INDEX `club_hall_bookings_booking_date_idx`(`booking_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_classes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `trainer_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `hall_id` INTEGER NULL,
    `class_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `end_time` VARCHAR(8) NOT NULL,
    `max_capacity` INTEGER NOT NULL DEFAULT 10,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` ENUM('scheduled', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_classes_trainer_id_idx`(`trainer_id`),
    INDEX `club_classes_branch_id_idx`(`branch_id`),
    INDEX `club_classes_class_date_idx`(`class_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_class_enrollments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `enrollment_date` VARCHAR(10) NOT NULL,
    `attendance_status` ENUM('registered', 'attended', 'absent', 'cancelled') NOT NULL DEFAULT 'registered',
    `attendance_time` VARCHAR(8) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_class_enrollments_member_id_idx`(`member_id`),
    UNIQUE INDEX `club_class_enrollments_class_id_member_id_key`(`class_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_class_waitlist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'waiting',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_class_waitlist_class_id_status_idx`(`class_id`, `status`),
    UNIQUE INDEX `club_class_waitlist_class_id_member_id_key`(`class_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_endpoints` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `events` JSON NOT NULL,
    `secret` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `endpoint_id` INTEGER NOT NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `response_code` INTEGER NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `delivered_at` DATETIME(3) NULL,

    INDEX `webhook_deliveries_endpoint_id_status_idx`(`endpoint_id`, `status`),
    INDEX `webhook_deliveries_event_type_idx`(`event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NULL,
    `muscle_group` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `instructions` TEXT NULL,
    `sets_default` INTEGER NULL,
    `reps_default` INTEGER NULL,
    `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_workout_programs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NULL,
    `name` VARCHAR(200) NOT NULL,
    `goal` VARCHAR(150) NULL,
    `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
    `duration_weeks` INTEGER NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_workout_programs_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_workout_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `exercises_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_member_progress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `record_date` VARCHAR(10) NOT NULL,
    `weight` DECIMAL(6, 2) NULL,
    `body_fat` DECIMAL(5, 2) NULL,
    `muscle_mass` DECIMAL(6, 2) NULL,
    `measurements_json` JSON NULL,
    `goals` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_member_progress_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_physical_assessments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `assess_date` VARCHAR(10) NOT NULL,
    `assessor` VARCHAR(200) NULL,
    `scores_json` JSON NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_physical_assessments_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_inbody_measurements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `measurement_date` VARCHAR(10) NOT NULL,
    `weight` DECIMAL(6, 2) NULL,
    `body_fat` DECIMAL(5, 2) NULL,
    `muscle_mass` DECIMAL(6, 2) NULL,
    `bmi` DECIMAL(5, 2) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_inbody_measurements_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_spa_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `duration` INTEGER NOT NULL DEFAULT 60,
    `price` DECIMAL(10, 2) NOT NULL,
    `branch_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_spa_bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_number` VARCHAR(30) NOT NULL,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `customer_phone` VARCHAR(20) NULL,
    `service_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `booking_date` VARCHAR(10) NOT NULL,
    `booking_time` VARCHAR(8) NOT NULL,
    `duration` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `payment_status` ENUM('unpaid', 'paid', 'partial') NOT NULL DEFAULT 'unpaid',
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_spa_bookings_booking_number_key`(`booking_number`),
    INDEX `club_spa_bookings_service_id_idx`(`service_id`),
    INDEX `club_spa_bookings_booking_date_idx`(`booking_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_spa_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(30) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `invoice_date` VARCHAR(10) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'paid',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_spa_invoices_invoice_number_key`(`invoice_number`),
    INDEX `club_spa_invoices_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_inbody_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(30) NOT NULL,
    `is_member` BOOLEAN NOT NULL DEFAULT true,
    `member_id` INTEGER NULL,
    `customer_name` VARCHAR(200) NULL,
    `service_id` INTEGER NULL,
    `branch_id` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `invoice_date` VARCHAR(10) NOT NULL,
    `invoice_time` VARCHAR(8) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'paid',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_inbody_invoices_invoice_number_key`(`invoice_number`),
    INDEX `club_inbody_invoices_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_facilities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `facility_type` VARCHAR(50) NOT NULL DEFAULT 'general',
    `capacity` INTEGER NULL,
    `description` TEXT NULL,
    `status` ENUM('available', 'maintenance', 'unavailable') NOT NULL DEFAULT 'available',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_facilities_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `facility_id` INTEGER NULL,
    `name` VARCHAR(200) NOT NULL,
    `serial_number` VARCHAR(100) NULL,
    `branch_id` INTEGER NOT NULL,
    `status` ENUM('available', 'maintenance', 'unavailable') NOT NULL DEFAULT 'available',
    `purchase_date` VARCHAR(10) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_equipment_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_equipment_maintenance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipment_id` INTEGER NOT NULL,
    `scheduled_date` VARCHAR(10) NOT NULL,
    `completed_date` VARCHAR(10) NULL,
    `description` TEXT NULL,
    `cost` DECIMAL(10, 2) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_equipment_maintenance_equipment_id_idx`(`equipment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(100) NOT NULL,
    `name_en` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `parent_category_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inv_categories_parent_category_id_idx`(`parent_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_main_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `image` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_main_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_sub_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `main_category_id` INTEGER NOT NULL,
    `image` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inv_sub_categories_main_category_id_idx`(`main_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_brands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NOT NULL,
    `logo_url` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `website` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_manufacturers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(150) NULL,
    `email` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `address` TEXT NULL,
    `website` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `address` TEXT NULL,
    `tax_number` VARCHAR(50) NULL,
    `contact_person` VARCHAR(150) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inv_suppliers_name_ar_idx`(`name_ar`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `warehouse_code` VARCHAR(50) NOT NULL,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NULL,
    `type` ENUM('main', 'sub') NOT NULL DEFAULT 'main',
    `storage_capacity` INTEGER NOT NULL DEFAULT 1,
    `branch_id` INTEGER NOT NULL,
    `manager_name` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `address` TEXT NULL,
    `country` VARCHAR(150) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_warehouses_warehouse_code_key`(`warehouse_code`),
    INDEX `inv_warehouses_branch_id_idx`(`branch_id`),
    INDEX `inv_warehouses_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_storages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `image_attachment` VARCHAR(255) NULL,
    `licence_attachment` VARCHAR(255) NULL,
    `safety_cert_attachment` VARCHAR(255) NULL,
    `plans_attachment` VARCHAR(255) NULL,
    `reports_attachment` VARCHAR(255) NULL,
    `other_attachment` VARCHAR(255) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_storages_email_key`(`email`),
    INDEX `inv_storages_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_product_storages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storage_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_product_storages_product_id_idx`(`product_id`),
    UNIQUE INDEX `uq_product_storage`(`storage_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_unit_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `base_unit` VARCHAR(50) NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'general',
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_unit_templates_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_unit_conversions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER NOT NULL,
    `from_unit` VARCHAR(50) NOT NULL,
    `to_unit` VARCHAR(50) NOT NULL,
    `factor` DECIMAL(12, 4) NOT NULL DEFAULT 1,
    `formula` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `inv_unit_conversions_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_code` VARCHAR(50) NOT NULL,
    `name_ar` VARCHAR(255) NOT NULL,
    `name_en` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `barcode` VARCHAR(50) NULL,
    `category_id` INTEGER NULL,
    `brand_id` INTEGER NULL,
    `manufacturer_id` INTEGER NULL,
    `supplier_id` INTEGER NULL,
    `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `selling_price` DECIMAL(12, 2) NOT NULL,
    `wholesale_price` DECIMAL(12, 2) NULL,
    `unit_of_measure` VARCHAR(50) NOT NULL DEFAULT 'وحدة',
    `unit_template_id` INTEGER NULL,
    `min_stock` INTEGER NOT NULL DEFAULT 1,
    `max_stock` INTEGER NOT NULL DEFAULT 1000,
    `reorder_point` INTEGER NOT NULL DEFAULT 10,
    `image_url` VARCHAR(255) NULL,
    `model` VARCHAR(150) NULL,
    `color` VARCHAR(50) NULL,
    `size` VARCHAR(50) NULL,
    `material` VARCHAR(100) NULL,
    `weight_kg` DECIMAL(10, 3) NULL,
    `dimensions` JSON NULL,
    `warranty_period` VARCHAR(50) NULL,
    `expiry_date` DATETIME(3) NULL,
    `batch_number` VARCHAR(50) NULL,
    `shelf_location` VARCHAR(100) NULL,
    `apply_to_all_branches` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_products_product_code_key`(`product_code`),
    UNIQUE INDEX `inv_products_barcode_key`(`barcode`),
    INDEX `inv_products_category_id_idx`(`category_id`),
    INDEX `inv_products_brand_id_idx`(`brand_id`),
    INDEX `inv_products_supplier_id_idx`(`supplier_id`),
    INDEX `inv_products_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_spare_parts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `part_code` VARCHAR(50) NOT NULL,
    `name_ar` VARCHAR(255) NOT NULL,
    `name_en` VARCHAR(255) NOT NULL,
    `main_category_id` INTEGER NOT NULL,
    `sub_category_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NULL,
    `supplier_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `brand` VARCHAR(150) NULL,
    `part_condition` ENUM('new', 'used', 'refurbished') NOT NULL DEFAULT 'new',
    `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `selling_price` DECIMAL(12, 2) NULL,
    `current_stock` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `min_stock` INTEGER NOT NULL DEFAULT 0,
    `warranty_period` VARCHAR(50) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_spare_parts_part_code_key`(`part_code`),
    INDEX `inv_spare_parts_main_category_id_idx`(`main_category_id`),
    INDEX `inv_spare_parts_sub_category_id_idx`(`sub_category_id`),
    INDEX `inv_spare_parts_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_consumables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name_ar` VARCHAR(255) NOT NULL,
    `name_en` VARCHAR(255) NOT NULL,
    `category_id` INTEGER NULL,
    `warehouse_id` INTEGER NULL,
    `supplier_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `brand_id` INTEGER NULL,
    `unit_template_id` INTEGER NULL,
    `consumption_rate` DECIMAL(12, 3) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `current_stock` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `min_stock` INTEGER NOT NULL DEFAULT 0,
    `max_stock` INTEGER NOT NULL DEFAULT 0,
    `shelf_location` VARCHAR(100) NULL,
    `image_url` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_consumables_code_key`(`code`),
    INDEX `inv_consumables_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_composite_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(50) NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_composite_products_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_composite_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `composite_product_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL DEFAULT 1,

    INDEX `inv_composite_items_composite_product_id_idx`(`composite_product_id`),
    INDEX `inv_composite_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_service_consumables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_id` INTEGER NOT NULL,
    `consumable_id` INTEGER NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_service_consumables_service_id_idx`(`service_id`),
    UNIQUE INDEX `uq_service_consumable`(`service_id`, `consumable_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_stock_balances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `current_stock` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `min_stock` INTEGER NOT NULL DEFAULT 0,
    `max_stock` INTEGER NOT NULL DEFAULT 1000,
    `reorder_point` INTEGER NOT NULL DEFAULT 10,
    `shelf_location` VARCHAR(100) NULL,
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_stock_balances_warehouse_id_idx`(`warehouse_id`),
    UNIQUE INDEX `uq_product_warehouse`(`product_id`, `warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_product_branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `stock_quantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `reorder_point` INTEGER NOT NULL DEFAULT 10,
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_product_branches_branch_id_idx`(`branch_id`),
    UNIQUE INDEX `uq_product_branch`(`product_id`, `branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `movement_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `txn_type` ENUM('receipt', 'issue', 'transfer', 'count', 'damage', 'purchase_return', 'sales_return', 'adjustment') NOT NULL,
    `direction` ENUM('in', 'out') NOT NULL,
    `product_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `uom` VARCHAR(50) NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance_after` DECIMAL(14, 3) NOT NULL,
    `doc_type` VARCHAR(50) NULL,
    `doc_ref` VARCHAR(100) NULL,
    `transaction_id` INTEGER NULL,
    `batch_number` VARCHAR(50) NULL,
    `expiry_date` DATETIME(3) NULL,
    `branch_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_movements_product_id_idx`(`product_id`),
    INDEX `inv_movements_warehouse_id_idx`(`warehouse_id`),
    INDEX `inv_movements_txn_type_idx`(`txn_type`),
    INDEX `inv_movements_movement_date_idx`(`movement_date`),
    INDEX `inv_movements_doc_type_doc_ref_idx`(`doc_type`, `doc_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(100) NOT NULL,
    `txn_type` ENUM('receipt', 'issue', 'transfer', 'count', 'damage', 'purchase_return', 'sales_return', 'adjustment') NOT NULL,
    `status` ENUM('draft', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
    `txn_date` DATETIME(3) NOT NULL,
    `source_warehouse_id` INTEGER NULL,
    `target_warehouse_id` INTEGER NULL,
    `branch_id` INTEGER NOT NULL,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `reason` TEXT NULL,
    `created_by` INTEGER NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_by` INTEGER NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_transactions_reference_key`(`reference`),
    INDEX `inv_transactions_txn_type_idx`(`txn_type`),
    INDEX `inv_transactions_status_idx`(`status`),
    INDEX `inv_transactions_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_transaction_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `item_code` VARCHAR(50) NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(50) NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,

    INDEX `inv_transaction_items_transaction_id_idx`(`transaction_id`),
    INDEX `inv_transaction_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_opening_stocks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opening_stock_date` DATETIME(3) NULL,
    `item_code` VARCHAR(50) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `total_cost` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `branch_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `spare_part_id` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inv_opening_stocks_branch_id_idx`(`branch_id`),
    INDEX `inv_opening_stocks_warehouse_id_idx`(`warehouse_id`),
    INDEX `inv_opening_stocks_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_count_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_number` VARCHAR(50) NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_count_sessions_session_number_key`(`session_number`),
    INDEX `inv_count_sessions_warehouse_id_idx`(`warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_count_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `item_code` VARCHAR(50) NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NULL,
    `system_quantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `counted_quantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `variance` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `status` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inv_count_items_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inv_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adjustment_number` VARCHAR(50) NOT NULL,
    `session_id` INTEGER NULL,
    `warehouse_id` INTEGER NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
    `approved_by` VARCHAR(150) NULL,
    `approved_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inv_adjustments_adjustment_number_key`(`adjustment_number`),
    INDEX `inv_adjustments_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_shifts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shift_name` VARCHAR(100) NOT NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `end_time` VARCHAR(8) NOT NULL,
    `branch_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_shifts_branch_id_idx`(`branch_id`),
    INDEX `sales_shifts_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_shift_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shift_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `user_id` INTEGER NOT NULL,
    `session_date` VARCHAR(10) NOT NULL,
    `start_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_time` DATETIME(3) NULL,
    `expected_start_time` VARCHAR(8) NOT NULL,
    `expected_end_time` VARCHAR(8) NOT NULL,
    `opening_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `closing_balance` DECIMAL(10, 2) NULL,
    `expected_closing_balance` DECIMAL(10, 2) NULL,
    `cash_difference` DECIMAL(10, 2) NULL,
    `total_sales` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_cash` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_card` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_wallet` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_transfer` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_discount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_tax` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `transactions_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('open', 'closed', 'auto_closed') NOT NULL DEFAULT 'open',
    `closed_by` INTEGER NULL,
    `notes` TEXT NULL,
    `closing_notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_shift_sessions_branch_id_idx`(`branch_id`),
    INDEX `sales_shift_sessions_user_id_idx`(`user_id`),
    INDEX `sales_shift_sessions_status_idx`(`status`),
    UNIQUE INDEX `uq_open_session`(`session_date`, `shift_id`, `branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_quick_sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_number` VARCHAR(50) NOT NULL,
    `customer_name` VARCHAR(100) NOT NULL DEFAULT 'عميل نقدي',
    `customer_phone` VARCHAR(20) NULL,
    `branch_id` INTEGER NOT NULL,
    `cashier_id` INTEGER NULL,
    `shift_session_id` INTEGER NULL,
    `sale_date` VARCHAR(10) NOT NULL,
    `sale_time` VARCHAR(8) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `tax_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 15,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `payment_method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NOT NULL DEFAULT 'cash',
    `status` ENUM('completed', 'refunded', 'cancelled') NOT NULL DEFAULT 'completed',
    `notes` TEXT NULL,
    `loyalty_points_earned` INTEGER NOT NULL DEFAULT 0,
    `receipt_printed` BOOLEAN NOT NULL DEFAULT false,
    `warehouse_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_quick_sales_sale_number_key`(`sale_number`),
    INDEX `sales_quick_sales_branch_id_idx`(`branch_id`),
    INDEX `sales_quick_sales_sale_date_idx`(`sale_date`),
    INDEX `sales_quick_sales_status_idx`(`status`),
    INDEX `sales_quick_sales_shift_session_id_idx`(`shift_session_id`),
    INDEX `sales_quick_sales_cashier_id_idx`(`cashier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_quick_sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quick_sale_id` INTEGER NOT NULL,
    `item_type` VARCHAR(20) NOT NULL DEFAULT 'product',
    `product_id` INTEGER NOT NULL,
    `ref_id` INTEGER NULL,
    `name` VARCHAR(150) NOT NULL,
    `product_code` VARCHAR(50) NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `line_total` DECIMAL(10, 2) NOT NULL,

    INDEX `sales_quick_sale_items_quick_sale_id_idx`(`quick_sale_id`),
    INDEX `sales_quick_sale_items_item_type_product_id_idx`(`item_type`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quick_sale_id` INTEGER NOT NULL,
    `method` ENUM('cash', 'card', 'wallet', 'transfer', 'mixed') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reference` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sales_pos_payments_quick_sale_id_idx`(`quick_sale_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_number` VARCHAR(50) NOT NULL,
    `customer_name` VARCHAR(100) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `booking_date` VARCHAR(10) NOT NULL,
    `booking_time` VARCHAR(8) NOT NULL,
    `status` ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'confirmed',
    `total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `final_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `payment_status` VARCHAR(20) NOT NULL DEFAULT 'unpaid',
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_bookings_booking_number_key`(`booking_number`),
    INDEX `sales_bookings_branch_id_idx`(`branch_id`),
    INDEX `sales_bookings_booking_date_idx`(`booking_date`),
    INDEX `sales_bookings_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `serial_number` VARCHAR(100) NULL,
    `device_type` ENUM('desktop', 'tablet', 'mobile', 'terminal') NOT NULL DEFAULT 'terminal',
    `branch_id` INTEGER NULL,
    `warehouse_id` INTEGER NULL,
    `cash_drawer_id` VARCHAR(60) NULL,
    `ip_address` VARCHAR(45) NULL,
    `printer_type` ENUM('thermal', 'receipt', 'laser', 'inkjet') NOT NULL DEFAULT 'thermal',
    `mac_address` VARCHAR(20) NULL,
    `operating_system` VARCHAR(60) NULL,
    `software_version` VARCHAR(40) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_sync` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_pos_devices_branch_id_idx`(`branch_id`),
    INDEX `sales_pos_devices_device_type_idx`(`device_type`),
    INDEX `sales_pos_devices_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_payment_methods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `name_en` VARCHAR(100) NULL,
    `code` VARCHAR(40) NOT NULL,
    `icon` VARCHAR(60) NULL,
    `fees` DECIMAL(8, 4) NOT NULL DEFAULT 0,
    `max_amount` DECIMAL(14, 2) NULL,
    `min_amount` DECIMAL(14, 2) NULL,
    `supports_mixed_payment` BOOLEAN NOT NULL DEFAULT true,
    `requires_approval` BOOLEAN NOT NULL DEFAULT false,
    `approval_threshold` DECIMAL(14, 2) NULL,
    `provider_name` VARCHAR(100) NULL,
    `api_key` VARCHAR(255) NULL,
    `api_secret` VARCHAR(255) NULL,
    `is_test_mode` BOOLEAN NOT NULL DEFAULT false,
    `description` TEXT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_pos_payment_methods_code_key`(`code`),
    INDEX `sales_pos_payment_methods_is_enabled_idx`(`is_enabled`),
    INDEX `sales_pos_payment_methods_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_invoice_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `template_type` ENUM('simple', 'detailed', 'thermal', 'electronic') NOT NULL DEFAULT 'simple',
    `paper_size` VARCHAR(20) NOT NULL DEFAULT 'A4',
    `include_header` BOOLEAN NOT NULL DEFAULT true,
    `include_logo` BOOLEAN NOT NULL DEFAULT true,
    `include_footer` BOOLEAN NOT NULL DEFAULT true,
    `include_qr` BOOLEAN NOT NULL DEFAULT false,
    `include_signature` BOOLEAN NOT NULL DEFAULT false,
    `header_text` TEXT NULL,
    `footer_text` TEXT NULL,
    `css_styles` TEXT NULL,
    `layout_config` JSON NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_pos_invoice_templates_is_active_idx`(`is_active`),
    INDEX `sales_pos_invoice_templates_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_report_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `report_type` ENUM('sales', 'inventory', 'financial', 'operational', 'customer', 'product', 'employee') NOT NULL DEFAULT 'sales',
    `frequency` ENUM('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'on_demand') NOT NULL DEFAULT 'on_demand',
    `auto_generate` BOOLEAN NOT NULL DEFAULT false,
    `recipients` JSON NULL,
    `format` ENUM('pdf', 'excel', 'csv', 'html') NOT NULL DEFAULT 'excel',
    `schedule` JSON NULL,
    `parameters` JSON NULL,
    `filters` JSON NULL,
    `columns` JSON NULL,
    `sorting` JSON NULL,
    `grouping` JSON NULL,
    `charts` JSON NULL,
    `watermark` VARCHAR(100) NULL,
    `password` VARCHAR(100) NULL,
    `retention_days` INTEGER NOT NULL DEFAULT 90,
    `max_file_size` INTEGER NOT NULL DEFAULT 10,
    `last_generated` DATETIME(3) NULL,
    `next_generation` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_pos_report_templates_report_type_idx`(`report_type`),
    INDEX `sales_pos_report_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_notification_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `notification_type` ENUM('transaction', 'inventory', 'system', 'security', 'payment', 'user') NOT NULL DEFAULT 'transaction',
    `trigger` VARCHAR(60) NOT NULL,
    `threshold` DECIMAL(14, 2) NULL,
    `threshold_type` VARCHAR(30) NULL,
    `channels` JSON NOT NULL,
    `recipients` JSON NULL,
    `message_template` TEXT NULL,
    `subject_template` VARCHAR(255) NULL,
    `conditions` JSON NULL,
    `schedule` JSON NULL,
    `priority` ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    `group_by` VARCHAR(60) NULL,
    `cooldown_minutes` INTEGER NOT NULL DEFAULT 0,
    `max_notifications_per_hour` INTEGER NOT NULL DEFAULT 10,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_pos_notification_rules_notification_type_idx`(`notification_type`),
    INDEX `sales_pos_notification_rules_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_pos_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NULL,
    `category` VARCHAR(40) NOT NULL,
    `setting_key` VARCHAR(80) NOT NULL,
    `setting_value` TEXT NOT NULL,
    `setting_type` ENUM('string', 'number', 'boolean', 'json', 'array') NOT NULL DEFAULT 'string',
    `description` VARCHAR(255) NULL,
    `group_name` VARCHAR(60) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `requires_restart` BOOLEAN NOT NULL DEFAULT false,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_pos_settings_category_idx`(`category`),
    INDEX `sales_pos_settings_branch_id_idx`(`branch_id`),
    UNIQUE INDEX `uq_pos_setting`(`branch_id`, `category`, `setting_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_actions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(40) NOT NULL,
    `label_ar` VARCHAR(80) NOT NULL,
    `label_en` VARCHAR(80) NOT NULL,
    `sensitive` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `rbac_actions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_resources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(120) NOT NULL,
    `parent_id` INTEGER NULL,
    `type` ENUM('module', 'group', 'page') NOT NULL,
    `name_ar` VARCHAR(160) NOT NULL,
    `name_en` VARCHAR(160) NULL,
    `route` VARCHAR(200) NULL,
    `icon` VARCHAR(80) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `rbac_resources_key_key`(`key`),
    INDEX `rbac_resources_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_resource_actions` (
    `resource_id` INTEGER NOT NULL,
    `action_id` INTEGER NOT NULL,

    INDEX `rbac_resource_actions_action_id_idx`(`action_id`),
    PRIMARY KEY (`resource_id`, `action_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(60) NOT NULL,
    `name_ar` VARCHAR(120) NOT NULL,
    `name_en` VARCHAR(120) NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rbac_roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_role_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `action_id` INTEGER NOT NULL,
    `effect` ENUM('allow', 'deny') NOT NULL,

    INDEX `rbac_role_permissions_role_id_idx`(`role_id`),
    INDEX `rbac_role_permissions_resource_id_idx`(`resource_id`),
    INDEX `rbac_role_permissions_action_id_idx`(`action_id`),
    UNIQUE INDEX `rbac_role_permissions_role_id_resource_id_action_id_key`(`role_id`, `resource_id`, `action_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_user_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    INDEX `rbac_user_roles_user_id_idx`(`user_id`),
    INDEX `rbac_user_roles_role_id_idx`(`role_id`),
    UNIQUE INDEX `rbac_user_roles_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_user_exceptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `action_id` INTEGER NOT NULL,
    `effect` ENUM('allow', 'deny') NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    INDEX `rbac_user_exceptions_user_id_idx`(`user_id`),
    UNIQUE INDEX `rbac_user_exceptions_user_id_resource_id_action_id_key`(`user_id`, `resource_id`, `action_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_role_scopes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `scope` ENUM('own', 'team', 'branch', 'department', 'global') NOT NULL,

    INDEX `rbac_role_scopes_role_id_idx`(`role_id`),
    UNIQUE INDEX `rbac_role_scopes_role_id_resource_id_key`(`role_id`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_user_id` INTEGER NULL,
    `action` VARCHAR(60) NOT NULL,
    `target_type` VARCHAR(40) NULL,
    `target_id` VARCHAR(60) NULL,
    `detail` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rbac_audit_log_created_at_idx`(`created_at`),
    INDEX `rbac_audit_log_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(60) NOT NULL,
    `entity_id` VARCHAR(60) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `actor_user_id` INTEGER NULL,
    `actor_name` VARCHAR(150) NULL,
    `branch_id` INTEGER NULL,
    `before_json` JSON NULL,
    `after_json` JSON NULL,
    `changed_fields` JSON NULL,
    `reason` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_audit_log_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `business_audit_log_created_at_idx`(`created_at`),
    INDEX `business_audit_log_actor_user_id_idx`(`actor_user_id`),
    INDEX `business_audit_log_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `automation_workflows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(60) NOT NULL,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NULL,
    `trigger_type` ENUM('subscription_expired', 'subscription_expiring_soon', 'subscription_renewed', 'member_checked_in', 'payment_outstanding', 'manual') NOT NULL,
    `trigger_config` JSON NULL,
    `conditions` JSON NULL,
    `actions` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `automation_workflows_key_key`(`key`),
    INDEX `automation_workflows_trigger_type_is_active_idx`(`trigger_type`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `automation_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `trigger_type` ENUM('subscription_expired', 'subscription_expiring_soon', 'subscription_renewed', 'member_checked_in', 'payment_outstanding', 'manual') NOT NULL,
    `entity_type` VARCHAR(60) NULL,
    `entity_id` VARCHAR(60) NULL,
    `status` VARCHAR(20) NOT NULL,
    `detail` JSON NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `automation_runs_workflow_id_idx`(`workflow_id`),
    INDEX `automation_runs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_type` VARCHAR(60) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `member_id` INTEGER NULL,
    `subscription_id` INTEGER NULL,
    `assigned_to` INTEGER NULL,
    `status` ENUM('open', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
    `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `due_date` VARCHAR(10) NULL,
    `branch_id` INTEGER NULL,
    `workflow_run_id` INTEGER NULL,
    `closed_at` DATETIME(3) NULL,
    `closed_reason` VARCHAR(255) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `staff_tasks_member_id_idx`(`member_id`),
    INDEX `staff_tasks_subscription_id_idx`(`subscription_id`),
    INDEX `staff_tasks_status_idx`(`status`),
    INDEX `staff_tasks_assigned_to_idx`(`assigned_to`),
    INDEX `staff_tasks_branch_id_idx`(`branch_id`),
    INDEX `staff_tasks_task_type_status_idx`(`task_type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NULL,
    `kind` ENUM('competition', 'challenge', 'workshop', 'bootcamp', 'seminar', 'open_day', 'community', 'kids_activity', 'campaign') NOT NULL,
    `color` VARCHAR(20) NULL,
    `icon` VARCHAR(50) NULL,
    `show_in_app` BOOLEAN NOT NULL DEFAULT true,
    `requires_approval` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_number` VARCHAR(30) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `cover_image` VARCHAR(255) NULL,
    `category_id` INTEGER NOT NULL,
    `kind` ENUM('competition', 'challenge', 'workshop', 'bootcamp', 'seminar', 'open_day', 'community', 'kids_activity', 'campaign') NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `hall_id` INTEGER NULL,
    `venue_name` VARCHAR(200) NULL,
    `start_date` VARCHAR(10) NOT NULL,
    `end_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(8) NULL,
    `end_time` VARCHAR(8) NULL,
    `registration_opens` VARCHAR(10) NULL,
    `registration_closes` VARCHAR(10) NULL,
    `registration_paused` BOOLEAN NOT NULL DEFAULT false,
    `max_capacity` INTEGER NOT NULL DEFAULT 0,
    `waitlist_capacity` INTEGER NOT NULL DEFAULT 0,
    `visibility` ENUM('internal', 'members', 'public') NOT NULL DEFAULT 'members',
    `status` ENUM('draft', 'pending_approval', 'approved', 'rejected', 'published', 'ongoing', 'completed', 'closed', 'cancelled') NOT NULL DEFAULT 'draft',
    `is_free` BOOLEAN NOT NULL DEFAULT false,
    `allow_guests` BOOLEAN NOT NULL DEFAULT false,
    `requires_active_subscription` BOOLEAN NOT NULL DEFAULT true,
    `min_age` INTEGER NULL,
    `max_age` INTEGER NULL,
    `requires_guardian_consent` BOOLEAN NOT NULL DEFAULT false,
    `campaign_tag` VARCHAR(100) NULL,
    `show_in_app` BOOLEAN NOT NULL DEFAULT false,
    `registrations_count` INTEGER NOT NULL DEFAULT 0,
    `attended_count` INTEGER NOT NULL DEFAULT 0,
    `closing_notes` TEXT NULL,
    `closed_by` INTEGER NULL,
    `closed_at` DATETIME(3) NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `cancel_reason` TEXT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_events_event_number_key`(`event_number`),
    INDEX `club_events_branch_id_idx`(`branch_id`),
    INDEX `club_events_status_idx`(`status`),
    INDEX `club_events_kind_idx`(`kind`),
    INDEX `club_events_start_date_idx`(`start_date`),
    INDEX `club_events_branch_id_status_is_deleted_idx`(`branch_id`, `status`, `is_deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `title` VARCHAR(200) NULL,
    `session_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(8) NOT NULL,
    `end_time` VARCHAR(8) NOT NULL,
    `hall_id` INTEGER NULL,
    `trainer_id` INTEGER NULL,
    `max_capacity` INTEGER NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('scheduled', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_event_sessions_event_id_idx`(`event_id`),
    INDEX `club_event_sessions_session_date_idx`(`session_date`),
    INDEX `club_event_sessions_trainer_id_idx`(`trainer_id`),
    INDEX `club_event_sessions_hall_id_session_date_idx`(`hall_id`, `session_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_ticket_tiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `audience` ENUM('member', 'guest', 'lead') NULL,
    `min_age` INTEGER NULL,
    `max_age` INTEGER NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `early_bird_price` DECIMAL(10, 2) NULL,
    `early_bird_until` VARCHAR(10) NULL,
    `capacity` INTEGER NULL,
    `sales_from` VARCHAR(10) NULL,
    `sales_until` VARCHAR(10) NULL,
    `members_only` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_event_ticket_tiers_event_id_idx`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_registrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registration_number` VARCHAR(30) NOT NULL,
    `event_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `tier_id` INTEGER NULL,
    `registrant_type` ENUM('member', 'guest', 'lead') NOT NULL DEFAULT 'member',
    `member_id` INTEGER NULL,
    `guest_name` VARCHAR(200) NULL,
    `guest_phone` VARCHAR(20) NULL,
    `guest_email` VARCHAR(150) NULL,
    `lead_source` VARCHAR(100) NULL,
    `converted_member_id` INTEGER NULL,
    `branch_id` INTEGER NOT NULL,
    `status` ENUM('pending_payment', 'confirmed', 'waitlisted', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending_payment',
    `waitlist_position` INTEGER NULL,
    `hold_expires_at` DATETIME(3) NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `checkin_code` VARCHAR(40) NOT NULL,
    `participant_dob` VARCHAR(10) NULL,
    `guardian_name` VARCHAR(200) NULL,
    `guardian_phone` VARCHAR(20) NULL,
    `guardian_relation` VARCHAR(50) NULL,
    `consent_signed` BOOLEAN NOT NULL DEFAULT false,
    `consent_file` VARCHAR(255) NULL,
    `emergency_phone` VARCHAR(20) NULL,
    `channel` VARCHAR(20) NULL,
    `no_show` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `club_event_registrations_registration_number_key`(`registration_number`),
    UNIQUE INDEX `club_event_registrations_checkin_code_key`(`checkin_code`),
    INDEX `club_event_registrations_event_id_idx`(`event_id`),
    INDEX `club_event_registrations_member_id_idx`(`member_id`),
    INDEX `club_event_registrations_branch_id_idx`(`branch_id`),
    INDEX `club_event_registrations_status_idx`(`status`),
    INDEX `club_event_registrations_event_id_status_idx`(`event_id`, `status`),
    UNIQUE INDEX `uq_event_member_session`(`event_id`, `member_id`, `session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_number` VARCHAR(30) NOT NULL,
    `registration_id` INTEGER NOT NULL,
    `event_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `type` ENUM('payment', 'refund') NOT NULL DEFAULT 'payment',
    `amount` DECIMAL(10, 2) NOT NULL,
    `payment_method` ENUM('cash', 'card', 'bank', 'online', 'visa', 'transfer', 'wallet') NULL,
    `payment_date` VARCHAR(10) NOT NULL,
    `status` ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
    `refund_of_id` INTEGER NULL,
    `idempotency_key` VARCHAR(64) NULL,
    `description` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `club_event_payments_payment_number_key`(`payment_number`),
    INDEX `club_event_payments_registration_id_idx`(`registration_id`),
    INDEX `club_event_payments_event_id_idx`(`event_id`),
    INDEX `club_event_payments_branch_id_payment_date_idx`(`branch_id`, `payment_date`),
    UNIQUE INDEX `uq_payment_reg_idem`(`registration_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_checkins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registration_id` INTEGER NOT NULL,
    `event_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `method` ENUM('qr', 'member_code', 'manual') NOT NULL DEFAULT 'qr',
    `checked_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checked_by` INTEGER NULL,

    INDEX `club_event_checkins_event_id_idx`(`event_id`),
    INDEX `club_event_checkins_session_id_idx`(`session_id`),
    UNIQUE INDEX `uq_checkin_reg_session`(`registration_id`, `session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `trainer_id` INTEGER NULL,
    `employee_id` INTEGER NULL,
    `external_name` VARCHAR(200) NULL,
    `external_phone` VARCHAR(20) NULL,
    `role` ENUM('lead_instructor', 'assistant', 'judge', 'coordinator', 'support') NOT NULL DEFAULT 'support',
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_event_staff_event_id_idx`(`event_id`),
    INDEX `club_event_staff_trainer_id_idx`(`trainer_id`),
    INDEX `club_event_staff_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `refund_window_days` INTEGER NOT NULL DEFAULT 3,
    `waitlist_hold_hours` INTEGER NOT NULL DEFAULT 24,
    `approval_budget_threshold` DECIMAL(10, 2) NULL,
    `reminder_hours_before` INTEGER NOT NULL DEFAULT 24,
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prc_purchase_return_items` ADD CONSTRAINT `prc_purchase_return_items_purchase_return_id_fkey` FOREIGN KEY (`purchase_return_id`) REFERENCES `prc_purchase_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_requisition_items` ADD CONSTRAINT `prc_requisition_items_requisition_id_fkey` FOREIGN KEY (`requisition_id`) REFERENCES `prc_requisitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_rfq_items` ADD CONSTRAINT `prc_rfq_items_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `prc_rfqs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_quotations` ADD CONSTRAINT `prc_quotations_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `prc_rfqs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_purchase_orders` ADD CONSTRAINT `prc_purchase_orders_requisition_id_fkey` FOREIGN KEY (`requisition_id`) REFERENCES `prc_requisitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_purchase_order_items` ADD CONSTRAINT `prc_purchase_order_items_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `prc_purchase_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_goods_receipts` ADD CONSTRAINT `prc_goods_receipts_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `prc_purchase_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_goods_receipt_items` ADD CONSTRAINT `prc_goods_receipt_items_goods_receipt_id_fkey` FOREIGN KEY (`goods_receipt_id`) REFERENCES `prc_goods_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_purchase_invoices` ADD CONSTRAINT `prc_purchase_invoices_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `prc_purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_purchase_invoices` ADD CONSTRAINT `prc_purchase_invoices_goods_receipt_id_fkey` FOREIGN KEY (`goods_receipt_id`) REFERENCES `prc_goods_receipts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_purchase_invoice_items` ADD CONSTRAINT `prc_purchase_invoice_items_purchase_invoice_id_fkey` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `prc_purchase_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_supplier_payment_schedules` ADD CONSTRAINT `prc_supplier_payment_schedules_purchase_invoice_id_fkey` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `prc_purchase_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_debit_note_items` ADD CONSTRAINT `prc_debit_note_items_debit_note_id_fkey` FOREIGN KEY (`debit_note_id`) REFERENCES `prc_debit_notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_supplier_invoice_items` ADD CONSTRAINT `prc_supplier_invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `prc_supplier_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prc_supplier_payments` ADD CONSTRAINT `prc_supplier_payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `prc_supplier_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acc_accounts` ADD CONSTRAINT `acc_accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `acc_accounts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `acc_journal_entries` ADD CONSTRAINT `acc_journal_entries_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `acc_journal_entries`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `acc_journal_entry_lines` ADD CONSTRAINT `acc_journal_entry_lines_entry_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `acc_journal_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acc_journal_entry_lines` ADD CONSTRAINT `acc_journal_entry_lines_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_exercises` ADD CONSTRAINT `am_exercises_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `am_exercise_categories`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_page_id_fk_fkey` FOREIGN KEY (`page_id_fk`) REFERENCES `pages`(`page_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_app_user_id_fkey` FOREIGN KEY (`app_user_id`) REFERENCES `api_users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `emp_files` ADD CONSTRAINT `emp_files_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hr_finance_employes` ADD CONSTRAINT `hr_finance_employes_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employees_branches` ADD CONSTRAINT `employees_branches_emp_id_fk_fkey` FOREIGN KEY (`emp_id_fk`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hr_emp_dwam` ADD CONSTRAINT `hr_emp_dwam_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hr_emp_dwam_details` ADD CONSTRAINT `hr_emp_dwam_details_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_members` ADD CONSTRAINT `club_members_membership_type_id_fkey` FOREIGN KEY (`membership_type_id`) REFERENCES `club_membership_types`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_attendance` ADD CONSTRAINT `club_attendance_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscriptions` ADD CONSTRAINT `club_subscriptions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscriptions` ADD CONSTRAINT `club_subscriptions_subscription_type_id_fkey` FOREIGN KEY (`subscription_type_id`) REFERENCES `club_subscription_types`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_receipts` ADD CONSTRAINT `club_receipts_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_receipts` ADD CONSTRAINT `club_receipts_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cafe_products` ADD CONSTRAINT `cafe_products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `inv_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cafe_product_recipes` ADD CONSTRAINT `cafe_product_recipes_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `cafe_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cafe_product_recipes` ADD CONSTRAINT `cafe_product_recipes_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscription_refunds` ADD CONSTRAINT `club_subscription_refunds_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscription_refunds` ADD CONSTRAINT `club_subscription_refunds_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscription_freezes` ADD CONSTRAINT `club_subscription_freezes_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscription_transfers` ADD CONSTRAINT `club_subscription_transfers_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_subscription_transfers` ADD CONSTRAINT `club_subscription_transfers_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_locker_subscriptions` ADD CONSTRAINT `club_locker_subscriptions_locker_id_fkey` FOREIGN KEY (`locker_id`) REFERENCES `club_lockers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_locker_subscriptions` ADD CONSTRAINT `club_locker_subscriptions_subscription_type_id_fkey` FOREIGN KEY (`subscription_type_id`) REFERENCES `club_locker_subscription_types`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_locker_subscriptions` ADD CONSTRAINT `club_locker_subscriptions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_trainer_salaries` ADD CONSTRAINT `club_trainer_salaries_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_hall_bookings` ADD CONSTRAINT `club_hall_bookings_hall_id_fkey` FOREIGN KEY (`hall_id`) REFERENCES `club_halls`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_classes` ADD CONSTRAINT `club_classes_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_classes` ADD CONSTRAINT `club_classes_hall_id_fkey` FOREIGN KEY (`hall_id`) REFERENCES `club_halls`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_class_enrollments` ADD CONSTRAINT `club_class_enrollments_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `club_classes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_class_waitlist` ADD CONSTRAINT `club_class_waitlist_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `club_classes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_endpoint_id_fkey` FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_spa_bookings` ADD CONSTRAINT `club_spa_bookings_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `club_spa_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_spa_invoices` ADD CONSTRAINT `club_spa_invoices_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `club_spa_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_equipment` ADD CONSTRAINT `club_equipment_facility_id_fkey` FOREIGN KEY (`facility_id`) REFERENCES `club_facilities`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_equipment_maintenance` ADD CONSTRAINT `club_equipment_maintenance_equipment_id_fkey` FOREIGN KEY (`equipment_id`) REFERENCES `club_equipment`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_categories` ADD CONSTRAINT `inv_categories_parent_category_id_fkey` FOREIGN KEY (`parent_category_id`) REFERENCES `inv_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_sub_categories` ADD CONSTRAINT `inv_sub_categories_main_category_id_fkey` FOREIGN KEY (`main_category_id`) REFERENCES `inv_main_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_product_storages` ADD CONSTRAINT `inv_product_storages_storage_id_fkey` FOREIGN KEY (`storage_id`) REFERENCES `inv_storages`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_product_storages` ADD CONSTRAINT `inv_product_storages_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_unit_conversions` ADD CONSTRAINT `inv_unit_conversions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `inv_unit_templates`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_products` ADD CONSTRAINT `inv_products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `inv_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_products` ADD CONSTRAINT `inv_products_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `inv_brands`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_products` ADD CONSTRAINT `inv_products_manufacturer_id_fkey` FOREIGN KEY (`manufacturer_id`) REFERENCES `inv_manufacturers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_products` ADD CONSTRAINT `inv_products_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `inv_suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_products` ADD CONSTRAINT `inv_products_unit_template_id_fkey` FOREIGN KEY (`unit_template_id`) REFERENCES `inv_unit_templates`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_spare_parts` ADD CONSTRAINT `inv_spare_parts_main_category_id_fkey` FOREIGN KEY (`main_category_id`) REFERENCES `inv_main_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_spare_parts` ADD CONSTRAINT `inv_spare_parts_sub_category_id_fkey` FOREIGN KEY (`sub_category_id`) REFERENCES `inv_sub_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_spare_parts` ADD CONSTRAINT `inv_spare_parts_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `inv_suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_composite_items` ADD CONSTRAINT `inv_composite_items_composite_product_id_fkey` FOREIGN KEY (`composite_product_id`) REFERENCES `inv_composite_products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_composite_items` ADD CONSTRAINT `inv_composite_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_service_consumables` ADD CONSTRAINT `inv_service_consumables_consumable_id_fkey` FOREIGN KEY (`consumable_id`) REFERENCES `inv_consumables`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_stock_balances` ADD CONSTRAINT `inv_stock_balances_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_stock_balances` ADD CONSTRAINT `inv_stock_balances_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `inv_warehouses`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_product_branches` ADD CONSTRAINT `inv_product_branches_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_movements` ADD CONSTRAINT `inv_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `inv_products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_movements` ADD CONSTRAINT `inv_movements_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `inv_warehouses`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_movements` ADD CONSTRAINT `inv_movements_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `inv_transactions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_transaction_items` ADD CONSTRAINT `inv_transaction_items_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `inv_transactions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_count_items` ADD CONSTRAINT `inv_count_items_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `inv_count_sessions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inv_adjustments` ADD CONSTRAINT `inv_adjustments_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `inv_count_sessions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sales_shift_sessions` ADD CONSTRAINT `sales_shift_sessions_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `sales_shifts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sales_quick_sales` ADD CONSTRAINT `sales_quick_sales_shift_session_id_fkey` FOREIGN KEY (`shift_session_id`) REFERENCES `sales_shift_sessions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sales_quick_sale_items` ADD CONSTRAINT `sales_quick_sale_items_quick_sale_id_fkey` FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_pos_payments` ADD CONSTRAINT `sales_pos_payments_quick_sale_id_fkey` FOREIGN KEY (`quick_sale_id`) REFERENCES `sales_quick_sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_resources` ADD CONSTRAINT `rbac_resources_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `rbac_resources`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rbac_resource_actions` ADD CONSTRAINT `rbac_resource_actions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_resource_actions` ADD CONSTRAINT `rbac_resource_actions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_roles` ADD CONSTRAINT `rbac_user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_exceptions` ADD CONSTRAINT `rbac_user_exceptions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_exceptions` ADD CONSTRAINT `rbac_user_exceptions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_scopes` ADD CONSTRAINT `rbac_role_scopes_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_scopes` ADD CONSTRAINT `rbac_role_scopes_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_runs` ADD CONSTRAINT `automation_runs_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `automation_workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_events` ADD CONSTRAINT `club_events_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `club_event_categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_sessions` ADD CONSTRAINT `club_event_sessions_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_sessions` ADD CONSTRAINT `club_event_sessions_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_ticket_tiers` ADD CONSTRAINT `club_event_ticket_tiers_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_tier_id_fkey` FOREIGN KEY (`tier_id`) REFERENCES `club_event_ticket_tiers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_payments` ADD CONSTRAINT `club_event_payments_registration_id_fkey` FOREIGN KEY (`registration_id`) REFERENCES `club_event_registrations`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_checkins` ADD CONSTRAINT `club_event_checkins_registration_id_fkey` FOREIGN KEY (`registration_id`) REFERENCES `club_event_registrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_checkins` ADD CONSTRAINT `club_event_checkins_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `club_event_sessions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_staff` ADD CONSTRAINT `club_event_staff_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_staff` ADD CONSTRAINT `club_event_staff_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_staff` ADD CONSTRAINT `club_event_staff_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

