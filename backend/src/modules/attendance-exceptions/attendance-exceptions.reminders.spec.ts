import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { AttendanceExceptionsService } from './attendance-exceptions.service';
import {
  AttendanceExceptionsRemindersService,
  casesPhrase,
  hrEscalationText,
  managerReminderText,
} from './attendance-exceptions.reminders';

const NOW = new Date('2026-11-24T08:00:00Z'); // 10:00 Cairo

function item(date: string, branchId: number, section: 'male' | 'female' | null = 'male') {
  return { key: `${date}|${branchId}`, date, branchId, homeBranchId: branchId, branchName: `فرع ${branchId}`, section, resolution: null };
}

function setup(options: { log?: Array<{ open_count: number }>; cases?: unknown[] } = {}) {
  const prisma: Record<string, any> = {
    users: {
      findMany: jest.fn().mockResolvedValue([
        { user_id: 10, level: 3, emp_code: 100, branch_id_fk: 2, name: 'مدير طنطا' },
        { user_id: 11, level: 3, emp_code: 101, branch_id_fk: 3, name: 'مدير المحلة' },
        { user_id: 12, level: 2, emp_code: 102, branch_id_fk: 2, name: 'موظف' },
        { user_id: 13, level: 3, emp_code: 103, branch_id_fk: 3, name: 'مشرفة' },
      ]),
      findFirst: jest.fn().mockResolvedValue({ user_id: 1 }),
    },
    employees: {
      findMany: jest.fn().mockResolvedValue([
        { id: 100, emp_code: 5100, branch_id_fk: 2, emp_type: 1, mosma_wazefy_n: 'مدير فرع', employee_type: 1, leave_emp: 0 },
        { id: 101, emp_code: 5101, branch_id_fk: 3, emp_type: 1, mosma_wazefy_n: 'مدير فرع', employee_type: 2, leave_emp: 0 },
        { id: 102, emp_code: 5102, branch_id_fk: 2, emp_type: 1, mosma_wazefy_n: 'ريسبشن', employee_type: 1, leave_emp: 0 },
        { id: 103, emp_code: 5103, branch_id_fk: 3, emp_type: 2, mosma_wazefy_n: 'مشرف إدارة حريمي', employee_type: 1, leave_emp: 0 },
      ]),
    },
    department_jobs: { findMany: jest.fn().mockResolvedValue([]) },
    hr_egraat_emp_setting: { findMany: jest.fn().mockResolvedValue([]) },
    rbac_user_roles: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(options.log ?? []),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  };
  const permissions = {
    getEffective: jest.fn(async (userId: number) => ({
      superAdmin: false,
      keys: new Set(userId === 12 ? ['attendance.exceptions:view'] : ['attendance.exceptions:view', 'attendance.exceptions:update']),
      scope: new Map(),
    })),
  };
  const push = { sendToUsers: jest.fn().mockResolvedValue({ sent: 1, skipped: 0 }) };
  const exceptions = new AttendanceExceptionsService(prisma as never, new BranchScopeService());
  jest.spyOn(exceptions, 'openCases').mockResolvedValue((options.cases ?? []) as never);
  const service = new AttendanceExceptionsRemindersService(
    prisma as never, exceptions, new BranchScopeService(), permissions as never, push as never,
  );
  return { service, prisma, push };
}

describe('attendance exception reminder texts', () => {
  it('uses the Arabic count forms', () => {
    expect(casesPhrase(1)).toBe('حالة حضور واحدة');
    expect(casesPhrase(2)).toBe('حالتين حضور');
    expect(casesPhrase(4)).toBe('4 حالات حضور');
    expect(casesPhrase(12)).toBe('12 حالة حضور');
    expect(managerReminderText(4, 3, 1).title).toBe('عندك 4 حالات حضور محتاجة قرار');
    expect(hrEscalationText([{ branchName: 'طنطا', stale: 3 }, { branchName: 'المحلة', stale: 0 }], 3).body).toContain('طنطا: 3');
  });
});

describe('AttendanceExceptionsRemindersService', () => {
  it('notifies each active manager with the update permission about the open cases of their branches only', async () => {
    const { service, push } = setup({
      cases: [item('2026-11-24', 2), item('2026-11-23', 5), item('2026-11-20', 2), item('2026-11-23', 3, 'male'), item('2026-11-23', 4, 'female')],
    });
    const result = await service.remindManagers(NOW);
    // 10: Tanta (2) + its sub-branch 5. 11: suspended employee. 12: view only. 13: women's section, every branch.
    expect(push.sendToUsers.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [[10], 'عندك 3 حالات حضور محتاجة قرار'],
      [[13], 'عندك حالة حضور واحدة محتاجة قرار'],
    ]);
    expect(push.sendToUsers.mock.calls[0][2]).toContain('1 مفتوحة من يومين أو أكتر');
    expect(result).toMatchObject({ recipients: 2, sent: 2, skippedDuplicate: 0 });
  });

  it('does not repeat the same count on the same day, but sends when it changed', async () => {
    const cases = [item('2026-11-24', 2)];
    const same = setup({ cases, log: [{ open_count: 1 }] });
    expect(await same.service.remindManagers(NOW)).toMatchObject({ sent: 0, skippedDuplicate: 1 });
    const changed = setup({ cases, log: [{ open_count: 3 }] });
    expect(await changed.service.remindManagers(NOW)).toMatchObject({ sent: 1 });
  });

  it('escalates cases open two days or more to HR once a day, falling back to an admin', async () => {
    const { service, push, prisma } = setup({ cases: [item('2026-11-24', 2), item('2026-11-22', 2), item('2026-11-21', 3)] });
    const result = await service.escalateToHr(NOW);
    expect(result).toMatchObject({ recipients: 1, sent: 1 });
    expect(push.sendToUsers).toHaveBeenCalledWith([1], 'حالتين حضور مفتوحة من يومين أو أكتر', expect.stringContaining('فرع 2: 1'));
    prisma.$queryRaw.mockResolvedValue([{ open_count: 2 }]);
    expect(await service.escalateToHr(NOW)).toMatchObject({ sent: 0, skippedDuplicate: 1 });
  });

  it('finds HR through job-title code 44 and the hr_manager role', async () => {
    const { service, prisma } = setup();
    prisma.hr_egraat_emp_setting.findMany.mockResolvedValue([{ person_id: 200, person_code: null }]);
    prisma.employees.findMany.mockResolvedValue([{ id: 200, emp_code: 5200, employee_type: 1, leave_emp: 0 }]);
    prisma.users.findMany
      .mockResolvedValueOnce([{ user_id: 20 }])
      .mockResolvedValueOnce([{ user_id: 21 }]);
    prisma.rbac_user_roles.findMany.mockResolvedValue([{ user_id: 21 }]);
    expect((await service.hrUserIds()).sort()).toEqual([20, 21]);
  });
});
