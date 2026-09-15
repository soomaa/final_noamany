/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_API_BASE_URL || 'http://127.0.0.1:4000';
const modernOnly = process.argv.includes('--modern-only');
const tag = `codex_api_test_${Date.now()}`;
const password = '102030';
const phoneSuffix = String(Date.now()).slice(-8);
const employeePhone = `010${phoneSuffix}`;
const managerPhone = `011${phoneSuffix}`;
const results = [];
const createdUploads = [];
let token = '';
let managerToken = '';
let employee;
let manager;
let account;
let managerAccount;
let site;
let shift;
let originalAppChannel;
let punchLat;
let punchLong;

const today = new Date().toISOString().slice(0, 10);
const futureDate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);

function hhmm(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function request(method, url, { body, form, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function check(name, method, url, options = {}, validate) {
  const started = Date.now();
  try {
    const response = await request(method, url, options);
    const legacyOk = url.startsWith('/Api/') ? response.data?.status === 200 : true;
    const ok = response.status >= 200 && response.status < 300 && legacyOk && (!validate || validate(response.data));
    results.push({ name, method, url, ok, status: response.status, ms: Date.now() - started,
      note: ok ? '' : String(response.data?.message ?? response.data?.error ?? 'Unexpected response') });
    return response.data;
  } catch (error) {
    results.push({ name, method, url, ok: false, status: 0, ms: Date.now() - started, note: error.message });
    return null;
  }
}

async function expectError(name, method, url, options = {}, accepted = [400]) {
  const started = Date.now();
  try {
    const response = await request(method, url, options);
    const legacyError = url.startsWith('/Api/') && response.data?.status === 400;
    const ok = accepted.includes(response.status) || legacyError;
    results.push({ name, method, url, ok, status: response.status, ms: Date.now() - started,
      note: ok ? 'expected rejection' : 'Request should have been rejected' });
    return response.data;
  } catch (error) {
    results.push({ name, method, url, ok: false, status: 0, ms: Date.now() - started, note: error.message });
    return null;
  }
}

function urlForm(values) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) form.set(key, String(value));
  }
  return form;
}

