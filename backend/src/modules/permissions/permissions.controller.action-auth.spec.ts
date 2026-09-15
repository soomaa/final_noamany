import { ForbiddenException } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';

describe('PermissionsController action authorization', () => {
  const user = { sub: 7, name: 'Reviewer' } as never;

  it('requires the approve permission for an accept action, not just view', async () => {
    const can = jest.fn().mockResolvedValue(false);
    const action = jest.fn();
    const controller = new PermissionsController(
      { action } as never,
      { can } as never,
    );

    await expect(
      controller.action(19, { action: 'accept' } as never, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(can).toHaveBeenCalledWith(7, 'leaves.permissions', 'approve');
    expect(action).not.toHaveBeenCalled();
  });

  it('requires the reject permission for a reject action', async () => {
    const can = jest.fn().mockResolvedValue(false);
    const action = jest.fn();
    const controller = new PermissionsController(
      { action } as never,
      { can } as never,
    );

    await expect(
      controller.action(19, { action: 'reject' } as never, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(can).toHaveBeenCalledWith(7, 'leaves.permissions', 'reject');
    expect(action).not.toHaveBeenCalled();
  });

  it('proceeds once the matching permission is granted', async () => {
    const can = jest.fn().mockResolvedValue(true);
    const action = jest.fn().mockResolvedValue({ ok: true });
    const controller = new PermissionsController(
      { action } as never,
      { can } as never,
    );

    await expect(
      controller.action(19, { action: 'accept' } as never, user),
    ).resolves.toEqual({ ok: true });
    expect(action).toHaveBeenCalledWith(19, { action: 'accept' }, 7, 'Reviewer');
  });
});
