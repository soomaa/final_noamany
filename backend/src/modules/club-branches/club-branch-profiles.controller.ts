import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubBranchProfilesService } from './club-branch-profiles.service';

/**
 * الفروع — the admin screen behind the branch tabs a member or guest browses in the app.
 * Staff see and edit only the branches in their own scope (`user.branchIds`).
 */
@UseGuards(JwtAuthGuard)
@Controller('club-branch-profiles')
export class ClubBranchProfilesController {
  constructor(private readonly service: ClubBranchProfilesService) {}

  @Get()
  @RequiresPermission('app-management.branches:view')
  list(@CurrentUser() user: JwtUser) {
    return this.service.listForStaff(user);
  }

  @Get(':branchId')
  @RequiresPermission('app-management.branches:view')
  findOne(@CurrentUser() user: JwtUser, @Param('branchId', ParseIntPipe) branchId: number) {
    return this.service.findForStaff(user, branchId);
  }

  @Put(':branchId')
  @RequiresPermission('app-management.branches:update')
  upsert(
    @CurrentUser() user: JwtUser,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.upsert(user, branchId, body);
  }
}
