-- Human-resources partner directory with searchable codes and related phone numbers.
-- Data preserving: existing cafe partners keep their ids and legacy primary phone.

ALTER TABLE `cafe_partners`
  ADD COLUMN `partner_code` VARCHAR(30) NULL,
  ADD COLUMN `national_id` VARCHAR(30) NULL,
  ADD COLUMN `email` VARCHAR(150) NULL,
  ADD COLUMN `address` VARCHAR(255) NULL,
  ADD COLUMN `created_by` INTEGER NULL,
  ADD UNIQUE INDEX `cafe_partners_partner_code_key` (`partner_code`),
  ADD INDEX `cafe_partners_national_id_idx` (`national_id`);

UPDATE `cafe_partners`
SET `partner_code` = CONCAT('PRT-', LPAD(`id`, 5, '0'))
WHERE `partner_code` IS NULL OR TRIM(`partner_code`) = '';

CREATE TABLE `cafe_partner_phones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `partner_id` INTEGER NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `label` VARCHAR(50) NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cafe_partner_phones_partner_id_phone_key` (`partner_id`, `phone`),
  INDEX `cafe_partner_phones_phone_idx` (`phone`),
  INDEX `cafe_partner_phones_partner_id_is_primary_idx` (`partner_id`, `is_primary`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cafe_partner_phones_partner_id_fkey`
    FOREIGN KEY (`partner_id`) REFERENCES `cafe_partners` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `cafe_partner_phones` (`partner_id`, `phone`, `label`, `is_primary`, `created_at`, `updated_at`)
SELECT `id`, TRIM(`phone`), 'رئيسي', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `cafe_partners`
WHERE `phone` IS NOT NULL AND TRIM(`phone`) <> '';

INSERT INTO `rbac_resources` (`key`, `parent_id`, `type`, `name_ar`, `name_en`, `route`, `icon`, `sort_order`, `is_active`)
SELECT 'hr.partners', parent.`id`, 'page', 'الشركاء', 'Partners', '/hr/partners', NULL, 5, TRUE
FROM `rbac_resources` parent
WHERE parent.`key` = 'employees'
ON DUPLICATE KEY UPDATE `parent_id` = VALUES(`parent_id`), `name_ar` = VALUES(`name_ar`), `name_en` = VALUES(`name_en`), `route` = VALUES(`route`), `sort_order` = VALUES(`sort_order`), `is_active` = TRUE;

INSERT IGNORE INTO `rbac_resource_actions` (`resource_id`, `action_id`)
SELECT resource.`id`, action.`id`
FROM `rbac_resources` resource
CROSS JOIN `rbac_actions` action
WHERE resource.`key` = 'hr.partners'
  AND action.`key` IN ('view', 'create', 'update', 'delete', 'export', 'print', 'audit');

-- HR users who can manage employees receive the partner directory on upgrade.
-- It remains independently revocable through the permission matrix afterwards.
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `resource_id`, `action_id`, `effect`)
SELECT old_permission.`role_id`, new_resource.`id`, old_permission.`action_id`, old_permission.`effect`
FROM `rbac_role_permissions` old_permission
JOIN `rbac_resources` old_resource ON old_resource.`id` = old_permission.`resource_id` AND old_resource.`key` = 'employees.list'
JOIN `rbac_resources` new_resource ON new_resource.`key` = 'hr.partners'
JOIN `rbac_resource_actions` allowed ON allowed.`resource_id` = new_resource.`id` AND allowed.`action_id` = old_permission.`action_id`;

INSERT IGNORE INTO `rbac_user_exceptions` (`user_id`, `resource_id`, `action_id`, `effect`, `expires_at`, `reason`, `created_by`)
SELECT old_exception.`user_id`, new_resource.`id`, old_exception.`action_id`, old_exception.`effect`, old_exception.`expires_at`, old_exception.`reason`, old_exception.`created_by`
FROM `rbac_user_exceptions` old_exception
JOIN `rbac_resources` old_resource ON old_resource.`id` = old_exception.`resource_id` AND old_resource.`key` = 'employees.list'
JOIN `rbac_resources` new_resource ON new_resource.`key` = 'hr.partners'
JOIN `rbac_resource_actions` allowed ON allowed.`resource_id` = new_resource.`id` AND allowed.`action_id` = old_exception.`action_id`;
