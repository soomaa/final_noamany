import { PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { ClubLeadsController } from './club-leads.controller';

describe('ClubLeadsController workflow routes', () => {
  it('does not expose a shortcut that creates a member from a lead', () => {
    const prototype = ClubLeadsController.prototype as unknown as Record<string, unknown>;
    const paths = Object.getOwnPropertyNames(prototype).flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function') return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      return path == null ? [] : Array.isArray(path) ? path : [path];
    });

    expect(paths).not.toContain(':id/convert');
  });

  it('keeps lead creation with management while sales specialists only update assigned leads', () => {
    const createPermissions = Reflect.getMetadata(
      REQUIRES_PERMISSION_KEY,
      ClubLeadsController.prototype.create,
    ) ?? [];
    const followUpPermissions = Reflect.getMetadata(
      REQUIRES_PERMISSION_KEY,
      ClubLeadsController.prototype.followUp,
    ) ?? [];

    expect(createPermissions).toEqual(['club.leads:create']);
    expect(followUpPermissions).toEqual(expect.arrayContaining([
      'club.leads:update',
      'sales.portal:update',
    ]));
  });
});
