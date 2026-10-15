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
  listAll() {
    return this.service.listActive();
  }

  @Get()
  list(@Query('isSpecialOffer') isSpecialOffer?: string) {
    return this.service.listActive(isSpecialOffer);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.remove(id);
  }
}
