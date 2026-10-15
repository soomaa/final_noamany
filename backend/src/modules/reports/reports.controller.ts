import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ReportsService } from './reports.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('reports')
@RequiresPermission('reports.hub:view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':key')
  @ScopedHrData()
  run(
    @Param('key') key: string,
    @Query() query: ListQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reports.run(key, query, user);
  }
}
