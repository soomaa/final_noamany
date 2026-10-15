-- Employee code is the legacy business key used across payroll, attendance,
-- leave, loan, and contract tables. Fail migration instead of silently allowing
-- ambiguous identities; nullable employee codes remain allowed by MySQL.
DROP INDEX `employees_emp_code_idx` ON `employees`;
CREATE UNIQUE INDEX `employees_emp_code_key` ON `employees` (`emp_code`);

-- A staff member has exactly one active legacy contract row. This also makes
-- contract writes safely upsertable under concurrency.
DROP INDEX `contract_employe_emp_code_idx` ON `contract_employe`;
CREATE UNIQUE INDEX `contract_employe_emp_code_key` ON `contract_employe` (`emp_code`);
