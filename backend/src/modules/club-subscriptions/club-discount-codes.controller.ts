import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import {
  CreateClubDiscountCodeDto,
  UpdateClubDiscountCodeDto,
} from './dto/club-discount-code.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-discount-codes')
@RequiresPermission(
  'club.packages.settings:view',
  'club.lockers.settings:view',
  'club.subscriptions.list:view',
  'club.subscriptions.new:view',
  'club.subscriptions.special:view',
  'club.reception:view',
)
export class ClubDiscountCodesController {
  constructor(private readonly service: ClubDiscountCodesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true' || includeInactive === '1');
  }

  @Post()
  @RequiresPermission('club.packages.settings:create', 'club.lockers.settings:create')
  create(@Body() body: CreateClubDiscountCodeDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.create(body, user.sub);
  }

  @Put(':id')
  @RequiresPermission('club.packages.settings:update', 'club.lockers.settings:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateClubDiscountCodeDto,
    @CurrentUser() user: JwtUser,
  ) {
    assertSystemAdmin(user);
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.packages.settings:delete', 'club.lockers.settings:delete')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.deactivate(id);
  }
}
