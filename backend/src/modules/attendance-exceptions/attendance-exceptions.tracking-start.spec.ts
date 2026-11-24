import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { defaultHrPayrollSettings } from '../hr-payroll-settings/hr-payroll-settings.defaults';
import { AttendanceExceptionsService } from './attendance-exceptions.service';

function service(trackingStart: string | null) {
  const settings = { get: jest.fn().mockResolvedValue({ ...defaultHrPayrollSettings(), exceptionsTrackingStartDate: trackingStart }) };
  const prisma = { employees: { findMany: jest.fn().mockResolvedValue([{ id: 1, emp_code: 1001 }]) } };
  const exceptions = new AttendanceExceptionsService(prisma as never, new BranchScopeService(), undefined, settings as never);
  const compute = jest.spyOn(exceptions, 'computeCases').mockResolvedValue([]);
  return { exceptions, compute };
}

describe('daily exceptions tracking start date', () => {
  it('open cases (banner / reminders / escalation) start at the tracking date', async () => {
    const { exceptions, compute } = service('2026-11-20');
    await exceptions.openCases(null, '2026-11-01', '2026-11-25');
    expect(compute).toHaveBeenCalledWith(expect.anything(), '2026-11-20', '2026-11-25', null, expect.anything());
  });

  it('a window entirely before the tracking date yields nothing', async () => {
    const { exceptions, compute } = service('2026-11-20');
    await expect(exceptions.openCases(null, '2026-11-01', '2026-11-10')).resolves.toEqual([]);
    expect(compute).not.toHaveBeenCalled();
  });

  it('no tracking date keeps the requested window', async () => {
    const { exceptions, compute } = service(null);
    await exceptions.openCases(null, '2026-11-01', '2026-11-25');
    expect(compute).toHaveBeenCalledWith(expect.anything(), '2026-11-01', '2026-11-25', null, expect.anything());
  });
});
