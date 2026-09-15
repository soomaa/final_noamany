import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { isDryRun } from '../../common/preview/dry-run.util';
import { JwtUser } from '../../common/types/jwt-user';
import { WeeklyLeavesService } from './weekly-leaves.service';
import { ListWeeklyLeavesDto } from './dto/list-weekly-leaves.dto';

@UseGuards(JwtAuthGuard)
@Controller('weekly-leaves')
@RequiresPermission('employees.weekly_leaves:view')
export class WeeklyLeavesController {
  constructor(private readonly service: WeeklyLeavesService) {}

  @Get()
  list(@Query() q: ListWeeklyLeavesDto) {
    return this.service.list(q);
  }

  @Post()
  create(
    @Body() body: { empId: number; offDay: string },
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.create(body, user.sub, isDryRun(dryRun));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { empId?: number; offDay?: string },
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.update(id, body, user.sub, isDryRun(dryRun));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
