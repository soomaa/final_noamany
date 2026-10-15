// Read-only diagnostic. Run from the deployed application's directory:
// node ~/diagnose-employee-login-20260907.cjs 16 rahma
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { readFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const appRequire = createRequire(resolve(process.cwd(), 'package.json'));
appRequire('dotenv').config({ path: resolve(process.cwd(), '.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');

const employeeId = Number(process.argv[2]);
const requestedUsername = String(process.argv[3] ?? '').trim();
if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !requestedUsername) {
  console.error('Usage: node diagnose-employee-login-20260907.cjs <employee-id> <requested-username>');
  process.exit(1);
}

const prisma = new PrismaClient();
const userSelect = {
  user_id: true, emp_code: true, username: true, name: true,
  approved: true, level: true,
};

async function diagnose() {
  const employee = await prisma.employees.findUnique({
    where: { id: employeeId },
    select: { id: true, emp_code: true, employee: true },
  });
  if (!employee) {
    console.log(JSON.stringify({ employeeId, employeeFound: false }, null, 2));
    return;
  }
  const [selectedAccount, employeeAccounts, usernameMatches, businessCodeAccounts] = await Promise.all([
    prisma.users.findFirst({ where: { emp_code: employeeId }, select: userSelect }),
    prisma.users.findMany({ where: { emp_code: employeeId }, select: userSelect, orderBy: { user_id: 'asc' } }),
    prisma.users.findMany({ where: { username: requestedUsername }, select: userSelect, orderBy: { user_id: 'asc' } }),
    employee.emp_code != null && employee.emp_code !== employeeId
      ? prisma.users.findMany({ where: { emp_code: employee.emp_code }, select: userSelect, orderBy: { user_id: 'asc' } })
      : [],
  ]);
  const conflictingAccounts = usernameMatches.filter((u) => u.user_id !== selectedAccount?.user_id);
  const relatedIds = [...new Set([...usernameMatches, ...businessCodeAccounts]
    .map((u) => u.emp_code).filter((id) => id != null))];
  const relatedEmployees = relatedIds.length
    ? await prisma.employees.findMany({
      where: { OR: [{ id: { in: relatedIds } }, { emp_code: { in: relatedIds } }] },
      select: { id: true, emp_code: true, employee: true },
    })
    : [];
  const servicePath = resolve(process.cwd(), 'src/modules/employees/employees.service.ts');
  console.log(JSON.stringify({
    employee, requestedUsername, selectedAccount, employeeAccounts,
    usernameMatches, conflictingAccounts, businessCodeAccounts, relatedEmployees,
    employeeServiceSha256: existsSync(servicePath)
      ? createHash('sha256').update(readFileSync(servicePath)).digest('hex')
      : null,
  }, null, 2));
}

diagnose().catch((error) => {
  console.error(JSON.stringify({ error: error.name, code: error.code ?? null }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
