import 'reflect-metadata';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { ClubMembersController } from './club-members.controller';

describe('club member profile permission', () => {
  it('allows attendance viewers to open the read-only member profile only', () => {
    const profilePermissions = Reflect.getMetadata(
      REQUIRES_PERMISSION_KEY,
      ClubMembersController.prototype.profileSummary,
    ) ?? [];
    const memberListPermissions = Reflect.getMetadata(
      REQUIRES_PERMISSION_KEY,
      ClubMembersController.prototype.list,
    ) ?? [];

    expect(profilePermissions).toEqual(expect.arrayContaining([
      'club.members:view',
      'club.reception:view',
      'club.members.attendance:view',
    ]));
    expect(memberListPermissions).not.toContain('club.members.attendance:view');
  });
});
