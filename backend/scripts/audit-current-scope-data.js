/** Read-only audit of branch and men/women linkage in the currently configured database. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function counts(rows, key) {
  return Object.fromEntries([...rows.reduce((map, row) => {
    const value = String(row[key] ?? 'null');
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map())].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
}

async function main() {
  const [branches, employees, users, members, subscriptions, attendance, expenses, revenues, warehouses, productBranches, purchaseOrders, quickSales, events, appUsers, subscriptionDates, expenseDates, revenueDates] = await Promise.all([
    prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } }),
    prisma.employees.findMany({ select: { id: true, emp_code: true, branch_id_fk: true, emp_type: true, gender: true } }),
    prisma.users.findMany({ select: { user_id: true, username: true, approved: true, level: true, emp_code: true, branch_id_fk: true } }),
    prisma.club_members.findMany({ select: { id: true, branch_id: true, gender: true, app_user_id: true } }),
    prisma.club_subscriptions.findMany({ select: { id: true, branch_id: true, gender: true } }),
    prisma.tbl_hdoor_emps.findMany({ select: { hodoor_id: true, branch_id_fk: true, member_id: true } }),
    prisma.fin_expenses.findMany({ select: { id: true, branch_id: true } }),
    prisma.fin_revenues.findMany({ select: { id: true, branch_id: true } }),
    prisma.inv_warehouses.findMany({ select: { id: true, branch_id: true } }),
    prisma.inv_product_branches.findMany({ select: { id: true, branch_id: true } }),
    prisma.prc_purchase_orders.findMany({ select: { id: true, branch_id: true } }),
    prisma.sales_quick_sales.findMany({ select: { id: true, branch_id: true } }),
    prisma.club_events.findMany({ select: { id: true, branch_id: true } }),
    prisma.api_users.findMany({ select: { user_id: true, status: true, user_pass: true } }),
    prisma.club_subscriptions.aggregate({ _min: { registration_date: true }, _max: { registration_date: true } }),
    prisma.fin_expenses.aggregate({ _min: { expense_date: true }, _max: { expense_date: true } }),
    prisma.fin_revenues.aggregate({ _min: { revenue_date: true }, _max: { revenue_date: true } }),
  ]);

  const branchIds = new Set(branches.map((row) => row.branch_id));
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const employeeByBusinessCode = new Map(employees.filter((row) => row.emp_code != null).map((row) => [row.emp_code, row]));
  const linkedUsers = users.filter((row) => row.emp_code != null);
  const matchesAuthConvention = linkedUsers.filter((row) => employeeById.has(row.emp_code)).length;
  const matchesBusinessConvention = linkedUsers.filter((row) => employeeByBusinessCode.has(row.emp_code)).length;
  const matchesNeither = linkedUsers.filter((row) => !employeeById.has(row.emp_code) && !employeeByBusinessCode.has(row.emp_code)).length;
  const authBranchMismatches = linkedUsers.filter((row) => {
    const employee = employeeById.get(row.emp_code);
    return employee && row.branch_id_fk !== employee.branch_id_fk;
  }).length;

  const orphanBranches = (rows, key) => rows.filter((row) => row[key] != null && Number(row[key]) > 0 && !branchIds.has(Number(row[key]))).length;
  console.log(JSON.stringify({
    branches: branches.map((row) => ({ id: row.branch_id, name: row.branch_name })),
    branchNamesMissing: branches.filter((row) => !row.branch_name?.trim()).length,
    employees: {
      total: employees.length,
      byBranch: counts(employees, 'branch_id_fk'),
      byEmpType: counts(employees, 'emp_type'),
      byGender: counts(employees, 'gender'),
      orphanBranchRows: orphanBranches(employees, 'branch_id_fk'),
    },
    users: {
      total: users.length,
      approved: users.filter((row) => row.approved === 1).length,
      byLevel: counts(users, 'level'),
      linkedToEmployee: linkedUsers.length,
      matchesAuthEmployeeIdConvention: matchesAuthConvention,
      matchesEmployeeBusinessCodeConvention: matchesBusinessConvention,
      matchesNeitherConvention: matchesNeither,
      authConventionBranchMismatches: authBranchMismatches,
      orphanBranchRows: orphanBranches(users, 'branch_id_fk'),
    },
    clubMembers: {
      total: members.length,
      byBranch: counts(members, 'branch_id'),
      byGender: counts(members, 'gender'),
      orphanBranchRows: orphanBranches(members, 'branch_id'),
    },
    memberAppAccounts: {
      total: appUsers.length,
      active: appUsers.filter((row) => row.status === 1).length,
      bcryptPasswords: appUsers.filter((row) => /^\$2[aby]\$/.test(row.user_pass || '')).length,
      linkedMembers: members.filter((row) => row.app_user_id != null).length,
    },
    subscriptions: {
      total: subscriptions.length,
      byBranch: counts(subscriptions, 'branch_id'),
      byGender: counts(subscriptions, 'gender'),
      orphanBranchRows: orphanBranches(subscriptions, 'branch_id'),
      dateRange: { min: subscriptionDates._min.registration_date, max: subscriptionDates._max.registration_date },
    },
    attendance: { total: attendance.length, orphanBranchRows: orphanBranches(attendance, 'branch_id_fk') },
    financeExpenses: { total: expenses.length, orphanBranchRows: orphanBranches(expenses, 'branch_id'), dateRange: { min: expenseDates._min.expense_date, max: expenseDates._max.expense_date } },
    financeRevenues: { total: revenues.length, orphanBranchRows: orphanBranches(revenues, 'branch_id'), dateRange: { min: revenueDates._min.revenue_date, max: revenueDates._max.revenue_date } },
    warehouses: { total: warehouses.length, orphanBranchRows: orphanBranches(warehouses, 'branch_id') },
    foreignRecordSamplesForBranch2: {
      employee: employees.find((row) => row.branch_id_fk && row.branch_id_fk !== 2)?.id ?? null,
      member: members.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      subscription: subscriptions.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      expense: expenses.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      revenue: revenues.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      warehouse: warehouses.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      productBranch: productBranches.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      purchaseOrder: purchaseOrders.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      quickSale: quickSales.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
      event: events.find((row) => row.branch_id && row.branch_id !== 2)?.id ?? null,
    },
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
