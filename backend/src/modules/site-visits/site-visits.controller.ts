import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { SiteVisitsService } from './site-visits.service';
import { CreateSiteVisitDto, UpdateSiteVisitDto } from './dto/site-visit.dto';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sites/visits')
@RequiresPermission('affairs.site_visits:view')
export class SiteVisitsController {
  constructor(private readonly service: SiteVisitsService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.service.list(q);
  }

  @Post()
  @RequiresPermission('affairs.site_visits:create')
  create(
    @Body() body: CreateSiteVisitDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(body, user.sub);
  }

  @Get(':id/records')
  @ScopedHrData()
  listRecords(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.listRecords(id, user);
  }

  @Patch(':id')
  @RequiresPermission('affairs.site_visits:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSiteVisitDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub);
  }

  @Delete(':id')
  @RequiresPermission('affairs.site_visits:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
