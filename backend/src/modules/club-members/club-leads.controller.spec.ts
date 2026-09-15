import { ClubLeadsController } from './club-leads.controller';

describe('ClubLeadsController sales portal contract', () => {
  it('delegates personal CRM reads and renewal ensure with the authenticated user', async () => {
    const service: any = {
      mine: jest.fn().mockResolvedValue({ data: [] }),
      reminders: jest.fn().mockResolvedValue({ data: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 4 }),
      ensureRenewalLead: jest.fn().mockResolvedValue({ id: 7 }),
    };
    const controller = new ClubLeadsController(service);
    const user = { sub: 9, emp_code: 77, branch: 1 } as never;

    await controller.mine(user, { page: '2' });
    await controller.reminders(user, { page: '3' });
    await controller.findOne(4, user);
    await controller.ensureRenewal(41, user);

    expect(service.mine).toHaveBeenCalledWith(user, { page: '2' });
    expect(service.reminders).toHaveBeenCalledWith(user, { page: '3' });
    expect(service.findOne).toHaveBeenCalledWith(4, user);
    expect(service.ensureRenewalLead).toHaveBeenCalledWith(41, user);
  });
});
