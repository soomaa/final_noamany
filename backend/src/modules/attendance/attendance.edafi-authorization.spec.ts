import { AttendanceService } from './attendance.service';

const targetEmployee = {
  id: 20,
  emp_code: 200,
  employee: 'الموظف المستهدف',
  branch_id_fk: 3,
  manger: '10',
};

const actorEmployee = {
  id: 10,
  emp_code: 100,
  employee: 'المدير المباشر',
};

function prismaFixture(options?: {
  targetManager?: string;
  actor?: typeof actorEmployee;
  activeHrPersonId?: number | null;
}) {
  const target = { ...targetEmployee, manger: options?.targetManager ?? targetEmployee.manger };
  const actor = options?.actor ?? actorEmployee;
  return {
    users: {
      findUnique: jest.fn().mockResolvedValue({ user_id: 501, emp_code: actor.id }),
    },
    employees: {
      findUnique: jest.fn().mockResolvedValue(target),
      findFirst: jest.fn().mockResolvedValue(actor),
    },
    hr_egraat_emp_setting: {
      findFirst: jest.fn().mockResolvedValue(
        options?.activeHrPersonId == null
          ? null
          : { person_id: options.activeHrPersonId, person_code: String(options.activeHrPersonId) },
      ),
    },
    tbl_emps_shef_edafi: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 700 }),
    },
    tbl_hdodr_setting: {
      findUnique: jest.fn().mockResolvedValue({ id: 4 }),
    },
    tbl_emps_hours_edafi: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 800 }),
    },
  };
}

describe('AttendanceService special shifts and extra hours authorization', () => {
  it('rejects a shift change by a user who is not the direct manager or active HR officer', async () => {
    const prisma = prismaFixture({ targetManager: '99' });
    const service = new AttendanceService(prisma as never);

    await expect(service.createShiftSwap({
      empId: 20,
      ttype: 1,
      dwamIdFk: 4,
      sheftDate: '2026-08-24',
    }, 501)).rejects.toMatchObject({
      status: 403,
      message: 'غير مسموح: أنت لست المدير المباشر لهذا الموظف ولا مسؤول الموارد البشرية المعيّن',
    });
  });

  it('allows the direct manager to change a shift and records that manager as publisher employee', async () => {
    const prisma = prismaFixture();
    const service = new AttendanceService(prisma as never);

    await service.createShiftSwap({
      empId: 20,
      ttype: 1,
      dwamIdFk: 4,
      sheftDate: '2026-08-24',
    }, 501);

    expect(prisma.tbl_emps_shef_edafi.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emp_id_fk: 20,
        publisher: 501,
        publisher_emp_id: 10,
      }),
    });
  });

  it('allows the active HR officer configured under job-title code 44', async () => {
    const hrActor = { id: 44, emp_code: 440, employee: 'مسؤول الموارد البشرية' };
    const prisma = prismaFixture({
      targetManager: '99',
      actor: hrActor,
      activeHrPersonId: 44,
    });
    const service = new AttendanceService(prisma as never);

    await service.createExtraHours({
      empId: 20,
      numHours: 3,
      edafaDate: '2026-08-24',
    }, 501);

    expect(prisma.tbl_emps_hours_edafi.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emp_id_fk: 20,
        publisher: 501,
        publisher_emp_id: 44,
      }),
    });
  });

  it('rejects extra hours by a user who is not the direct manager or active HR officer', async () => {
    const prisma = prismaFixture({ targetManager: '99' });
    const service = new AttendanceService(prisma as never);

    await expect(service.createExtraHours({
      empId: 20,
      numHours: 3,
      edafaDate: '2026-08-24',
    }, 501)).rejects.toMatchObject({
      status: 403,
      message: 'غير مسموح: أنت لست المدير المباشر لهذا الموظف ولا مسؤول الموارد البشرية المعيّن',
    });
  });
});
