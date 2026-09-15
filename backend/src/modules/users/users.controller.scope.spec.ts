import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController scope editor authorization', () => {
  it('rejects both scope reads and atomic writes unless the caller is a system administrator', () => {
    const service = { getPermissions: jest.fn(), putPermissions: jest.fn() };
    const controller = new UsersController(service as never);
    const branchManager = { sub: 8, level: 3, branch: 5, man_women_type: 0 } as never;

    expect(() => controller.getPermissions(9, branchManager)).toThrow(ForbiddenException);
    expect(() => controller.putPermissions(9, { permissions: ['12'], scope: { branchId: 5, gender: 'male' } }, branchManager)).toThrow(ForbiddenException);
    expect(service.getPermissions).not.toHaveBeenCalled();
    expect(service.putPermissions).not.toHaveBeenCalled();
  });
});
