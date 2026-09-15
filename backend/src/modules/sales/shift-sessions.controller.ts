import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { isDryRun } from '../../common/preview';
import {
  CloseShiftSessionDto,
  CreateDrawerMovementDto,
  CurrentSessionQueryDto,
  DailyReportQueryDto,
  ListDrawerMovementsDto,
  ListShiftSessionsDto,
  OpenCustodiesQueryDto,
  ShiftSessionsReportQueryDto,
  StartShiftSessionDto,
  SwitchShiftSessionDto,
} from './dto/shift-sessions.dto';
import { ShiftSessionsService } from './shift-sessions.service';

@UseGuards(JwtAuthGuard)
@Controller('shift-sessions')
@RequiresPermission('gym-sales.sales:view')
export class ShiftSessionsController {
  constructor(
    private readonly service: ShiftSessionsService,
    private readonly config: ConfigService,
  ) {}

  private cookieOpts(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: this.config.get<string>('nodeEnv') === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  @Post('start')
  @RequiresPermission('gym-sales.sales:create')
  start(@Body() body: StartShiftSessionDto, @CurrentUser('sub') userId: number) {
    return this.service.start(body, userId);
  }

  @Get('current')
  getCurrent(@Query() query: CurrentSessionQueryDto) {
    // Branch-scoped: do NOT force the JWT userId. POS shows the open drawer for the
    // branch; start() also blocks on any open session in that branch. Filtering by
    // the current user made the UI say "no open shift" while start returned 400.
    return this.service.getCurrent(query);
  }

  @Post('switch')
  @RequiresPermission('gym-sales.sales:update')
  async switchShift(
    @Body() body: SwitchShiftSessionDto,
    @CurrentUser('sub') userId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.switchShift(body, userId);
    res.cookie('one80_access', result.accessToken, this.cookieOpts(2 * 60 * 60 * 1000));
    res.cookie('one80_refresh', result.refreshToken, this.cookieOpts(7 * 24 * 60 * 60 * 1000));
    return result;
  }

  @Post('drawer-movements')
  @RequiresPermission('gym-sales.sales:create')
  createDrawerMovement(@Body() body: CreateDrawerMovementDto, @CurrentUser('sub') userId: number) {
    return this.service.createDrawerMovement(body, userId);
  }

  @Get('drawer-movements')
  listDrawerMovements(@Query() query: ListDrawerMovementsDto) {
    return this.service.listDrawerMovements(query);
  }

  @Get('custodies/open')
  openCustodies(@Query() query: OpenCustodiesQueryDto) {
    return this.service.openCustodies(query);
  }

  @Get('report')
  report(@Query() query: ShiftSessionsReportQueryDto) {
    return this.service.report(query);
  }

  @Get('daily-report')
  dailyReport(@Query() query: DailyReportQueryDto) {
    return this.service.dailyReport(query);
  }

  @Get()
  list(@Query() query: ListShiftSessionsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/close-report')
  closeReport(@Param('id', ParseIntPipe) id: number) {
    return this.service.closeReport(id);
  }

  @Put(':id/close-own')
  @RequiresPermission('gym-sales.sales:update')
  closeOwn(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CloseShiftSessionDto,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.closeOwn(id, body, userId, isDryRun(dryRun));
  }

  @Put(':id/close')
  @RequiresPermission('gym-sales.sales:update')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CloseShiftSessionDto,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.close(id, body, userId, isDryRun(dryRun));
  }
}
