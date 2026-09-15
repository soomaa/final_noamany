import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { SiteVisitsService } from './site-visits.service';

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
  create(
    @Body() body: { name: string; lat: number; long: number; radius?: number; siteName?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(body, user.sub);
  }

  @Get(':id/records')
  listRecords(@Param('id', ParseIntPipe) id: number) {
    return this.service.listRecords(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; lat?: number; long?: number; radius?: number; siteName?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
