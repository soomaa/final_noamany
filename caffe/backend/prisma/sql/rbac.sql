-- =====================================================================================
-- PHAROS Club — Enterprise RBAC tables (additive). Idempotent. Apply with:
--   mysql -uroot one80_hr < prisma/sql/rbac.sql
-- Column names/types match prisma/schema.prisma exactly so `prisma generate` clients work.
-- Legacy tables (pages, permissions, users) are NOT touched.
-- =====================================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `rbac_actions` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `key`        VARCHAR(40)  NOT NULL,
  `label_ar`   VARCHAR(80)  NOT NULL,
  `label_en`   VARCHAR(80)  NOT NULL,
  `sensitive`  TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_actions_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_resources` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `key`        VARCHAR(120) NOT NULL,
  `parent_id`  INT NULL,
  `type`       ENUM('module','group','page') NOT NULL,
  `name_ar`    VARCHAR(160) NOT NULL,
  `name_en`    VARCHAR(160) NULL,
  `route`      VARCHAR(200) NULL,
  `icon`       VARCHAR(80)  NULL,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_resources_key_key` (`key`),
  KEY `rbac_resources_parent_id_idx` (`parent_id`),
  CONSTRAINT `rbac_resources_parent_id_fkey` FOREIGN KEY (`parent_id`)
    REFERENCES `rbac_resources` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_resource_actions` (
  `resource_id` INT NOT NULL,
  `action_id`   INT NOT NULL,
  PRIMARY KEY (`resource_id`,`action_id`),
  KEY `rbac_resource_actions_action_id_idx` (`action_id`),
  CONSTRAINT `rbac_resource_actions_resource_id_fkey` FOREIGN KEY (`resource_id`)
    REFERENCES `rbac_resources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rbac_resource_actions_action_id_fkey` FOREIGN KEY (`action_id`)
    REFERENCES `rbac_actions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_roles` (
  `id`             INT NOT NULL AUTO_INCREMENT,
  `key`            VARCHAR(60)  NOT NULL,
  `name_ar`        VARCHAR(120) NOT NULL,
  `name_en`        VARCHAR(120) NULL,
  `description`    VARCHAR(255) NULL,
  `is_system`      TINYINT(1)   NOT NULL DEFAULT 0,
  `is_super_admin` TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_roles_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_role_permissions` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `role_id`     INT NOT NULL,
  `resource_id` INT NOT NULL,
  `action_id`   INT NOT NULL,
  `effect`      ENUM('allow','deny') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_role_permissions_role_id_resource_id_action_id_key` (`role_id`,`resource_id`,`action_id`),
  KEY `rbac_role_permissions_role_id_idx` (`role_id`),
  KEY `rbac_role_permissions_resource_id_idx` (`resource_id`),
  KEY `rbac_role_permissions_action_id_idx` (`action_id`),
  CONSTRAINT `rbac_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`)
    REFERENCES `rbac_roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rbac_role_permissions_resource_id_fkey` FOREIGN KEY (`resource_id`)
    REFERENCES `rbac_resources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rbac_role_permissions_action_id_fkey` FOREIGN KEY (`action_id`)
    REFERENCES `rbac_actions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_user_roles` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `user_id`    INT NOT NULL,
  `role_id`    INT NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_user_roles_user_id_role_id_key` (`user_id`,`role_id`),
  KEY `rbac_user_roles_user_id_idx` (`user_id`),
  KEY `rbac_user_roles_role_id_idx` (`role_id`),
  CONSTRAINT `rbac_user_roles_role_id_fkey` FOREIGN KEY (`role_id`)
    REFERENCES `rbac_roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_user_exceptions` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `user_id`     INT NOT NULL,
  `resource_id` INT NOT NULL,
  `action_id`   INT NOT NULL,
  `effect`      ENUM('allow','deny') NOT NULL,
  `expires_at`  DATETIME(3) NULL,
  `reason`      VARCHAR(255) NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`  INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_user_exceptions_user_id_resource_id_action_id_key` (`user_id`,`resource_id`,`action_id`),
  KEY `rbac_user_exceptions_user_id_idx` (`user_id`),
  CONSTRAINT `rbac_user_exceptions_resource_id_fkey` FOREIGN KEY (`resource_id`)
    REFERENCES `rbac_resources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rbac_user_exceptions_action_id_fkey` FOREIGN KEY (`action_id`)
    REFERENCES `rbac_actions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_role_scopes` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `role_id`     INT NOT NULL,
  `resource_id` INT NOT NULL,
  `scope`       ENUM('own','team','branch','department','global') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_role_scopes_role_id_resource_id_key` (`role_id`,`resource_id`),
  KEY `rbac_role_scopes_role_id_idx` (`role_id`),
  CONSTRAINT `rbac_role_scopes_role_id_fkey` FOREIGN KEY (`role_id`)
    REFERENCES `rbac_roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rbac_role_scopes_resource_id_fkey` FOREIGN KEY (`resource_id`)
    REFERENCES `rbac_resources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_audit_log` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT NULL,
  `action`        VARCHAR(60) NOT NULL,
  `target_type`   VARCHAR(40) NULL,
  `target_id`     VARCHAR(60) NULL,
  `detail`        JSON NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `rbac_audit_log_created_at_idx` (`created_at`),
  KEY `rbac_audit_log_actor_user_id_idx` (`actor_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
