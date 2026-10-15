import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FinancePayrollService } from './finance-payroll.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ListPayrollRunsDto } from '../payroll/dto/payroll.dto';

const user = { sub: 7, employeeId: 12, branch: 3 } as JwtUser;
function setup(status = 'computed') {
  const payroll = {
    listRuns: jest.fn().mockResolvedValue({ data: [{ id: 10, status }], total: 1 }),
    findRun: jest.fn().mockResolvedValue({ id: 10, status }),
    listRunLines: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getSlip: jest.fn().mockResolvedValue({ netSalary: 9500, deductions: { incomeTax: 500 } }),
    createRun: jest.fn().mockResolvedValue({ id: 10, status }),
    runAction: jest.fn().mockResolvedValue({ id: 10, status: 'reviewing' }),
  };
  const permissions = { canAny: jest.fn().mockResolvedValue(true) };
  return { payroll, permissions, service: new FinancePayrollService(payroll as never, permissions as never) };
}

describe('Finance payroll shares the ONE80 HR workflow', () => {
  it('passes the authenticated HR scope through for list, lines, and historical slips', async () => {
    const { service, payroll } = setup();
    const query = new ListPayrollRunsDto();
    await service.listRuns(query, user);
    await service.listRunLines(10, query, user);
    await service.getSlip(10, 21, user);
    expect(payroll.listRuns).toHaveBeenCalledWith(query, user);
    expect(payroll.listRunLines).toHaveBeenCalledWith(10, query, user);
    expect(payroll.getSlip).toHaveBeenCalledWith(10, 21, user);
  });

  it('requires HR payroll permission even when a caller can open finance', async () => {
    const { service, permissions, payroll } = setup();
    permissions.canAny.mockResolvedValue(false);
    await expect(service.listRuns(new ListPayrollRunsDto(), user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createRun({ month: 9, year: 2026 }, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.runAction(10, 'approve', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(payroll.listRuns).not.toHaveBeenCalled();
    expect(payroll.createRun).not.toHaveBeenCalled();
    expect(payroll.runAction).not.toHaveBeenCalled();
  });

  it('reuses the existing period lock and rejects an already-created HR payroll month', async () => {
    const { service, payroll } = setup();
    payroll.createRun.mockRejectedValue(new ConflictException('مسيرة هذا الشهر موجودة مسبقًا'));
    await expect(service.createRun({ month: 9, year: 2026 }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(payroll.createRun).toHaveBeenCalledTimes(1);
    expect(payroll.createRun).toHaveBeenCalledWith({ month: 9, year: 2026 }, user);
  });

  it('approval invokes only HR approval, never post, payment, or bank settlement', async () => {
    const { service, payroll, permissions } = setup('reviewing');
    await service.runAction(10, 'approve', user);
    expect(permissions.canAny).toHaveBeenCalledWith(7, ['payroll.runs:approve']);
    expect(payroll.runAction.mock.calls).toEqual([[10, 'approve', 7, user]]);
  });

  it('rejects repeat payment actions and unsupported per-employee payment shortcuts', async () => {
    const { service, payroll } = setup('completed');
    for (const action of ['compute', 'review', 'approve', 'post', 'bank', 'bank-sync', 'approve-all', 'pay']) {
      await expect(service.runAction(10, action, user)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(payroll.runAction).not.toHaveBeenCalled();
  });

  it('keeps bank verification and exact settlement failure authoritative', async () => {
    const { service, payroll, permissions } = setup('bank_prepared');
    payroll.runAction.mockRejectedValue(new BadRequestException('البنك لم يؤكد تسوية كامل صافي المسيرة بعد'));
    await expect(service.runAction(10, 'bank-sync', user)).rejects.toThrow('البنك لم يؤكد');
    expect(permissions.canAny).toHaveBeenCalledWith(7, ['payroll.runs:execute']);
    expect(payroll.runAction).toHaveBeenCalledWith(10, 'bank-sync', 7, user);
  });

  it('only posts an approved HR run and preserves the bank file response', async () => {
    const { service, payroll } = setup('posted');
    const response = { id: 10, status: 'bank_prepared', bankFile: { filename: 'salary.csv', content: 'name,amount' } };
    payroll.runAction.mockResolvedValue(response);
    await expect(service.runAction(10, 'post', user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.runAction(10, 'bank', user)).resolves.toEqual(response);
    expect(payroll.runAction).toHaveBeenCalledTimes(1);
  });
});
