-- Transactional payroll headers/details are required for atomic editing and posting.
ALTER TABLE hr_mosayer ENGINE=InnoDB;
ALTER TABLE hr_mosayer_details ENGINE=InnoDB;
-- Additive only: historical payroll periods remain NULL and retain legacy interpretation.
ALTER TABLE hr_mosayer ADD COLUMN period_start VARCHAR(10) NULL, ADD COLUMN period_end VARCHAR(10) NULL, ADD COLUMN payout_date VARCHAR(10) NULL;
CREATE TABLE payroll_monthly_events (
 id INT NOT NULL AUTO_INCREMENT, run_id INT NOT NULL, employee_id INT NOT NULL,
 kind VARCHAR(30) NOT NULL, amount DECIMAL(19,2) NOT NULL, note VARCHAR(1000) NOT NULL,
 actor_id INT NOT NULL, actor_name VARCHAR(100) NOT NULL, request_id VARCHAR(64) NOT NULL,
 reverses_id INT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY(request_id), UNIQUE KEY(reverses_id), INDEX(run_id, employee_id, id),
 CONSTRAINT payroll_event_run_fk FOREIGN KEY(run_id) REFERENCES hr_mosayer(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE payroll_cafe_allocations (
 id INT NOT NULL AUTO_INCREMENT, run_id INT NOT NULL, employee_id INT NOT NULL, sale_id INT NOT NULL,
 amount DECIMAL(19,2) NOT NULL, previous_status VARCHAR(20) NOT NULL, settled_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(id), UNIQUE KEY(sale_id), INDEX(run_id, employee_id),
 CONSTRAINT payroll_cafe_run_fk FOREIGN KEY(run_id) REFERENCES hr_mosayer(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
