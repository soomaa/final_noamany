import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { ClubBranchGroupService } from './club-branch-group.service';
import { ClubAttendanceService } from '../../modules/club-members/club-attendance.service';
import { ClubMembersService } from '../../modules/club-members/club-members.service';
import { ClubSubscriptionsService } from '../../modules/club-subscriptions/club-subscriptions.service';

describe('ClubBranchGroupService injection metadata', () => {
  it.each([
    ['ClubMembersService', ClubMembersService, 5],
    ['ClubAttendanceService', ClubAttendanceService, 8],
    ['ClubSubscriptionsService', ClubSubscriptionsService, 9],
  ])('%s uses ClubBranchGroupService as its branch-group dependency', (_name, target, parameterIndex) => {
    const parameters = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      target,
    ) as Array<{ index: number; param: unknown }>;

    expect(parameters).toContainEqual({
      index: parameterIndex,
      param: ClubBranchGroupService,
    });
  });
});
