import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { GymRatesService } from './gym-rates.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/gym-rates')
@RequiresPermission('affairs.gym_rates:view')
export class GymRatesController {
  constructor(private readonly service: GymRatesService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.service.list(q);
  }

  // affairs.gym_rates is a SETTINGS resource (view/update/configure/audit) —
  // all mutations map to the `update` action.
  @Post()
  @RequiresPermission('affairs.gym_rates:update')
  create(@Body() body: { ttype: string; forUser: number; forGym: number }, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.sub, user.name);
  }

  @Patch(':id')
  @RequiresPermission('affairs.gym_rates:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ttype?: string; forUser?: number; forGym?: number },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub, user.name);
  }

  @Delete(':id')
  @RequiresPermission('affairs.gym_rates:update')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
