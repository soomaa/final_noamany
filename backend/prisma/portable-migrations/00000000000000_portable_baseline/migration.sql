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
CREATE TABLE `attendance_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(20) NOT NULL,
    `enabled` TINYINT NOT NULL DEFAULT 1,
    `label` VARCHAR(50) NULL,

    UNIQUE INDEX `attendance_channels_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_device_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `device_id` INTEGER NOT NULL,
    `provider_event_id` VARCHAR(120) NOT NULL,
    `employee_code` INTEGER NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `event_type` VARCHAR(8) NOT NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'received',
    `attendance_record_id` INTEGER NULL,
    `error_code` VARCHAR(60) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    INDEX `idx_attendance_device_events_occurred`(`device_id`, `occurred_at`),
    INDEX `idx_attendance_device_events_status`(`status`, `received_at`),
    UNIQUE INDEX `uq_attendance_device_provider_event`(`device_id`, `provider_event_id`),
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
    `credential_hash` CHAR(64) NULL,
    `credential_rotated_at` DATETIME(3) NULL,

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
CREATE TABLE `banks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bank_name` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
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
    `correlation_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_audit_log_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `business_audit_log_created_at_idx`(`created_at`),
    INDEX `business_audit_log_actor_user_id_idx`(`actor_user_id`),
    INDEX `business_audit_log_branch_id_idx`(`branch_id`),
    INDEX `business_audit_log_correlation_id_idx`(`correlation_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `contract_employe_emp_code_key`(`emp_code`),
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
CREATE TABLE `department_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `from_id_fk` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 0,
    `in_order` VARCHAR(255) NOT NULL DEFAULT '0',
    `dep_code` INTEGER NULL,
    `edara_id` INTEGER NULL,
    `is_trainer` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
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
CREATE TABLE `document_number_series` (
    `series_key` VARCHAR(80) NOT NULL,
    `next_value` BIGINT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`series_key`)
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
CREATE TABLE `emp_custody_transfer_operations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `custody_id_fk` INTEGER NOT NULL,
    `from_emp_code` INTEGER NOT NULL,
    `to_emp_code` INTEGER NOT NULL,
    `date` INTEGER NOT NULL,
    `date_ar` VARCHAR(20) NOT NULL,
    `date_s` INTEGER NOT NULL,
    `publisher` VARCHAR(100) NOT NULL,

    INDEX `emp_custody_transfer_operations_custody_id_fk_idx`(`custody_id_fk`),
    INDEX `emp_custody_transfer_operations_from_emp_code_idx`(`from_emp_code`),
    INDEX `emp_custody_transfer_operations_to_emp_code_idx`(`to_emp_code`),
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
    `employment_type` VARCHAR(20) NULL,
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
    `previous_experience` TEXT NULL,
    `skills` TEXT NULL,
    `languages` TEXT NULL,
    `marital_status` INTEGER NULL,
    `national_address` VARCHAR(255) NULL,
    `basic_salary` DECIMAL(19, 2) NULL,
    `app_user_id` INTEGER NULL,

    INDEX `employees_app_user_id_idx`(`app_user_id`),
    UNIQUE INDEX `employees_emp_code_key`(`emp_code`),
    PRIMARY KEY (`id`)
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
    `is_paid` BOOLEAN NOT NULL DEFAULT true,
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

    INDEX `hr_agz_emp_year_status_idx`(`emp_code_fk`, `year`, `suspend`, `f2a_agaza`),
    INDEX `hr_agz_emp_date_range_idx`(`emp_code_fk`, `agaza_from_date_m`, `agaza_to_date_m`),
    INDEX `hr_agz_assignee_status_idx`(`current_to_user_id`, `suspend`),
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

    INDEX `hr_all_ozonat_orders_current_to_user_id_suspend_idx`(`current_to_user_id`, `suspend`),
    INDEX `hr_all_ozonat_orders_emp_code_fk_ezn_date_ar_idx`(`emp_code_fk`, `ezn_date_ar`),
    INDEX `hr_all_ozonat_orders_emp_code_fk_ezn_date_idx`(`emp_code_fk`, `ezn_date`),
    INDEX `hr_all_ozonat_orders_emp_id_fk_no3_ezn_ezn_month_ezn_year_idx`(`emp_id_fk`, `no3_ezn`, `ezn_month`, `ezn_year`),
    INDEX `hr_all_ozonat_orders_suspend_idx`(`suspend`),
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
CREATE TABLE `hr_dwrat_job_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `dawra` VARCHAR(255) NULL,
    `place` VARCHAR(255) NULL,
    `date_from` VARCHAR(50) NULL,
    `date_to` VARCHAR(50) NULL,
    `specialized` VARCHAR(255) NULL,
    `img` VARCHAR(500) NULL,

    INDEX `hr_dwrat_job_orders_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
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
CREATE TABLE `hr_evaluation_setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NULL,
    `from_id` INTEGER NULL,
    `degree` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_final_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_number` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `employee_code` INTEGER NULL,
    `employee_name` VARCHAR(200) NOT NULL,
    `branch_id` INTEGER NULL,
    `termination_date` DATE NOT NULL,
    `service_start_date` DATE NOT NULL,
    `service_years` DECIMAL(12, 6) NOT NULL,
    `policy_id` INTEGER NOT NULL,
    `policy_version` VARCHAR(80) NOT NULL,
    `tax_policy_id` INTEGER NOT NULL,
    `tax_policy_version` VARCHAR(80) NOT NULL,
    `worked_period_gross` DECIMAL(19, 2) NOT NULL,
    `worked_period_deductions_before_tax_loan` DECIMAL(19, 2) NOT NULL,
    `employee_insurance` DECIMAL(19, 2) NOT NULL,
    `employer_insurance` DECIMAL(19, 2) NOT NULL,
    `unused_leave_days` DECIMAL(10, 4) NOT NULL,
    `unused_leave_compensation` DECIMAL(19, 2) NOT NULL,
    `end_of_service_benefit` DECIMAL(19, 2) NOT NULL,
    `other_earnings` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `loan_recovery` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `other_deductions` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `income_tax` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `gross_entitlements` DECIMAL(19, 2) NOT NULL,
    `total_deductions` DECIMAL(19, 2) NOT NULL,
    `net_payable` DECIMAL(19, 2) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `calculation_snapshot` JSON NOT NULL,
    `reason` VARCHAR(500) NULL,
    `created_by` INTEGER NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `posted_by` INTEGER NULL,
    `posted_at` DATETIME(3) NULL,
    `paid_by` INTEGER NULL,
    `paid_at` DATETIME(3) NULL,
    `bank_reference` VARCHAR(150) NULL,
    `payment_snapshot` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_hr_final_settlement_number`(`settlement_number`),
    INDEX `idx_hr_final_settlement_status_date`(`status`, `termination_date`),
    UNIQUE INDEX `uq_hr_final_settlement_employee_termination`(`employee_id`, `termination_date`),
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
CREATE TABLE `hr_interview_degree` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `item_id_fk` VARCHAR(50) NULL,
    `item_degree` VARCHAR(50) NULL,
    `publisher` VARCHAR(255) NULL,
    `date` VARCHAR(20) NULL,
    `date_ar` VARCHAR(20) NULL,

    INDEX `hr_interview_degree_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_interview_degree_adv_disadv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` INTEGER NOT NULL,
    `title` TEXT NULL,
    `type` VARCHAR(10) NULL,

    INDEX `hr_interview_degree_adv_disadv_job_request_ordered_fk_type_idx`(`job_request_ordered_fk`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_job_orders_offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `salaray` VARCHAR(50) NULL,
    `bdl_sakn` VARCHAR(50) NULL,
    `bdl_moslat` VARCHAR(50) NULL,
    `medical_insurance` VARCHAR(50) NULL,
    `contract_peroid` VARCHAR(50) NULL,
    `contract_type_fk` VARCHAR(50) NULL,
    `demo_days` VARCHAR(50) NULL,
    `yearly_vacation` VARCHAR(50) NULL,
    `other` TEXT NULL,
    `notes` TEXT NULL,
    `date` VARCHAR(20) NULL,
    `date_ar` VARCHAR(20) NULL,
    `publisher` VARCHAR(255) NULL,
    `suspend` VARCHAR(10) NULL,

    UNIQUE INDEX `hr_job_orders_offers_job_request_ordered_fk_key`(`job_request_ordered_fk`),
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
    `egmali_tamin_hesa_oner` DECIMAL(19, 2) NULL,
    `egmali_khasm_solaf` DECIMAL(19, 2) NULL,
    `egmali_tot_okraa_khasm` DECIMAL(19, 2) NULL,
    `egmali_total_khsomat` DECIMAL(19, 2) NULL,
    `egmali_safi` DECIMAL(19, 2) NULL,
    `tax_policy_id` INTEGER NULL,
    `tax_policy_version` VARCHAR(80) NULL,
    `tax_policy_snapshot` JSON NULL,
    `egmali_income_tax` DECIMAL(19, 2) NULL,
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
    UNIQUE INDEX `uq_hr_mosayer_period`(`mosayer_year`, `mosayer_month`),
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
    `tamin_hesa_oner` DECIMAL(19, 2) NULL,
    `khasm_solaf` DECIMAL(19, 2) NULL,
    `tot_okraa_khasm` DECIMAL(19, 2) NULL,
    `total_khsomat` DECIMAL(19, 2) NULL,
    `safi` DECIMAL(19, 2) NULL,
    `taxable_earnings` DECIMAL(19, 2) NULL,
    `income_tax` DECIMAL(19, 2) NULL,
    `tax_policy_id` INTEGER NULL,
    `tax_policy_version` VARCHAR(80) NULL,
    `tax_breakdown` JSON NULL,
    `calculation_snapshot` JSON NULL,
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
CREATE TABLE `hr_persons_job_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `job` VARCHAR(255) NULL,
    `job_name` VARCHAR(255) NULL,
    `job_place` VARCHAR(255) NULL,
    `mob` VARCHAR(50) NULL,

    INDEX `hr_persons_job_orders_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_previous_work_job_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `company_name` VARCHAR(255) NULL,
    `job_id_title_fk` VARCHAR(50) NULL,
    `date_from` VARCHAR(50) NULL,
    `date_to` VARCHAR(50) NULL,
    `job_mission` TEXT NULL,
    `salary` VARCHAR(50) NULL,
    `leave_work_reason` TEXT NULL,

    INDEX `hr_previous_work_job_orders_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_qualification_job_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `degree_id_fk` VARCHAR(50) NULL,
    `qualification_id_fk` VARCHAR(50) NULL,
    `school` VARCHAR(255) NULL,
    `specialied` VARCHAR(255) NULL,
    `year` VARCHAR(20) NULL,
    `taqder` VARCHAR(100) NULL,
    `img` VARCHAR(500) NULL,

    INDEX `hr_qualification_job_orders_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_request_effects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `effect_type` VARCHAR(30) NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `snapshot_json` JSON NOT NULL,
    `result_json` JSON NOT NULL,
    `applied_by` INTEGER NOT NULL,
    `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `hr_request_effects_request_id_key`(`request_id`),
    INDEX `hr_request_effects_employee_id_applied_at_idx`(`employee_id`, `applied_at`),
    INDEX `hr_request_effects_effect_type_applied_at_idx`(`effect_type`, `applied_at`),
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
CREATE TABLE `hr_skills_job_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_request_ordered_fk` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NULL,
    `details` TEXT NULL,
    `efficiency_id_fk` VARCHAR(50) NULL,

    INDEX `hr_skills_job_orders_job_request_ordered_fk_idx`(`job_request_ordered_fk`),
    PRIMARY KEY (`id`)
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
    `pipeline_status` VARCHAR(32) NOT NULL DEFAULT 'applied',
    `status_reason` TEXT NULL,
    `status_changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `accepted_at` DATETIME(3) NULL,
    `accepted_by` INTEGER NULL,
    `converted_employee_id` INTEGER NULL,
    `converted_at` DATETIME(3) NULL,

    INDEX `idx_job_request_orders_pipeline_status`(`pipeline_status`, `status_changed_at`),
    UNIQUE INDEX `uq_job_request_orders_converted_employee`(`converted_employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_carryover_runs` (
    `target_year` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `initiated_by` INTEGER NULL,

    PRIMARY KEY (`target_year`)
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
CREATE TABLE `payroll_period_controls` (
    `period_key` VARCHAR(7) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`period_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_settlement_benefit_tiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `lower_years` DECIMAL(10, 6) NOT NULL,
    `upper_years` DECIMAL(10, 6) NULL,
    `salary_months_per_year` DECIMAL(10, 6) NOT NULL,

    UNIQUE INDEX `uq_payroll_settlement_tier_order`(`policy_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_settlement_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(60) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `jurisdiction` VARCHAR(80) NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `benefit_base` VARCHAR(30) NOT NULL DEFAULT 'basic',
    `leave_day_divisor` INTEGER NOT NULL DEFAULT 30,
    `max_compensated_leave_days` DECIMAL(10, 4) NULL,
    `benefit_taxable` BOOLEAN NOT NULL DEFAULT false,
    `leave_taxable` BOOLEAN NOT NULL DEFAULT false,
    `recover_all_outstanding_loans` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `source_reference` VARCHAR(500) NULL,
    `created_by` INTEGER NULL,
    `published_by` INTEGER NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_payroll_settlement_policy_effective_status`(`effective_from`, `effective_to`, `status`),
    UNIQUE INDEX `uq_payroll_settlement_policy_code_version`(`code`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_tax_brackets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `lower_bound` DECIMAL(19, 2) NOT NULL,
    `upper_bound` DECIMAL(19, 2) NULL,
    `rate_percent` DECIMAL(7, 4) NOT NULL,

    INDEX `idx_payroll_tax_bracket_policy`(`policy_id`),
    UNIQUE INDEX `uq_payroll_tax_bracket_order`(`policy_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_tax_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(60) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `jurisdiction` VARCHAR(80) NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `annual_allowance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `annual_tax_credit` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `periods_per_year` INTEGER NOT NULL DEFAULT 12,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `source_reference` VARCHAR(500) NULL,
    `created_by` INTEGER NULL,
    `published_by` INTEGER NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_payroll_tax_policy_effective_status`(`effective_from`, `effective_to`, `status`),
    UNIQUE INDEX `uq_payroll_tax_policy_code_version`(`code`, `version`),
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
CREATE TABLE `permissions` (
    `user_id` INTEGER NOT NULL,
    `page_id_fk` INTEGER NOT NULL,
    `page_level` INTEGER NOT NULL,

    INDEX `permissions_page_id_fk_idx`(`page_id_fk`),
    PRIMARY KEY (`user_id`, `page_id_fk`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `private_file_metadata` (
    `id` CHAR(36) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `byte_size` BIGINT NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `owner_employee_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `uploaded_by` INTEGER NOT NULL,
    `validation_status` VARCHAR(30) NOT NULL DEFAULT 'validated',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `retention_until` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` INTEGER NULL,

    UNIQUE INDEX `private_file_metadata_storage_key_key`(`storage_key`),
    INDEX `private_file_metadata_category_created_at_idx`(`category`, `created_at`),
    INDEX `private_file_metadata_owner_employee_id_deleted_at_idx`(`owner_employee_id`, `deleted_at`),
    INDEX `private_file_metadata_branch_id_deleted_at_idx`(`branch_id`, `deleted_at`),
    INDEX `private_file_metadata_uploaded_by_created_at_idx`(`uploaded_by`, `created_at`),
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
CREATE TABLE `rbac_resource_actions` (
    `resource_id` INTEGER NOT NULL,
    `action_id` INTEGER NOT NULL,

    INDEX `rbac_resource_actions_action_id_idx`(`action_id`),
    PRIMARY KEY (`resource_id`, `action_id`)
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
CREATE TABLE `staff_auth_sessions` (
    `id` CHAR(36) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revocation_reason` VARCHAR(100) NULL,
    `replaced_by` CHAR(36) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,

    UNIQUE INDEX `staff_auth_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `staff_auth_sessions_user_id_revoked_at_expires_at_idx`(`user_id`, `revoked_at`, `expires_at`),
    INDEX `staff_auth_sessions_family_id_revoked_at_idx`(`family_id`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_branches` (
    `branch_id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_name` VARCHAR(50) NULL,
    `from_id` INTEGER NOT NULL,

    PRIMARY KEY (`branch_id`)
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
CREATE TABLE `tbl_hdoor_emps` (
    `hodoor_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_code` INTEGER NULL,
    `employee_id` INTEGER NULL,
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

    INDEX `tbl_hdoor_emps_action_date_idx`(`action_date`),
    INDEX `tbl_hdoor_emps_action_date_s_idx`(`action_date_s`),
    INDEX `tbl_hdoor_emps_branch_id_fk_action_date_idx`(`branch_id_fk`, `action_date`),
    INDEX `tbl_hdoor_emps_branch_id_fk_action_date_s_idx`(`branch_id_fk`, `action_date_s`),
    INDEX `tbl_hdoor_emps_employee_code_action_date_idx`(`employee_code`, `action_date`),
    INDEX `tbl_hdoor_emps_employee_code_action_date_s_idx`(`employee_code`, `action_date_s`),
    PRIMARY KEY (`hodoor_id`)
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
CREATE TABLE `tbl_sys_notifications_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NULL,
    `t_table` VARCHAR(100) NULL,
    `url` VARCHAR(100) NULL,
    `title` VARCHAR(100) NULL,

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

-- AddForeignKey
ALTER TABLE `attendance_device_events` ADD CONSTRAINT `fk_attendance_device_events_device` FOREIGN KEY (`device_id`) REFERENCES `attendance_devices`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `emp_files` ADD CONSTRAINT `emp_files_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_app_user_id_fkey` FOREIGN KEY (`app_user_id`) REFERENCES `api_users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employees_branches` ADD CONSTRAINT `employees_branches_emp_id_fk_fkey` FOREIGN KEY (`emp_id_fk`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hr_emp_dwam` ADD CONSTRAINT `hr_emp_dwam_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hr_finance_employes` ADD CONSTRAINT `hr_finance_employes_emp_id_fkey` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `payroll_settlement_benefit_tiers` ADD CONSTRAINT `fk_payroll_settlement_tier_policy` FOREIGN KEY (`policy_id`) REFERENCES `payroll_settlement_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_tax_brackets` ADD CONSTRAINT `fk_payroll_tax_bracket_policy` FOREIGN KEY (`policy_id`) REFERENCES `payroll_tax_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_page_id_fk_fkey` FOREIGN KEY (`page_id_fk`) REFERENCES `pages`(`page_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rbac_resource_actions` ADD CONSTRAINT `rbac_resource_actions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_resource_actions` ADD CONSTRAINT `rbac_resource_actions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_resources` ADD CONSTRAINT `rbac_resources_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `rbac_resources`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_permissions` ADD CONSTRAINT `rbac_role_permissions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_scopes` ADD CONSTRAINT `rbac_role_scopes_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_role_scopes` ADD CONSTRAINT `rbac_role_scopes_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_exceptions` ADD CONSTRAINT `rbac_user_exceptions_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `rbac_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_exceptions` ADD CONSTRAINT `rbac_user_exceptions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `rbac_actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rbac_user_roles` ADD CONSTRAINT `rbac_user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `rbac_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

