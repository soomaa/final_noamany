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
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listActive(
      isSpecialOffer,
      user,
      branchId && branchId !== 'all' ? Number(branchId) : undefined,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
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

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.remove(id);
  }
}