async function createFixture() {
  const geofences = await prisma.branch_settings.findMany({ orderBy: { id: 'asc' } });
  let fingerprintBranch = null;
  let fingerprintGeofence = null;
  for (const geofence of geofences) {
    const lat = Number(geofence.lat_map);
    const long = Number(geofence.long_map);
    if (!Number.isFinite(lat) || !Number.isFinite(long) || Number(geofence.distance) <= 0) continue;
    const branch = await prisma.tbl_branches.findUnique({ where: { branch_id: geofence.id } });
    if (branch) {
      fingerprintBranch = branch;
      fingerprintGeofence = geofence;
      break;
    }
  }
  if (!fingerprintBranch || !fingerprintGeofence) {
    throw new Error('No branch has valid matching branch_settings coordinates for the fingerprint API test');
  }
  punchLat = String(fingerprintGeofence.lat_map);
  punchLong = String(fingerprintGeofence.long_map);
  site = await prisma.tbl_sites.create({
    data: { name: tag, site_name: tag, s_lat: Number(punchLat), s_long: Number(punchLong), radius: 150, date_ar: today, publisher: 1 },
  });
  shift = await prisma.tbl_hdodr_setting.create({
    data: {
      title: tag,
      hdoor_from_time: hhmm(-45),
      hdoor_to_time: hhmm(30),
      hdoor_khasm_from: hhmm(-15),
      ensraf_from_time: hhmm(-5),
      ensraf_khasm_from: hhmm(5),
      ensraf_to_time: hhmm(180),
    },
  });
  const maxCode = await prisma.employees.aggregate({ _max: { emp_code: true } });
  const employeeCode = (maxCode._max.emp_code || 900000) + 100;
  manager = await prisma.employees.create({
    data: {
      employee: `${tag}_manager`, emp_code: employeeCode + 1,
      branch_id_fk: fingerprintBranch.branch_id, emp_sign: String(fingerprintBranch.branch_id), phone: managerPhone,
      demo_card: '0', shahadt_jaish: 'no', tamin_rkm: 0, khedma_year: 0,
      employee_type: 1, edara_id: 1, edara_n: tag, qsm_id: 1, qsm_n: tag, mosma_wazefy_n: 'مدير مباشر',
    },
  });
  employee = await prisma.employees.create({
    data: {
      employee: tag, emp_code: employeeCode,
      branch_id_fk: fingerprintBranch.branch_id, emp_sign: String(fingerprintBranch.branch_id), phone: employeePhone,
      demo_card: '0', shahadt_jaish: 'no', tamin_rkm: 0, khedma_year: 0,
      employee_type: 1, edara_id: 1, edara_n: tag, qsm_id: 1, qsm_n: tag,
      mosma_wazefy_n: 'موظف اختبار', manger: String(manager.id), start_work_date_m: '2020-01-01',
    },
  });
  const hash = await bcrypt.hash(password, 8);
  managerAccount = await prisma.users.create({
    data: { username: managerPhone, password: hash, name: `${tag}_manager`, level: 1,
      role_id_fk: 3, emp_code: manager.id, branch_id_fk: fingerprintBranch.branch_id, approved: 1,
      must_change_password: false },
  });
  account = await prisma.users.create({
    data: { username: employeePhone, password: hash, name: tag, level: 1,
      role_id_fk: 3, emp_code: employee.id, branch_id_fk: fingerprintBranch.branch_id, approved: 1,
      must_change_password: false },
  });
  await prisma.tbl_hdoor_dawms_emps.create({
    data: { dwam_id_fk: shift.id, emp_id_fk: employee.id, emp_code_fk: employee.emp_code,
      type: tag, b_name: tag, branch_id_fk: String(fingerprintBranch.branch_id) },
  });
  originalAppChannel = await prisma.attendance_channels.findUnique({ where: { key: 'app' } });
  await prisma.attendance_channels.upsert({
    where: { key: 'app' }, create: { key: 'app', enabled: 1, label: 'App' }, update: { enabled: 1 },
  });
  await prisma.tbl_notifications.create({
    data: { to_user: account.user_id, from_user: managerAccount.user_id, date_ar: today,
      time_ar: hhmm(), n_code: 999, seen: 0 },
  });
  const circular = await prisma.hr_ta3mem.create({
    data: { ta3mem_title: tag, subject: 'اختبار API', ta3mem_date: today, send_all_t3mem: 1,
      publisher: account.user_id },
  });
  await prisma.hr_ta3mem_details.create({
    data: { ta3mem_id_fk: circular.id, emp_id: employee.id, emp_code: employee.emp_code,
      emp_name: employee.employee, seen: 0, type: tag },
  });
  await prisma.hr_enzarat.create({
    data: { emp_name: employee.employee, emp_name_id: employee.id, emp_user_id: account.user_id,
      enzar_type: tag, details: 'اختبار API', enzar_date_ar: today, seen: 0 },
  });
  await prisma.hr_lawyeh_files.create({
    data: { title: tag, details: 'تفاصيل لائحة اختبار', f_file: 'files/test.pdf', user_id: account.user_id,
      added_date: today, added_time: hhmm() },
  });
}

async function loginTests() {
  await expectError('Auth rejects missing token', 'GET', '/api/mobile/profile', { auth: false }, [401]);
  await expectError('Mobile login rejects wrong password', 'POST', '/api/mobile/login', {
    auth: false, body: { username: employeePhone, password: 'wrong-password' },
  }, [401]);
  const login = await check('Modern mobile login', 'POST', '/api/mobile/login', {
    auth: false, body: { username: employeePhone, password },
  }, (data) => Boolean(data?.accessToken));
  token = login?.accessToken || '';
  const managerLogin = await check('Modern manager login', 'POST', '/api/mobile/login', {
    auth: false, body: { username: managerPhone, password },
  }, (data) => Boolean(data?.accessToken));
  managerToken = managerLogin?.accessToken || '';
  if (!modernOnly) await check('Legacy login_app', 'POST', '/Api/login_app', {
    auth: false, form: urlForm({ phone: employeePhone, user_pass: password }),
  }, (data) => Boolean(data?.data?.access_token));
}

