import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateExitDto, ListExitsDto } from './dto/exit.dto';
import { ExitsService } from './exits.service';

/** Structured employee exits (resignation / abandonment / termination …), under the archive permission. */
@UseGuards(JwtAuthGuard)
@Controller('termination/exits')
@RequiresPermission('termination.archive:view')
export class ExitsController {
  constructor(private readonly exits: ExitsService) {}

  @Get('meta')
  meta() {
    return this.exits.meta();
  }

  @Get()
  list(@Query() query: ListExitsDto, @CurrentUser() user: JwtUser) {
    return this.exits.list(query, user);
  }

  @Get('employee/:empId')
  forEmployee(@Param('empId', ParseIntPipe) empId: number, @CurrentUser() user: JwtUser) {
    return this.exits.forEmployee(empId, user);
  }

  @Post()
  @RequiresPermission('termination.archive:update')
  create(@Body() dto: CreateExitDto, @CurrentUser() user: JwtUser) {
    return this.exits.create(dto, user);
  }
}
