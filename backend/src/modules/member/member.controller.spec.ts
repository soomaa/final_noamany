import { BadRequestException } from '@nestjs/common';
import { MemberAuthController } from './member.controller';
import { MemberAuthService } from './member-auth.service';

describe('MemberAuthController.login', () => {
  const auth = { login: jest.fn() };
  const controller = new MemberAuthController(auth as unknown as MemberAuthService);

  beforeEach(() => jest.clearAllMocks());

  it('accepts the legacy username field as the member phone number', () => {
    auth.login.mockResolvedValue({ message: 'تم تسجيل الدخول بنجاح' });

    controller.login({ username: '01000000000', password: '000000' });

    expect(auth.login).toHaveBeenCalledWith('01000000000', '000000', undefined);
  });

  it('uses phone when both compatibility fields are supplied', () => {
    controller.login({ phone: '01000000000', username: '01111111111', password: '000000' });

    expect(auth.login).toHaveBeenCalledWith('01000000000', '000000', undefined);
  });

  it('passes an explicit branch through for members enrolled in several branches', () => {
    controller.login({ phone: '01000000000', password: '000000', branchId: 2 });

    expect(auth.login).toHaveBeenCalledWith('01000000000', '000000', 2);
  });

  it('rejects a request without either login field', () => {
    expect(() => controller.login({ password: '000000' })).toThrow(BadRequestException);
  });
});