async function attendanceTests() {
  await expectError('Attendance invalid coordinates', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: '999', long: '31' },
  });
  await expectError('Attendance geofence rejection', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: String(-Number(punchLat)), long: String(-Number(punchLong)) },
  });
  const punchIn = await check('Attendance mobile check-in', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: punchLat, long: punchLong },
  }, (data) => data?.type === 'in' && data?.distanceMeters === 0);
  await expectError('Attendance duplicate protection', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: punchLat, long: punchLong },
  });
  if (punchIn?.id) {
    await prisma.tbl_hdoor_emps.update({ where: { hodoor_id: punchIn.id }, data: { hdoor_time: hhmm(-65) } });
    await prisma.tbl_hdoor_emps_history.updateMany({
      where: { member_code: employee.emp_code }, data: { action_time: hhmm(-65), hdoor_ensraf_time: hhmm(-65) },
    });
  }
  await check('Attendance mobile check-out', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: punchLat, long: punchLong },
  }, (data) => data?.type === 'out');
  await expectError('Attendance repeated check-out protection', 'POST', '/api/mobile/attendance/punch', {
    body: { lat: punchLat, long: punchLong },
  });

  if (modernOnly) return;

  await check('Attendance rules read', 'GET', '/api/attendance/rules');
  const settings = await check('Attendance settings read', 'GET', '/api/attendance/settings');
  if (settings?.channels) await check('Attendance settings no-op update', 'PATCH', '/api/attendance/settings', { body: { channels: settings.channels } });
  await check('Attendance shifts list', 'GET', '/api/attendance/shifts?page=1&pageSize=20');
  const testShift = await check('Attendance shift create', 'POST', '/api/attendance/shifts', { body: {
    title: `${tag}_crud`, hdoorFromTime: '08:00', hdoorToTime: '09:00', hdoorKhasmFrom: '08:15',
    ensrafFromTime: '16:00', ensrafToTime: '17:00', ensrafKhasmFrom: '16:15',
  }});
  if (testShift?.id) {
    await check('Attendance shift update', 'PUT', `/api/attendance/shifts/${testShift.id}`, { body: {
      title: `${tag}_updated`, hdoorFromTime: '08:00', hdoorToTime: '09:00', hdoorKhasmFrom: '08:15',
      ensrafFromTime: '16:00', ensrafToTime: '17:00', ensrafKhasmFrom: '16:15',
    }});
    await check('Attendance shift delete', 'DELETE', `/api/attendance/shifts/${testShift.id}`);
  }
  const swap = await check('Attendance shift-swap create', 'POST', '/api/attendance/shift-swaps', {
    body: { empId: employee.id, ttype: 2, dwamIdFk: shift.id, sheftDate: futureDate },
  });
  await check('Attendance shift-swaps list', 'GET', `/api/attendance/shift-swaps?page=1&pageSize=20&empCode=${employee.emp_code}`);
  if (swap?.id) await check('Attendance shift-swap delete', 'DELETE', `/api/attendance/shift-swaps/${swap.id}`);
  const extra = await check('Attendance extra-hours create', 'POST', '/api/attendance/extra-hours', {
    body: { empId: employee.id, numHours: 2, edafaDate: futureDate },
  });
  await check('Attendance extra-hours list', 'GET', `/api/attendance/extra-hours?page=1&pageSize=20&empCode=${employee.emp_code}`);
  if (extra?.id) await check('Attendance extra-hours delete', 'DELETE', `/api/attendance/extra-hours/${extra.id}`);

  const reportQuery = `page=1&pageSize=20&empCode=${employee.emp_code}&dateFrom=${today}&dateTo=${today}`;
  for (const report of ['basma', 'full-sheet', 'late', 'absence', 'overtime', 'shift-swap']) {
    await check(`Attendance report ${report}`, 'GET', `/api/attendance/reports/${report}?${reportQuery}`);
  }
  await check('Attendance board', 'GET', `/api/attendance?page=1&pageSize=20&date=${today}`);
  await check('Attendance manual options', 'GET', '/api/attendance/manual-options');
  await check('Attendance devices list', 'GET', '/api/attendance/devices?page=1&pageSize=20');
  const device = await check('Attendance device create', 'POST', '/api/attendance/devices', {
    body: { title: tag, ip: '127.0.0.1', branchId: employee.branch_id_fk },
  });
  if (device?.id) {
    await expectError('Attendance device sync handles unreachable hardware', 'POST', `/api/attendance/devices/${device.id}/sync`, {}, [400]);
    await check('Attendance device delete', 'DELETE', `/api/attendance/devices/${device.id}`);
  }

  await prisma.tbl_hdoor_emps.deleteMany({ where: { member_code: employee.emp_code } });
  await prisma.tbl_hdoor_emps_history.deleteMany({ where: { member_code: employee.emp_code } });
  await check('Attendance manual check-in', 'POST', '/api/attendance/check', {
    body: { empCode: String(employee.emp_code), branchId: String(employee.branch_id_fk),
      type: 'in', checkIn: hhmm(-10), channel: 'app' },
  }, (data) => data?.type === 'in');
  await check('Attendance manual check-out', 'POST', '/api/attendance/check', {
    body: { empCode: String(employee.emp_code), branchId: String(employee.branch_id_fk),
      type: 'out', checkOut: hhmm(10), channel: 'app' },
  }, (data) => data?.type === 'out');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance');
  sheet.addRow(['emp_code', 'emp_name', 'date', 'in', 'out', 'actual_in', 'actual_out', 'absent', 'hours', 'department']);
  sheet.addRow([employee.emp_code, employee.employee, '31/12/2099', '08:00', '16:00', '08:00', '16:00', '', 8, tag]);
  const xlsx = await workbook.xlsx.writeBuffer();
  const importForm = new FormData();
  importForm.append('hdoor_file', new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'attendance.xlsx');
  await check('Attendance device-file import', 'POST', '/api/attendance/imports/device-file', { form: importForm });

  await prisma.tbl_hdoor_emps.deleteMany({ where: { member_code: employee.emp_code } });
  await prisma.tbl_hdoor_emps_history.deleteMany({ where: { member_code: employee.emp_code } });
  await check('Legacy attendance_new valid punch', 'POST', '/Api/attendance_new', {
    form: urlForm({ lat: punchLat, long: punchLong }),
  });
  await check('Legacy Report_Basma', 'POST', '/Api/Report_Basma', {
    form: urlForm({ date_from: today, date_to: today }),
  });
  await check('Legacy Basma_Today', 'POST', '/Api/Basma_Today', { form: urlForm({}) });
  await check('Legacy sheft_types', 'POST', '/Api/sheft_types', { form: urlForm({}) });
  await check('Legacy dwam_types', 'POST', '/Api/dwam_types', { form: urlForm({ page: 1 }) });
  await check('Legacy Report_hours_edafi', 'POST', '/Api/Report_hours_edafi', { form: urlForm({}) });
  await check('Legacy report_tabdel_sheft', 'POST', '/Api/report_tabdel_sheft', { form: urlForm({}) });
}

