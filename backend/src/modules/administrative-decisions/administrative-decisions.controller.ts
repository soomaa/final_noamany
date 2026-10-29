import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { AdministrativeDecisionsService } from './administrative-decisions.service';
import {
  CreateAdministrativeDecisionDto,
  ListAdministrativeDecisionsDto,
  UpdateAdministrativeDecisionDto,
} from './dto/administrative-decision.dto';

@UseGuards(JwtAuthGuard)
@Controller('hr/administrative-decisions')
@RequiresPermission('affairs.admin_decisions:view')
export class AdministrativeDecisionsController {
  constructor(private readonly decisions: AdministrativeDecisionsService) {}

  @Get()
  list(@Query() query: ListAdministrativeDecisionsDto, @CurrentUser() user: JwtUser) {
    return this.decisions.list(query, user);
  }

  @Get('lookups')
  lookups() {
    return this.decisions.lookups();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.decisions.getOne(id, user);
  }

  @Post()
  @RequiresPermission('affairs.admin_decisions:create')
  create(@Body() dto: CreateAdministrativeDecisionDto, @CurrentUser() user: JwtUser) {
    return this.decisions.create(dto, user.sub, user.name, user);
  }

  @Patch(':id')
  @RequiresPermission('affairs.admin_decisions:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdministrativeDecisionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.decisions.update(id, dto, user.sub, user.name, user);
  }

  @Delete(':id')
  @RequiresPermission('affairs.admin_decisions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.decisions.remove(id, user);
  }
}
