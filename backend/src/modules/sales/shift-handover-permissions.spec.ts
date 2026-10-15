import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ShiftSessionsController } from './shift-sessions.controller';
import { ShiftsController } from './shifts.controller';
import { BranchesController } from '../branches/branches.controller';

const engine = { canAny: jest.fn().mockResolvedValue(false) };
const guard = new PermissionsGuard(new Reflector(), {} as never, engine as never);
function context(controller: any, method: string) {
  return { getHandler: () => controller.prototype[method], getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: 42, level: 2, branch: 1 } }) }) } as never;
}
describe('shift handover for authenticated roles without management permissions', () => {
  it.each([
    [ShiftSessionsController, 'getCurrent'], [ShiftSessionsController, 'start'],
    [ShiftSessionsController, 'switchShift'],
    [ShiftsController, 'list'], [ShiftsController, 'getCurrent'], [ShiftsController, 'scheduleStatus'],
  ])('permits the operational route %p.%s', async (controller, method) => {
    await expect(guard.canActivate(context(controller, method as string))).resolves.toBe(true);
  });
  it.each([[ShiftsController, 'create'], [ShiftsController, 'remove'],
    [ShiftSessionsController, 'createDrawerMovement'], [ShiftSessionsController, 'report'],
    [BranchesController, 'findAll'], [BranchesController, 'create'],
  ])('still denies management route %p.%s', async (controller, method) => {
    await expect(guard.canActivate(context(controller, method as string))).rejects.toThrow();
  });
});

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ShiftSessionsService } from './shift-sessions.service';
import { BranchesService } from '../branches/branches.service';

describe('handover security boundaries', () => {
  it.each([ShiftSessionsController, ShiftsController, BranchesController])('retains authentication on %p', (controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(JwtAuthGuard);
  });
  it.each([[ShiftSessionsController, 'closeOwn'], [BranchesController, 'findOptions']])('permits scoped operation %p.%s without a role grant', async (controller, method) => {
    await expect(guard.canActivate(context(controller, method as string))).resolves.toBe(true);
  });
  it('allows an owner to close their shift and forward the preview flag', async () => {
    const service = new ShiftSessionsService({ sales_shift_sessions: {
      findUnique: jest.fn().mockResolvedValue({ user_id: 42 }),
    } } as never, {} as never, {} as never, {} as never, {} as never);
    const close = jest.spyOn(service, 'close').mockResolvedValue({} as never);
    await service.closeOwn(7, {} as never, 42, true);
    expect(close).toHaveBeenCalledWith(7, {}, 42, true);
  });
  it('rejects closing another cashier shift before executing any close operation', async () => {
    const service = new ShiftSessionsService({ sales_shift_sessions: {
      findUnique: jest.fn().mockResolvedValue({ user_id: 43 }),
    } } as never, {} as never, {} as never, {} as never, {} as never);
    const close = jest.spyOn(service, 'close').mockResolvedValue({} as never);
    await expect(service.closeOwn(7, {} as never, 42)).rejects.toThrow('يمكنك تسليم وإغلاق ورديتك فقط');
    expect(close).not.toHaveBeenCalled();
  });
  it('exposes only the assigned branch as an operational option', async () => {
    const findMany = jest.fn().mockResolvedValue([{ branch_id: 3, branch_name: 'الفرع', from_id: 0 }]);
    const service = new BranchesService({ tbl_branches: { findMany } } as never, { allowedBranchIds: () => [3] } as never);
    await expect(service.findOptions({ level: 2, branch: 3 } as never)).resolves.toEqual([{ id: 3, name: 'الفرع', parentId: 0, lat: null, lng: null }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branch_id: { in: [3] } } }));
  });
});

import { ShiftsService } from './shifts.service';

it('includes approved staff across role levels in the receiving-user list', async () => {
  const findMany = jest.fn().mockResolvedValue([1, 2, 3, 9].map((level) => ({
    user_id: level, username: `staff${level}`, name: `Staff ${level}`, level, emp_code: null, branch_id_fk: 1,
  })));
  const service = new ShiftsService({ users: { findMany } } as never, {} as never);
  expect((await service.eligibleUsers(1)).map((user) => user.id)).toEqual([1, 2, 3, 9]);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    approved: 1, OR: [{ branch_id_fk: 1 }, { branch_id_fk: null }],
  } }));
});
