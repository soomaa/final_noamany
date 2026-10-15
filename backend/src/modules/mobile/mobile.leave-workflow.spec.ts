import { MobileService } from './mobile.service';

describe('MobileService leave workflow parity', () => {
  it('delegates mobile leave creation to the shared validated workflow with explicit employee id', async () => {
    const leaveWorkflow = {
      create: jest.fn().mockResolvedValue({ id: 81, agaza_rkm: 1008 }),
    };
    const service = new MobileService(
      {} as never,
      {} as never,
      leaveWorkflow as never,
    );
    const user = {
      sub: 7,
      employeeId: 17,
      employeeCode: 4401,
      name: 'موظف',
    } as never;

    await expect(service.createLeave(user, {
      leaveTypeId: 1,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      reason: 'إجازة',
    })).resolves.toEqual({ id: 81, agaza_rkm: 1008 });

    expect(leaveWorkflow.create).toHaveBeenCalledWith({
      leaveTypeId: 1,
      empId: 17,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      reason: 'إجازة',
    }, 7, 'موظف');
  });
});
