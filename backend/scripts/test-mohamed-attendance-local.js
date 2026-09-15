/** Local-only setup and real database attendance test for Mohamed Ahmed. */
const { PrismaClient } = require('@prisma/client');
const { EmployeesService } = require('../dist/modules/employees/employees.service');
const { AttendanceService } = require('../dist/modules/attendance/attendance.service');

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employees.findMany({
    where: { employee: { contains: 'محمد احمد' } },
    select: { id: true, emp_code: true, employee: true, branch_id_fk: true },
  });
  const employee = employees.find((row) => row.employee?.trim() === 'محمد احمد');
  if (!employee) throw new Error('Mohamed Ahmed was not found');

  const [geofence, shifts, currentAssignments] = await Promise.all([
    prisma.branch_settings.findUnique({ where: { id: employee.branch_id_fk } }),
    prisma.tbl_hdodr_setting.findMany({ orderBy: { id: 'asc' } }),
    prisma.tbl_hdoor_dawms_emps.findMany({
      where: { OR: [{ emp_id_fk: employee.id }, { emp_code_fk: employee.emp_code }] },
      orderBy: { id: 'asc' },
    }),
  ]);

  if (!geofence?.lat_map || !geofence?.long_map) throw new Error('Employee branch geofence is incomplete');
  const morningShift = shifts.find((row) => row.title === 'الدوام الصباحي') ?? shifts[0];
  if (!morningShift) throw new Error('No attendance shift was found');

  let assignment = currentAssignments.find(
    (row) => row.dwam_id_fk === morningShift.id && String(row.branch_id_fk) === String(employee.branch_id_fk),
  );
  if (!assignment) {
    const employeesService = new EmployeesService(prisma);
    const saved = await employeesService.putDwam(employee.id, {
      shiftId: morningShift.id,
      branchId: employee.branch_id_fk,
    });
    assignment = await prisma.tbl_hdoor_dawms_emps.findUnique({ where: { id: saved.assignmentId } });
  }

  // Exercise the real GPS + shift + transaction path at 08:30 local time. This
  // keeps production code server-time-only while making the local test repeatable.
  const RealDate = Date;
  const fixedTime = new RealDate(2026, 7, 15, 8, 30, 0);
  class FixedDate extends RealDate {
    constructor(...args) {
      super(args.length ? args[0] : fixedTime.getTime());
    }
    static now() { return fixedTime.getTime(); }
  }

  let punch;
  try {
    global.Date = FixedDate;
    const attendanceService = new AttendanceService(prisma);
    punch = await attendanceService.mobilePunch(
      { sub: 39, emp_code: employee.id, branch: employee.branch_id_fk, level: 2 },
      { lat: geofence.lat_map, long: geofence.long_map },
    );
  } catch (error) {
    // A prior successful run is acceptable and must not be deleted from local data.
    const existing = await prisma.tbl_hdoor_emps.findFirst({
      where: { member_code: employee.emp_code, action_date_s: '2026-08-15', dwam_id_fk: morningShift.id },
      orderBy: { hodoor_id: 'desc' },
    });
    if (!existing?.hdoor_time) throw error;
    punch = { alreadyRecorded: true, id: existing.hodoor_id, type: 'in', hdoorTime: existing.hdoor_time };
  } finally {
    global.Date = RealDate;
  }

  const assignments = await prisma.tbl_hdoor_dawms_emps.findMany({
    where: { OR: [{ emp_id_fk: employee.id }, { emp_code_fk: employee.emp_code }] },
    orderBy: { id: 'asc' },
  });
  const storedPunch = await prisma.tbl_hdoor_emps.findFirst({
    where: { member_code: employee.emp_code, action_date_s: '2026-08-15', dwam_id_fk: morningShift.id },
    orderBy: { hodoor_id: 'desc' },
    select: {
      hodoor_id: true,
      member_code: true,
      branch_id_fk: true,
      dwam_id_fk: true,
      hdoor_time: true,
      hdoor_lat: true,
      hdoor_long: true,
      late_min: true,
      tasgel_type: true,
    },
  });
  console.log(JSON.stringify({ employee, geofence, morningShift, assignment, assignments, punch, storedPunch }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
