import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClearanceService } from './clearance.service';
import { CreateClearanceDto, ListClearanceDto, UpdateClearanceDto } from './dto/clearance.dto';

@UseGuards(JwtAuthGuard)
@Controller('termination/clearance')
@RequiresPermission('termination.clearance:view')
export class ClearanceController {
  constructor(private readonly clearance: ClearanceService) {}

  @Get()
  list(@Query() query: ListClearanceDto, @CurrentUser() user: JwtUser) {
    return this.clearance.list(query, user);
  }

  @Get(':groupId')
  getGroup(@Param('groupId', ParseIntPipe) groupId: number, @CurrentUser() user: JwtUser) {
    return this.clearance.getGroup(groupId, user);
  }

  @Post()
  @RequiresPermission('termination.clearance:create')
  create(@Body() dto: CreateClearanceDto, @CurrentUser() user: JwtUser) {
    return this.clearance.create(dto, user);
  }

  @Patch(':groupId')
  @RequiresPermission('termination.clearance:update')
  update(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: UpdateClearanceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.clearance.update(groupId, dto, user);
  }

  @Delete(':groupId')
  @RequiresPermission('termination.clearance:delete')
  remove(@Param('groupId', ParseIntPipe) groupId: number, @CurrentUser() user: JwtUser) {
    return this.clearance.remove(groupId, user);
  }
}