async function mobileContentTests() {
  await check('Mobile profile', 'GET', '/api/mobile/profile');
  await check('Mobile device token', 'POST', '/api/mobile/device-token', { body: { token: tag } });
  const notifications = await check('Mobile notifications', 'GET', '/api/mobile/notifications');
  if (Array.isArray(notifications) && notifications[0]?.id) {
    await check('Mobile notification read', 'PATCH', `/api/mobile/notifications/${notifications[0].id}/read`);
  }
  await check('Mobile leaves list', 'GET', '/api/mobile/leaves');
  const leaveType = await prisma.holiday_setting.findFirst({ where: {
    agaza_ttype: { not: 1 }, id: { notIn: [3, 4, 20, 21] }, min_days: { lte: 1 },
    OR: [{ max_days: 0 }, { max_days: { gte: 1 } }],
  } });
  if (leaveType) {
    const leave = await check('Mobile leave create pending', 'POST', '/api/mobile/leaves', {
      body: { leaveTypeId: leaveType.id, startDate: futureDate, endDate: futureDate, reason: tag },
    });
    if (!modernOnly) {
      if (leave?.id) await check('Legacy leave cancel', 'POST', '/Api/Delete_agaza', { form: urlForm({ agaza_id: leave.id }) });
      const legacyLeave = await check('Legacy Add_Agaza form payload', 'POST', '/Api/Add_Agaza', {
        form: urlForm({ no3_agaza_id: leaveType.id, from_date: futureDate, to_date: futureDate, reason: tag }),
      });
      if (legacyLeave?.data?.id) await check('Legacy created leave cancel', 'POST', '/Api/Delete_agaza', {
        form: urlForm({ agaza_id: legacyLeave.data.id }),
      });
    }
  }
  const permission = await check('Mobile permission create pending', 'POST', '/api/mobile/permissions', {
    body: { no3Ezn: 1, eznDate: futureDate, fromHour: '10:00', toHour: '11:00', reason: tag, fatraFk: 1 },
  });
  await check('Mobile permissions list', 'GET', '/api/mobile/permissions?page=1&pageSize=20');
  if (!modernOnly) {
    if (permission?.id) await check('Legacy permission delete', 'POST', '/Api/Delete_ezn', { form: urlForm({ ezn_id: permission.id }) });
    const legacyPermission = await check('Legacy Add_Ezn Arabic time payload', 'POST', '/Api/Add_Ezn', {
      form: urlForm({ emp_id: employee.id, ezn_type_id: 1, from_time: '12:44 م', to_time: '2:44 م', reason: tag }),
    });
    if (legacyPermission?.data?.id) await check('Legacy created permission delete', 'POST', '/Api/Delete_ezn', {
      form: urlForm({ ezn_id: legacyPermission.data.id }),
    });
  }
  const task = await check('Mobile task create', 'POST', '/api/mobile/tasks', { body: { title: tag, notes: 'API test', status: 'done' } });
  await check('Mobile tasks list', 'GET', '/api/mobile/tasks?page=1&perPage=20');
  if (task?.id) await check('Mobile task delete', 'DELETE', `/api/mobile/tasks/${task.id}`);
  const circulars = await check('Mobile circulars list', 'GET', '/api/mobile/circulars?page=1&perPage=20');
  const circularId = circulars?.data?.find((x) => x.ta3mem_title === tag)?.id;
  if (circularId) {
    await check('Mobile circular detail', 'GET', `/api/mobile/circulars/${circularId}`);
    await check('Mobile circular read', 'PATCH', `/api/mobile/circulars/${circularId}/read`);
  }
  const warnings = await check('Mobile warnings list', 'GET', '/api/mobile/warnings?page=1&perPage=20');
  const warningId = warnings?.data?.find((x) => x.enzar_type === tag)?.id;
  if (warningId) {
    await check('Mobile warning detail', 'GET', `/api/mobile/warnings/${warningId}`);
    await check('Mobile warning read', 'PATCH', `/api/mobile/warnings/${warningId}/read`);
  }
  await check('Mobile generic requests list', 'GET', '/api/mobile/requests');
  await check('Mobile visit create', 'POST', '/api/mobile/visit', { body: { lat: '30.0444', long: '31.2357', notes: tag } });
  const laws = await check('Mobile legal files list', 'GET', '/api/mobile/legal-files?page=1&perPage=20');
  const lawId = Array.isArray(laws) ? Number(laws.find((x) => x.layha_name === tag)?.layha_id) : 0;
  if (lawId) await check('Mobile legal file read', 'PATCH', `/api/mobile/legal-files/${lawId}/read`);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const uploadForm = new FormData();
  uploadForm.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const upload = await check('Mobile activity image upload', 'POST', '/api/uploads/activity', { form: uploadForm }, (data) => Boolean(data?.path));
  if (upload?.path) createdUploads.push(upload.path);
  const activity = await check('Mobile activity create', 'POST', '/api/mobile/activities', {
    body: { title: tag, notes: 'API test', files: [upload?.path || 'nashat/test.png'] },
  });
  await check('Mobile activities list', 'GET', '/api/mobile/activities?page=1&perPage=20');
  if (activity?.main_id) await check('Mobile activity delete', 'DELETE', `/api/mobile/activities/${activity.main_id}`);
  await check('Mobile employees directory', 'GET', '/api/mobile/employees?page=1&perPage=100');
  const message = await check('Mobile internal message send', 'POST', '/api/mobile/messages', {
    body: { toUserIds: [managerAccount.user_id], subject: tag, message: 'API test' },
  });
  await check('Mobile messages sent', 'GET', '/api/mobile/messages/sent?page=1&perPage=20');
  if (message?.msg_id) {
    await check('Mobile message detail', 'GET', `/api/mobile/messages/${message.msg_id}`);
    await check('Mobile message delete', 'DELETE', `/api/mobile/messages/${message.msg_id}`);
  }
  const employeeToken = token;
  token = managerToken;
  const inboundMessage = await check('Mobile incoming message fixture', 'POST', '/api/mobile/messages', {
    body: { toUserIds: [account.user_id], subject: `${tag}_inbound`, message: 'API inbox test' },
  });
  token = employeeToken;
  await check('Mobile messages inbox', 'GET', '/api/mobile/messages/inbox?page=1&perPage=20');
  if (inboundMessage?.msg_id) {
    await check('Mobile incoming message detail', 'GET', `/api/mobile/messages/${inboundMessage.msg_id}`);
    await check('Mobile incoming message read', 'PATCH', `/api/mobile/messages/${inboundMessage.msg_id}/read`);
    await check('Mobile incoming message delete', 'DELETE', `/api/mobile/messages/${inboundMessage.msg_id}`);
  }
  await check('Mobile loan meta', 'GET', '/api/mobile/loans/meta');
  if (!modernOnly) {
    const legacyLoan = await check('Legacy Add_Solfa form payload', 'POST', '/Api/Add_Solfa', {
      form: urlForm({ emp_id: employee.id, qemt_solaf: 200, sadad_solfa: 2, qst_num: 1,
        solaf_reason: tag, khsm_form_date_m: futureDate }),
    });
    if (legacyLoan?.data?.id) await check('Legacy created loan cancel', 'POST', '/Api/Delete_solfa', {
      form: urlForm({ solfa_id: legacyLoan.data.id }),
    });
  }
  const loan = await check('Mobile loan create pending', 'POST', '/api/mobile/loans', {
    body: { amount: 100, repaymentMethod: 2, reason: tag },
  });
  await check('Mobile loans sent list', 'GET', '/api/mobile/loans?mode=sader&page=1&perPage=20');
  if (loan?.id) {
    await check('Mobile loan detail', 'GET', `/api/mobile/loans/${loan.id}`);
    token = managerToken;
    await check('Mobile loans received list', 'GET', '/api/mobile/loans?mode=wared&page=1&perPage=20');
    await check('Mobile loan manager action', 'PATCH', `/api/mobile/loans/${loan.id}/action`, {
      body: { action: 'reject', reason: tag },
    });
    token = employeeToken;
  }
  const cancellableLoan = await check('Mobile cancellable loan create', 'POST', '/api/mobile/loans', {
    body: { amount: 50, repaymentMethod: 2, reason: `${tag}_cancel` },
  });
  if (cancellableLoan?.id) {
    await check('Mobile loan cancel', 'DELETE', `/api/mobile/loans/${cancellableLoan.id}`);
  }
}

