import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { PointsDateRangeQueryDto, SavePointsConversionDto, SavePointsEarnSettingDto, UpdatePointsEarnSettingDto } from './dto/club-points.dto';
import { ClubPointsService } from './club-points.service';

@UseGuards(JwtAuthGuard)
@Controller('club-points')
@RequiresPermission('club.members:view', 'club.subscriptions:view')
export class ClubPointsController {
  constructor(private readonly service: ClubPointsService) {}

  @Get('settings')
  async settings() {
    const [conversion, earnSettings] = await Promise.all([
      this.service.conversion(), this.service.listEarnSettings(),
    ]);
    return { conversion, earnSettings };
  }

  @Put('settings/conversion')
  saveConversion(@Body() body: SavePointsConversionDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.saveConversion(body, user.sub);
  }

  @Post('settings/earn')
  saveEarnSetting(@Body() body: SavePointsEarnSettingDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.saveEarnSetting(body, user.sub);
  }

  @Put('settings/earn/:id')
  updateEarnSetting(@Param('id', ParseIntPipe) id: number, @Body() body: UpdatePointsEarnSettingDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.updateEarnSetting(id, body, user.sub);
  }

  @Delete('settings/earn/:id')
  deleteEarnSetting(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.deleteEarnSetting(id);
  }

  // This literal route must precede `members/:id/history`; otherwise the
  // dynamic `:id` route interprets "code" as an integer member id.
  @Get('members/code/:memberCode/history')
  historyByMemberCode(@Param('memberCode') memberCode: string) {
    return this.service.memberHistoryByCode(memberCode);
  }

  @Get('members/:id')
  account(@Param('id', ParseIntPipe) id: number) {
    return this.service.memberAccount(id);
  }

  @Get('members/:id/history')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.service.history(id);
  }

  @Get('reports/earned-members')
  earnedMembersReport(@Query() query: PointsDateRangeQueryDto) {
    return this.service.earnedMembersReport(query.fromDate, query.toDate);
  }

  @Get('reports/active-members')
  activeMembersReport() {
    return this.service.activeMembersReport();
  }
}
