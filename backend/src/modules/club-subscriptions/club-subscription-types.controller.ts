import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionTypesService } from './club-subscription-types.service';

@UseGuards(JwtAuthGuard)
@Controller('club-subscription-types')
@RequiresPermission('club.subscriptions:view')
export class ClubSubscriptionTypesController {
  constructor(private readonly service: ClubSubscriptionTypesService) {}

  @Get('all')
  listAll(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.listActive(
      undefined,
      user,
      branchId && branchId !== 'all' ? Number(branchId) : undefined,
    );
  }

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('isSpecialOffer') isSpecialOffer?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.listActive(
      isSpecialOffer,
      user,
      branchId && branchId !== 'all' ? Number(branchId) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Get(':id/usage')
  @RequiresPermission('club.subscriptions:update')
  usage(@Param('id', ParseIntPipe) id: number) {
    return this.service.usage(id);
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Put(':id/active')
  @RequiresPermission('club.subscriptions:update')
  setActive(@Param('id', ParseIntPipe) id: number, @Body('isActive') isActive: boolean) {
    return this.service.setActive(id, Boolean(isActive));
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.remove(id);
  }
}
