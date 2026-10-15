-- HTTP push (ZK /iclock) connection settings. Existing controllers stay on the Windows agent.
ALTER TABLE `gate_controllers`
  ADD COLUMN `connection_mode` VARCHAR(20) NOT NULL DEFAULT 'agent',
  ADD COLUMN `timezone` VARCHAR(40) NOT NULL DEFAULT 'Africa/Cairo',
  ADD COLUMN `push_allowed_ip` VARCHAR(45) NULL,
  ADD COLUMN `push_last_ip` VARCHAR(45) NULL,
  ADD COLUMN `last_time_sync_at` DATETIME(3) NULL;

-- MySQL unique indexes still allow several NULLs, so controllers without a serial are unchanged.
CREATE UNIQUE INDEX `gate_controllers_serial_number_key` ON `gate_controllers`(`serial_number`);
