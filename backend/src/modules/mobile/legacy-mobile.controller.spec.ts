import { LegacyMobileController } from './legacy-mobile.controller';

describe('LegacyMobileController', () => {
  const mobile = {
    legacyLogin: jest.fn(),
    createDailyTask: jest.fn(),
    dailyTasks: jest.fn(),
    circulars: jest.fn(),
    warnings: jest.fn(),
  };
  const controller = new LegacyMobileController(
    mobile as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('accepts login_app phone/user_pass and returns the legacy envelope', async () => {
    mobile.legacyLogin.mockResolvedValue({ access_token: 'signed-token', emp_id: '7' });

    await expect(
      controller.login({ phone: '01000000000', user_pass: 'secret' }, {}),
    ).resolves.toEqual({
      status: 200,
      message: 'تم التسجيل بنجاح',
      logout_option: 1,
      data: { access_token: 'signed-token', emp_id: '7' },
    });
    expect(mobile.legacyLogin).toHaveBeenCalledWith('01000000000', 'secret');
  });

  it('returns a legacy validation error rather than a fake success', async () => {
    await expect(controller.login({ phone: '01000000000' }, {})).resolves.toEqual(
      expect.objectContaining({ status: 400, logout_option: 0, data: null }),
    );
    expect(mobile.legacyLogin).not.toHaveBeenCalled();
  });

  it('uses JWT identity for Add_Task and ignores a posted employee id', async () => {
    mobile.createDailyTask.mockResolvedValue({ id: 81 });
    const user = { sub: 4, emp_code: 1004, name: 'Employee' } as never;

    const result = await controller.createTask(
      { emp_id: 999, title: 'Daily', notes: 'Done', status: 'done' },
      {},
      user,
    );

    expect(result).toEqual(expect.objectContaining({ status: 200, data: { id: 81 } }));
    expect(mobile.createDailyTask).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ title: 'Daily', status: 'done' }),
    );
  });

  it('keeps the legacy circular envelope and ignores posted emp_id', async () => {
    const row = { ta3mem_id_fk: '5', ta3mem_title: 'تعميم' };
    mobile.circulars.mockResolvedValue({ data: [row] });
    const user = { sub: 4, emp_code: 8 } as never;

    await expect(controller.circulars({ emp_id: 999, page: 1, per_page: 10 }, {}, user))
      .resolves.toEqual(expect.objectContaining({
        status: 200,
        data: [expect.objectContaining({ ...row, seen: '0' })],
      }));
    expect(mobile.circulars).toHaveBeenCalledWith(user, expect.objectContaining({ page: 1, perPage: 10 }));
  });
});
