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
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { ListWarningsDto } from './dto/list-warnings.dto';
import {
  CreateWarningDto,
  CreateWarningTemplateDto,
  SendToEmpDto,
  UpdateWarningDto,
  UpdateWarningTemplateDto,
} from './dto/warning.dto';
import { HrWarningsService } from './hr-warnings.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/warnings')
@RequiresPermission('affairs.warnings:view')
export class HrWarningsController {
  constructor(private readonly warnings: HrWarningsService) {}

  @Get()
  list(@Query() query: ListWarningsDto, @CurrentUser() user: JwtUser) {
    return this.warnings.list(query, user);
  }

  @Get('types')
  listTypes() {
    return this.warnings.listTypes();
  }

  @Get('templates')
  listTemplates(@Query() query: PaginationDto) {
    return this.warnings.listTemplates(query);
  }

  @Post('templates')
  @RequiresPermission('affairs.warnings:create')
  createTemplate(@Body() dto: CreateWarningTemplateDto) {
    return this.warnings.createTemplate(dto);
  }

  @Patch('templates/:id')
  @RequiresPermission('affairs.warnings:update')
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarningTemplateDto,
  ) {
    return this.warnings.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @RequiresPermission('affairs.warnings:delete')
  removeTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.warnings.removeTemplate(id);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.warnings.getOne(id, user);
  }

  @Post()
  @RequiresPermission('affairs.warnings:create')
  create(@Body() dto: CreateWarningDto, @CurrentUser() user: JwtUser) {
    return this.warnings.create(dto, user.sub, user.name);
  }

  @Patch(':id')
  @RequiresPermission('affairs.warnings:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarningDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.warnings.update(id, dto, user);
  }

  @Patch(':id/send-hr')
  sendToHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.warnings.sendToHr(id, user.sub, user.name);
  }

  @Patch(':id/send-emp')
  sendToEmp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendToEmpDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.warnings.sendToEmp(id, dto, user.sub, user.name);
  }

  @Delete(':id')
  @RequiresPermission('affairs.warnings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.warnings.remove(id, user);
  }
}
