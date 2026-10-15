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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClearanceService } from './clearance.service';
import { CreateClearanceDto, ListClearanceDto, UpdateClearanceDto } from './dto/clearance.dto';

@UseGuards(JwtAuthGuard)
@Controller('termination/clearance')
@RequiresPermission('termination.clearance:view')
export class ClearanceController {
  constructor(private readonly clearance: ClearanceService) {}

  @Get()
  list(@Query() query: ListClearanceDto) {
    return this.clearance.list(query);
  }

  @Get(':groupId')
  getGroup(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.clearance.getGroup(groupId);
  }

  @Post()
  create(@Body() dto: CreateClearanceDto) {
    return this.clearance.create(dto);
  }

  @Patch(':groupId')
  update(@Param('groupId', ParseIntPipe) groupId: number, @Body() dto: UpdateClearanceDto) {
    return this.clearance.update(groupId, dto);
  }

  @Delete(':groupId')
  remove(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.clearance.remove(groupId);
  }
}
