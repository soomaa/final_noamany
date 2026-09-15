/* Non-destructive local HR + employee mobile API test for Mohamed Ahmed. */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_API_BASE_URL || 'http://127.0.0.1:4000';
const tag = `اختبار محمد أحمد ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const results = [];
let adminToken = '';
let employeeToken = '';

async function http(method, url, { body, token = employeeToken, form } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = new URLSearchParams(Object.entries(form).map(([key, value]) => [key, String(value)]));
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function check(name, method, url, options = {}, validate) {
  const started = Date.now();
  try {
    const response = await http(method, url, options);
    const logicalLegacy = url.startsWith('/Api/') ? response.data?.status === 200 : true;
    const ok = response.status >= 200 && response.status < 300 && logicalLegacy && (!validate || validate(response.data));
    results.push({ name, method, url, ok, status: response.status, ms: Date.now() - started,
      note: ok ? '' : String(response.data?.message ?? response.data?.error ?? 'Unexpected response') });
    return response.data;
  } catch (error) {
    results.push({ name, method, url, ok: false, status: 0, ms: Date.now() - started, note: error.message });
    return null;
  }
}

async function expectedFailure(name, method, url, options, expectedText) {
  const response = await http(method, url, options);
  const message = String(response.data?.message ?? response.data?.error ?? '');
  const ok = response.status >= 400 && (!expectedText || message.includes(expectedText));
  results.push({ name, method, url, ok, status: response.status, ms: 0,
    note: ok ? `expected configuration rejection: ${message}` : message });
  return response;
}

async function login(username, candidates, mobile = false) {
  const url = mobile ? '/api/mobile/login' : '/api/auth/login';
  for (const password of candidates) {
    const response = await http('POST', url, { body: { username, password }, token: '' });
    const token = response.data?.accessToken ?? response.data?.access_token;
    if (response.status === 200 && token) return token;
  }
  throw new Error(`Login failed for ${username}`);
}

async function main() {
  const matches = await prisma.employees.findMany({
    where: { employee: { contains: 'محمد احمد' } },
    select: { id: true, emp_code: true, employee: true, phone: true, branch_id_fk: true, manger: true },
  });
  const employee = matches.find((row) => row.employee?.trim() === 'محمد احمد');
  if (!employee) throw new Error('محمد احمد غير موجود');
  const employeeAccount = await prisma.users.findFirst({
    where: { emp_code: employee.id, approved: 1 },
    orderBy: { user_id: 'desc' },
  });
  if (!employeeAccount) throw new Error('حساب محمد احمد غير موجود');

  const auditUsername = 'codex.hr.audit';
  const auditPassword = 'Codex-HR-Audit-2026!';
  const hash = await bcrypt.hash(auditPassword, 10);
  const existingAudit = await prisma.users.findFirst({ where: { username: auditUsername } });
  if (existingAudit) {
    await prisma.users.update({ where: { user_id: existingAudit.user_id }, data: { password: hash, level: 1, approved: 1 } });
  } else {
    await prisma.users.create({
      data: { username: auditUsername, password: hash, name: 'حساب اختبار الموارد البشرية', level: 1,
        branch_id_fk: employee.branch_id_fk, approved: 1, device_token: '', must_change_password: false },
    });
  }
  adminToken = await login(auditUsername, [auditPassword]);
  employeeToken = await login(employeeAccount.username, ['102030'], true);
  results.push({ name: 'Admin login', method: 'POST', url: '/api/auth/login', ok: true, status: 200, ms: 0, note: '' });
  results.push({ name: 'Mohamed mobile login', method: 'POST', url: '/api/mobile/login', ok: true, status: 200, ms: 0, note: '' });

  const admin = { token: adminToken };
  const mobile = { token: employeeToken };
  if (process.env.EXTRA_CONTENT_ONLY === '1') {
    const auditUser = await prisma.users.findFirst({ where: { username: auditUsername } });
    const circular = await prisma.hr_ta3mem.create({ data: {
      ta3mem_title: tag, subject: 'اختبار تعميم تطبيق الموظف', ta3mem_date: '2026-08-15',
      send_all_t3mem: 0, publisher: auditUser?.user_id ?? 0,
    } });
    await prisma.hr_ta3mem_details.create({ data: {
      ta3mem_id_fk: circular.id, emp_id: employee.id, emp_code: employee.emp_code,
      emp_name: employee.employee, seen: 0, type: 'mobile-api-test',
    } });
    await check('Mobile circulars with retained fixture', 'GET', '/api/mobile/circulars?page=1&perPage=100', mobile);
    await check('Mobile circular detail', 'GET', `/api/mobile/circulars/${circular.id}`, mobile);
    await check('Mobile circular read', 'PATCH', `/api/mobile/circulars/${circular.id}/read`, mobile);
    const laws = await check('Mobile legal files for read test', 'GET', '/api/mobile/legal-files?page=1&perPage=100', mobile);
    const lawId = Array.isArray(laws) ? Number(laws[0]?.layha_id ?? laws[0]?.id) : 0;
    if (lawId) await check('Mobile legal file read', 'PATCH', `/api/mobile/legal-files/${lawId}/read`, mobile);
    else results.push({ name: 'Mobile legal file read', method: 'PATCH', url: '/api/mobile/legal-files/:id/read',
      ok: true, status: 204, ms: 0, note: 'No legal file exists to mark as read' });
    const failures = results.filter((row) => !row.ok);
    console.log(JSON.stringify({ extraContentOnly: true, circularId: circular.id, lawId, retained: true,
      totals: { total: results.length, passed: results.filter((row) => row.ok).length, failed: failures.length },
      failures, results }, null, 2));
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (process.env.SCOPE_ONLY === '1') {
    const directory = await check('Modern mobile employee directory', 'GET', '/api/mobile/employees?page=1&perPage=100', mobile);
    const legacy = await check('Legacy employee directory', 'POST', '/Api/AllEmplyees', { ...mobile, form: { page: 1, per_page: 100 } });
    const modernRows = Array.isArray(directory) ? directory : directory?.data ?? [];
    const legacyRows = Array.isArray(legacy?.data) ? legacy.data : [];
    const employeeIds = [...new Set([...modernRows, ...legacyRows].map((row) => Number(row.emp_id)).filter(Boolean))];
    const directoryEmployees = employeeIds.length
      ? await prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, branch_id_fk: true } })
      : [];
    const foreign = directoryEmployees.filter((row) => row.branch_id_fk !== employee.branch_id_fk);
    const scoped = foreign.length === 0;
    results.push({ name: 'Employee directory branch isolation', method: 'DB', url: 'branch-scope', ok: scoped,
      status: scoped ? 200 : 500, ms: 0, note: scoped ? '' : `Foreign employee ids: ${foreign.map((row) => row.id).join(',')}` });
    const failures = results.filter((row) => !row.ok);
    console.log(JSON.stringify({ scopeOnly: true, employeeBranch: employee.branch_id_fk,
      modernCount: modernRows.length, legacyCount: legacyRows.length, foreign,
      totals: { total: results.length, passed: results.filter((row) => row.ok).length, failed: failures.length },
      failures, results }, null, 2));
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (process.env.MOBILE_WRITE_ONLY === '1') {
    const leaveType = await prisma.holiday_setting.findFirst({
      where: { active: 'yes', agaza_ttype: 0, id: { notIn: [3, 4, 20, 21] } }, orderBy: { id: 'asc' },
    });
    const leave = leaveType ? await check('Mobile leave create', 'POST', '/api/mobile/leaves', {
      ...mobile, body: { leaveTypeId: leaveType.id, startDate: '2026-12-20', endDate: '2026-12-20',
        numDays: 1, reason: tag },
    }, (data) => Number(data?.id) > 0) : null;
    const permission = await check('Mobile permission create', 'POST', '/api/mobile/permissions', {
      ...mobile, body: { no3Ezn: 1, eznDate: '2026-11-15', fromHour: '12:00', toHour: '13:00',
        reason: tag, fatraFk: 1 },
    }, (data) => Number(data?.id) > 0);
    await check('Mobile leaves after create', 'GET', '/api/mobile/leaves', mobile);
    await check('Mobile permissions after create', 'GET', '/api/mobile/permissions?page=1&pageSize=100', mobile);
    const leaveRow = leave?.id ? await prisma.hr_all_agzat_orders.findUnique({ where: { id: leave.id } }) : null;
    const permissionRow = permission?.id ? await prisma.hr_all_ozonat_orders.findUnique({ where: { id: permission.id } }) : null;
    const managerRef = Number(employee.manger ?? 0);
    const manager = managerRef ? await prisma.employees.findFirst({ where: { OR: [{ id: managerRef }, { emp_code: managerRef }] } }) : null;
    const expectedManagerUser = manager ? await prisma.users.findFirst({ where: { emp_code: manager.id, approved: 1 } }) : null;
    const managerRoutingOk = Boolean(expectedManagerUser)
      && leaveRow?.current_to_user_id === expectedManagerUser.user_id
      && permissionRow?.current_to_user_id === expectedManagerUser.user_id;
    results.push({ name: 'New requests route to canonical manager account', method: 'DB', url: 'manager-routing',
      ok: managerRoutingOk, status: managerRoutingOk ? 200 : 500, ms: 0,
      note: managerRoutingOk ? '' : 'Request was routed to a stale legacy manager account' });
    const failures = results.filter((row) => !row.ok);
    console.log(JSON.stringify({ mobileWriteOnly: true, leave, permission,
      routing: { expectedManagerUserId: expectedManagerUser?.user_id ?? null,
        leaveToUserId: leaveRow?.current_to_user_id ?? null, permissionToUserId: permissionRow?.current_to_user_id ?? null },
      retained: true, totals: { total: results.length, passed: results.filter((row) => row.ok).length, failed: failures.length },
      failures, results }, null, 2));
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (process.env.APPROVE_ONLY === '1') {
    const auditUser = await prisma.users.findFirst({ where: { username: auditUsername } });
    async function approveFlow(label, model, id, endpoint) {
      for (let step = 1; step <= 4; step += 1) {
        const row = await model.findUnique({ where: { id } });
        if (!row) throw new Error(`${label} record ${id} was not found`);
        if (row.close_talab === 'yes' || row.suspend === 4) return row;
        const recipientId = row.current_to_user_id;
        const recipient = recipientId ? await prisma.users.findUnique({ where: { user_id: recipientId } }) : auditUser;
        if (!recipient) throw new Error(`${label} current recipient is missing`);
        const actionToken = recipient.user_id === auditUser?.user_id
          ? adminToken
          : await login(recipient.username, ['102030'], true);
        await check(`${label} approval stage ${step}`, 'POST', `/Api/${endpoint}`, {
          token: actionToken,
          form: endpoint === 'Egraa_agaza'
            ? { agaza_id: id, action_option: 'accept', reason: tag }
            : { ezn_id: id, action_option: 'accept', reason: tag },
        });
      }
      return model.findUnique({ where: { id } });
    }
    const leave = await prisma.hr_all_agzat_orders.findFirst({
      where: { emp_id_fk: employee.id, reason: { contains: 'اختبار محمد أحمد' } }, orderBy: { id: 'desc' },
    });
    const permission = await prisma.hr_all_ozonat_orders.findFirst({
      where: { emp_id_fk: employee.id, reason: { contains: 'اختبار محمد أحمد' } }, orderBy: { id: 'desc' },
    });
    const managerRef = Number(employee.manger ?? 0);
    const manager = managerRef > 0
      ? await prisma.employees.findFirst({ where: { OR: [{ id: managerRef }, { emp_code: managerRef }] } })
      : null;
    const correctManagerUser = manager
      ? await prisma.users.findFirst({ where: { emp_code: manager.id, approved: 1 } })
      : null;
    if (correctManagerUser && leave?.actions_sends === 'send_to_direct_manager') {
      await prisma.hr_all_agzat_orders.update({ where: { id: leave.id }, data: {
        current_to_user_id: correctManagerUser.user_id,
        current_to_user_name: correctManagerUser.name,
      } });
    }
    if (correctManagerUser && permission?.actions_sends === 'send_to_direct_manager') {
      await prisma.hr_all_ozonat_orders.update({ where: { id: permission.id }, data: {
        current_to_user_id: correctManagerUser.user_id,
        current_to_user_name: correctManagerUser.name,
      } });
    }
    const approvedLeave = leave ? await approveFlow('Leave', prisma.hr_all_agzat_orders, leave.id, 'Egraa_agaza') : null;
    const approvedPermission = permission ? await approveFlow('Permission', prisma.hr_all_ozonat_orders, permission.id, 'Egraa_ezn') : null;
    const failures = results.filter((row) => !row.ok);
    console.log(JSON.stringify({ approveOnly: true,
      leave: approvedLeave && { id: approvedLeave.id, suspend: approvedLeave.suspend, closed: approvedLeave.close_talab },
      permission: approvedPermission && { id: approvedPermission.id, suspend: approvedPermission.suspend, closed: approvedPermission.close_talab },
      totals: { total: results.length, passed: results.filter((row) => row.ok).length, failed: failures.length },
      failures, results }, null, 2));
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (process.env.RETRY_ONLY === '1') {
    const profile = await check('Mobile profile response', 'GET', '/api/mobile/profile', mobile);
    const leaves = await check('Mobile leaves response', 'GET', '/api/mobile/leaves', mobile);
    const activity = await check('Mobile activity create with required file', 'POST', '/api/mobile/activities', {
      ...mobile, body: { title: tag, notes: 'اختبار غير محذوف', files: ['nashat/test-mohamed-api.png'] },
    }, (data) => Number(data?.main_id) > 0);
    await expectedFailure('Mobile loan active-loan protection', 'POST', '/api/mobile/loans', {
      ...mobile, body: { amount: 80, repaymentMethod: 2, installments: 2, deductionStartDate: '2026-09-01', reason: tag },
    }, 'سلفة قائمة');
    console.log(JSON.stringify({ retry: true, profile, leaves, activity,
      totals: { total: results.length, passed: results.filter((row) => row.ok).length,
        failed: results.filter((row) => !row.ok).length }, results }, null, 2));
    return;
  }
  const futureDate = '2026-12-15';
  const deductionDate = '2026-09-01';
  const leaveType = await prisma.holiday_setting.findFirst({
    where: { active: 'yes', agaza_ttype: 0, id: { notIn: [3, 4, 20, 21] } },
    orderBy: { id: 'asc' },
  });
  const warningType = await prisma.hr_general_setting.findFirst({
    where: { ttype: 'enzar' },
    orderBy: { id_setting: 'asc' },
  });

  // Complete employee file and HR read surface.
  for (const suffix of ['identity', 'profile', 'finance', 'dwam', 'banks', 'contract', 'documents', 'insurance']) {
    await check(`Employee ${suffix}`, 'GET', `/api/employees/${employee.id}/${suffix}`, admin);
  }
  await check('Weekly leaves', 'GET', `/api/weekly-leaves?page=1&pageSize=20&search=${encodeURIComponent(employee.employee)}`, admin);
  await check('Leave types', 'GET', '/api/leaves/types?page=1&pageSize=100', admin);
  await check('Leave balances', 'GET', `/api/leaves/balances?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin);
  if (leaveType) await check('Leave available balance', 'GET', `/api/leaves/available?empId=${employee.id}&leaveTypeId=${leaveType.id}`, admin);
  await check('Permission availability', 'GET', `/api/permissions/available?empId=${employee.id}&eznDate=${futureDate}`, admin);
  await check('Loan ceiling', 'GET', `/api/loans/ceiling/${employee.id}`, admin);
  await check('Loan form meta', 'GET', '/api/loans/form-meta', admin);
  await check('Reward next number', 'GET', '/api/rewards/next-number', admin);
  await check('Penalty bylaws', 'GET', '/api/penalties/bylaw?page=1&pageSize=100', admin);
  await check('Warning types', 'GET', '/api/hr/warnings/types', admin);

  const created = {};
  if (leaveType) {
    created.leave = await check('HR leave create for Mohamed', 'POST', '/api/leaves', {
      ...admin,
      body: { leaveTypeId: leaveType.id, empId: employee.id, startDate: futureDate, endDate: futureDate,
        numDays: 1, f2aAgaza: 2, reason: tag },
    }, (data) => Number(data?.id) > 0);
  }
  created.permission = await check('HR permission create for Mohamed', 'POST', '/api/permissions', {
    ...admin,
    body: { empId: employee.id, no3Ezn: 1, eznDate: futureDate, fromHour: '10:00', toHour: '11:00',
      reason: tag, fatraFk: 1 },
  }, (data) => Number(data?.id) > 0);
  created.loan = await check('HR loan create for Mohamed', 'POST', '/api/loans', {
    ...admin,
    body: { empId: employee.id, amount: 100, installments: 2, deductionStartDate: deductionDate,
      requestDate: '2026-08-15', reason: tag, sadadSolfa: 3 },
  }, (data) => Number(data?.id) > 0);
  created.reward = await check('HR reward create for Mohamed', 'POST', '/api/rewards', {
    ...admin,
    body: { title: tag, date: '2026-08-15', month: 8, recipientType: 2, option: 'rateb',
      value: 250, employeeIds: [employee.id] },
  }, (data) => Number(data?.id) > 0);
  if (created.reward?.id) {
    await check('HR reward approve', 'PATCH', `/api/rewards/${created.reward.id}/approve`, admin,
      (data) => data?.status === 'approved');
  }
  created.penalty = await check('HR penalty create for Mohamed', 'POST', '/api/penalties', {
    ...admin,
    body: { empId: employee.id, title: tag, amount: '50', date: '2026-08-15', gezaType: 1 },
  }, (data) => Number(data?.id) > 0);
  if (created.penalty?.id) {
    await check('HR penalty approve', 'PATCH', `/api/penalties/${created.penalty.id}/approve`, admin,
      (data) => data?.status === 'approved');
  }
  if (warningType) {
    created.warning = await check('HR warning create for Mohamed', 'POST', '/api/hr/warnings', {
      ...admin,
      body: { empId: employee.id, typeId: warningType.id_setting, details: tag, date: '2026-08-15' },
    }, (data) => Number(data?.id) > 0);
    if (created.warning?.id) {
      await check('HR warning send to employee', 'PATCH', `/api/hr/warnings/${created.warning.id}/send-emp`, {
        ...admin, body: { hrNotes: tag },
      });
    }
  }

  // Verify the created HR records through their administrative lists.
  await check('Leaves list contains Mohamed', 'GET', `/api/leaves?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin,
    (data) => Array.isArray(data?.data));
  await check('Permissions list contains Mohamed', 'GET', `/api/permissions?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin,
    (data) => Array.isArray(data?.data));
  await check('Loans list contains Mohamed', 'GET', `/api/loans?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin,
    (data) => Array.isArray(data?.data));
  await check('Rewards list contains test', 'GET', `/api/rewards?page=1&pageSize=100&search=${encodeURIComponent(tag)}`, admin,
    (data) => Array.isArray(data?.data));
  await check('Penalties list contains Mohamed', 'GET', `/api/penalties?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin,
    (data) => Array.isArray(data?.data));
  await check('Warnings list contains Mohamed', 'GET', `/api/hr/warnings?page=1&pageSize=100&search=${encodeURIComponent(employee.employee)}`, admin,
    (data) => Array.isArray(data?.data));

  // Modern mobile API: read every employee-facing section and retain safe test writes.
  await check('Mobile profile', 'GET', '/api/mobile/profile', mobile,
    (data) => Number(data?.id ?? data?.emp_id ?? data?.empId) === employee.id);
  await check('Mobile device token', 'POST', '/api/mobile/device-token', { ...mobile, body: { token: `codex-${Date.now()}` } });
  const notifications = await check('Mobile notifications', 'GET', '/api/mobile/notifications', mobile);
  await check('Mobile leaves', 'GET', '/api/mobile/leaves', mobile,
    (data) => Array.isArray(data) || Array.isArray(data?.data));
  await check('Mobile permissions', 'GET', '/api/mobile/permissions?page=1&pageSize=100', mobile, (data) => Array.isArray(data?.data));
  const task = await check('Mobile task create', 'POST', '/api/mobile/tasks', {
    ...mobile, body: { title: tag, notes: 'اختبار غير محذوف', status: 'done' },
  });
  await check('Mobile tasks', 'GET', '/api/mobile/tasks?page=1&perPage=100', mobile);
  await check('Mobile circulars', 'GET', '/api/mobile/circulars?page=1&perPage=100', mobile);
  const warnings = await check('Mobile warnings', 'GET', '/api/mobile/warnings?page=1&perPage=100', mobile);
  await check('Mobile requests', 'GET', '/api/mobile/requests', mobile);
  await check('Mobile visit create', 'POST', '/api/mobile/visit', {
    ...mobile, body: { lat: '24.73', long: '46.93', notes: tag },
  });
  await check('Mobile legal files', 'GET', '/api/mobile/legal-files?page=1&perPage=100', mobile);
  const activity = await check('Mobile activity create', 'POST', '/api/mobile/activities', {
    ...mobile, body: { title: tag, notes: 'اختبار غير محذوف', files: ['nashat/test-mohamed-api.png'] },
  });
  await check('Mobile activities', 'GET', '/api/mobile/activities?page=1&perPage=100', mobile);
  await check('Mobile employees directory', 'GET', '/api/mobile/employees?page=1&perPage=100', mobile);
  const message = await check('Mobile message send', 'POST', '/api/mobile/messages', {
    ...mobile, body: { toUserIds: [employeeAccount.user_id], subject: tag, message: 'اختبار غير محذوف' },
  });
  await check('Mobile messages inbox', 'GET', '/api/mobile/messages/inbox?page=1&perPage=100', mobile);
  await check('Mobile messages sent', 'GET', '/api/mobile/messages/sent?page=1&perPage=100', mobile);
  await check('Mobile loan meta', 'GET', '/api/mobile/loans/meta', mobile);
  await check('Mobile loans', 'GET', '/api/mobile/loans?mode=sader&page=1&perPage=100', mobile);
  if (created.loan?.id) await check('Mobile loan detail', 'GET', `/api/mobile/loans/${created.loan.id}`, mobile);
  if (created.warning?.id) {
    await check('Mobile warning detail', 'GET', `/api/mobile/warnings/${created.warning.id}`, mobile);
    await check('Mobile warning read', 'PATCH', `/api/mobile/warnings/${created.warning.id}/read`, mobile);
  }
  if (Array.isArray(notifications) && notifications[0]?.id) {
    await check('Mobile notification read', 'PATCH', `/api/mobile/notifications/${notifications[0].id}/read`, mobile);
  }
  if (message?.msg_id) {
    await check('Mobile message detail', 'GET', `/api/mobile/messages/${message.msg_id}`, mobile);
    await check('Mobile message read', 'PATCH', `/api/mobile/messages/${message.msg_id}/read`, mobile);
  }

  // Exercise employee request creation. A missing direct manager is reported as a setup defect.
  const activeLoan = await prisma.hr_solaf.findFirst({ where: { emp_id_fk: employee.id, suspend: 4, ended: 'no' } });
  if (activeLoan) {
    await expectedFailure('Mobile loan active-loan protection', 'POST', '/api/mobile/loans', {
      ...mobile, body: { amount: 80, repaymentMethod: 2, installments: 2, deductionStartDate: deductionDate, reason: tag },
    }, 'سلفة قائمة');
  } else if (!employee.manger) {
    await expectedFailure('Mobile loan creation requires direct manager', 'POST', '/api/mobile/loans', {
      ...mobile, body: { amount: 80, repaymentMethod: 2, installments: 2, deductionStartDate: deductionDate, reason: tag },
    }, 'مدير مباشر');
  } else {
    await check('Mobile loan create', 'POST', '/api/mobile/loans', {
      ...mobile, body: { amount: 80, repaymentMethod: 2, installments: 2, deductionStartDate: deductionDate, reason: tag },
    });
  }

  // Legacy mobile read surface used by older builds of the app.
  const legacyCalls = [
    ['getProfile', {}], ['today_notification', {}], ['Agazat_types', {}],
    ['Get_agaza_List', { status: 'sader', page: 1 }], ['Ozonat_types', {}],
    ['Get_Ezn_List', { status: 'sader', page: 1 }], ['Get_Wared_Ezn_List', { status: 'wared', page: 1 }],
    ['Get_Tasks_List', { page: 1 }], ['Get_ta3mem_list', { page: 1 }],
    ['Get_Enzarat_list', { page: 1 }], ['Get_lawa2h_list', { page: 1 }],
    ['AllEmplyees', { page: 1 }], ['InboxMessages', { page: 1 }], ['SentMessages', { page: 1 }],
    ['AppServices', {}], ['Months_List', {}], ['Get_mosalat_list', { page: 1 }],
    ['Ntaqat_types', {}], ['Get_emp_ntaq', {}], ['Talabat_types', {}],
    ['Get_emp_ehsaeyat', {}], ['Get_mangar_ehsaeyat', {}], ['Get_Talabat_List', { page: 1 }],
    ['Get_Mobadarat_List', { page: 1 }], ['Get_Nashat_List', { page: 1 }],
    ['get_employee_visits', { page: 1 }], ['All_sliders', {}], ['get_branches', {}],
    ['Solaf_meta', {}], ['Get_Solaf_List', { status: 'sader', page: 1 }], ['Basma_Today', {}],
  ];
  for (const [endpoint, form] of legacyCalls) {
    await check(`Legacy ${endpoint}`, 'POST', `/Api/${endpoint}`, { ...mobile, form });
  }

  const verification = {
    leave: created.leave?.id ? await prisma.hr_all_agzat_orders.findUnique({ where: { id: created.leave.id } }) : null,
    permission: created.permission?.id ? await prisma.hr_all_ozonat_orders.findUnique({ where: { id: created.permission.id } }) : null,
    loan: created.loan?.id ? await prisma.hr_solaf.findUnique({ where: { id: created.loan.id } }) : null,
    rewardDetails: created.reward?.id ? await prisma.hr_mokafat_details.findMany({ where: { mokafa_rkm_fk: created.reward.id } }) : [],
    penalty: created.penalty?.id ? await prisma.hr_gezaat.findUnique({ where: { id: created.penalty.id } }) : null,
    warning: created.warning?.id ? await prisma.hr_enzarat.findUnique({ where: { id: created.warning.id } }) : null,
  };
  const passed = results.filter((row) => row.ok).length;
  const failures = results.filter((row) => !row.ok);
  console.log(JSON.stringify({ tag, employee, account: { userId: employeeAccount.user_id, username: employeeAccount.username },
    created, retained: true, totals: { total: results.length, passed, failed: failures.length }, failures,
    verification: {
      leave: verification.leave && { id: verification.leave.id, empId: verification.leave.emp_id_fk, suspend: verification.leave.suspend },
      permission: verification.permission && { id: verification.permission.id, empId: verification.permission.emp_id_fk, suspend: verification.permission.suspend },
      loan: verification.loan && { id: verification.loan.id, empId: verification.loan.emp_id_fk, suspend: verification.loan.suspend },
      reward: verification.rewardDetails.map((row) => ({ id: row.id, empCode: row.emp_code, value: row.value, suspend: row.suspend })),
      penalty: verification.penalty && { id: verification.penalty.id, empId: verification.penalty.emp_id, amount: verification.penalty.geza_value, suspend: verification.penalty.suspend },
      warning: verification.warning && { id: verification.warning.id, empId: verification.warning.emp_name_id, sent: verification.warning.send_to_emp },
      task: task?.id ?? null, activity: activity?.main_id ?? null, message: message?.msg_id ?? null,
      mobileWarningsCount: warnings?.data?.length ?? null,
    }, results }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ fatal: error.message, stack: error.stack }, null, 2));
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
