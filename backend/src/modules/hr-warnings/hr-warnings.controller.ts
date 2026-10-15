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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ListWarningsDto } from './dto/list-warnings.dto';
import { CreateWarningDto, SendToEmpDto } from './dto/warning.dto';
import { HrWarningsService } from './hr-warnings.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/warnings')
@RequiresPermission('affairs.warnings:view')
export class HrWarningsController {
  constructor(private readonly warnings: HrWarningsService) {}

  @Get()
  list(@Query() query: ListWarningsDto) {
    return this.warnings.list(query);
  }

  @Get('types')
  listTypes() {
    return this.warnings.listTypes();
  }

  @Post()
  @RequiresPermission('affairs.warnings:create')
  create(@Body() dto: CreateWarningDto, @CurrentUser() user: JwtUser) {
    return this.warnings.create(dto, user.sub, user.name);
  }

  @Patch(':id/send-hr')
  @RequiresPermission('affairs.warnings:update')
  sendToHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.warnings.sendToHr(id, user.sub, user.name);
  }

  @Patch(':id/send-emp')
  @RequiresPermission('affairs.warnings:update')
  sendToEmp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendToEmpDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.warnings.sendToEmp(id, dto, user.sub, user.name);
  }

  @Delete(':id')
  @RequiresPermission('affairs.warnings:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.warnings.remove(id);
  }
}