async function legacyReadTests() {
  const calls = [
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
    ['Solaf_meta', {}], ['Get_Solaf_List', { status: 'sader', page: 1 }],
  ];
  for (const [endpoint, values] of calls) {
    await check(`Legacy ${endpoint}`, 'POST', `/Api/${endpoint}`, { form: urlForm(values) });
  }
}

async function cleanup() {
  if (!employee) return;
  const empId = employee.id;
  const empCode = employee.emp_code;
  await prisma.hr_solaf_quest.deleteMany({ where: { emp_code_fk: empCode } }).catch(() => {});
  await prisma.hr_solaf.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  const leaves = await prisma.hr_all_agzat_orders.findMany({ where: { emp_id_fk: empId }, select: { id: true } }).catch(() => []);
  await prisma.hr_all_agzat_history.deleteMany({ where: { agaza_id_fk: { in: leaves.map((x) => x.id) } } }).catch(() => {});
  await prisma.hr_all_agzat_orders.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  const permissions = await prisma.hr_all_ozonat_orders.findMany({ where: { emp_id_fk: empId }, select: { id: true } }).catch(() => []);
  await prisma.hr_all_ozonat_history.deleteMany({ where: { ezn_id_fk: { in: permissions.map((x) => x.id) } } }).catch(() => {});
  await prisma.hr_all_ozonat_orders.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.hr_dialy_reports.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.hr_locations_visits.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.tbl_emp_zeyarat.deleteMany({ where: { emp_id: empId } }).catch(() => {});
  const activities = await prisma.hr_ansheta.findMany({ where: { emp_id: empId }, select: { id: true } }).catch(() => []);
  await prisma.hr_ansheta_files.deleteMany({ where: { main_id_fk: { in: activities.map((x) => x.id) } } }).catch(() => {});
  await prisma.hr_ansheta.deleteMany({ where: { emp_id: empId } }).catch(() => {});
  const messages = await prisma.hr_ta3mem_personal_msg.findMany({ where: { from_user_id: { in: [account?.user_id, managerAccount?.user_id].filter(Boolean) } }, select: { id: true } }).catch(() => []);
  await prisma.hr_ta3mem_personal_msg_details.deleteMany({ where: { ta3mem_msg_id_fk: { in: messages.map((x) => x.id) } } }).catch(() => {});
  await prisma.hr_ta3mem_personal_msg.deleteMany({ where: { from_user_id: account?.user_id } }).catch(() => {});
  await prisma.tbl_hdoor_emps.deleteMany({ where: { member_code: empCode } }).catch(() => {});
  await prisma.tbl_hdoor_emps_history.deleteMany({ where: { member_code: empCode } }).catch(() => {});
  await prisma.tbl_emp_hdoor.deleteMany({ where: { emp_code: empCode } }).catch(() => {});
  await prisma.tbl_emps_shef_edafi.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.tbl_emps_hours_edafi.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.tbl_hdoor_dawms_emps.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.tbl_notifications.deleteMany({ where: { OR: [{ to_user: account?.user_id }, { from_user: account?.user_id }] } }).catch(() => {});
  await prisma.hr_lawyeh_files_seens.deleteMany({ where: { emp_id_fk: empId } }).catch(() => {});
  await prisma.hr_lawyeh_files.deleteMany({ where: { title: tag } }).catch(() => {});
  await prisma.hr_ta3mem_details.deleteMany({ where: { emp_id: empId } }).catch(() => {});
  await prisma.hr_ta3mem.deleteMany({ where: { ta3mem_title: tag } }).catch(() => {});
  await prisma.hr_enzarat.deleteMany({ where: { emp_name_id: empId } }).catch(() => {});
  await prisma.attendance_devices.deleteMany({ where: { title: tag } }).catch(() => {});
  await prisma.users.deleteMany({ where: { user_id: { in: [account?.user_id, managerAccount?.user_id].filter(Boolean) } } }).catch(() => {});
  await prisma.employees.deleteMany({ where: { id: { in: [empId, manager?.id].filter(Boolean) } } }).catch(() => {});
  if (shift) await prisma.tbl_hdodr_setting.deleteMany({ where: { id: shift.id } }).catch(() => {});
  if (site) await prisma.tbl_sites.deleteMany({ where: { id: site.id } }).catch(() => {});
  if (originalAppChannel) {
    await prisma.attendance_channels.update({ where: { key: 'app' }, data: { enabled: originalAppChannel.enabled, label: originalAppChannel.label } }).catch(() => {});
  } else {
    await prisma.attendance_channels.deleteMany({ where: { key: 'app' } }).catch(() => {});
  }
  for (const rel of createdUploads) {
    const full = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
}

async function main() {
  try {
    await createFixture();
    await loginTests();
    if (!token) throw new Error('Login did not return an access token');
    await attendanceTests();
    await mobileContentTests();
    if (!modernOnly) await legacyReadTests();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok);
  console.log(JSON.stringify({ baseUrl, total: results.length, passed, failed: failed.length, failures: failed, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(async (error) => {
  console.error(JSON.stringify({ fatal: error.message, stack: error.stack }, null, 2));
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 2;
});
