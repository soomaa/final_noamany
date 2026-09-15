import { LegacyMobileController } from './legacy-mobile.controller';

describe('LegacyMobileController Flutter form compatibility', () => {
  const mobile = {};
  const leaves = { create: jest.fn() };
  const permissions = { create: jest.fn() };
  const attendance = { mobilePunch: jest.fn() };
  const compat = {};
  const uploads = {};
  const loans = { mobileCreate: jest.fn() };
  const controller = new LegacyMobileController(
    mobile as never,
    leaves as never,
    permissions as never,
    attendance as never,
    compat as never,
    uploads as never,
    loans as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('normalizes Arabic meridiem permission times before applying the two-hour limit', async () => {
    permissions.create.mockResolvedValue({ id: 91 });
    const user = { sub: 196, emp_code: 56, name: 'اسماء حلمى' } as never;

    const result = await controller.createPermission({
      emp_id: 56,
      ezn_type_id: 1,
      from_time: '12:44 م',
      to_time: '2:44 م',
      reason: 'اختبار',
    }, {}, user);

    expect(result).toEqual(expect.objectContaining({ status: 200, data: { id: 91 } }));
    expect(permissions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        no3Ezn: 1,
        fromHour: '12:44:00',
        toHour: '14:44:00',
        reason: 'اختبار',
      }),
      196,
      'اسماء حلمى',
    );
  });

  it('maps the exact legacy loan payload and ignores posted emp_id', async () => {
    loans.mobileCreate.mockResolvedValue({ id: 92 });
    const user = { sub: 196, emp_code: 56, name: 'اسماء حلمى' } as never;

    const result = await controller.createLoan({
      emp_id: 56,
      qemt_solaf: 200,
      sadad_solfa: 2,
      qst_num: 1,
      solaf_reason: 'dfx',
      khsm_form_date_m: '2026-09-01',
    }, {}, user);

    expect(result).toEqual(expect.objectContaining({ status: 200, data: { id: 92 } }));
    expect(loans.mobileCreate).toHaveBeenCalledWith(user, {
      amount: 200,
      repaymentMethod: 2,
      reason: 'dfx',
      installments: 1,
      deductionStartDate: '2026-09-01',
    });
  });
});
