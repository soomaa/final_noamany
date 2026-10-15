import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubClassTypesService } from './club-class-types.service';

@UseGuards(JwtAuthGuard)
@Controller('club-class-types')
@RequiresPermission('club.subscriptions.special:view')
export class ClubClassTypesController {
  constructor(private readonly service: ClubClassTypesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string, @CurrentUser() user?: JwtUser) {
    return this.service.list(includeInactive === 'true' || includeInactive === '1', user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.subscriptions.special:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user?: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions.special:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions.special:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: JwtUser) {
    return this.service.remove(id, user);
  }
}
