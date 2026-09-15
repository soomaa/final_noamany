import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  TargetPeopleQueryDto,
  TargetReportQueryDto,
} from './dto/target-report-query.dto';
import { TargetsService } from './targets.service';

@UseGuards(JwtAuthGuard)
@Controller('targets')
@RequiresPermission('club.fitness.trainer_payments:view')
export class TargetsController {
  constructor(private readonly service: TargetsService) {}

  @Get('report')
  report(@Query() query: TargetReportQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.report(query, user);
  }

  @Get('people')
  people(@Query() query: TargetPeopleQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.people(query, user);
  }
}
